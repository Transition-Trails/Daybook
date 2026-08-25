#!/usr/bin/env node
/**
 * Brings databases created with the former schema-push workflow into the
 * tracked Drizzle migration history before `drizzle-kit migrate` runs.
 *
 * A legacy Daybook database already has the consolidated 0000 schema but does
 * not have Drizzle's migration ledger. Recording that one known baseline lets
 * later, additive catalog migrations run without trying to recreate every
 * existing table. The complete schema fingerprint is checked before baselining;
 * partial or unknown Daybook schemas stop with a recovery error instead of
 * silently skipping required catalog updates. Fresh databases are left for
 * Drizzle to initialize normally.
 *
 * `pnpm --filter @workspace/db run migrate` is the deployment migration entry
 * point. It applies the full tracked schema, including WorldSmith editorial
 * repairs that older deployments previously ran as separate scripts.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  classifyMigrationLedger,
  describeLedgerRecovery,
  describeLedgerSchemaRecovery,
  describeLedgerTypeRecovery,
  incompatibleLedgerColumns,
  knownOutOfOrderLedgerTags,
  ledgerRowMatchesMigration,
  missingLedgerColumns,
} from "./migration-ledger.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(packageDir, "drizzle");
const baselineTag = "0000_verify-canon-relation-primary-key";
const journalFile = path.join(migrationsDir, "meta", "_journal.json");
const baselineSnapshotFile = path.join(migrationsDir, "meta", "0000_snapshot.json");
const sellerCheckoutOriginalHash = "9571ecb12c63c2b1d1f631b16610f944df40165af6fa442ec6f53fc07515812d";
const sellerCheckoutPreWave9Hash = "5170e85018e21a7587836f61a0e814f0e36d893fd08dc575b0390d27d2bc8e1f";
const sellerCheckoutTag = "0019_seller_checkout";
const wave9CartIntegrityPreCorrectionHash = "017648681f1597dd01067de81b48a0768724668f3667e9a40e37d5720ac86424";
const wave9CartIntegrityTag = "0020_wave9_cart_integrity";
const knownLegacyBaselineMismatches = new Set([
  "changed column public.product_recipes.created_at",
  "changed column public.product_recipes.updated_at",
  "changed column public.releases.release_date",
  "changed column public.releases.created_at",
  "changed column public.releases.updated_at",
  "missing constraint f:ticket_replies_ticket_id_tickets_id_fk",
  "missing constraint f:ticket_replies_author_user_id_users_id_fk",
  "missing constraint f:tickets_reporter_user_id_users_id_fk",
  "missing constraint f:email_log_store_id_stores_id_fk",
  "missing constraint u:email_log_idempotency_key_unique",
  "missing constraint f:store_email_config_store_id_stores_id_fk",
  "missing constraint f:orders_buyer_user_id_users_id_fk",
  "missing constraint p:ws_canon_record_relations_from_record_id_to_record_id_pk",
  "missing constraint f:release_notes_release_id_releases_id_fk",
  "missing constraint u:releases_version_unique",
]);

async function getTrackedMigrations() {
  const journalSource = await readFile(journalFile, "utf8");
  const journal = JSON.parse(journalSource);
  return Promise.all(journal.entries.map(async entry => {
    const sql = await readFile(path.join(migrationsDir, `${entry.tag}.sql`));
    return {
      tag: entry.tag,
      hash: createHash("sha256").update(sql).digest("hex"),
      createdAt: entry.when,
    };
  }));
}

function normaliseType(type) {
  return ({
    serial: "integer",
    smallserial: "smallint",
    bigserial: "bigint",
    timestamp: "timestamp without time zone",
    time: "time without time zone",
  })[type] ?? type;
}

function normaliseIdentifier(identifier) {
  // PostgreSQL truncates generated names to NAMEDATALEN - 1 bytes.
  return identifier.slice(0, 63);
}

function tableKey(schema, table) {
  return `${schema}.${table}`;
}

function columnKey(schema, table, column) {
  return `${schema}.${table}.${column}`;
}

async function getLegacySchemaFingerprint(client) {
  const snapshot = JSON.parse(await readFile(baselineSnapshotFile, "utf8"));
  const expectedTables = new Set();
  const expectedColumns = new Map();
  const expectedConstraints = new Set();
  const expectedIndexes = new Set();

  for (const table of Object.values(snapshot.tables)) {
    const schema = table.schema || "public";
    const key = tableKey(schema, table.name);
    expectedTables.add(key);

    for (const column of Object.values(table.columns)) {
      expectedColumns.set(columnKey(schema, table.name, column.name), {
        type: normaliseType(column.type),
        notNull: column.notNull,
      });
    }

    for (const foreignKey of Object.values(table.foreignKeys)) {
      expectedConstraints.add(`f:${normaliseIdentifier(foreignKey.name)}`);
    }
    for (const uniqueConstraint of Object.values(table.uniqueConstraints)) {
      expectedConstraints.add(`u:${normaliseIdentifier(uniqueConstraint.name)}`);
    }
    for (const compositePrimaryKey of Object.values(table.compositePrimaryKeys)) {
      expectedConstraints.add(`p:${normaliseIdentifier(compositePrimaryKey.name)}`);
    }

    const singlePrimaryKeyColumns = Object.values(table.columns)
      .filter(column => column.primaryKey);
    if (singlePrimaryKeyColumns.length) {
      expectedConstraints.add(`p:${table.name}_pkey`);
    }

    for (const index of Object.values(table.indexes)) {
      expectedIndexes.add(normaliseIdentifier(index.name));
    }
  }

  // A pg Client allows one active query at a time. Keep these sequential so the
  // fingerprint remains compatible with current and future pg releases.
  const tables = await client.query(`
      SELECT n.nspname AS schema, c.relname AS table_name
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    `);
  const columns = await client.query(`
      SELECT
        n.nspname AS schema,
        c.relname AS table_name,
        a.attname AS column_name,
        format_type(a.atttypid, a.atttypmod) AS type,
        a.attnotnull AS not_null
      FROM pg_attribute a
      INNER JOIN pg_class c ON c.oid = a.attrelid
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND a.attnum > 0
        AND NOT a.attisdropped
    `);
  const constraints = await client.query(`
      SELECT con.contype AS type, con.conname AS name
      FROM pg_constraint con
      INNER JOIN pg_class c ON c.oid = con.conrelid
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND con.contype IN ('p', 'u', 'f')
    `);
  const indexes = await client.query(`
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
    `);

  const actualTables = new Set(
    tables.rows.map(row => tableKey(row.schema, row.table_name)),
  );
  const actualColumns = new Map(
    columns.rows.map(row => [
      columnKey(row.schema, row.table_name, row.column_name),
      { type: row.type, notNull: row.not_null },
    ]),
  );
  const actualConstraints = new Set(
    constraints.rows.map(row => `${row.type}:${row.name}`),
  );
  const actualIndexes = new Set(indexes.rows.map(row => row.name));

  const missingTables = [...expectedTables].filter(key => !actualTables.has(key));
  const missingColumns = [];
  const changedColumns = [];
  for (const [key, expected] of expectedColumns) {
    const actual = actualColumns.get(key);
    if (!actual) {
      missingColumns.push(key);
    } else if (actual.type !== expected.type || actual.notNull !== expected.notNull) {
      changedColumns.push(key);
    }
  }

  const missingConstraints = [...expectedConstraints]
    .filter(key => !actualConstraints.has(key));
  const missingIndexes = [...expectedIndexes]
    .filter(name => !actualIndexes.has(name));
  const mismatches = [
    ...missingTables.map(name => `missing table ${name}`),
    ...missingColumns.map(name => `missing column ${name}`),
    ...changedColumns.map(name => `changed column ${name}`),
    ...missingConstraints.map(name => `missing constraint ${name}`),
    ...missingIndexes.map(name => `missing index ${name}`),
  ];

  return {
    hasKnownDaybookTable: [...expectedTables].some(key => actualTables.has(key)),
    mismatches,
  };
}

function describeMismatches(mismatches) {
  const preview = mismatches.slice(0, 8).join(", ");
  const remaining = mismatches.length - 8;
  return remaining > 0 ? `${preview}, and ${remaining} more` : preview;
}

async function hasConstraints(client, names) {
  const { rows } = await client.query(
    `
      SELECT conname AS name
      FROM pg_constraint
      WHERE conname = ANY($1::text[])
    `,
    [names],
  );
  return new Set(rows.map(row => row.name));
}

async function hasColumns(client, table, columns) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = ANY($2::text[])
    `,
    [table, columns],
  );
  return new Set(rows.map(row => row.column_name));
}

async function hasIndexes(client, names) {
  const { rows } = await client.query(
    `
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
    `,
    [names],
  );
  return new Set(rows.map(row => row.name));
}

async function hasTrigger(client, name) {
  const { rowCount } = await client.query(
    `
      SELECT 1
      FROM pg_trigger
      WHERE tgname = $1
        AND NOT tgisinternal
    `,
    [name],
  );
  return rowCount > 0;
}

async function getAlreadyAppliedMigrationTags(client) {
  const applied = new Set([baselineTag]);

  const relationForeignKeys = [
    "ws_canon_record_relations_from_record_id_ws_canon_records_id_fk",
    "ws_canon_record_relations_to_record_id_ws_canon_records_id_fk",
  ];
  const existingRelationForeignKeys = await hasConstraints(client, relationForeignKeys);
  if (existingRelationForeignKeys.size === relationForeignKeys.length) {
    applied.add("0001_long_punisher");
  } else if (existingRelationForeignKeys.size) {
    throw new Error(
      "Cannot safely baseline this database: migration 0001 has only one of its required relation foreign keys. "
      + "Repair both constraints or remove the partial change before running migrate.",
    );
  }

  const canonColumns = [
    "from_entity_id",
    "to_entity_id",
    "emotional_valence",
  ];
  const existingCanonColumns = await hasColumns(client, "ws_canon_records", canonColumns);
  if (existingCanonColumns.size === canonColumns.length) {
    applied.add("0002_rel-canon-columns");
  }

  const fontOwnershipConstraint = "fonts_authored_by_store_id_stores_id_fk";
  const fontColumns = await hasColumns(client, "fonts", ["authored_by_store_id"]);
  const fontConstraints = await hasConstraints(client, [fontOwnershipConstraint]);
  if (fontColumns.has("authored_by_store_id") && fontConstraints.has(fontOwnershipConstraint)) {
    applied.add("0003_font_catalog_store_ownership");
  }

  const fontNotes = await hasColumns(client, "fonts", ["notes"]);
  if (fontNotes.has("notes")) {
    applied.add("0004_font_catalog_notes");
  }

  // Planner interiors shipped before this project had a fully tracked ledger in
  // one shared development database. Record the migration only after proving its
  // complete contract exists; a partial schema must still be repaired by hand.
  const plannerInteriorColumns = await hasColumns(client, "planner_interiors", [
    "id", "store_id", "name", "current_version_id", "created_at", "updated_at",
  ]);
  const plannerInteriorVersionColumns = await hasColumns(client, "planner_interior_versions", [
    "id", "interior_id", "version", "manifest", "assets", "created_at",
  ]);
  const editionInteriorColumns = await hasColumns(client, "editions", ["interior_version_id"]);
  const plannerInteriorConstraints = [
    "planner_interiors_store_id_stores_id_fk",
    "planner_interior_versions_interior_id_planner_interiors_id_fk",
    "planner_interiors_current_version_id_planner_interior_versions_id_fk",
    "editions_interior_version_id_planner_interior_versions_id_fk",
  ].map(normaliseIdentifier);
  const plannerInteriorIndexes = [
    "planner_interiors_store_id_idx",
    "planner_interior_versions_interior_version_uq",
    "planner_interior_versions_interior_id_idx",
    "editions_interior_version_id_idx",
  ];
  const [existingPlannerConstraints, existingPlannerIndexes, hasPlannerTrigger] = await Promise.all([
    hasConstraints(client, plannerInteriorConstraints),
    hasIndexes(client, plannerInteriorIndexes),
    hasTrigger(client, "planner_interior_versions_immutable_trigger"),
  ]);
  const hasAnyPlannerInteriorState = [
    plannerInteriorColumns.size,
    plannerInteriorVersionColumns.size,
    editionInteriorColumns.size,
    existingPlannerConstraints.size,
    existingPlannerIndexes.size,
    hasPlannerTrigger ? 1 : 0,
  ].some(Boolean);
  const hasCompletePlannerInteriorState =
    plannerInteriorColumns.size === 6
    && plannerInteriorVersionColumns.size === 6
    && editionInteriorColumns.size === 1
    && existingPlannerConstraints.size === plannerInteriorConstraints.length
    && existingPlannerIndexes.size === plannerInteriorIndexes.length
    && hasPlannerTrigger;
  if (hasCompletePlannerInteriorState) {
    applied.add("0016_planner_interiors");
  } else if (hasAnyPlannerInteriorState) {
    throw new Error(
      "Cannot safely record planner interior migration history: the schema is partial. "
      + "Restore or complete the planner interior contract before running migrate.",
    );
  }

  return applied;
}

async function repairKnownOutOfOrderLedger(client, migrations, ledgerRows) {
  const migrationByTag = new Map(migrations.map(migration => [migration.tag, migration]));
  const legacyMigrations = knownOutOfOrderLedgerTags.map(tag => migrationByTag.get(tag));
  if (ledgerRows.length < legacyMigrations.length) return false;

  // A database can have been deployed after the older order was recorded but
  // before a later migration existed. Accept only a contiguous canonical suffix;
  // missing, duplicate, unknown, or otherwise reordered rows remain untouched
  // and are still rejected by verify-migration.
  const legacyTags = new Set(knownOutOfOrderLedgerTags);
  const expectedLegacyOrder = [
    ...legacyMigrations,
    ...migrations.filter(migration => !legacyTags.has(migration.tag)),
  ];
  if (
    ledgerRows.length > expectedLegacyOrder.length
    || !ledgerRows.every((row, index) => ledgerRowMatchesMigration(row, expectedLegacyOrder[index]))
  ) {
    return false;
  }

  for (const [index, migration] of migrations.slice(0, ledgerRows.length).entries()) {
    await client.query(
      `
        UPDATE "drizzle"."__drizzle_migrations"
        SET hash = $1, created_at = $2
        WHERE id = $3
      `,
      [migration.hash, migration.createdAt, ledgerRows[index].id],
    );
  }

  return true;
}

/**
 * The first checked-in seller checkout migration was corrected before release:
 * databases that had already applied the original SQL have its complete final
 * contract, but its ledger checksum no longer matches the corrected file.
 *
 * Normalize only that exact historic checksum, only after proving the expected
 * postconditions. This is deliberately narrower than a generic hash rewrite.
 */
async function repairKnownSellerCheckoutRevision(client, migrations, ledgerRows) {
  const index = migrations.findIndex(migration => migration.tag === sellerCheckoutTag);
  if (index < 0 || !ledgerRows[index]) return false;
  const migration = migrations[index];
  const row = ledgerRows[index];
  if (
    ![sellerCheckoutOriginalHash, sellerCheckoutPreWave9Hash].includes(row.hash)
    || String(row.created_at) !== String(migration.createdAt)
  ) return false;

  const { rows: contractRows } = await client.query(`
    SELECT
      (
        SELECT count(*) = 4
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'stores' AND column_name IN ('stripe_account_id', 'stripe_charges_enabled'))
            OR
            (table_name = 'payments' AND column_name IN ('stripe_checkout_session_id', 'stripe_connected_account_id'))
          )
      ) AS has_columns,
      (
        SELECT is_nullable = 'YES'
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'user_id'
      ) AS user_id_nullable,
      (
        SELECT is_nullable = 'YES'
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'plan_id'
      ) AS plan_id_nullable,
      EXISTS (
        SELECT 1 FROM stores
        WHERE id = 'store-house' AND slug = 'pixel-perfect-plans'
      ) AS house_normalized,
      EXISTS (
        SELECT 1 FROM stores
        WHERE id = 'store-platform' AND slug = 'daybook-platform'
      ) AS platform_present
  `);
  const contract = contractRows[0];
  if (
    !contract?.has_columns
    || !contract?.user_id_nullable
    || !contract?.plan_id_nullable
    || !contract?.house_normalized
    || !contract?.platform_present
  ) return false;

  await client.query(
    `
      UPDATE "drizzle"."__drizzle_migrations"
      SET hash = $1, created_at = $2
      WHERE id = $3 AND hash = $4
    `,
    [migration.hash, migration.createdAt, row.id, row.hash],
  );
  return true;
}

/**
 * A follow-up correction makes product/edition de-duplication independent of
 * serial insertion order. Only normalize the exact previously applied Wave 9
 * checksum after proving the cart-integrity schema is already present.
 */
async function repairKnownWave9CartIntegrityRevision(client, migrations, ledgerRows) {
  const index = migrations.findIndex(migration => migration.tag === wave9CartIntegrityTag);
  if (index < 0 || !ledgerRows[index]) return false;
  const migration = migrations[index];
  const row = ledgerRows[index];
  if (
    row.hash !== wave9CartIntegrityPreCorrectionHash
    || String(row.created_at) !== String(migration.createdAt)
  ) return false;

  const { rows } = await client.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'editions'
          AND column_name = 'digital_price_cents'
      ) AS has_digital_price,
      to_regclass('public.checkout_intents') IS NOT NULL AS has_checkout_intents,
      NOT EXISTS (
        SELECT 1 FROM store_catalog WHERE item_type = 'product'
      ) AS catalog_normalized
  `);
  const contract = rows[0];
  if (!contract?.has_digital_price || !contract?.has_checkout_intents || !contract?.catalog_normalized) {
    return false;
  }
  await client.query(
    `
      UPDATE "drizzle"."__drizzle_migrations"
      SET hash = $1, created_at = $2
      WHERE id = $3 AND hash = $4
    `,
    [migration.hash, migration.createdAt, row.id, row.hash],
  );
  return true;
}

async function prepareMigrationLedger() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('daybook-drizzle-baseline'))");

    const migrations = await getTrackedMigrations();
    const ledgerTable = await client.query(`
      SELECT to_regclass('drizzle.__drizzle_migrations') AS name
    `);
    let ledgerRows = [];
    let ledgerClassification = { kind: "empty" };
    if (ledgerTable.rows[0].name) {
      const ledgerColumns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'drizzle'
          AND table_name = '__drizzle_migrations'
      `);
      const missingColumns = missingLedgerColumns(
        ledgerColumns.rows.map(row => row.column_name),
      );
      if (missingColumns.length) {
        throw new Error(describeLedgerSchemaRecovery(missingColumns));
      }
      const incompatibleColumns = incompatibleLedgerColumns(ledgerColumns.rows);
      if (incompatibleColumns.length) {
        throw new Error(describeLedgerTypeRecovery(incompatibleColumns));
      }

      const ledger = await client.query(`
        SELECT id, hash, created_at
        FROM "drizzle"."__drizzle_migrations"
        ORDER BY id
      `);
      ledgerRows = ledger.rows;
      const repairedSellerCheckoutRevision = await repairKnownSellerCheckoutRevision(
        client,
        migrations,
        ledgerRows,
      );
      if (repairedSellerCheckoutRevision) {
        const refreshedLedger = await client.query(`
          SELECT id, hash, created_at
          FROM "drizzle"."__drizzle_migrations"
          ORDER BY id
        `);
        ledgerRows = refreshedLedger.rows;
        console.log("✓ Normalized the known seller checkout migration revision after contract verification.");
      }
      const repairedWave9CartIntegrityRevision = await repairKnownWave9CartIntegrityRevision(
        client,
        migrations,
        ledgerRows,
      );
      if (repairedWave9CartIntegrityRevision) {
        const refreshedLedger = await client.query(`
          SELECT id, hash, created_at
          FROM "drizzle"."__drizzle_migrations"
          ORDER BY id
        `);
        ledgerRows = refreshedLedger.rows;
        console.log("✓ Normalized the known Wave 9 cart-integrity migration revision after contract verification.");
      }
      ledgerClassification = classifyMigrationLedger(ledgerRows, migrations);
      if (ledgerClassification.kind === "invalid") {
        throw new Error(describeLedgerRecovery(ledgerClassification));
      }
    }

    let repairedKnownLedger = false;
    if (ledgerClassification.kind === "supportedHistorical") {
      repairedKnownLedger = await repairKnownOutOfOrderLedger(client, migrations, ledgerRows);
      if (!repairedKnownLedger) {
        throw new Error(
          "Cannot safely repair the supported historical Drizzle ledger after classification changed. "
          + "Retry only after diagnosing concurrent migration activity.",
        );
      }
    }

    const fingerprint = await getLegacySchemaFingerprint(client);
    if (!fingerprint.hasKnownDaybookTable) {
      await client.query("COMMIT");
      return;
    }

    const unknownMismatches = fingerprint.mismatches
      .filter(mismatch => !knownLegacyBaselineMismatches.has(mismatch));
    if (unknownMismatches.length) {
      throw new Error(
        `Cannot safely baseline this database: it contains a partial pre-ledger Daybook schema (${describeMismatches(unknownMismatches)}). `
        + `Restore or repair it to match ${baselineTag} before running migrate; do not use drizzle push or insert migration records manually.`,
      );
    }
    if (fingerprint.mismatches.length) {
      console.log(
        `✓ Recognized ${fingerprint.mismatches.length} repairable legacy schema difference(s); `
        + "the tracked repair migration will normalize them.",
      );
    }

    const alreadyAppliedTags = await getAlreadyAppliedMigrationTags(client);
    await client.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const recordedTags = [];
    for (const migration of migrations) {
      if (!alreadyAppliedTags.has(migration.tag)) continue;

      const { rowCount } = await client.query(
        `
          INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
          SELECT $1, $2
          WHERE NOT EXISTS (
            SELECT 1
            FROM "drizzle"."__drizzle_migrations"
            WHERE hash = $1
          )
        `,
        [migration.hash, migration.createdAt],
      );
      if (rowCount) recordedTags.push(migration.tag);
    }

    await client.query("COMMIT");

    if (recordedTags.length) {
      console.log(`✓ Recorded existing tracked schema history: ${recordedTags.join(", ")}`);
    }
    if (repairedKnownLedger) {
      console.log(
        "✓ Normalized the known legacy Drizzle ledger order; no manual ledger edits were required.",
      );
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await prepareMigrationLedger();