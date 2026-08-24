/**
 * Regression coverage for the tracked WorldSmith production-package repair.
 *
 * These tests execute the checked-in migration against isolated PostgreSQL
 * schemas. That keeps the test aligned with the migration Drizzle applies,
 * while the transaction rollback prevents it from changing the development
 * database.
 */
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

const migrationUrl = new URL(
  "../../../../lib/db/drizzle/0008_worldsmith_production_packages.sql",
  import.meta.url,
);
const migrationSql = await readFile(migrationUrl, "utf8");

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
  const schema = `ws_production_packages_test_${randomUUID().replaceAll("-", "")}`;
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

async function createPreProductionPackageSchema(client: QueryableClient) {
  await client.query(`
    CREATE TABLE worldsmith_runs (
      id TEXT PRIMARY KEY,
      production_spec_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    )
  `);
}

async function applyTrackedMigration(client: QueryableClient) {
  for (const statement of migrationSql.split("--> statement-breakpoint")) {
    const sql = statement.trim();
    if (sql) await client.query(sql);
  }
}

async function getWorldsmithRunColumns(client: QueryableClient, schema: string) {
  const result = await client.query<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'worldsmith_runs'
      AND column_name IN ('generated_filename', 'notion_upload_id')
    ORDER BY column_name
  `, [schema]);
  return result.rows;
}

async function getProductionPackageShape(client: QueryableClient, schema: string) {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_name = 'worldsmith_production_packages'
  `, [schema]);
  const columns = await client.query<{ column_name: string; data_type: string }>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'worldsmith_production_packages'
    ORDER BY ordinal_position
  `, [schema]);
  const indexes = await client.query<{ indexname: string; indexdef: string }>(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = $1
      AND tablename = 'worldsmith_production_packages'
      AND indexname IN (
        'worldsmith_production_packages_identity_idx',
        'worldsmith_production_packages_spec_idx'
      )
    ORDER BY indexname
  `, [schema]);

  return {
    tables: tables.rows,
    columns: columns.rows,
    indexes: indexes.rows,
  };
}

describe("WorldSmith production-package tracked migration", () => {
  it("adds run audit columns, the package table, and both indexes to a fresh schema", async () => {
    await inIsolatedSchema(async (client, schema) => {
      await createPreProductionPackageSchema(client);

      await applyTrackedMigration(client);

      expect(await getWorldsmithRunColumns(client, schema)).toEqual([
        { column_name: "generated_filename", data_type: "text" },
        { column_name: "notion_upload_id", data_type: "text" },
      ]);

      const packageShape = await getProductionPackageShape(client, schema);
      expect(packageShape.tables).toEqual([
        { table_name: "worldsmith_production_packages" },
      ]);
      expect(packageShape.columns.map(({ column_name }) => column_name)).toEqual([
        "id",
        "production_spec_id",
        "prompt_hash",
        "provider",
        "model_name",
        "model_version",
        "effective_size",
        "quality",
        "filename",
        "visual_asset_notion_id",
        "notion_upload_id",
        "provider_request_id",
        "estimated_cost_usd",
        "actual_cost_usd",
        "status",
        "production_art_status",
        "error",
        "created_at",
        "updated_at",
      ]);
      expect(packageShape.indexes.map(({ indexname }) => indexname)).toEqual([
        "worldsmith_production_packages_identity_idx",
        "worldsmith_production_packages_spec_idx",
      ]);
      expect(packageShape.indexes[0]?.indexdef).toContain("UNIQUE INDEX");
    });
  });

  it("repairs a legacy run table without changing existing rows and is idempotent", async () => {
    await inIsolatedSchema(async (client, schema) => {
      await createPreProductionPackageSchema(client);
      await client.query(`
        INSERT INTO worldsmith_runs (id, production_spec_id, operation, status)
        VALUES ('legacy-run', 'legacy-spec', 'compile_and_generate', 'complete')
      `);

      const before = await client.query(`
        SELECT id, production_spec_id, operation, status
        FROM worldsmith_runs
        ORDER BY id
      `);

      await applyTrackedMigration(client);
      const shapeAfterFirstRun = await getProductionPackageShape(client, schema);
      const columnsAfterFirstRun = await getWorldsmithRunColumns(client, schema);

      expect((await client.query(`
        SELECT id, production_spec_id, operation, status
        FROM worldsmith_runs
        ORDER BY id
      `)).rows).toEqual(before.rows);
      expect((await client.query(`
        SELECT generated_filename, notion_upload_id
        FROM worldsmith_runs
        WHERE id = 'legacy-run'
      `)).rows).toEqual([{ generated_filename: null, notion_upload_id: null }]);

      await applyTrackedMigration(client);

      expect(await getWorldsmithRunColumns(client, schema)).toEqual(columnsAfterFirstRun);
      expect(await getProductionPackageShape(client, schema)).toEqual(shapeAfterFirstRun);
      expect((await client.query(`
        SELECT id, production_spec_id, operation, status
        FROM worldsmith_runs
        ORDER BY id
      `)).rows).toEqual(before.rows);
    });
  });
});