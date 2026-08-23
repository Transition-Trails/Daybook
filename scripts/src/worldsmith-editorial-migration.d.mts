export type EditorialMigrationClient = {
  query(sql: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
  release(): void;
};

export type EditorialMigrationPool = {
  connect(): Promise<EditorialMigrationClient>;
  end(): Promise<void>;
};

export function applyWorldsmithEditorialMigration(
  client: EditorialMigrationClient,
  schema?: string,
): Promise<void>;

export function runWorldsmithEditorialMigration(
  pool: EditorialMigrationPool,
): Promise<void>;