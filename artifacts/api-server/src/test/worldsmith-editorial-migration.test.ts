/**
 * Regression coverage for the Editorial Suite migration's compiler routing.
 * Each test runs in an isolated, rolled-back schema so it exercises PostgreSQL
 * DDL and backfills without changing the shared development database.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";

const { applyWorldsmithEditorialMigration } = await import(
  "../../../../scripts/src/worldsmith-editorial-migration.mjs"
);

type QueryableClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rowCount: number | null; rows: T[] }>;
  release(): void;
};

async function inIsolatedSchema(
  test: (client: QueryableClient, schema: string) => Promise<void>,
) {
  const client = await pool.connect() as QueryableClient;
  const schema = `ws_editorial_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    await test(client, schema);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

describe("WorldSmith Editorial Suite migration", () => {
  it("adds the compiler section and its constraint only to prompt modules on a clean schema", async () => {
    await inIsolatedSchema(async (client, schema) => {
      await applyWorldsmithEditorialMigration(client, schema);

      const sectionColumns = await client.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND column_name = 'section'
        ORDER BY table_name
      `, [schema]);
      expect(sectionColumns.rows).toEqual([{ table_name: "ws_prompt_modules" }]);

      const sectionConstraints = await client.query<{ table_name: string; definition: string }>(`
        SELECT relation.relname AS table_name, pg_get_constraintdef(check_constraint.oid) AS definition
        FROM pg_constraint AS check_constraint
        JOIN pg_class AS relation ON relation.oid = check_constraint.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = $1
          AND check_constraint.contype = 'c'
          AND pg_get_constraintdef(check_constraint.oid) ILIKE '%section%'
      `, [schema]);
      expect(sectionConstraints.rows).toHaveLength(1);
      expect(sectionConstraints.rows[0]?.table_name).toBe("ws_prompt_modules");
      expect(sectionConstraints.rows[0]?.definition).toContain("'world'");
      expect(sectionConstraints.rows[0]?.definition).toContain("'style'");
      expect(sectionConstraints.rows[0]?.definition).toContain("'general'");
    });
  });

  it("backfills existing prompt modules into style, world, or general routing sections", async () => {
    await inIsolatedSchema(async (client, schema) => {
      await client.query(`
        CREATE TABLE ws_prompt_modules (
          id TEXT PRIMARY KEY,
          world_id TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          dependency_ids JSONB NOT NULL DEFAULT '[]'
        );
      `);
      await client.query(`
        INSERT INTO ws_prompt_modules (id, world_id, name) VALUES
          ('style', 'world-1', 'Paper Style'),
          ('aesthetic', 'world-1', 'Aesthetic Direction'),
          ('world', 'world-1', 'World Canon'),
          ('priority', 'world-1', 'World Style Hybrid'),
          ('general', 'world-1', 'Subject Composition')
      `);

      await applyWorldsmithEditorialMigration(client, schema);

      const modules = await client.query<{ id: string; section: string }>(`
        SELECT id, section
        FROM ws_prompt_modules
        ORDER BY id
      `);
      expect(modules.rows).toEqual([
        { id: "aesthetic", section: "style" },
        { id: "general", section: "general" },
        { id: "priority", section: "style" },
        { id: "style", section: "style" },
        { id: "world", section: "world" },
      ]);

      await expect(
        client.query(`
          INSERT INTO ws_prompt_modules (id, world_id, name, section)
          VALUES ('invalid', 'world-1', 'Invalid section', 'invalid')
        `),
      ).rejects.toThrow();
    });
  });

  it("preserves a deliberate general section when a migration is re-run", async () => {
    await inIsolatedSchema(async (client, schema) => {
      await applyWorldsmithEditorialMigration(client, schema);
      await client.query(`
        INSERT INTO ws_prompt_modules (id, world_id, name, section)
        VALUES ('author-choice', 'world-1', 'World Materials', 'general')
      `);

      await applyWorldsmithEditorialMigration(client, schema);

      const result = await client.query<{ section: string }>(`
        SELECT section FROM ws_prompt_modules WHERE id = 'author-choice'
      `);
      expect(result.rows).toEqual([{ section: "general" }]);
    });
  });

  it("backfills only catalog-matched font blocks once, retaining unmatched prose for review", async () => {
    await inIsolatedSchema(async (client, schema) => {
      await client.query(`
        CREATE TABLE fonts (
          id TEXT PRIMARY KEY,
          family_name TEXT NOT NULL,
          curated_pairings JSONB NOT NULL DEFAULT '[]'
        );
        INSERT INTO fonts (id, family_name, curated_pairings)
        VALUES ('font-lora', 'Lora', '[{"role":"heading","weight":"700"},{"role":"body","weight":"400"}]');

        CREATE TABLE worldsmith_worlds (
          id TEXT PRIMARY KEY,
          visual_palette TEXT
        );
        CREATE TABLE ws_canon_records (
          id TEXT PRIMARY KEY,
          world_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'proposed',
          visual_notes TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE ws_style_guides (
          id TEXT PRIMARY KEY,
          world_id TEXT NOT NULL,
          name TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT ''
        );

        INSERT INTO worldsmith_worlds (id, visual_palette)
        VALUES ('world-1', 'World palette
Daybook Font: Lora
Curated roles: heading 700, body 400
Available variants: 8');
        INSERT INTO ws_canon_records (id, world_id, name, visual_notes)
        VALUES ('canon-1', 'world-1', 'The Lantern', '<p>Daybook Font: Lora<br>Curated roles: heading 700, body 400<br>Source notes: legacy catalog note</p><p>Keep this visual note.</p>');
        INSERT INTO ws_style_guides (id, world_id, name, content)
        VALUES ('style-1', 'world-1', 'House Style', 'Daybook Font: Lora
Curated roles: heading 700, body 400
Daybook Font: Missing Family
Curated roles: body 400
Available variants: 2
Source notes: manual source');
      `);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      let warnings: unknown[][] = [];
      try {
        await applyWorldsmithEditorialMigration(client, schema);
        warnings = warn.mock.calls;
      } finally {
        warn.mockRestore();
      }

      const expectedTypography = [{
        fontId: "font-lora",
        family: "Lora",
        roles: [{ role: "heading", weight: "700" }, { role: "body", weight: "400" }],
      }];
      const world = await client.query<{ typography: unknown; prose: string }>(
        `SELECT typography, visual_palette AS prose FROM worldsmith_worlds WHERE id = 'world-1'`,
      );
      const canon = await client.query<{ typography: unknown; prose: string }>(
        `SELECT typography, visual_notes AS prose FROM ws_canon_records WHERE id = 'canon-1'`,
      );
      const style = await client.query<{ typography: unknown; prose: string }>(
        `SELECT typography, content AS prose FROM ws_style_guides WHERE id = 'style-1'`,
      );
      // The old picker omitted notes, variants, or both when those values were
      // empty. All valid historical shapes must migrate.
      expect(world.rows[0]?.typography).toEqual(expectedTypography);
      expect(canon.rows[0]?.typography).toEqual(expectedTypography);
      expect(style.rows[0]?.typography).toEqual(expectedTypography);
      expect(world.rows[0]?.prose).not.toContain("Daybook Font:");
      expect(canon.rows[0]?.prose).toContain("Keep this visual note.");
      expect(canon.rows[0]?.prose).not.toContain("Daybook Font:");
      expect(style.rows[0]?.prose).toContain("Daybook Font: Missing Family");
      expect(warnings).toEqual([
        [expect.stringContaining("unmatched legacy font reference")],
      ]);

      // The newly introduced typography column marks the migration as complete.
      // An intentional empty selection must not be regenerated on later runs.
      await client.query(`
        UPDATE ws_style_guides
        SET typography = '[]', content = 'Daybook Font: Lora
Curated roles: heading 700, body 400
Available variants: 8
Source notes: author deliberately removed it'
        WHERE id = 'style-1'
      `);
      await applyWorldsmithEditorialMigration(client, schema);
      const rerun = await client.query<{ typography: unknown; content: string }>(
        `SELECT typography, content FROM ws_style_guides WHERE id = 'style-1'`,
      );
      expect(rerun.rows[0]?.typography).toEqual([]);
      expect(rerun.rows[0]?.content).toContain("Daybook Font: Lora");
    });
  });
});