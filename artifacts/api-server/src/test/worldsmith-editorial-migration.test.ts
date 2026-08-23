/**
 * Regression coverage for the Editorial Suite migration's compiler routing.
 * Each test runs in an isolated, rolled-back schema so it exercises PostgreSQL
 * DDL and backfills without changing the shared development database.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
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
});