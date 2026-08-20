/**
 * WorldSmith Run Repository
 * Persists and queries compilation/generation runs for audit and recovery.
 */
import { db } from "@workspace/db";
import { worldsmithRunsTable, type InsertWorldsmithRun, type NotionRetryEvent } from "@workspace/db";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ValidationError, CompiledSectionRecord } from "./types";

export interface CreateRunInput {
  productionSpecId: string;
  operation: "validate_and_compile" | "compile_and_generate" | "preview";
  dryRun: boolean;
  initiatedBy?: string;
}

export async function createRun(input: CreateRunInput): Promise<string> {
  const id = randomUUID();
  const row: InsertWorldsmithRun = {
    id,
    productionSpecId: input.productionSpecId,
    operation: input.operation,
    status: "pending",
    dryRun: input.dryRun,
    initiatedBy: input.initiatedBy ?? null,
    startedAt: new Date(),
    retryCount: 0,
  };
  await db.insert(worldsmithRunsTable).values(row);
  return id;
}

export interface RunUpdate {
  status?: string;
  payloadVersion?: string;
  compiledPrompt?: string;
  promptHash?: string;
  compiledPromptStatus?: string;
  visualAssetNotionId?: string;
  assetId?: string;
  assetVersion?: string;
  provider?: string;
  modelName?: string;
  modelVersion?: string;
  generationSettings?: Record<string, unknown>;
  seed?: string;
  providerRequestId?: string;
  costUsd?: number;
  driveFileId?: string;
  driveFolderId?: string;
  driveUrl?: string;
  daybookAssetId?: string;
  errors?: ValidationError[];
  warnings?: ValidationError[];
  failedStage?: string;
  errorCode?: string;
  resolvedSourceIds?: Record<string, string | string[]>;
  retryCount?: number;
  notionRetries?: NotionRetryEvent[];
  /** Structured per-section records produced by the compiler — stored for run history display. */
  compiledSections?: CompiledSectionRecord[];
  completedAt?: Date;
}

export async function updateRun(runId: string, update: RunUpdate): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (update.status !== undefined) patch.status = update.status;
  if (update.payloadVersion !== undefined) patch.payloadVersion = update.payloadVersion;
  if (update.compiledPrompt !== undefined) patch.compiledPrompt = update.compiledPrompt;
  if (update.promptHash !== undefined) patch.promptHash = update.promptHash;
  if (update.compiledPromptStatus !== undefined) patch.compiledPromptStatus = update.compiledPromptStatus;
  if (update.visualAssetNotionId !== undefined) patch.visualAssetNotionId = update.visualAssetNotionId;
  if (update.assetId !== undefined) patch.assetId = update.assetId;
  if (update.assetVersion !== undefined) patch.assetVersion = update.assetVersion;
  if (update.provider !== undefined) patch.provider = update.provider;
  if (update.modelName !== undefined) patch.modelName = update.modelName;
  if (update.modelVersion !== undefined) patch.modelVersion = update.modelVersion;
  if (update.generationSettings !== undefined) patch.generationSettings = update.generationSettings;
  if (update.seed !== undefined) patch.seed = update.seed;
  if (update.providerRequestId !== undefined) patch.providerRequestId = update.providerRequestId;
  if (update.costUsd !== undefined) patch.costUsd = update.costUsd;
  if (update.driveFileId !== undefined) patch.driveFileId = update.driveFileId;
  if (update.driveFolderId !== undefined) patch.driveFolderId = update.driveFolderId;
  if (update.driveUrl !== undefined) patch.driveUrl = update.driveUrl;
  if (update.daybookAssetId !== undefined) patch.daybookAssetId = update.daybookAssetId;
  if (update.errors !== undefined) patch.errors = update.errors;
  if (update.warnings !== undefined) patch.warnings = update.warnings;
  if (update.failedStage !== undefined) patch.failedStage = update.failedStage;
  if (update.errorCode !== undefined) patch.errorCode = update.errorCode;
  if (update.resolvedSourceIds !== undefined) patch.resolvedSourceIds = update.resolvedSourceIds;
  if (update.retryCount !== undefined) patch.retryCount = update.retryCount;
  if (update.notionRetries !== undefined) patch.notionRetries = update.notionRetries;
  if (update.compiledSections !== undefined) patch.compiledSections = update.compiledSections;
  if (update.completedAt !== undefined) patch.completedAt = update.completedAt;

  if (Object.keys(patch).length === 0) return;
  await db.update(worldsmithRunsTable).set(patch).where(eq(worldsmithRunsTable.id, runId));
}

export async function getRun(runId: string) {
  const rows = await db
    .select()
    .from(worldsmithRunsTable)
    .where(eq(worldsmithRunsTable.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRunsBySpec(productionSpecId: string, limit = 10) {
  return db
    .select()
    .from(worldsmithRunsTable)
    .where(eq(worldsmithRunsTable.productionSpecId, productionSpecId))
    .orderBy(worldsmithRunsTable.startedAt)
    .limit(limit);
}

/** Mark a run as failed, recording the stage and error code. */
export async function failRun(
  runId: string,
  stage: string,
  errorCode: string,
  errors: ValidationError[],
  existingVisualAssetId?: string | null,
  existingDriveFileId?: string | null,
): Promise<void> {
  await updateRun(runId, {
    status: "failed",
    failedStage: stage,
    errorCode,
    errors,
    completedAt: new Date(),
  });
}

/**
 * On startup (or periodically), mark any run that is still in
 * 'compiling' or 'pending' after `staleAfterMinutes` as failed
 * with errorCode INTERRUPTED.  Returns the number of rows updated.
 */
export async function recoverStaleRuns(staleAfterMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMinutes * 60 * 1000);

  const staleRows = await db
    .select({ id: worldsmithRunsTable.id })
    .from(worldsmithRunsTable)
    .where(
      and(
        inArray(worldsmithRunsTable.status, ["compiling", "pending"]),
        lt(worldsmithRunsTable.startedAt, cutoff),
      ),
    );

  if (staleRows.length === 0) return 0;

  const interruptedError = {
    code: "INTERRUPTED",
    field: "server",
    governing_rule: "CS-000",
    message: "The server restarted while this run was in progress.",
    recommended_action: "Retry the compilation.",
  };

  for (const row of staleRows) {
    await updateRun(row.id, {
      status: "failed",
      failedStage: "server_restart",
      errorCode: "INTERRUPTED",
      errors: [interruptedError],
      completedAt: new Date(),
    });
  }

  return staleRows.length;
}

/**
 * Before starting a new run for a given spec, fail any run that is
 * still stuck in 'compiling' or 'pending' for that spec (regardless
 * of age). Returns the number of rows recovered.
 */
export async function failStaleRunsForSpec(productionSpecId: string): Promise<number> {
  const staleRows = await db
    .select({ id: worldsmithRunsTable.id })
    .from(worldsmithRunsTable)
    .where(
      and(
        eq(worldsmithRunsTable.productionSpecId, productionSpecId),
        inArray(worldsmithRunsTable.status, ["compiling", "pending"]),
      ),
    );

  if (staleRows.length === 0) return 0;

  const interruptedError = {
    code: "INTERRUPTED",
    field: "server",
    governing_rule: "CS-000",
    message: "A new compile was requested for this spec while a previous run was still in progress.",
    recommended_action: "The previous run has been marked as interrupted.",
  };

  for (const row of staleRows) {
    await updateRun(row.id, {
      status: "failed",
      failedStage: "superseded",
      errorCode: "INTERRUPTED",
      errors: [interruptedError],
      completedAt: new Date(),
    });
  }

  return staleRows.length;
}
