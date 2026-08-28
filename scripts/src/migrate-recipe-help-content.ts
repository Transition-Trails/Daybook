/**
 * Upserts the canonical recipe explainer for databases that were seeded before
 * the Concepts help article existed.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run migrate-recipe-help-content
 */
import { pool } from "@workspace/db";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECIPE_HELP_CONTENT } from "./recipe-help-content";

type SqlResult = {
  rowCount: number | null;
};

export interface RecipeHelpContentMigrationClient {
  query(sql: string, values?: readonly unknown[]): Promise<SqlResult>;
  release(): void;
}

export interface RecipeHelpContentMigrationPool {
  connect(): Promise<RecipeHelpContentMigrationClient>;
  end(): Promise<void>;
}

export async function applyRecipeHelpContentMigration(
  client: RecipeHelpContentMigrationClient,
): Promise<void> {
  const article = RECIPE_HELP_CONTENT;
  await client.query(
    `
      INSERT INTO help_content (id, title, body, category, kind, scope, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        category = EXCLUDED.category,
        kind = EXCLUDED.kind,
        scope = EXCLUDED.scope,
        status = EXCLUDED.status,
        updated_at = NOW();
    `,
    [
      article.id,
      article.title,
      article.body,
      article.category,
      article.kind,
      article.scope,
      article.status,
    ],
  );
}

export async function runRecipeHelpContentMigration(
  migrationPool: RecipeHelpContentMigrationPool = pool,
): Promise<void> {
  const client = await migrationPool.connect();
  try {
    await client.query("BEGIN");
    await applyRecipeHelpContentMigration(client);
    await client.query("COMMIT");
    console.log("✓ Recipe Concepts help article");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await migrationPool.end();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await runRecipeHelpContentMigration();
}