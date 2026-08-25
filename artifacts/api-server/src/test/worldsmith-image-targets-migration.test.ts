/**
 * Regression coverage for the tracked WorldSmith image-target catalog migration.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

const migrationSql = await readFile(
  new URL("../../../../lib/db/drizzle/0010_worldsmith_image_targets.sql", import.meta.url),
  "utf8",
);

type QueryableClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rowCount: number | null; rows: T[] }>;
  release(): void;
};

async function applyMigration(client: QueryableClient): Promise<void> {
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (sql) await client.query(sql);
  }
}

describe("WorldSmith image-target tracked migration", () => {
  it("creates and seeds the catalog idempotently without overwriting managed values", async () => {
    const client = await pool.connect() as QueryableClient;
    const schema = `ws_image_targets_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}", public`);

      await applyMigration(client);
      expect((await client.query(`
        SELECT component_type, print_width_in, print_height_in
        FROM worldsmith_image_targets
        ORDER BY component_type
      `)).rows).toEqual([
        { component_type: "Coordinating Paper", print_width_in: 12, print_height_in: 12 },
        { component_type: "Decorative Paper", print_width_in: 12, print_height_in: 12 },
        { component_type: "Endpaper", print_width_in: 8.5, print_height_in: 11 },
        { component_type: "Ephemera Sheet", print_width_in: 8.5, print_height_in: 11 },
        { component_type: "Hero Paper", print_width_in: 12, print_height_in: 12 },
        { component_type: "Journal Card", print_width_in: 3, print_height_in: 4 },
        { component_type: "Notepaper", print_width_in: 8.5, print_height_in: 11 },
      ]);

      await client.query(`
        UPDATE worldsmith_image_targets
        SET print_width_in = 5, print_height_in = 7
        WHERE component_type = 'Journal Card'
      `);
      await applyMigration(client);

      expect((await client.query(`
        SELECT print_width_in, print_height_in
        FROM worldsmith_image_targets
        WHERE component_type = 'Journal Card'
      `)).rows).toEqual([{ print_width_in: 5, print_height_in: 7 }]);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});