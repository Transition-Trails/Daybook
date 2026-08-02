/**
 * Daybook Adapter
 * Registers and updates WorldSmith-generated assets in Daybook's own database.
 * Upserts are idempotent — retrying with the same Asset ID never creates duplicates.
 */
import { db } from "@workspace/db";
import { worldsmithAssetsTable, type InsertWorldsmithAsset } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { DaybookAssetPayload, DaybookResult } from "./types";

export async function upsertAsset(payload: DaybookAssetPayload): Promise<DaybookResult> {
  const existing = await db
    .select()
    .from(worldsmithAssetsTable)
    .where(eq(worldsmithAssetsTable.id, payload.asset_id))
    .limit(1);

  if (existing.length > 0) {
    // Update in place — never mutate the immutable Asset ID
    await db
      .update(worldsmithAssetsTable)
      .set({
        filename: payload.filename,
        currentVersion: payload.version,
        productionSpecNotionId: payload.production_specification_id ?? null,
        visualAssetNotionId: payload.visual_asset_id ?? null,
        driveFileId: payload.google_drive_file_id ?? null,
        driveUrl: payload.google_drive_url ?? null,
        promptHash: payload.prompt_hash ?? null,
        generationProvider: payload.generation_provider ?? null,
        modelName: payload.model_name ?? null,
        providerRequestId: payload.provider_request_id ?? null,
        readinessState: payload.readiness_state,
        updatedAt: new Date(payload.updated_at),
      })
      .where(eq(worldsmithAssetsTable.id, payload.asset_id));
    return { asset_id: payload.asset_id, created: false };
  }

  // Insert new asset
  const insert: InsertWorldsmithAsset = {
    id: payload.asset_id,
    assetName: payload.filename.replace(/\.[^.]+$/, "").replace(/_/g, " "),
    assetType: payload.component_type,
    world: payload.world,
    volume: payload.volume ?? null,
    componentType: payload.component_type,
    currentVersion: payload.version,
    filename: payload.filename,
    productionSpecNotionId: payload.production_specification_id ?? null,
    visualAssetNotionId: payload.visual_asset_id ?? null,
    driveFileId: payload.google_drive_file_id ?? null,
    driveUrl: payload.google_drive_url ?? null,
    promptHash: payload.prompt_hash ?? null,
    generationProvider: payload.generation_provider ?? null,
    modelName: payload.model_name ?? null,
    providerRequestId: payload.provider_request_id ?? null,
    readinessState: payload.readiness_state,
    createdAt: new Date(),
    updatedAt: new Date(payload.updated_at),
  };

  await db.insert(worldsmithAssetsTable).values(insert);
  return { asset_id: payload.asset_id, created: true };
}

export async function getAsset(assetId: string) {
  const rows = await db
    .select()
    .from(worldsmithAssetsTable)
    .where(eq(worldsmithAssetsTable.id, assetId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAssetBySpec(productionSpecNotionId: string) {
  const rows = await db
    .select()
    .from(worldsmithAssetsTable)
    .where(eq(worldsmithAssetsTable.productionSpecNotionId, productionSpecNotionId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Build a stable logical Asset ID from spec fields.
 * Pattern: WS-{WORLD}-{VOLUME}-{TYPE}{SEQUENCE}-{ROLE}
 * e.g. WS-WYC-V01-HP001-MASTER
 *
 * For MVP we derive the world/volume abbreviations and use the spec's
 * stable production-record ID as the sequence component when available.
 */
export function buildAssetId(
  world: string,
  volume: string | undefined,
  componentType: string,
  sequenceOrSpecId: string,
  role = "MASTER",
): string {
  const worldCode = abbreviate(world, 3).toUpperCase();
  const volCode = volume ? "V" + abbreviate(volume.replace(/[^0-9]/g, "").padStart(2, "0"), 2) : "V01";
  const typeCode = componentTypeCode(componentType);
  const seq = sequenceOrSpecId.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6).padStart(3, "0");
  return `WS-${worldCode}-${volCode}-${typeCode}${seq}-${role}`;
}

export function buildFilename(
  world: string,
  volume: string | undefined,
  componentType: string,
  sequenceOrSpecId: string,
  role = "Master",
  version: string,
  ext = "png",
): string {
  const worldCode = abbreviate(world, 3).toUpperCase();
  const volCode = volume ? "V" + abbreviate(volume.replace(/[^0-9]/g, "").padStart(2, "0"), 2) : "V01";
  const typeCode = componentTypeCode(componentType);
  const seq = sequenceOrSpecId.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6).padStart(3, "0");
  const ver = version.startsWith("v") ? version : `v${version}`;
  return `${worldCode}_${volCode}_${typeCode}${seq}_${role}_${ver}.${ext}`;
}

function abbreviate(s: string, maxLen: number): string {
  return s
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, maxLen);
}

const COMPONENT_CODE_MAP: Record<string, string> = {
  "Hero Paper": "HP",
  "Decorative Paper": "DP",
  "Coordinating Paper": "CP",
  "Journal Card": "JC",
  "Ephemera Sheet": "ES",
  "Cover Art": "CA",
  "Insert": "IN",
};

function componentTypeCode(componentType: string): string {
  return COMPONENT_CODE_MAP[componentType] ?? componentType.replace(/[^A-Z]/g, "").slice(0, 2);
}
