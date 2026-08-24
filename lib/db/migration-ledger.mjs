/**
 * Classifies the rows in Drizzle's migration ledger without changing them.
 *
 * The canonical order is the checked-in journal order. One older shared
 * development database is also supported: its first seven rows were recorded
 * in introduction order and may be followed only by the canonical suffix.
 * Everything else must be diagnosed before the migration runner is allowed to
 * apply schema changes.
 */
const knownOutOfOrderLedgerTags = [
  "0000_verify-canon-relation-primary-key",
  "0002_rel-canon-columns",
  "0004_font_catalog_notes",
  "0005_repair_legacy_catalog_baseline",
  "0006_repair_skipped_legacy_dependencies",
  "0001_long_punisher",
  "0003_font_catalog_store_ownership",
];

function ledgerRowMatchesMigration(row, migration) {
  return row.hash === migration.hash
    && String(row.created_at) === String(migration.createdAt);
}

function findMigrationIndex(row, migrations) {
  return migrations.findIndex(migration => ledgerRowMatchesMigration(row, migration));
}

function historicalOrder(migrations) {
  const migrationByTag = new Map(migrations.map(migration => [migration.tag, migration]));
  const legacyMigrations = knownOutOfOrderLedgerTags.map(tag => migrationByTag.get(tag));
  if (legacyMigrations.some(migration => !migration)) {
    return null;
  }

  const legacyTags = new Set(knownOutOfOrderLedgerTags);
  return [
    ...legacyMigrations,
    ...migrations.filter(migration => !legacyTags.has(migration.tag)),
  ];
}

/**
 * @returns {{ kind: "empty" | "canonical" | "supportedHistorical" | "invalid", reason?: string }}
 */
export function classifyMigrationLedger(ledgerRows, migrations) {
  if (ledgerRows.length === 0) {
    return { kind: "empty" };
  }

  const canonicalPrefix = ledgerRows.length <= migrations.length
    && ledgerRows.every((row, index) => ledgerRowMatchesMigration(row, migrations[index]));
  if (canonicalPrefix) {
    return { kind: "canonical" };
  }

  const historicalMigrations = historicalOrder(migrations);
  const supportedHistorical = historicalMigrations
    && ledgerRows.length >= knownOutOfOrderLedgerTags.length
    && ledgerRows.length <= historicalMigrations.length
    && ledgerRows.every((row, index) => ledgerRowMatchesMigration(row, historicalMigrations[index]));
  if (supportedHistorical) {
    return { kind: "supportedHistorical" };
  }

  const migrationIndexes = ledgerRows.map(row => findMigrationIndex(row, migrations));
  const unknownRows = migrationIndexes
    .map((migrationIndex, index) => migrationIndex === -1 ? index + 1 : null)
    .filter(index => index !== null);
  if (unknownRows.length) {
    return {
      kind: "invalid",
      reason: `unknown migration record(s) at ledger row(s) ${unknownRows.join(", ")}`,
    };
  }

  const seenIndexes = new Set();
  const duplicateRows = [];
  for (const [index, migrationIndex] of migrationIndexes.entries()) {
    if (seenIndexes.has(migrationIndex)) duplicateRows.push(index + 1);
    seenIndexes.add(migrationIndex);
  }
  if (duplicateRows.length) {
    return {
      kind: "invalid",
      reason: `duplicate migration record(s) at ledger row(s) ${duplicateRows.join(", ")}`,
    };
  }

  return {
    kind: "invalid",
    reason: "a gap or order different from the checked-in migration journal",
  };
}

export function describeLedgerRecovery(classification) {
  return (
    `Cannot safely run tracked migrations: the existing Drizzle ledger has ${classification.reason}. `
    + "No schema changes were made. Back up the database, diagnose the history, and restore it "
    + "to the checked-in journal order before retrying "
    + "`pnpm --filter @workspace/db run migrate`; then run "
    + "`pnpm --filter @workspace/db run verify-migration`. "
    + "Do not insert, delete, or reorder migration-ledger rows by hand, and do not use drizzle push."
  );
}

export { knownOutOfOrderLedgerTags, ledgerRowMatchesMigration };