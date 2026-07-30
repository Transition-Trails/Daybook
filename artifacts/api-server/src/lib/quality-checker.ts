/**
 * Quality Checker
 *
 * Validates catalog and planner items against the invariants that have actually
 * broken in production during development.  Each checker function returns a list
 * of CheckResult objects — one per item inspected.
 *
 * Rules:
 *   theme:         colors[] must be non-empty  (at least one required slot filled)
 *   pack:          must have ≥1 sticker OR an instruction sheet file ID
 *   asset:         transparent must be true when the asset is used as a sticker
 *   edition:       art.cover, art.first, art.divider — each drive_file_id must
 *                  resolve to a real assets row
 *   recipe:        claudeBrief.engineGaps must contain no "Blocks release" entries
 *   plannerConfig: output.sampleLinks[].href must not use a .test TLD
 *
 * The ci_bad_* seed fixtures deliberately violate one rule each.
 * A passing quality-checker run against those fixtures is a false green.
 */

import { db } from "@workspace/db";
import {
  themesTable,
  stickerPacksTable,
  stickersTable,
  assetsTable,
  editionsTable,
  plannerConfigsTable,
  productRecipesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { UI_REACHABLE_FAMILIES } from "./pdf-generator";
import { getBundleCoverageGaps } from "./font-warmup";

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckKind =
  | "theme"
  | "pack"
  | "sticker_asset"
  | "edition"
  | "recipe"
  | "planner_config"
  | "font_coverage";

export interface CheckResult {
  kind:   CheckKind;
  id:     string;
  pass:   boolean;
  reason: string;
}

// ── Individual checkers ───────────────────────────────────────────────────────

/** Themes must have at least one colour in their colors[] slot. */
export async function checkThemes(ids?: string[]): Promise<CheckResult[]> {
  const rows = ids?.length
    ? await db.select({ id: themesTable.id, colors: themesTable.colors })
        .from(themesTable)
        .where(inArray(themesTable.id, ids))
    : await db.select({ id: themesTable.id, colors: themesTable.colors })
        .from(themesTable);

  return rows.map((r) => {
    const colors = (r.colors as string[] | null) ?? [];
    return {
      kind:   "theme" as const,
      id:     r.id,
      pass:   colors.length > 0,
      reason: colors.length > 0
        ? "ok"
        : "empty required slot: colors[] has no entries",
    };
  });
}

/**
 * Packs must either have ≥1 sticker linked OR an instruction sheet file ID.
 * A pack with no stickers AND no sheet is an empty shell — buyers see a blank pack.
 */
export async function checkPacks(ids?: string[]): Promise<CheckResult[]> {
  const packs = ids?.length
    ? await db.select({ id: stickerPacksTable.id, instructionSheetFileId: stickerPacksTable.instructionSheetFileId })
        .from(stickerPacksTable)
        .where(inArray(stickerPacksTable.id, ids))
    : await db.select({ id: stickerPacksTable.id, instructionSheetFileId: stickerPacksTable.instructionSheetFileId })
        .from(stickerPacksTable);

  if (!packs.length) return [];

  const packIds = packs.map((p) => p.id);
  const stickerCounts = await db
    .select({ packId: stickersTable.packId })
    .from(stickersTable)
    .where(inArray(stickersTable.packId, packIds));

  const countByPack = new Map<string, number>();
  for (const s of stickerCounts) {
    countByPack.set(s.packId, (countByPack.get(s.packId) ?? 0) + 1);
  }

  return packs.map((p) => {
    const stickerCount = countByPack.get(p.id) ?? 0;
    const hasSheet = Boolean(p.instructionSheetFileId);
    const pass = stickerCount > 0 || hasSheet;
    return {
      kind:   "pack" as const,
      id:     p.id,
      pass,
      reason: pass ? "ok" : "no index sheet: pack has no stickers and no instruction sheet file",
    };
  });
}

/**
 * Assets used as stickers must be transparent (background pixels removed).
 * transparent=false means the cutout failed — the sticker will have a white box.
 */
export async function checkStickerAssets(ids?: string[]): Promise<CheckResult[]> {
  // Join stickers → assets so we only inspect assets that are actually used as stickers.
  const stickerRows = await db
    .select({ assetId: stickersTable.assetId })
    .from(stickersTable);

  const stickerAssetIds = [...new Set(stickerRows.map((s) => s.assetId))];
  if (!stickerAssetIds.length) return [];

  const targetIds = ids?.length
    ? stickerAssetIds.filter((id) => ids.includes(id))
    : stickerAssetIds;

  if (!targetIds.length) return [];

  const assets = await db
    .select({ id: assetsTable.id, transparent: assetsTable.transparent })
    .from(assetsTable)
    .where(inArray(assetsTable.id, targetIds));

  return assets.map((a) => ({
    kind:   "sticker_asset" as const,
    id:     a.id,
    pass:   a.transparent === true,
    reason: a.transparent === true
      ? "ok"
      : "cutout incomplete: asset transparent=false — background pixels remain",
  }));
}

/**
 * Edition art slots (cover, first, divider) that contain a drive_file_id must
 * have a matching row in the assets table.  A missing row means the asset was
 * deleted after the edition was saved — the export will error at generation time.
 */
export async function checkEditions(ids?: string[]): Promise<CheckResult[]> {
  const rows = ids?.length
    ? await db.select({ id: editionsTable.id, art: editionsTable.art })
        .from(editionsTable)
        .where(inArray(editionsTable.id, ids))
    : await db.select({ id: editionsTable.id, art: editionsTable.art })
        .from(editionsTable);

  // Collect all drive_file_ids referenced in art slots
  type ArtSlots = Partial<Record<"cover" | "first" | "divider" | "weekly" | "daily" | "notes", string>>;
  const ART_SLOTS: Array<keyof ArtSlots> = ["cover", "first", "divider", "weekly", "daily", "notes"];

  const results: CheckResult[] = [];
  const allDriveFileIds = new Set<string>();
  const editionDriveMap = new Map<string, string[]>();

  for (const row of rows) {
    const art = (row.art ?? {}) as ArtSlots;
    const refs: string[] = [];
    for (const slot of ART_SLOTS) {
      const ref = art[slot];
      if (ref && typeof ref === "string") {
        refs.push(ref);
        allDriveFileIds.add(ref);
      }
    }
    editionDriveMap.set(row.id, refs);
  }

  if (!allDriveFileIds.size) {
    // No art slots set — nothing to validate
    return rows.map((r) => ({ kind: "edition" as const, id: r.id, pass: true, reason: "ok — no art refs" }));
  }

  // Resolve which drive_file_ids exist in the assets table
  const allFileIds = [...allDriveFileIds];
  const foundAssets = await db
    .select({ driveFileId: assetsTable.driveFileId })
    .from(assetsTable)
    .where(inArray(assetsTable.driveFileId, allFileIds));

  const foundSet = new Set(foundAssets.map((a) => a.driveFileId));

  for (const row of rows) {
    const refs = editionDriveMap.get(row.id) ?? [];
    const orphaned = refs.filter((ref) => !foundSet.has(ref));
    const pass = orphaned.length === 0;
    results.push({
      kind:   "edition" as const,
      id:     row.id,
      pass,
      reason: pass
        ? "ok"
        : `orphaned asset reference: drive_file_id(s) not found in assets — ${orphaned.join(", ")}`,
    });
  }

  return results;
}

/**
 * A recipe with a "Blocks release" engine gap cannot be published.
 * Finding one in the DB in "live" status means the publish gate was bypassed.
 */
export async function checkRecipes(ids?: string[]): Promise<CheckResult[]> {
  const rows = ids?.length
    ? await db.select({ id: productRecipesTable.id, status: productRecipesTable.status, claudeBrief: productRecipesTable.claudeBrief })
        .from(productRecipesTable)
        .where(inArray(productRecipesTable.id, ids))
    : await db.select({ id: productRecipesTable.id, status: productRecipesTable.status, claudeBrief: productRecipesTable.claudeBrief })
        .from(productRecipesTable);

  return rows.map((r) => {
    type Gap = { severity?: string; [k: string]: unknown };
    const brief = (r.claudeBrief ?? {}) as { engineGaps?: Gap[] };
    const blockingGaps = (brief.engineGaps ?? []).filter((g) => g.severity === "Blocks release");
    const pass = blockingGaps.length === 0;
    return {
      kind:   "recipe" as const,
      id:     r.id,
      pass,
      reason: pass
        ? "ok"
        : `${blockingGaps.length} blocking engine gap(s): ${blockingGaps.map((g) => g.gap ?? "unknown").join(", ")}`,
    };
  });
}

/**
 * Planner configs must not contain hyperlinks pointing to domains that cannot
 * resolve.  The .test TLD is RFC-2606-reserved and never resolves in production.
 */
export async function checkPlannerConfigs(ids?: string[]): Promise<CheckResult[]> {
  const rows = ids?.length
    ? await db.select({ id: plannerConfigsTable.id, output: plannerConfigsTable.output })
        .from(plannerConfigsTable)
        .where(inArray(plannerConfigsTable.id, ids))
    : await db.select({ id: plannerConfigsTable.id, output: plannerConfigsTable.output })
        .from(plannerConfigsTable);

  return rows.map((r) => {
    type Link = { label?: string; href?: string };
    const output = (r.output ?? {}) as { sampleLinks?: Link[] };
    const links = output.sampleLinks ?? [];
    const badLinks = links.filter((l) => {
      try {
        const u = new URL(l.href ?? "");
        // .test TLD is reserved and never resolves outside of test environments
        return u.hostname.endsWith(".test");
      } catch {
        return true; // malformed URL also fails
      }
    });
    const pass = badLinks.length === 0;
    return {
      kind:   "planner_config" as const,
      id:     r.id,
      pass,
      reason: pass
        ? "ok"
        : `unresolvable hyperlink target(s): ${badLinks.map((l) => l.href).join(", ")}`,
    };
  });
}

/**
 * Font bundle coverage.
 * Every family selectable in the UI must have a bundled WOFF file.
 * Returns one result per gap (or a single "all covered" pass result).
 */
export function checkFontCoverage(): CheckResult[] {
  const gaps = getBundleCoverageGaps();
  if (gaps.length === 0) {
    return [{
      kind:   "font_coverage",
      id:     "__all__",
      pass:   true,
      reason: `all ${UI_REACHABLE_FAMILIES.size} UI-reachable families have bundled WOFF files`,
    }];
  }
  return gaps.map((family) => ({
    kind:   "font_coverage" as const,
    id:     family,
    pass:   false,
    reason: `no bundled WOFF file — UI allows selection but PDF will silently substitute`,
  }));
}

// ── Aggregate runner ──────────────────────────────────────────────────────────

export interface QualityReport {
  runAt:   string;
  totals:  { checked: number; passed: number; failed: number };
  results: CheckResult[];
}

export async function runFullQualityCheck(): Promise<QualityReport> {
  const [themes, packs, assets, editions, recipes, planners] = await Promise.all([
    checkThemes(),
    checkPacks(),
    checkStickerAssets(),
    checkEditions(),
    checkRecipes(),
    checkPlannerConfigs(),
  ]);
  const fontResults = checkFontCoverage();

  const results = [...themes, ...packs, ...assets, ...editions, ...recipes, ...planners, ...fontResults];
  const passed  = results.filter((r) => r.pass).length;

  return {
    runAt:  new Date().toISOString(),
    totals: { checked: results.length, passed, failed: results.length - passed },
    results,
  };
}
