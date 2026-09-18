/**
 * WorldSmith Editorial Suite API
 *
 * GET  /v1/editorial/worlds                           list worlds for selector
 * GET  /v1/editorial/board?world_id=                 readiness board (specs grouped by pipeline status)
 * GET  /v1/editorial/canon-board?world_id=           canon board (canon records grouped by status)
 *
 * Collections:
 * GET/POST   /v1/editorial/collections
 * GET/PATCH  /v1/editorial/collections/:id
 *
 * Volumes:
 * GET/POST   /v1/editorial/volumes
 * GET/PATCH  /v1/editorial/volumes/:id
 *
 * Canon Records:
 * GET/POST   /v1/editorial/canon-records
 * GET/PATCH  /v1/editorial/canon-records/:id
 * POST       /v1/editorial/canon-records/:id/transition
 *
 * Production Specs:
 * GET/POST   /v1/editorial/specs
 * GET/PATCH/DELETE /v1/editorial/specs/:id
 * POST       /v1/editorial/specs/:id/publish
 *
 * Style Guides, Component Specs, Prompt Modules (CRUD pattern):
 * GET/POST   /v1/editorial/{resource}
 * GET/PATCH  /v1/editorial/{resource}/:id
 */
import { Router } from "express";
import {
  canonClear,
  payloadReady,
  readinessChecks,
  readinessScore,
} from "@workspace/api-zod/readiness";
import {
  editorialRichTextToPlainText,
  sanitizeEditorialRichText,
} from "../lib/worldsmith/editorial-rich-text";
import { requireAuth } from "../lib/auth-middleware";
import { requireStoreAccess, requireSuperAdmin } from "../middleware/requireRole";
import { db } from "@workspace/db";
import {
  wsCollectionsTable,
  wsVolumesTable,
  wsCanonRecordsTable,
  wsContextSnapshotsTable,
  wsCanonRecordRelationsTable,
  wsStyleGuidesTable,
  wsComponentSpecsTable,
  wsProductionProfilesTable,
  wsPunchTemplatesTable,
  wsPromptModulesTable,
  wsProductionSpecsTable,
  worldsmithSpecPreviewsTable,
  worldsmithRunsTable,
  worldsmithProductionPackagesTable,
  wsPromptPayloadsTable,
  worldsmithWorldsTable,
  palettesTable,
  wsStoriesTable,
  wsStoryActsTable,
  wsEncountersTable,
  wsJournalPromptsTable,
  wsCanonRecordStoryLinksTable,
  wsSuggestionRefreshesTable,
  worldsmithImageTargetsTable,
  type InsertWsProductionSpec,
  type InsertWsCanonRecord,
} from "@workspace/db";
import { randomUUID } from "crypto";
import { calculateSafeAreas } from "../lib/worldsmith/safe-area-geometry";
import { and, eq, inArray, like, desc, ne, or, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";
import { ObjectStorageService } from "../lib/objectStorage";
import { buildProductionSpecPdf } from "../lib/worldsmith/production-spec-pdf";
import {
  canonSnapshotPath,
  contextSnapshotIsOutdated,
  ContextSnapshotGitHubPublisher,
  mapWithConcurrency,
  editorialSnapshotPath,
  renderEditorialSnapshot,
  renderCanonSnapshot,
  shouldAutoSyncContextSnapshot,
  snapshotHash,
} from "../lib/worldsmith/context-snapshot";
import { callAi } from "../lib/ai-proxy";
import { generateImage } from "../lib/worldsmith/image-generation";
import { isPromptModuleSection } from "../lib/worldsmith/types";
import { resolveTypographyChoices, TypographyValidationError } from "../lib/worldsmith/typography";
import { ORIENTATION_AWARE_TYPES } from "@workspace/api-zod/readiness";
import {
  updatePage,
  createPage,
  richTextProp,
  selectProp,
  queryDatabase,
  extractTitle,
  extractRichText,
  extractSelect,
  extractRelation,
  extractCheckbox,
} from "../lib/notion-client";

const router = Router();

// ── Daybook palette library ──────────────────────────────────────────────────
// Store teams can select palettes for a World Bible, but only from the store
// that owns the selected world. The rest of Editorial remains platform-only.
router.get(
  "/v1/editorial/worlds/:worldId/palette-library",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [world] = await db
        .select({ storeId: worldsmithWorldsTable.storeId })
        .from(worldsmithWorldsTable)
        .where(eq(worldsmithWorldsTable.id, req.params.worldId as string))
        .limit(1);

      if (!world || (!req.actor?.isSuperAdmin && world.storeId !== req.actor?.storeId)) {
        res.status(404).json({ error: "World not found" });
        return;
      }

      const palettes = await db
        .select({
          id: palettesTable.id,
          name: palettesTable.name,
          colors: palettesTable.colors,
          status: palettesTable.status,
        })
        .from(palettesTable)
        .where(world.storeId
          ? and(
              eq(palettesTable.origin, "owned"),
              eq(palettesTable.authoredByStoreId, world.storeId),
              ne(palettesTable.status, "deleted"),
            )
          : ne(palettesTable.status, "deleted"))
        .orderBy(desc(palettesTable.updatedAt));

      res.json({ source: world.storeId ? "store" : "platform", palettes });
    } catch (err) {
      logger.error({ err, worldId: req.params.worldId }, "editorial: list palette library error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// Apply super-admin guard to all remaining editorial routes.
router.use(requireAuth, requireSuperAdmin);

// ── Readiness score helper ────────────────────────────────────────────────────

// ── Shared error handler ──────────────────────────────────────────────────────

/**
 * Handle a DB (or other) error from an editorial route.
 * Maps known Postgres constraint codes to specific HTTP status codes so
 * operators get actionable responses instead of a bare 500.
 */
function editorialDbError(err: unknown, res: Response, context: string): void {
  logger.error({ err }, `editorial: ${context}`);
  const pgCode = (err as any)?.code;
  if (pgCode === "23503") {
    // Foreign-key constraint: a referenced record (world, style guide, etc.) doesn't exist
    res.status(422).json({
      error: "A required linked record (world, collection, style guide, or component spec) does not exist.",
      code: "LINKED_RECORD_NOT_FOUND",
    });
    return;
  }
  if (pgCode === "23505") {
    // Unique constraint: the record already exists
    res.status(409).json({
      error: "A record with these unique fields already exists.",
      code: "DUPLICATE_RECORD",
    });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

export function computeReadinessScore(spec: Partial<InsertWsProductionSpec>): number {
  return readinessScore(readinessChecks(spec));
}

export function derivePipelineStatus(spec: Partial<InsertWsProductionSpec>, _readinessScore: number): string {
  const dep = spec.canonDependency ?? "None";
  const canonIds = (spec.canonRecordIds ?? []) as string[];
  const payload = spec.promptPayload ?? "";

  // Check for blocking issues
  const needsCanon = dep === "Canon Reference" || dep === "Canon Defining";
  if (needsCanon && canonIds.length === 0) return "blocked";
  if (spec.notionPageId && spec.syncedAt) return "published";
  if (spec.compiledPromptStatus === "Compiled") return "compiled";

  if (!spec.productionItem?.trim() || !spec.componentType?.trim()) return "draft";
  if (!payload.trim()) return "draft";

  const checks = readinessChecks(spec);
  if (payloadReady(checks) && canonClear(checks)) return "canon_clear";
  if (payloadReady(checks)) return "payload_ready";
  return "draft";
}

// ── Worlds ────────────────────────────────────────────────────────────────────

// ── Image target catalog ──────────────────────────────────────────────────────
// Print dimensions are platform-owned configuration. Generation reads the
// same managed catalog through image-generation-service.

router.get("/v1/editorial/image-targets", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(worldsmithImageTargetsTable)
      .orderBy(worldsmithImageTargetsTable.componentType);
    const byType = new Map(rows.map((row) => [row.componentType, row]));
    res.json({
      image_targets: [...ORIENTATION_AWARE_TYPES].map((componentType) => {
        const row = byType.get(componentType);
        return {
          component_type: componentType,
          print_width_in: row?.printWidthIn ?? null,
          print_height_in: row?.printHeightIn ?? null,
          updated_at: row?.updatedAt ?? null,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, "editorial: list image targets");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/v1/editorial/image-targets/:componentType", async (req: Request, res: Response) => {
  const componentType = decodeURIComponent(req.params.componentType as string).trim();
  if (!ORIENTATION_AWARE_TYPES.has(componentType)) {
    res.status(400).json({ error: "component_type must be an orientation-aware WorldSmith component type" });
    return;
  }

  const printWidthIn = Number(req.body?.print_width_in);
  const printHeightIn = Number(req.body?.print_height_in);
  if (
    !Number.isFinite(printWidthIn) ||
    !Number.isFinite(printHeightIn) ||
    printWidthIn <= 0 ||
    printHeightIn <= 0 ||
    printWidthIn > 1000 ||
    printHeightIn > 1000
  ) {
    res.status(400).json({
      error: "print_width_in and print_height_in must be positive dimensions no larger than 1000 inches",
    });
    return;
  }

  try {
    const [row] = await db
      .insert(worldsmithImageTargetsTable)
      .values({ componentType, printWidthIn, printHeightIn })
      .onConflictDoUpdate({
        target: worldsmithImageTargetsTable.componentType,
        set: { printWidthIn, printHeightIn, updatedAt: new Date() },
      })
      .returning();
    if (!row) {
      res.status(500).json({ error: "Could not save image target" });
      return;
    }
    res.json({
      image_target: {
        component_type: row.componentType,
        print_width_in: row.printWidthIn,
        print_height_in: row.printHeightIn,
        updated_at: row.updatedAt,
      },
    });
  } catch (err) {
    editorialDbError(err, res, "update image target");
  }
});

// ── Worlds ────────────────────────────────────────────────────────────────────

router.get("/v1/editorial/worlds", async (_req: Request, res: Response) => {
  try {
    const worlds = await db
      .select({
        id: worldsmithWorldsTable.id,
        name: worldsmithWorldsTable.name,
        code: worldsmithWorldsTable.code,
        status: worldsmithWorldsTable.status,
        description: worldsmithWorldsTable.description,
        currentCollection: worldsmithWorldsTable.currentCollection,
        currentVolume: worldsmithWorldsTable.currentVolume,
        notionProductionDbId: worldsmithWorldsTable.notionProductionDbId,
        notionCanonDbId: worldsmithWorldsTable.notionCanonDbId,
        visualPalette: worldsmithWorldsTable.visualPalette,
        proseVoice: worldsmithWorldsTable.proseVoice,
        atmosphericNotes: worldsmithWorldsTable.atmosphericNotes,
        materialWorld: worldsmithWorldsTable.materialWorld,
        worldRules: worldsmithWorldsTable.worldRules,
        typography: worldsmithWorldsTable.typography,
      })
      .from(worldsmithWorldsTable)
      .orderBy(worldsmithWorldsTable.name);
    res.json({ worlds });
  } catch (err) {
    logger.error({ err }, "editorial: list worlds error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Readiness Board ───────────────────────────────────────────────────────────

router.get("/v1/editorial/board", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  const collectionId = req.query.collection_id as string | undefined;

  try {
    const conditions = [];
    if (worldId) conditions.push(eq(wsProductionSpecsTable.worldId, worldId));
    if (collectionId) conditions.push(eq(wsProductionSpecsTable.collectionId, collectionId));

    const specs = await db
      .select()
      .from(wsProductionSpecsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(wsProductionSpecsTable.updatedAt));

    // Group by pipeline status
    const grouped: Record<string, typeof specs> = {
      draft: [],
      payload_ready: [],
      canon_clear: [],
      compiled: [],
      published: [],
      blocked: [],
    };

    for (const spec of specs) {
      const bucket = grouped[spec.status] ?? grouped.draft;
      bucket.push(spec);
    }

    // Summary stats
    const totalErrors = specs.filter(s => s.status === "blocked").length;
    const awaitingCanon = specs.filter(s => {
      const dep = s.canonDependency ?? "None";
      const ids = (s.canonRecordIds ?? []) as string[];
      return (dep === "Canon Reference" || dep === "Canon Defining") && ids.length === 0;
    }).length;

    res.json({
      board: grouped,
      summary: {
        total: specs.length,
        errors: totalErrors,
        awaiting_canon: awaitingCanon,
      },
    });
  } catch (err) {
    logger.error({ err }, "editorial: board error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Canon Board ───────────────────────────────────────────────────────────────

router.get("/v1/editorial/canon-board", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;

  try {
    const records = await db
      .select()
      .from(wsCanonRecordsTable)
      .where(worldId ? eq(wsCanonRecordsTable.worldId, worldId) : undefined)
      .orderBy(wsCanonRecordsTable.name);

    const grouped: Record<string, typeof records> = {
      proposed: [],
      under_review: [],
      accepted: [],
      superseded: [],
      rejected: [],
    };

    for (const r of records) {
      const bucket = grouped[r.status];
      if (bucket) bucket.push(r);
    }

    res.json({ board: grouped, total: records.length });
  } catch (err) {
    logger.error({ err }, "editorial: canon board error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Collections ───────────────────────────────────────────────────────────────

router.get("/v1/editorial/collections", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  try {
    const rows = await db
      .select()
      .from(wsCollectionsTable)
      .where(worldId ? eq(wsCollectionsTable.worldId, worldId) : undefined)
      .orderBy(wsCollectionsTable.name);
    res.json({ collections: rows });
  } catch (err) {
    logger.error({ err }, "editorial: list collections");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/collections", async (req: Request, res: Response) => {
  const { world_id, name, season, year, description } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    const id = crypto.randomUUID();
    const [row] = await db
      .insert(wsCollectionsTable)
      .values({ id, worldId: world_id, name: name.trim(), season, year, description: description ?? "" })
      .returning();
    res.status(201).json({ collection: row });
  } catch (err) {
    logger.error({ err }, "editorial: create collection");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/collections/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select()
      .from(wsCollectionsTable)
      .where(eq(wsCollectionsTable.id, req.params.id as string))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Collection not found" }); return; }
    res.json({ collection: row });
  } catch (err) {
    logger.error({ err }, "editorial: get collection");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/v1/editorial/collections/:id", async (req: Request, res: Response) => {
  const { name, season, year, description, status } = req.body;
  try {
    const [row] = await db
      .update(wsCollectionsTable)
      .set({ ...(name !== undefined ? { name } : {}), season, year, description, status })
      .where(eq(wsCollectionsTable.id, req.params.id as string))
      .returning();
    if (!row) { res.status(404).json({ error: "Collection not found" }); return; }
    res.json({ collection: row });
  } catch (err) {
    logger.error({ err }, "editorial: update collection");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Volumes ────────────────────────────────────────────────────────────────────

router.get("/v1/editorial/volumes", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  const collectionId = req.query.collection_id as string | undefined;
  try {
    const conditions = [];
    if (worldId) conditions.push(eq(wsVolumesTable.worldId, worldId));
    if (collectionId) conditions.push(eq(wsVolumesTable.collectionId, collectionId));
    const rows = await db
      .select()
      .from(wsVolumesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(wsVolumesTable.name);
    res.json({ volumes: rows });
  } catch (err) {
    logger.error({ err }, "editorial: list volumes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/volumes", async (req: Request, res: Response) => {
  const { world_id, collection_id, name, code, description } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    if (collection_id) {
      const [collection] = await db.select({ id: wsCollectionsTable.id })
        .from(wsCollectionsTable)
        .where(and(eq(wsCollectionsTable.id, collection_id), eq(wsCollectionsTable.worldId, world_id)))
        .limit(1);
      if (!collection) {
        res.status(400).json({ error: "collection_id must belong to world_id" });
        return;
      }
    }
    const id = randomUUID();
    const [row] = await db.insert(wsVolumesTable).values({
      id,
      worldId: world_id,
      collectionId: collection_id || null,
      name: name.trim(),
      code: code?.trim() || null,
      description: description ?? "",
    }).returning();
    res.status(201).json({ volume: row });
  } catch (err) {
    logger.error({ err }, "editorial: create volume");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/volumes/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(wsVolumesTable)
      .where(eq(wsVolumesTable.id, req.params.id as string)).limit(1);
    if (!row) { res.status(404).json({ error: "Volume not found" }); return; }
    res.json({ volume: row });
  } catch (err) {
    logger.error({ err }, "editorial: get volume");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/v1/editorial/volumes/:id", async (req: Request, res: Response) => {
  const { collection_id, name, code, description, status } = req.body;
  try {
    const [existing] = await db.select({ id: wsVolumesTable.id, worldId: wsVolumesTable.worldId })
      .from(wsVolumesTable)
      .where(eq(wsVolumesTable.id, req.params.id as string)).limit(1);
    if (!existing) { res.status(404).json({ error: "Volume not found" }); return; }
    if (collection_id) {
      const [collection] = await db.select({ id: wsCollectionsTable.id })
        .from(wsCollectionsTable)
        .where(and(eq(wsCollectionsTable.id, collection_id), eq(wsCollectionsTable.worldId, existing.worldId)))
        .limit(1);
      if (!collection) {
        res.status(400).json({ error: "collection_id must belong to the volume's world" });
        return;
      }
    }
    const [row] = await db.update(wsVolumesTable).set({
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(code !== undefined ? { code: code?.trim() || null } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(collection_id !== undefined ? { collectionId: collection_id || null } : {}),
    }).where(eq(wsVolumesTable.id, req.params.id as string)).returning();
    res.json({ volume: row });
  } catch (err) {
    logger.error({ err }, "editorial: update volume");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Canon Records ─────────────────────────────────────────────────────────────

router.get("/v1/editorial/canon-records", async (req: Request, res: Response) => {
  const worldId      = req.query.world_id   as string | undefined;
  const q            = req.query.q          as string | undefined;
  const statusFilter = req.query.status     as string | undefined;
  const typeFilter   = req.query.canon_type as string | undefined;

  try {
    // Filtered query (respects all params)
    const conditions = [];
    if (worldId)      conditions.push(eq(wsCanonRecordsTable.worldId, worldId));
    if (statusFilter) conditions.push(eq(wsCanonRecordsTable.status, statusFilter));
    if (typeFilter)   conditions.push(eq(wsCanonRecordsTable.canonType, typeFilter));
    if (q?.trim()) {
      const term = `%${q.trim()}%`;
      conditions.push(
        or(
          like(wsCanonRecordsTable.name, term),
          like(wsCanonRecordsTable.narrativeDetails, term),
          like(wsCanonRecordsTable.historicalContext, term),
          like(wsCanonRecordsTable.visualNotes, term),
        )!,
      );
    }

    const rows = await db
      .select()
      .from(wsCanonRecordsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(wsCanonRecordsTable.name)
      .limit(200);

    // Unfiltered totals for the world (for quick-start detection + type tab counts)
    let total = rows.length;
    const byType: Record<string, number> = {};

    if (worldId) {
      const allForWorld = await db
        .select({ canonType: wsCanonRecordsTable.canonType, status: wsCanonRecordsTable.status })
        .from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.worldId, worldId));
      total = allForWorld.length;
      for (const r of allForWorld) {
        if (r.canonType) byType[r.canonType] = (byType[r.canonType] ?? 0) + 1;
      }
    }

    res.json({ canon_records: rows, total, by_type: byType });
  } catch (err) {
    logger.error({ err }, "editorial: list canon records");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/canon-records", async (req: Request, res: Response) => {
  const { world_id, name, canon_type, narrative_details, historical_context, visual_notes, notes, portrait_url, typography } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    const resolvedTypography = typography === undefined ? undefined : await resolveTypographyChoices(typography);
    const id = crypto.randomUUID();
    const [row] = await db
      .insert(wsCanonRecordsTable)
      .values({
        id,
        worldId: world_id,
        name: name.trim(),
        canonType: canon_type,
        narrativeDetails: sanitizeEditorialRichText(narrative_details ?? ""),
        historicalContext: sanitizeEditorialRichText(historical_context ?? ""),
        visualNotes: sanitizeEditorialRichText(visual_notes ?? ""),
        ...(resolvedTypography !== undefined ? { typography: resolvedTypography } : {}),
        notes: sanitizeEditorialRichText(notes ?? ""),
        portraitUrl: portrait_url ?? null,
        createdBy: (req.user as any)?.id,
      })
      .returning();
    res.status(201).json({ canon_record: row });
  } catch (err) {
    if (err instanceof TypographyValidationError) {
      res.status(400).json({ error: err.message, code: "INVALID_TYPOGRAPHY" });
      return;
    }
    logger.error({ err }, "editorial: create canon record");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Notion sync ────────────────────────────────────────────────────────────────
// POST /v1/editorial/canon-records/sync-notion
// Pulls all pages from the world's Notion canon DB and upserts them locally.
// Uses the world's notionCanonDbId first, falls back to NOTION_CANON_DB_ID env.

/** Map common Notion status strings to our internal values. */
function normaliseCanonStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/[_\s-]+/g, "_");
  if (s.includes("accept") || s.includes("approve") || s.includes("final")) return "accepted";
  if (s.includes("review")  || s.includes("under"))                          return "under_review";
  if (s.includes("supersede") || s.includes("retired"))                      return "superseded";
  if (s.includes("reject") || s.includes("decline"))                         return "rejected";
  return "proposed";
}

/** Map common Notion type strings to our internal values. */
function normaliseCanonType(raw: string): string | undefined {
  const s = raw.toLowerCase();
  if (s.includes("character") || s.includes("person") || s.includes("figure"))       return "character";
  if (s.includes("location")  || s.includes("place")  || s.includes("geo"))          return "location";
  if (s.includes("object")    || s.includes("artefact")|| s.includes("item"))        return "object";
  if (s.includes("event")     || s.includes("incident"))                              return "event";
  if (s.includes("lore")      || s.includes("myth")    || s.includes("legend"))      return "lore";
  if (s.includes("atmosphere")|| s.includes("mood")    || s.includes("tone"))        return "atmosphere";
  if (s.includes("material")  || s.includes("texture") || s.includes("fabric"))      return "material";
  if (s.includes("relationship")|| s.includes("relation")|| s.includes("bond"))      return "relationship";
  if (s.includes("motif")     || s.includes("symbol")  || s.includes("recurrence"))  return "motif";
  return undefined;
}

router.post("/v1/editorial/canon-records/sync-notion", async (req: Request, res: Response) => {
  const { world_id } = req.body as { world_id?: string };
  if (!world_id) {
    res.status(400).json({ error: "world_id is required" });
    return;
  }

  try {
    // Resolve Notion token
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      res.status(503).json({ error: "NOTION_TOKEN is not configured" });
      return;
    }

    // Resolve the Notion canon DB for this world
    const [world] = await db
      .select({ notionCanonDbId: worldsmithWorldsTable.notionCanonDbId })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, world_id));

    if (!world) {
      res.status(404).json({ error: "World not found" });
      return;
    }

    const dbId = world.notionCanonDbId ?? process.env.NOTION_CANON_DB_ID ?? "";
    if (!dbId) {
      res.status(422).json({
        error:
          "No Notion canon DB configured. Set notionCanonDbId on the world or the NOTION_CANON_DB_ID environment variable.",
      });
      return;
    }

    // Fetch all pages from Notion
    let pages;
    try {
      pages = await queryDatabase(dbId);
    } catch (notionErr) {
      const msg = String(notionErr);
      if (msg.includes("404") || msg.includes("object_not_found")) {
        res.status(422).json({
          error:
            "Notion returned 404 for that database. Make sure the database is shared with your Notion integration (open the database in Notion → Share → invite the integration).",
          notion_db_id: dbId,
        });
        return;
      }
      throw notionErr; // re-throw non-404 errors to the outer catch
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let relationsUpserted = 0;

    // Build a map of notionPageId → local record id for relation linking
    const notionIdToLocalId = new Map<string, string>();

    // ── Pass 1: upsert canon records ──────────────────────────────────────────
    // Collect relation data separately so we can link after all records exist.
    const pendingRelations: Array<{ fromNotionId: string; toNotionIds: string[] }> = [];

    for (const page of pages) {
      const p = page.properties;

      // Name — try multiple property variants
      const name =
        extractTitle(p["Name"]) ||
        extractTitle(p["Canon Record"]) ||
        extractTitle(p["Title"]) ||
        extractRichText(p["Name"]) ||
        page.id;

      // Canon type
      const rawType =
        extractSelect(p["Canon Type"]) ||
        extractSelect(p["Type"]) ||
        extractSelect(p["Category"]) ||
        extractSelect(p["Record Type"]) ||
        extractRichText(p["Canon Type"]) ||
        "";
      const canonType = rawType ? normaliseCanonType(rawType) : undefined;

      // Status
      const rawStatus =
        extractSelect(p["Status"]) ||
        extractSelect(p["Canon Status"]) ||
        extractSelect(p["Review Status"]) ||
        "";
      const status = rawStatus ? normaliseCanonStatus(rawStatus) : "proposed";

      // Text fields
      const narrativeDetails =
        extractRichText(p["Narrative Details"]) ||
        extractRichText(p["Narrative"]) ||
        extractRichText(p["Description"]) ||
        extractRichText(p["Summary"]) ||
        "";

      const historicalContext =
        extractRichText(p["Historical Context"]) ||
        extractRichText(p["History"]) ||
        extractRichText(p["Context"]) ||
        extractRichText(p["Background"]) ||
        "";

      const visualNotes =
        extractRichText(p["Visual Notes"]) ||
        extractRichText(p["Visual"]) ||
        extractRichText(p["Appearance"]) ||
        extractRichText(p["Visual Description"]) ||
        "";

      // New fields — local-wins: only pull from Notion when local value is absent
      const notionEmotionalRegister =
        extractSelect(p["Emotional register"]) ||
        extractSelect(p["Emotional Register"]) ||
        null;
      const notionSensoryClauses =
        extractRichText(p["Sensory clauses"]) ||
        extractRichText(p["Sensory Clauses"]) ||
        "";
      const notionRegisterLocked =
        extractCheckbox(p["Register locked"]) ||
        extractCheckbox(p["Register Locked"]) ||
        false;

      // Related Canon relation property — collected for Pass 2
      const relatedNotionIds =
        extractRelation(p["Related Canon"]) ||
        extractRelation(p["Related Records"]) ||
        [];

      if (!name.trim()) { skipped++; continue; }

      const notionPageId = page.id;

      // Collect relation data regardless of whether record is new/existing
      if (relatedNotionIds.length > 0) {
        pendingRelations.push({ fromNotionId: notionPageId, toNotionIds: relatedNotionIds });
      }

      // Check if a local record already exists for this Notion page
      const [existing] = await db
        .select({
          id: wsCanonRecordsTable.id,
          emotionalRegister: wsCanonRecordsTable.emotionalRegister,
          sensoryClauses: wsCanonRecordsTable.sensoryClauses,
          registerLocked: wsCanonRecordsTable.registerLocked,
        })
        .from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.notionPageId, notionPageId));

      if (existing) {
        // Local-wins: only overwrite the three new fields if locally empty/null
        const mergedEmotionalRegister =
          existing.emotionalRegister ?? (notionEmotionalRegister || null);
        const mergedSensoryClauses =
          existing.sensoryClauses?.trim()
            ? existing.sensoryClauses
            : notionSensoryClauses;
        // register_locked: local wins if already true; otherwise take Notion value
        const mergedRegisterLocked =
          existing.registerLocked ? true : notionRegisterLocked;

        await db
          .update(wsCanonRecordsTable)
          .set({
            name: name.trim(),
            canonType: canonType ?? null,
            status,
            narrativeDetails,
            historicalContext,
            visualNotes,
            emotionalRegister: mergedEmotionalRegister,
            sensoryClauses: mergedSensoryClauses,
            registerLocked: mergedRegisterLocked,
            syncedAt: new Date(),
          })
          .where(eq(wsCanonRecordsTable.id, existing.id));
        notionIdToLocalId.set(notionPageId, existing.id);
        updated++;
      } else {
        const newId = crypto.randomUUID();
        await db.insert(wsCanonRecordsTable).values({
          id: newId,
          worldId: world_id,
          name: name.trim(),
          canonType: canonType ?? null,
          status,
          narrativeDetails,
          historicalContext,
          visualNotes,
          emotionalRegister: notionEmotionalRegister || null,
          sensoryClauses: notionSensoryClauses,
          registerLocked: notionRegisterLocked,
          notionPageId,
          syncedAt: new Date(),
          createdBy: (req.user as any)?.id,
        });
        notionIdToLocalId.set(notionPageId, newId);
        created++;
      }
    }

    // ── Pass 2: populate ws_canon_record_relations ────────────────────────────
    // notionIdToLocalId was populated during pass 1.
    // pendingRelations collected { fromNotionId, toNotionIds } for every page
    // that had a "Related Canon" / "Related Records" property.
    //
    // Strategy: differential sync — load existing edges first, then:
    //   1. Delete edges that Notion no longer lists (stale links cleared).
    //   2. Insert only brand-new edges as "related".
    //   3. Leave existing edges untouched → manually-set relation types (e.g.
    //      "contradicts", "precedes") survive re-syncs unmodified.
    const syncedLocalIds = [...notionIdToLocalId.values()];

    const edgePairs: Array<{ fromRecordId: string; toRecordId: string; relationType: string }> = [];
    for (const { fromNotionId, toNotionIds } of pendingRelations) {
      const fromLocalId = notionIdToLocalId.get(fromNotionId);
      if (!fromLocalId) continue;

      const seen = new Set<string>();
      for (const toNotionId of toNotionIds) {
        if (seen.has(toNotionId)) continue;
        seen.add(toNotionId);
        const toLocalId = notionIdToLocalId.get(toNotionId);
        if (toLocalId && toLocalId !== fromLocalId) {
          edgePairs.push({ fromRecordId: fromLocalId, toRecordId: toLocalId, relationType: "related" });
        }
      }
    }

    // Build the set of (from|to) pairs Notion currently defines.
    const notionPairKey = (from: string, to: string) => `${from}|${to}`;
    const notionPairSet = new Set(edgePairs.map(e => notionPairKey(e.fromRecordId, e.toRecordId)));

    if (syncedLocalIds.length > 0) {
      // Load all current outgoing edges for synced records in one query.
      const existingEdges = await db
        .select({
          fromRecordId: wsCanonRecordRelationsTable.fromRecordId,
          toRecordId: wsCanonRecordRelationsTable.toRecordId,
        })
        .from(wsCanonRecordRelationsTable)
        .where(
          sql`${wsCanonRecordRelationsTable.fromRecordId} = ANY(${sql.raw(
            `ARRAY[${syncedLocalIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`,
          )})`,
        );

      // Delete edges that Notion no longer includes (stale links).
      const staleEdges = existingEdges.filter(
        e => !notionPairSet.has(notionPairKey(e.fromRecordId, e.toRecordId)),
      );
      for (const stale of staleEdges) {
        await db
          .delete(wsCanonRecordRelationsTable)
          .where(
            and(
              eq(wsCanonRecordRelationsTable.fromRecordId, stale.fromRecordId),
              eq(wsCanonRecordRelationsTable.toRecordId, stale.toRecordId),
            ),
          );
      }

      // Insert only brand-new edges (not already present).
      const existingPairSet = new Set(
        existingEdges.map(e => notionPairKey(e.fromRecordId, e.toRecordId)),
      );
      const newEdges = edgePairs.filter(
        e => !existingPairSet.has(notionPairKey(e.fromRecordId, e.toRecordId)),
      );
      if (newEdges.length > 0) {
        await db.insert(wsCanonRecordRelationsTable).values(newEdges).onConflictDoNothing();
      }
    }

    const relationsWritten = edgePairs.length;
    logger.info(
      { world_id, created, updated, skipped, relationsWritten, total: pages.length },
      "canon-records: sync-notion complete",
    );
    res.json({ synced: pages.length, created, updated, skipped, relations_written: relationsWritten });
  } catch (err) {
    logger.error({ err }, "editorial: sync canon records from notion");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /v1/editorial/canon-records/suggest ──────────────────────────────────
// Uses the AI to analyse the world's existing canon and World Bible, then
// suggests new records that would meaningfully enrich the library.
// Body: { world_id, focus_type? }
// Returns: { suggestions: [{ name, canonType, rationale, narrativeDetails }] }.
// Without a focus type, the response contains one suggestion for every canon type.

const CANON_SUGGESTION_TYPES = [
  "character", "location", "object", "event", "lore",
  "atmosphere", "material", "relationship", "motif",
] as const;
const SUGGESTION_REFRESH_MS = 24 * 60 * 60 * 1_000;

async function getDailySuggestions(worldId: string, suggestionKind: string) {
  const [cached] = await db.select().from(wsSuggestionRefreshesTable).where(and(
    eq(wsSuggestionRefreshesTable.worldId, worldId),
    eq(wsSuggestionRefreshesTable.suggestionKind, suggestionKind),
  )).limit(1);
  if (!cached) return null;
  const nextRefreshAt = new Date(cached.generatedAt.getTime() + SUGGESTION_REFRESH_MS);
  return { ...cached, nextRefreshAt, current: nextRefreshAt.getTime() > Date.now() };
}

async function saveDailySuggestions(worldId: string, suggestionKind: string, suggestions: unknown[]) {
  const generatedAt = new Date();
  await db.insert(wsSuggestionRefreshesTable).values({
    worldId, suggestionKind, suggestions, generatedAt, updatedAt: generatedAt,
  }).onConflictDoUpdate({
    target: [wsSuggestionRefreshesTable.worldId, wsSuggestionRefreshesTable.suggestionKind],
    set: { suggestions, generatedAt, updatedAt: generatedAt },
  });
  return generatedAt;
}

router.post("/v1/editorial/canon-records/suggest", async (req: Request, res: Response) => {
  const { world_id, focus_type } = req.body as { world_id?: string; focus_type?: string };
  if (!world_id) {
    res.status(400).json({ error: "world_id is required" });
    return;
  }
  if (focus_type && !CANON_SUGGESTION_TYPES.includes(focus_type as typeof CANON_SUGGESTION_TYPES[number])) {
    res.status(400).json({ error: "focus_type is not a supported canon record type" });
    return;
  }

  try {
    const cached = await getDailySuggestions(world_id, "canon");
    if (cached?.current) {
      res.json({
        suggestions: cached.suggestions,
        generatedAt: cached.generatedAt,
        nextRefreshAt: cached.nextRefreshAt,
        canRefresh: false,
        cached: true,
      });
      return;
    }
    // Fetch world bible
    const [world] = await db
      .select()
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, world_id))
      .limit(1);
    if (!world) {
      res.status(404).json({ error: "World not found" });
      return;
    }

    // Fetch existing canon record names + types (limit 80 so prompt stays sane)
    const existing = await db
      .select({
        name: wsCanonRecordsTable.name,
        canonType: wsCanonRecordsTable.canonType,
        status: wsCanonRecordsTable.status,
      })
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.worldId, world_id))
      .orderBy(wsCanonRecordsTable.name)
      .limit(80);

    // Storylines give the suggestions narrative purpose instead of producing
    // world-building ideas in isolation from the stories they need to support.
    const stories = await db
      .select({
        id: wsStoriesTable.id,
        title: wsStoriesTable.title,
        summary: wsStoriesTable.summary,
        status: wsStoriesTable.status,
      })
      .from(wsStoriesTable)
      .where(eq(wsStoriesTable.worldId, world_id))
      .orderBy(wsStoriesTable.sortOrder, wsStoriesTable.createdAt)
      .limit(20);
    const storyIds = stories.map((story) => story.id);
    const acts = storyIds.length > 0
      ? await db
          .select({
            storyId: wsStoryActsTable.storyId,
            actNumber: wsStoryActsTable.actNumber,
            title: wsStoryActsTable.title,
            tagline: wsStoryActsTable.tagline,
          })
          .from(wsStoryActsTable)
          .where(inArray(wsStoryActsTable.storyId, storyIds))
          .orderBy(wsStoryActsTable.storyId, wsStoryActsTable.actNumber)
      : [];

    const existingLines = existing.length > 0
      ? existing.map(r => `- ${r.name} [${r.canonType ?? "unknown"}] (${r.status})`).join("\n")
      : "(no records yet)";

    const worldBible = [
      world.visualPalette ? `Visual Palette: ${editorialRichTextToPlainText(world.visualPalette)}` : "",
      world.proseVoice    ? `Prose Voice: ${editorialRichTextToPlainText(world.proseVoice)}`       : "",
      world.atmosphericNotes ? `Atmospheric Notes: ${editorialRichTextToPlainText(world.atmosphericNotes)}` : "",
      world.materialWorld ? `Material World: ${editorialRichTextToPlainText(world.materialWorld)}` : "",
      Array.isArray(world.worldRules) && world.worldRules.length > 0
        ? `World Rules:\n${(world.worldRules as string[]).map(r => `  - ${r}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    const storylineLines = stories.map((story) => {
      const storyActs = acts
        .filter((act) => act.storyId === story.id)
        .map((act) => `  Act ${act.actNumber}: ${act.title}${act.tagline ? ` — ${act.tagline}` : ""}`)
        .join("\n");
      return [
        `- ${story.title} [${story.status}]${story.summary ? ` — ${editorialRichTextToPlainText(story.summary).slice(0, 700)}` : ""}`,
        storyActs,
      ].filter(Boolean).join("\n");
    }).join("\n");

    const focusLine = focus_type
      ? `Focus specifically on the "${focus_type}" type — all six suggestions must be of that type.`
      : `Suggest exactly one record for each of these types: ${CANON_SUGGESTION_TYPES.join(", ")}.`;
    const suggestionCount = focus_type ? 6 : CANON_SUGGESTION_TYPES.length;

    const systemPrompt = `You are an expert WorldSmith editor who analyses a world's canon library and identifies the most valuable missing entries. Your job is to spot gaps — important characters, locations, objects, events, lore, atmosphere, materials, relationships, or motifs that the existing canon needs but doesn't yet have. Every suggestion must feel like it belongs deeply to this world's specific identity.`;

    const userMessage = `World: ${world.name}${world.description ? ` — ${world.description}` : ""}

## World Bible
${worldBible || "(not yet written)"}

## Existing Canon Records (${existing.length} total)
${existingLines}

## Storylines
${storylineLines || "(no storylines recorded yet)"}

## Task
Suggest exactly ${suggestionCount} new canon records that would meaningfully enrich this world and give the existing storylines useful anchors. ${focusLine}

Return ONLY a JSON array (no markdown fences, no preamble) where each element has:
- "name": string — the record's title (specific, evocative, fits this world's voice)
- "canonType": one of character|location|object|event|lore|atmosphere|material|relationship|motif
- "rationale": string — 1-2 sentences explaining why this record is missing and why it matters
- "narrativeDetails": string — 2-4 sentences of polished opening prose for this record, written in the world's voice

All ${suggestionCount} suggestions must be DIFFERENT from existing records and from each other. Avoid generic fantasy/Victorian tropes — ground every entry in this world's specific identity.`;

    const result = await callAi(
      [{ role: "user", content: userMessage }],
      process.env.DEFAULT_AI_PROVIDER ?? "chatgpt",
      systemPrompt,
    );

    // Parse the JSON array from the AI response
    let suggestions: unknown[] = [];
    try {
      const text = result.content.trim();
      // Strip any accidental code fences
      const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) suggestions = parsed.slice(0, suggestionCount);
    } catch {
      logger.warn({ raw: result.content }, "editorial: suggest — AI returned non-JSON, attempting extraction");
      // Fallback: try to find the first [ ... ] block
      const match = result.content.match(/\[[\s\S]*\]/);
      if (match) {
        try { suggestions = JSON.parse(match[0]); } catch { /* give up */ }
      }
    }

    // Sanitise each suggestion
    const VALID_TYPES = new Set<string>(CANON_SUGGESTION_TYPES);
    const sanitised = suggestions
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map(s => ({
        name: typeof s.name === "string" ? s.name.trim().slice(0, 120) : "Untitled",
        canonType: typeof s.canonType === "string" && VALID_TYPES.has(s.canonType) ? s.canonType : "lore",
        rationale: typeof s.rationale === "string" ? s.rationale.trim().slice(0, 400) : "",
        narrativeDetails: typeof s.narrativeDetails === "string" ? s.narrativeDetails.trim().slice(0, 800) : "",
      }));

    const generatedAt = await saveDailySuggestions(world_id, "canon", sanitised);
    res.json({
      suggestions: sanitised,
      world: { name: world.name, code: world.code },
      generatedAt,
      nextRefreshAt: new Date(generatedAt.getTime() + SUGGESTION_REFRESH_MS),
      canRefresh: false,
      cached: false,
    });
  } catch (err) {
    logger.error({ err }, "editorial: suggest canon records");
    res.status(502).json({ error: "Could not generate suggestions. Try again.", code: "AI_ERROR" });
  }
});

router.delete("/v1/editorial/canon-records/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .delete(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .returning({ id: wsCanonRecordsTable.id });
    if (!row) { res.status(404).json({ error: "Canon record not found" }); return; }
    logger.info({ id: req.params.id }, "editorial: deleted canon record");
    res.json({ deleted: true, id: row.id });
  } catch (err) {
    logger.error({ err }, "editorial: delete canon record");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/canon-records/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select()
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .limit(1);
    if (!row) { res.status(404).json({ error: "Canon record not found" }); return; }
    res.json({ canon_record: row });
  } catch (err) {
    logger.error({ err }, "editorial: get canon record");
    res.status(500).json({ error: "Internal server error" });
  }
});

async function buildCanonContextSnapshot(recordId: string) {
  const [record] = await db.select().from(wsCanonRecordsTable)
    .where(eq(wsCanonRecordsTable.id, recordId)).limit(1);
  if (!record) return null;
  const [world] = await db.select({ name: worldsmithWorldsTable.name })
    .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, record.worldId)).limit(1);
  if (!world) return null;

  const edges = await db.select().from(wsCanonRecordRelationsTable)
    .where(or(
      eq(wsCanonRecordRelationsTable.fromRecordId, recordId),
      eq(wsCanonRecordRelationsTable.toRecordId, recordId),
    ));
  const relatedIds = [...new Set(edges.map(edge =>
    edge.fromRecordId === recordId ? edge.toRecordId : edge.fromRecordId,
  ))];
  const related = relatedIds.length
    ? await db.select({
        id: wsCanonRecordsTable.id,
        name: wsCanonRecordsTable.name,
        canonType: wsCanonRecordsTable.canonType,
      }).from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, relatedIds))
    : [];
  const relatedById = new Map(related.map(item => [item.id, item]));

  const specs = await db.select({
    id: wsProductionSpecsTable.id,
    name: wsProductionSpecsTable.productionItem,
    promptModuleIds: wsProductionSpecsTable.promptModuleIds,
  }).from(wsProductionSpecsTable).where(and(
    eq(wsProductionSpecsTable.worldId, record.worldId),
    sql`${wsProductionSpecsTable.canonRecordIds} @> ${JSON.stringify([recordId])}::jsonb`,
  )).orderBy(wsProductionSpecsTable.productionItem);
  const moduleIds = [...new Set(specs.flatMap(spec => spec.promptModuleIds))];
  const modules = moduleIds.length
    ? await db.select({ id: wsPromptModulesTable.id, name: wsPromptModulesTable.name })
        .from(wsPromptModulesTable).where(inArray(wsPromptModulesTable.id, moduleIds))
    : [];

  const snapshotRecord = {
    ...record,
    worldName: world.name,
    relationships: edges.flatMap(edge => {
      const targetId = edge.fromRecordId === recordId ? edge.toRecordId : edge.fromRecordId;
      const target = relatedById.get(targetId);
      return target ? [{
        relationType: edge.fromRecordId === recordId ? edge.relationType : `inbound ${edge.relationType || "related"}`,
        recordId: target.id,
        name: target.name,
        canonType: target.canonType,
      }] : [];
    }),
    linkedSpecs: specs.map(spec => ({ id: spec.id, name: spec.name || "Untitled Production Spec" })),
    linkedPromptModules: modules,
  };
  return {
    record,
    path: canonSnapshotPath(snapshotRecord),
    markdown: renderCanonSnapshot(snapshotRecord),
  };
}

async function publishCanonContextSnapshot(recordId: string): Promise<{
  status: "current" | "sync_failed";
  snapshot: typeof wsContextSnapshotsTable.$inferSelect;
}> {
  const built = await buildCanonContextSnapshot(recordId);
  if (!built) throw new Error("Canon record not found");
  const [existingSnapshot] = await db.select({
    githubPath: wsContextSnapshotsTable.githubPath,
  }).from(wsContextSnapshotsTable).where(and(
    eq(wsContextSnapshotsTable.entityType, "canon_record"),
    eq(wsContextSnapshotsTable.entityId, recordId),
  )).limit(1);
  try {
    const published = await new ContextSnapshotGitHubPublisher().publish(
      built.path,
      built.markdown,
      `context: update Canon snapshot for ${built.record.name}`,
      existingSnapshot?.githubPath,
    );
    const now = new Date();
    const [snapshot] = await db.insert(wsContextSnapshotsTable).values({
      entityType: "canon_record",
      entityId: recordId,
      worldId: built.record.worldId,
      githubPath: published.path,
      githubCommitSha: published.commitSha,
      status: "current",
      contentHash: snapshotHash(built.markdown),
      recordUpdatedAt: built.record.updatedAt,
      lastSnapshotAt: now,
      lastError: null,
    }).onConflictDoUpdate({
      target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
      set: {
        worldId: built.record.worldId,
        githubPath: published.path,
        githubCommitSha: published.commitSha,
        status: "current",
        contentHash: snapshotHash(built.markdown),
        recordUpdatedAt: built.record.updatedAt,
        lastSnapshotAt: now,
        lastError: null,
        updatedAt: now,
      },
    }).returning();
    return { status: "current", snapshot };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Context Snapshot sync failed";
    logger.error({ err, recordId }, "editorial: update context snapshot");
    const [snapshot] = await db.insert(wsContextSnapshotsTable).values({
      entityType: "canon_record",
      entityId: recordId,
      worldId: built.record.worldId,
      githubPath: existingSnapshot?.githubPath ?? built.path,
      status: "sync_failed",
      lastError: message.slice(0, 500),
    }).onConflictDoUpdate({
      target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
      set: {
        worldId: built.record.worldId,
        githubPath: existingSnapshot?.githubPath ?? built.path,
        status: "sync_failed",
        lastError: message.slice(0, 500),
        updatedAt: new Date(),
      },
    }).returning();
    return { status: "sync_failed", snapshot };
  }
}

async function autoPublishCanonContextSnapshot(record: { id: string; status: string }): Promise<"current" | "sync_failed" | null> {
  const [policy] = await db.select({
    autoSync: wsContextSnapshotsTable.autoSync,
    autoSyncUnaccepted: wsContextSnapshotsTable.autoSyncUnaccepted,
  }).from(wsContextSnapshotsTable).where(and(
    eq(wsContextSnapshotsTable.entityType, "canon_record"),
    eq(wsContextSnapshotsTable.entityId, record.id),
  )).limit(1);
  if (!policy || !shouldAutoSyncContextSnapshot(policy, record.status)) return null;
  return (await publishCanonContextSnapshot(record.id)).status;
}

async function syncCanonContextSnapshot(recordId: string, _publisher: ContextSnapshotGitHubPublisher) {
  const result = await publishCanonContextSnapshot(recordId);
  if (result.status === "sync_failed") {
    throw new Error(result.snapshot.lastError ?? "Context Snapshot sync failed");
  }
  const built = await buildCanonContextSnapshot(recordId);
  return { snapshot: result.snapshot, name: built?.record.name ?? recordId };
}

async function markCanonContextSnapshotFailed(recordId: string, message: string) {
  const [stored] = await db.select().from(wsContextSnapshotsTable).where(and(
    eq(wsContextSnapshotsTable.entityType, "canon_record"),
    eq(wsContextSnapshotsTable.entityId, recordId),
  )).limit(1);
  if (stored?.status === "sync_failed") return;
  const [record] = await db.select({ worldId: wsCanonRecordsTable.worldId })
    .from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId)).limit(1).catch(() => []);
  if (!record) return;
  await db.insert(wsContextSnapshotsTable).values({
    entityType: "canon_record",
    entityId: recordId,
    worldId: record.worldId,
    githubPath: stored?.githubPath ?? `worlds/${record.worldId}/context/canon/${recordId}.md`,
    status: "sync_failed",
    lastError: message.slice(0, 500),
  }).onConflictDoUpdate({
    target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
    set: { status: "sync_failed", lastError: message.slice(0, 500), updatedAt: new Date() },
  }).catch(() => undefined);
}

interface ContextSnapshotJob {
  id: string;
  worldId: string;
  mode: "all" | "outdated";
  status: "running" | "complete";
  total: number;
  selected: number;
  processed: number;
  updated: number;
  failed: number;
  skipped: number;
  results: Array<{ id: string; name: string; status: "updated" | "failed"; error?: string }>;
  createdAt: Date;
}

const contextSnapshotJobs = new Map<string, ContextSnapshotJob>();

function removeExpiredContextSnapshotJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of contextSnapshotJobs) {
    if (job.createdAt.getTime() < cutoff) contextSnapshotJobs.delete(id);
  }
}

router.get("/v1/editorial/canon-records/:id/context-snapshot", async (req: Request, res: Response) => {
  try {
    const built = await buildCanonContextSnapshot(req.params.id as string);
    if (!built) { res.status(404).json({ error: "Canon record not found" }); return; }
    const [stored] = await db.select().from(wsContextSnapshotsTable).where(and(
      eq(wsContextSnapshotsTable.entityType, "canon_record"),
      eq(wsContextSnapshotsTable.entityId, built.record.id),
    )).limit(1);
    const status = stored?.status === "sync_failed"
      ? "sync_failed"
      : !stored?.lastSnapshotAt
        ? "not_generated"
      : !stored.recordUpdatedAt || built.record.updatedAt > stored.recordUpdatedAt
        ? "out_of_date"
        : "current";
    res.json({
      snapshot: {
        status,
        githubPath: stored?.githubPath ?? built.path,
        githubCommitSha: stored?.githubCommitSha ?? null,
        lastSnapshotAt: stored?.lastSnapshotAt ?? null,
        recordUpdatedAt: stored?.recordUpdatedAt ?? null,
        lastError: stored?.lastError ?? null,
        autoSync: stored?.autoSync ?? false,
        autoSyncUnaccepted: stored?.autoSyncUnaccepted ?? false,
      },
    });
  } catch (err) {
    logger.error({ err, recordId: req.params.id }, "editorial: get context snapshot status");
    res.status(500).json({ error: "Context Snapshot status could not be loaded" });
  }
});

router.patch("/v1/editorial/canon-records/:id/context-snapshot", async (req: Request, res: Response) => {
  const recordId = req.params.id as string;
  const { auto_sync, auto_sync_unaccepted } = req.body;
  if (typeof auto_sync !== "boolean" || (auto_sync_unaccepted !== undefined && typeof auto_sync_unaccepted !== "boolean")) {
    res.status(400).json({ error: "auto_sync must be boolean and auto_sync_unaccepted must be boolean when provided" });
    return;
  }
  try {
    const built = await buildCanonContextSnapshot(recordId);
    if (!built) { res.status(404).json({ error: "Canon record not found" }); return; }
    const [snapshot] = await db.insert(wsContextSnapshotsTable).values({
      entityType: "canon_record",
      entityId: recordId,
      worldId: built.record.worldId,
      githubPath: built.path,
      autoSync: auto_sync,
      autoSyncUnaccepted: auto_sync_unaccepted ?? false,
    }).onConflictDoUpdate({
      target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
      set: {
        autoSync: auto_sync,
        ...(auto_sync_unaccepted !== undefined ? { autoSyncUnaccepted: auto_sync_unaccepted } : {}),
        updatedAt: new Date(),
      },
    }).returning();
    res.json({ snapshot });
  } catch (err) {
    logger.error({ err, recordId }, "editorial: update context snapshot policy");
    res.status(500).json({ error: "Context Snapshot policy could not be updated" });
  }
});

router.post("/v1/editorial/canon-records/:id/context-snapshot", async (req: Request, res: Response) => {
  const recordId = req.params.id as string;
  try {
    const result = await publishCanonContextSnapshot(recordId);
    if (result.status === "sync_failed") {
      res.status(502).json({ error: result.snapshot.lastError ?? "Context Snapshot sync failed" });
      return;
    }
    res.json({ snapshot: { ...result.snapshot, status: "current" } });
  } catch (err) {
    res.status(err instanceof Error && err.message === "Canon record not found" ? 404 : 500)
      .json({ error: err instanceof Error ? err.message : "Context Snapshot sync failed" });
  }
});

router.post("/v1/editorial/worlds/:id/context-snapshots", async (req: Request, res: Response) => {
  const worldId = req.params.id as string;
  const mode = req.body?.mode;
  if (mode !== "all" && mode !== "outdated") {
    res.status(400).json({ error: "mode must be all or outdated" });
    return;
  }
  try {
    const [world] = await db.select({ id: worldsmithWorldsTable.id })
      .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
    if (!world) {
      res.status(404).json({ error: "World not found" });
      return;
    }
    const records = await db.select({
      id: wsCanonRecordsTable.id,
      name: wsCanonRecordsTable.name,
      updatedAt: wsCanonRecordsTable.updatedAt,
    }).from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.worldId, worldId))
      .orderBy(wsCanonRecordsTable.id);
    const stored = records.length
      ? await db.select().from(wsContextSnapshotsTable).where(and(
          eq(wsContextSnapshotsTable.entityType, "canon_record"),
          inArray(wsContextSnapshotsTable.entityId, records.map(record => record.id)),
        ))
      : [];
    const storedById = new Map(stored.map(snapshot => [snapshot.entityId, snapshot]));
    const targets = mode === "all"
      ? records
      : records.filter(record => contextSnapshotIsOutdated(record.updatedAt, storedById.get(record.id)));
    removeExpiredContextSnapshotJobs();
    const job: ContextSnapshotJob = {
      id: randomUUID(),
      worldId,
      mode,
      status: targets.length ? "running" : "complete",
      total: records.length,
      selected: targets.length,
      processed: 0,
      updated: 0,
      failed: 0,
      skipped: records.length - targets.length,
      results: [],
      createdAt: new Date(),
    };
    contextSnapshotJobs.set(job.id, job);
    res.status(202).json(job);

    if (targets.length) {
      const publisher = new ContextSnapshotGitHubPublisher();
      void mapWithConcurrency(targets, 3, async record => {
        let result: ContextSnapshotJob["results"][number];
        try {
          await syncCanonContextSnapshot(record.id, publisher);
          result = { id: record.id, name: record.name, status: "updated" };
          job.updated += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Context Snapshot sync failed";
          logger.error({ err, recordId: record.id, worldId }, "editorial: bulk context snapshot update");
          await markCanonContextSnapshotFailed(record.id, message);
          result = { id: record.id, name: record.name, status: "failed", error: message };
          job.failed += 1;
        }
        job.results.push(result);
        job.processed += 1;
        return result;
      }).then(() => {
        job.status = "complete";
      }).catch(err => {
        logger.error({ err, worldId, jobId: job.id }, "editorial: context snapshot job crashed");
        job.status = "complete";
      });
    }
  } catch (err) {
    logger.error({ err, worldId }, "editorial: bulk context snapshot update");
    res.status(500).json({ error: "Context Snapshots could not be updated" });
  }
});

router.get("/v1/editorial/context-snapshot-jobs/:id", async (req: Request, res: Response) => {
  removeExpiredContextSnapshotJobs();
  const job = contextSnapshotJobs.get(req.params.id as string);
  if (!job) {
    res.status(404).json({ error: "Context Snapshot job not found" });
    return;
  }
  res.json(job);
});

router.patch("/v1/editorial/canon-records/:id", async (req: Request, res: Response) => {
  const {
    name, canon_type, narrative_details, historical_context, visual_notes,
    emotional_register, sensory_clauses, register_locked,
    narrative_visibility, temporal_scope, canon_stability,
    from_entity_id, to_entity_id, emotional_valence,
    portrait_url, notes,
    typography,
  } = req.body;
  // Validate emotional_register if provided
  const VALID_REGISTERS = ["Withholding", "Intimate", "Guarded", "Trespass", "Absence", "Confidence"];
  if (emotional_register !== undefined && emotional_register !== null && !VALID_REGISTERS.includes(emotional_register)) {
    res.status(400).json({ error: `Invalid emotional_register. Must be one of: ${VALID_REGISTERS.join(", ")}` });
    return;
  }
  const VALID_VISIBILITIES = ["background", "hinted", "explicit"];
  if (narrative_visibility !== undefined && narrative_visibility !== null && !VALID_VISIBILITIES.includes(narrative_visibility)) {
    res.status(400).json({ error: `Invalid narrative_visibility. Must be one of: ${VALID_VISIBILITIES.join(", ")}` });
    return;
  }
  const VALID_STABILITIES = ["low", "medium", "high"];
  if (canon_stability !== undefined && canon_stability !== null && !VALID_STABILITIES.includes(canon_stability)) {
    res.status(400).json({ error: `Invalid canon_stability. Must be one of: ${VALID_STABILITIES.join(", ")}` });
    return;
  }
  const VALID_VALENCES = ["admiration", "affection", "rivalry", "estrangement", "dependency", "betrayal", "grief", "obligation", "ambivalence"];
  if (emotional_valence !== undefined && emotional_valence !== null && !VALID_VALENCES.includes(emotional_valence)) {
    res.status(400).json({ error: `Invalid emotional_valence. Must be one of: ${VALID_VALENCES.join(", ")}` });
    return;
  }
  // Validate from/to entity IDs belong to the same world as the record being patched
  if (from_entity_id !== undefined && from_entity_id !== null) {
    const [fromRecord] = await db.select({ worldId: wsCanonRecordsTable.worldId })
      .from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, from_entity_id));
    const [thisRecord] = await db.select({ worldId: wsCanonRecordsTable.worldId })
      .from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, req.params.id as string));
    if (!fromRecord) {
      res.status(400).json({ error: "from_entity_id references a canon record that does not exist" });
      return;
    }
    if (thisRecord && fromRecord.worldId !== thisRecord.worldId) {
      res.status(400).json({ error: "from_entity_id must belong to the same world as this record" });
      return;
    }
  }
  if (to_entity_id !== undefined && to_entity_id !== null) {
    const [toRecord] = await db.select({ worldId: wsCanonRecordsTable.worldId })
      .from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, to_entity_id));
    const [thisRecord] = await db.select({ worldId: wsCanonRecordsTable.worldId })
      .from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, req.params.id as string));
    if (!toRecord) {
      res.status(400).json({ error: "to_entity_id references a canon record that does not exist" });
      return;
    }
    if (thisRecord && toRecord.worldId !== thisRecord.worldId) {
      res.status(400).json({ error: "to_entity_id must belong to the same world as this record" });
      return;
    }
  }
  try {
    const resolvedTypography = typography === undefined ? undefined : await resolveTypographyChoices(typography);
    const [row] = await db
      .update(wsCanonRecordsTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(canon_type !== undefined ? { canonType: canon_type } : {}),
        ...(narrative_details !== undefined ? { narrativeDetails: sanitizeEditorialRichText(narrative_details) } : {}),
        ...(historical_context !== undefined ? { historicalContext: sanitizeEditorialRichText(historical_context) } : {}),
        ...(visual_notes !== undefined ? { visualNotes: sanitizeEditorialRichText(visual_notes) } : {}),
        ...(resolvedTypography !== undefined ? { typography: resolvedTypography } : {}),
        ...(emotional_register !== undefined ? { emotionalRegister: emotional_register } : {}),
        ...(sensory_clauses !== undefined ? { sensoryClauses: sensory_clauses } : {}),
        ...(register_locked !== undefined ? { registerLocked: register_locked } : {}),
        ...(narrative_visibility !== undefined ? { narrativeVisibility: narrative_visibility } : {}),
        ...(temporal_scope !== undefined ? { temporalScope: temporal_scope } : {}),
        ...(canon_stability !== undefined ? { canonStability: canon_stability } : {}),
        ...(from_entity_id !== undefined ? { fromEntityId: from_entity_id } : {}),
        ...(to_entity_id !== undefined ? { toEntityId: to_entity_id } : {}),
        ...(emotional_valence !== undefined ? { emotionalValence: emotional_valence } : {}),
        ...(portrait_url !== undefined ? { portraitUrl: portrait_url } : {}),
        ...(notes !== undefined ? { notes: sanitizeEditorialRichText(notes) } : {}),
      })
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .returning();
    if (!row) { res.status(404).json({ error: "Canon record not found" }); return; }

    // Write updated fields back to Notion if this record is linked to a page.
    // All Notion writes are non-fatal: local save already succeeded above.
    if (row.notionPageId) {
      const notionProps: Record<string, unknown> = {};
      if (emotional_register !== undefined) {
        notionProps["Emotional register"] = emotional_register
          ? selectProp(emotional_register)
          : { select: null };
      }
      if (sensory_clauses !== undefined) {
        notionProps["Sensory clauses"] = richTextProp(sensory_clauses ?? "");
      }
      if (register_locked !== undefined) {
        notionProps["Register locked"] = { checkbox: !!register_locked };
      }
      if (narrative_visibility !== undefined) {
        notionProps["Narrative visibility"] = narrative_visibility
          ? selectProp(narrative_visibility)
          : { select: null };
      }
      if (temporal_scope !== undefined) {
        notionProps["Temporal scope"] = richTextProp(temporal_scope ?? "");
      }
      if (canon_stability !== undefined) {
        notionProps["Canon stability"] = canon_stability
          ? selectProp(canon_stability)
          : { select: null };
      }
      if (Object.keys(notionProps).length > 0) {
        try {
          await updatePage(row.notionPageId, notionProps);
        } catch (notionErr) {
          // Non-fatal — log and continue; local save already succeeded
          logger.warn({ err: notionErr, id: row.id }, "editorial: failed to write canon fields to Notion (non-fatal)");
        }
      }
    }

    const contextSnapshotStatus = await autoPublishCanonContextSnapshot(row).catch(autoSyncErr => {
      logger.error({ err: autoSyncErr, id: row.id }, "editorial: automatic context snapshot failed");
      return "sync_failed" as const;
    });
    res.json({ canon_record: row, context_snapshot_status: contextSnapshotStatus });
  } catch (err) {
    if (err instanceof TypographyValidationError) {
      res.status(400).json({ error: err.message, code: "INVALID_TYPOGRAPHY" });
      return;
    }
    logger.error({ err }, "editorial: update canon record");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Create a reusable visual reference for a canon item.
 *
 * The resulting image is intentionally not written to the database here. The
 * editor uploads the returned PNG to App Storage and saves its object path as
 * the record's portraitUrl, so generated art and hand-uploaded art follow the
 * same durable asset lifecycle.
 */
router.post("/v1/editorial/canon-records/generate-image", async (req: Request, res: Response) => {
  const {
    world_id,
    name,
    canon_type,
    narrative_details,
    historical_context,
    visual_notes,
  } = req.body as {
    world_id?: string;
    name?: string;
    canon_type?: string;
    narrative_details?: string;
    historical_context?: string;
    visual_notes?: string;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "Give the canon record a name before generating an image." });
    return;
  }

  try {
    const [world] = world_id
      ? await db
          .select({
            name: worldsmithWorldsTable.name,
            visualPalette: worldsmithWorldsTable.visualPalette,
            atmosphericNotes: worldsmithWorldsTable.atmosphericNotes,
            materialWorld: worldsmithWorldsTable.materialWorld,
          })
          .from(worldsmithWorldsTable)
          .where(eq(worldsmithWorldsTable.id, world_id))
          .limit(1)
      : [];

    const visualDirection = [
      editorialRichTextToPlainText(visual_notes).trim(),
      editorialRichTextToPlainText(narrative_details).trim(),
      editorialRichTextToPlainText(historical_context).trim(),
    ].filter(Boolean).join("\n");

    const worldDirection = world
      ? [
          `World: ${world.name}`,
          world.visualPalette ? `Visual palette: ${editorialRichTextToPlainText(world.visualPalette)}` : "",
          world.materialWorld ? `Material world: ${editorialRichTextToPlainText(world.materialWorld)}` : "",
          world.atmosphericNotes ? `Atmosphere: ${editorialRichTextToPlainText(world.atmosphericNotes)}` : "",
        ].filter(Boolean).join("\n")
      : "";

    const subjectGuidance = canon_type === "object"
      ? "Depict the individual object itself as the hero subject, not a scene. Keep it fully visible, isolated, and easy to reuse in future ephemera, paper, or product compositions."
      : "Depict one clear, recognisable visual reference for this canon subject. Keep the main subject fully visible with clean space around it for reuse in future production work.";

    const prompt = [
      "Create a square, production-ready canon reference illustration.",
      `Canon type: ${canon_type || "canon item"}.`,
      `Canon name: ${name.trim()}.`,
      subjectGuidance,
      "Use the supplied canon and world direction as fixed design constraints so later related images can repeat the same materials, motifs, palette, age, and visual language.",
      "No words, lettering, labels, signatures, logos, watermarks, frames, or mockup presentation. Do not add unrelated objects.",
      worldDirection && `World direction:\n${worldDirection}`,
      visualDirection && `Canon direction:\n${visualDirection}`,
    ].filter(Boolean).join("\n\n");

    const generatedImage = await generateImage(prompt, { size: "1024x1024", quality: "high" });
    const { dataUrl: imageDataUrl, ...generationMetadata } = generatedImage;
    res.json({ image_data_url: imageDataUrl, generation: generationMetadata });
  } catch (err) {
    logger.error({ err, canonName: name }, "editorial: generate canon image");
    res.status(502).json({ error: "Image generation could not be completed. Please try again." });
  }
});

// Valid status transitions for canon records
const CANON_TRANSITIONS: Record<string, string[]> = {
  proposed:     ["under_review", "rejected"],
  under_review: ["accepted", "superseded", "rejected", "proposed"],
  accepted:     ["superseded"],
  superseded:   ["proposed"],
  rejected:     ["proposed"],
};

router.post("/v1/editorial/canon-records/:id/transition", async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: "status is required" }); return; }

  try {
    const [existing] = await db
      .select()
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Canon record not found" }); return; }

    const allowed = CANON_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(status)) {
      res.status(422).json({
        error: `Cannot transition from "${existing.status}" to "${status}".`,
        allowed_transitions: allowed,
      });
      return;
    }

    const [updated] = await db
      .update(wsCanonRecordsTable)
      .set({ status })
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .returning();

    const contextSnapshotStatus = await autoPublishCanonContextSnapshot(updated).catch(autoSyncErr => {
      logger.error({ err: autoSyncErr, id: updated.id }, "editorial: automatic context snapshot failed after transition");
      return "sync_failed" as const;
    });
    res.json({ canon_record: updated, context_snapshot_status: contextSnapshotStatus });
  } catch (err) {
    logger.error({ err }, "editorial: canon record transition");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Canon Records — register cascade ─────────────────────────────────────────

/**
 * POST /v1/editorial/canon-records/:id/cascade-register
 *
 * BFS traversal of ws_canon_record_relations starting from :id.
 * For every reachable descendant where register_locked = false,
 * overwrite emotional_register with the source record's value.
 * Stops traversal at any node where register_locked = true.
 *
 * Returns { updated, skipped_locked, register } summary.
 */
router.post("/v1/editorial/canon-records/:id/cascade-register", async (req: Request, res: Response) => {
  const sourceId = req.params.id as string;

  try {
    // Load the source record
    const [source] = await db
      .select({
        id: wsCanonRecordsTable.id,
        emotionalRegister: wsCanonRecordsTable.emotionalRegister,
      })
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, sourceId))
      .limit(1);

    if (!source) {
      res.status(404).json({ error: "Canon record not found" });
      return;
    }

    if (!source.emotionalRegister) {
      res.status(422).json({ error: "Source record has no emotional_register set — nothing to cascade." });
      return;
    }

    const register = source.emotionalRegister;

    // BFS traversal through ws_canon_record_relations
    const visited = new Set<string>([sourceId]);
    let frontier = [sourceId];
    const toUpdate: string[] = [];
    let skippedLocked = 0;

    while (frontier.length > 0) {
      // Fetch all outgoing edges for the current frontier
      const edges = await db
        .select({
          toRecordId: wsCanonRecordRelationsTable.toRecordId,
        })
        .from(wsCanonRecordRelationsTable)
        .where(inArray(wsCanonRecordRelationsTable.fromRecordId, frontier));

      // Collect unique, unvisited targets
      const candidates = [...new Set(edges.map(e => e.toRecordId))].filter(id => !visited.has(id));

      if (candidates.length === 0) break;

      // Load lock status for all candidates in one query
      const candidateRows = await db
        .select({
          id: wsCanonRecordsTable.id,
          registerLocked: wsCanonRecordsTable.registerLocked,
        })
        .from(wsCanonRecordsTable)
        .where(inArray(wsCanonRecordsTable.id, candidates));

      const nextFrontier: string[] = [];
      for (const row of candidateRows) {
        visited.add(row.id);
        if (row.registerLocked) {
          // Stop propagation here — locked node is not updated and not traversed further
          skippedLocked++;
        } else {
          toUpdate.push(row.id);
          nextFrontier.push(row.id); // continue BFS through unlocked nodes
        }
      }

      frontier = nextFrontier;
    }

    // Batch update all unlocked descendants
    if (toUpdate.length > 0) {
      await db
        .update(wsCanonRecordsTable)
        .set({ emotionalRegister: register })
        .where(inArray(wsCanonRecordsTable.id, toUpdate));
    }

    logger.info(
      { sourceId, register, updated: toUpdate.length, skipped_locked: skippedLocked },
      "editorial: cascade-register complete",
    );

    res.json({
      updated: toUpdate.length,
      skipped_locked: skippedLocked,
      register,
    });
  } catch (err) {
    logger.error({ err }, "editorial: cascade-register");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Canon Records — linked specs + bulk transition ────────────────────────────

/** GET /:id/specs — production specs that reference this canon record */
router.get("/v1/editorial/canon-records/:id/specs", async (req: Request, res: Response) => {
  try {
    const [record] = await db
      .select({ worldId: wsCanonRecordsTable.worldId })
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .limit(1);
    if (!record) { res.status(404).json({ error: "Canon record not found" }); return; }

    // Find specs whose canonRecordIds JSONB array contains this record's id
    const specs = await db
      .select({
        id: wsProductionSpecsTable.id,
        productionItem: wsProductionSpecsTable.productionItem,
        componentType: wsProductionSpecsTable.componentType,
        status: wsProductionSpecsTable.status,
        collectionId: wsProductionSpecsTable.collectionId,
        updatedAt: wsProductionSpecsTable.updatedAt,
      })
      .from(wsProductionSpecsTable)
      .where(
        and(
          eq(wsProductionSpecsTable.worldId, record.worldId),
          sql`${wsProductionSpecsTable.canonRecordIds} @> ${JSON.stringify([req.params.id])}::jsonb`,
        ),
      )
      .orderBy(wsProductionSpecsTable.productionItem)
      .limit(50);

    res.json({ specs });
  } catch (err) {
    logger.error({ err }, "editorial: canon record specs");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Canon Records — relation edges (GET/POST/PATCH/DELETE) ────────────────────

const VALID_RELATION_TYPES = ["related", "supports", "contradicts", "precedes", "follows"] as const;
type RelationType = typeof VALID_RELATION_TYPES[number];

/**
 * GET /v1/editorial/canon-records/:id/relations
 * Returns outgoing relation edges for a record, with target name + canonType enriched.
 */
router.get("/v1/editorial/canon-records/:id/relations", async (req: Request, res: Response) => {
  const recordId = req.params.id as string;
  try {
    const edges = await db
      .select({
        fromRecordId: wsCanonRecordRelationsTable.fromRecordId,
        toRecordId: wsCanonRecordRelationsTable.toRecordId,
        relationType: wsCanonRecordRelationsTable.relationType,
        createdAt: wsCanonRecordRelationsTable.createdAt,
        targetName: wsCanonRecordsTable.name,
        targetCanonType: wsCanonRecordsTable.canonType,
        targetStatus: wsCanonRecordsTable.status,
      })
      .from(wsCanonRecordRelationsTable)
      .innerJoin(wsCanonRecordsTable, eq(wsCanonRecordRelationsTable.toRecordId, wsCanonRecordsTable.id))
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, recordId))
      .orderBy(wsCanonRecordRelationsTable.createdAt);

    res.json({ relations: edges });
  } catch (err) {
    logger.error({ err }, "editorial: list canon record relations");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /v1/editorial/canon-records/:id/inbound-relations
 * Returns edges pointing AT this record, enriched with source name + canonType.
 * Useful for detecting `contradicts` edges from other records.
 */
router.get("/v1/editorial/canon-records/:id/inbound-relations", async (req: Request, res: Response) => {
  const recordId = req.params.id as string;
  try {
    // alias for the source (from) record
    const fromAlias = wsCanonRecordsTable;

    const edges = await db
      .select({
        fromRecordId: wsCanonRecordRelationsTable.fromRecordId,
        toRecordId: wsCanonRecordRelationsTable.toRecordId,
        relationType: wsCanonRecordRelationsTable.relationType,
        createdAt: wsCanonRecordRelationsTable.createdAt,
        sourceName: fromAlias.name,
        sourceCanonType: fromAlias.canonType,
        sourceStatus: fromAlias.status,
      })
      .from(wsCanonRecordRelationsTable)
      .innerJoin(fromAlias, eq(wsCanonRecordRelationsTable.fromRecordId, fromAlias.id))
      .where(eq(wsCanonRecordRelationsTable.toRecordId, recordId))
      .orderBy(wsCanonRecordRelationsTable.createdAt);

    res.json({ inbound_relations: edges });
  } catch (err) {
    logger.error({ err }, "editorial: list inbound canon record relations");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /v1/editorial/canon-records/:id/relations
 * Body: { to_record_id: string; relation_type?: RelationType }
 * Upserts an edge — if it already exists, updates the relation_type.
 */
router.post("/v1/editorial/canon-records/:id/relations", async (req: Request, res: Response) => {
  const fromRecordId = req.params.id as string;
  const { to_record_id, relation_type = "related" } = req.body as {
    to_record_id?: string;
    relation_type?: string;
  };

  if (!to_record_id?.trim()) {
    res.status(400).json({ error: "to_record_id is required" });
    return;
  }
  if (fromRecordId === to_record_id) {
    res.status(400).json({ error: "Cannot link a record to itself" });
    return;
  }
  if (!VALID_RELATION_TYPES.includes(relation_type as RelationType)) {
    res.status(400).json({
      error: `Invalid relation_type. Must be one of: ${VALID_RELATION_TYPES.join(", ")}`,
    });
    return;
  }

  try {
    // Verify both records exist
    const [from, to] = await Promise.all([
      db.select({ id: wsCanonRecordsTable.id }).from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.id, fromRecordId)).limit(1),
      db.select({ id: wsCanonRecordsTable.id }).from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.id, to_record_id)).limit(1),
    ]);
    if (!from[0]) { res.status(404).json({ error: "Source canon record not found" }); return; }
    if (!to[0]) { res.status(404).json({ error: "Target canon record not found" }); return; }

    // Upsert: insert or update relation_type on conflict
    await db
      .insert(wsCanonRecordRelationsTable)
      .values({ fromRecordId, toRecordId: to_record_id, relationType: relation_type })
      .onConflictDoUpdate({
        target: [wsCanonRecordRelationsTable.fromRecordId, wsCanonRecordRelationsTable.toRecordId],
        set: { relationType: relation_type },
      });

    // Return the updated edge with target info
    const [edge] = await db
      .select({
        fromRecordId: wsCanonRecordRelationsTable.fromRecordId,
        toRecordId: wsCanonRecordRelationsTable.toRecordId,
        relationType: wsCanonRecordRelationsTable.relationType,
        createdAt: wsCanonRecordRelationsTable.createdAt,
        targetName: wsCanonRecordsTable.name,
        targetCanonType: wsCanonRecordsTable.canonType,
        targetStatus: wsCanonRecordsTable.status,
      })
      .from(wsCanonRecordRelationsTable)
      .innerJoin(wsCanonRecordsTable, eq(wsCanonRecordRelationsTable.toRecordId, wsCanonRecordsTable.id))
      .where(
        and(
          eq(wsCanonRecordRelationsTable.fromRecordId, fromRecordId),
          eq(wsCanonRecordRelationsTable.toRecordId, to_record_id),
        ),
      )
      .limit(1);

    res.status(201).json({ relation: edge });
  } catch (err) {
    logger.error({ err }, "editorial: add canon record relation");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /v1/editorial/canon-records/:id/relations/:toId
 * Body: { relation_type: RelationType }
 * Updates the semantic label on an existing edge.
 */
router.patch("/v1/editorial/canon-records/:id/relations/:toId", async (req: Request, res: Response) => {
  const fromRecordId = req.params.id as string;
  const toRecordId = req.params.toId as string;
  const { relation_type } = req.body as { relation_type?: string };

  if (!relation_type || !VALID_RELATION_TYPES.includes(relation_type as RelationType)) {
    res.status(400).json({
      error: `relation_type is required and must be one of: ${VALID_RELATION_TYPES.join(", ")}`,
    });
    return;
  }

  try {
    const [updated] = await db
      .update(wsCanonRecordRelationsTable)
      .set({ relationType: relation_type })
      .where(
        and(
          eq(wsCanonRecordRelationsTable.fromRecordId, fromRecordId),
          eq(wsCanonRecordRelationsTable.toRecordId, toRecordId),
        ),
      )
      .returning();

    if (!updated) { res.status(404).json({ error: "Relation not found" }); return; }
    res.json({ relation: updated });
  } catch (err) {
    logger.error({ err }, "editorial: patch canon record relation");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /v1/editorial/canon-records/:id/relations/:toId
 * Removes an outgoing edge.
 */
router.delete("/v1/editorial/canon-records/:id/relations/:toId", async (req: Request, res: Response) => {
  const fromRecordId = req.params.id as string;
  const toRecordId = req.params.toId as string;
  try {
    const [deleted] = await db
      .delete(wsCanonRecordRelationsTable)
      .where(
        and(
          eq(wsCanonRecordRelationsTable.fromRecordId, fromRecordId),
          eq(wsCanonRecordRelationsTable.toRecordId, toRecordId),
        ),
      )
      .returning();

    if (!deleted) { res.status(404).json({ error: "Relation not found" }); return; }
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, "editorial: delete canon record relation");
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /bulk-transition — change status for multiple records at once */
router.post("/v1/editorial/canon-records/bulk-transition", async (req: Request, res: Response) => {
  const { ids, status } = req.body as { ids?: string[]; status?: string };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids (non-empty array) is required" });
    return;
  }
  if (!status) {
    res.status(400).json({ error: "status is required" });
    return;
  }

  try {
    // Validate all can transition to the target status
    const records = await db
      .select({ id: wsCanonRecordsTable.id, status: wsCanonRecordsTable.status })
      .from(wsCanonRecordsTable)
      .where(sql`${wsCanonRecordsTable.id} = ANY(${sql.raw(`ARRAY[${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`)})`)
      .limit(200);

    const invalid = records.filter(r => !(CANON_TRANSITIONS[r.status] ?? []).includes(status));
    if (invalid.length > 0) {
      res.status(422).json({
        error: `${invalid.length} record(s) cannot transition to "${status}".`,
        invalid_ids: invalid.map(r => r.id),
      });
      return;
    }

    // Apply transition to all. Snapshot publication remains non-fatal and runs
    // only after the authoritative Daybook update succeeds.
    const updatedRecords = await db
      .update(wsCanonRecordsTable)
      .set({ status })
      .where(sql`${wsCanonRecordsTable.id} = ANY(${sql.raw(`ARRAY[${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`)})`)
      .returning({ id: wsCanonRecordsTable.id, status: wsCanonRecordsTable.status });

    const snapshotResults: Array<{ id: string; status: "current" | "sync_failed" | "skipped" }> = [];
    const concurrency = 4;
    for (let offset = 0; offset < updatedRecords.length; offset += concurrency) {
      const batch = updatedRecords.slice(offset, offset + concurrency);
      snapshotResults.push(...await Promise.all(batch.map(async (record): Promise<{
        id: string;
        status: "current" | "sync_failed" | "skipped";
      }> => {
        try {
          const snapshotStatus = await autoPublishCanonContextSnapshot(record);
          return { id: record.id, status: snapshotStatus ?? "skipped" };
        } catch (autoSyncErr) {
          logger.error({ err: autoSyncErr, id: record.id }, "editorial: automatic context snapshot failed after bulk transition");
          return { id: record.id, status: "sync_failed" as const };
        }
      })));
    }
    res.json({
      updated: updatedRecords.length,
      status,
      context_snapshots: {
        current: snapshotResults.filter(result => result.status === "current").length,
        sync_failed: snapshotResults.filter(result => result.status === "sync_failed").length,
        skipped: snapshotResults.filter(result => result.status === "skipped").length,
        results: snapshotResults,
      },
    });
  } catch (err) {
    logger.error({ err }, "editorial: canon bulk transition");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Style Guides ──────────────────────────────────────────────────────────────

router.get("/v1/editorial/style-guides", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  try {
    const rows = await db
      .select()
      .from(wsStyleGuidesTable)
      .where(worldId ? eq(wsStyleGuidesTable.worldId, worldId) : undefined)
      .orderBy(wsStyleGuidesTable.name);
    res.json({ style_guides: rows });
  } catch (err) {
    logger.error({ err }, "editorial: list style guides");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/style-guides", async (req: Request, res: Response) => {
  const { world_id, name, content, typography } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    const resolvedTypography = typography === undefined ? undefined : await resolveTypographyChoices(typography);
    const [row] = await db
      .insert(wsStyleGuidesTable)
      .values({
        id: crypto.randomUUID(),
        worldId: world_id,
        name: name.trim(),
        content: sanitizeEditorialRichText(content ?? ""),
        ...(resolvedTypography !== undefined ? { typography: resolvedTypography } : {}),
      })
      .returning();
    res.status(201).json({ style_guide: row });
  } catch (err) {
    if (err instanceof TypographyValidationError) {
      res.status(400).json({ error: err.message, code: "INVALID_TYPOGRAPHY" });
      return;
    }
    logger.error({ err }, "editorial: create style guide");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Style Guides — Notion sync ────────────────────────────────────────────────
// POST /v1/editorial/style-guides/sync-notion
// Pulls all pages from the world's Notion style-guides DB and upserts them locally.
// Uses the world's notionStyleGuidesDbId first, falls back to NOTION_STYLE_GUIDES_DB_ID env.

router.post("/v1/editorial/style-guides/sync-notion", async (req: Request, res: Response) => {
  const { world_id } = req.body as { world_id?: string };
  if (!world_id) {
    res.status(400).json({ error: "world_id is required" });
    return;
  }

  try {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      res.status(503).json({ error: "NOTION_TOKEN is not configured" });
      return;
    }

    // Resolve the Notion style-guides DB for this world
    const [world] = await db
      .select({
        notionStyleGuidesDbId: worldsmithWorldsTable.notionStyleGuidesDbId,
      })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, world_id));

    if (!world) {
      res.status(404).json({ error: "World not found" });
      return;
    }

    const dbId = world.notionStyleGuidesDbId ?? process.env.NOTION_STYLE_GUIDES_DB_ID ?? "";
    if (!dbId) {
      res.status(422).json({
        error:
          "No Notion style-guides DB configured. Set notionStyleGuidesDbId on the world or the NOTION_STYLE_GUIDES_DB_ID environment variable.",
      });
      return;
    }

    // Fetch all pages from Notion
    let pages;
    try {
      pages = await queryDatabase(dbId);
    } catch (notionErr) {
      const msg = String(notionErr);
      if (msg.includes("404") || msg.includes("object_not_found")) {
        res.status(422).json({
          error:
            "Notion returned 404 for that database. Make sure the database is shared with your Notion integration (open the database in Notion → Share → invite the integration).",
          notion_db_id: dbId,
        });
        return;
      }
      throw notionErr;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const page of pages) {
      const p = page.properties;

      // Name — try multiple property variants
      const name =
        extractTitle(p["Name"]) ||
        extractTitle(p["Style Guide"]) ||
        extractTitle(p["Title"]) ||
        extractRichText(p["Name"]) ||
        page.id;

      if (!name.trim()) { skipped++; continue; }

      // Content — pull narrative/description fields
      const content =
        extractRichText(p["Content"]) ||
        extractRichText(p["Description"]) ||
        extractRichText(p["Summary"]) ||
        extractRichText(p["Visual Language"]) ||
        extractRichText(p["Guidelines"]) ||
        extractRichText(p["Notes"]) ||
        "";

      const notionPageId = page.id;

      // Check if a local record already exists for this Notion page
      const [existing] = await db
        .select({ id: wsStyleGuidesTable.id })
        .from(wsStyleGuidesTable)
        .where(eq(wsStyleGuidesTable.notionPageId, notionPageId));

      if (existing) {
        await db
          .update(wsStyleGuidesTable)
          .set({ name: name.trim(), content, syncedAt: new Date() })
          .where(eq(wsStyleGuidesTable.id, existing.id));
        updated++;
      } else {
        await db.insert(wsStyleGuidesTable).values({
          id: crypto.randomUUID(),
          worldId: world_id,
          name: name.trim(),
          content,
          notionPageId,
          syncedAt: new Date(),
        });
        created++;
      }
    }

    logger.info({ world_id, created, updated, skipped, total: pages.length }, "style-guides: sync-notion complete");
    res.json({ synced: pages.length, created, updated, skipped });
  } catch (err) {
    logger.error({ err }, "editorial: sync style guides from notion");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/style-guides/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(wsStyleGuidesTable)
      .where(eq(wsStyleGuidesTable.id, req.params.id as string)).limit(1);
    if (!row) { res.status(404).json({ error: "Style guide not found" }); return; }
    res.json({ style_guide: row });
  } catch (err) {
    logger.error({ err }, "editorial: get style guide");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/v1/editorial/style-guides/:id", async (req: Request, res: Response) => {
  const { name, content, typography } = req.body;
  try {
    const resolvedTypography = typography === undefined ? undefined : await resolveTypographyChoices(typography);
    const [row] = await db.update(wsStyleGuidesTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(content !== undefined ? { content: sanitizeEditorialRichText(content) } : {}),
        ...(resolvedTypography !== undefined ? { typography: resolvedTypography } : {}),
      })
      .where(eq(wsStyleGuidesTable.id, req.params.id as string))
      .returning();
    if (!row) { res.status(404).json({ error: "Style guide not found" }); return; }
    res.json({ style_guide: row });
  } catch (err) {
    if (err instanceof TypographyValidationError) {
      res.status(400).json({ error: err.message, code: "INVALID_TYPOGRAPHY" });
      return;
    }
    logger.error({ err }, "editorial: update style guide");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Production Profiles & Punch Templates ─────────────────────────────────────
const profileFields = ["name", "code", "status", "outputMedium", "finishedWidth", "finishedHeight", "units",
  "orientationBehavior", "bleed", "outerSafeMargin", "bindingType", "bindingSafeZone", "bindingEdgeBehavior", "punchTemplateId"] as const;
const punchFields = ["name", "code", "bindingType", "status", "discCount", "referencePageHeight", "units",
  "punchCenterSpacing", "edgeOffset", "mushroomHeadDiameter", "stemWidth", "stemDepth", "topOffset", "bottomOffset", "manufacturingTolerance", "version"] as const;
function bodyValues(body: any, fields: readonly string[]) {
  const out: Record<string, any> = {};
  for (const field of fields) {
    const snake = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    if (body[field] !== undefined) out[field] = body[field];
    else if (body[snake] !== undefined) out[field] = body[snake];
  }
  return out;
}
function numberChecks(values: Record<string, any>, names: string[], integerNames: string[] = []) {
  for (const name of names) if (values[name] != null && (!Number.isFinite(Number(values[name])) || Number(values[name]) < 0)) return `${name} must be nonnegative`;
  for (const name of integerNames) if (values[name] != null && (!Number.isInteger(Number(values[name])) || Number(values[name]) <= 0)) return `${name} must be a positive integer`;
  return null;
}
function profileResponse(row: any, currentPunchTemplate: any = null) {
  const safe = row.finishedWidth != null && row.finishedHeight != null
    ? {
        recto: calculateSafeAreas({ width: row.finishedWidth, height: row.finishedHeight, bindingType: row.bindingType, bleed: row.bleed, outerSafeMargin: row.outerSafeMargin, bindingSafeZone: row.bindingSafeZone, bindingEdgeBehavior: row.bindingEdgeBehavior, pageSide: "recto" }),
        verso: calculateSafeAreas({ width: row.finishedWidth, height: row.finishedHeight, bindingType: row.bindingType, bleed: row.bleed, outerSafeMargin: row.outerSafeMargin, bindingSafeZone: row.bindingSafeZone, bindingEdgeBehavior: row.bindingEdgeBehavior, pageSide: "verso" }),
        unspecified: calculateSafeAreas({ width: row.finishedWidth, height: row.finishedHeight, bindingType: row.bindingType, bleed: row.bleed, outerSafeMargin: row.outerSafeMargin, bindingSafeZone: row.bindingSafeZone, bindingEdgeBehavior: row.bindingEdgeBehavior, pageSide: "unspecified" }),
      }
    : null;
  const punchTemplate = row.punchTemplateSnapshot ?? currentPunchTemplate;
  return { ...row, punchTemplate, currentPunchTemplate, calculatedSafeAreas: safe };
}

function validateProfile(v: Record<string, any>) {
  if (typeof v.name !== "string" || !v.name.trim()) return "name is required";
  if (typeof v.code !== "string" || !v.code.trim()) return "code is required";
  if (!v.outputMedium || !v.orientationBehavior) return "outputMedium and orientationBehavior are required";
  if (!["draft", "active", "archived"].includes(v.status)) return "status is invalid";
  if (!["digital", "print"].includes(v.outputMedium)) return "outputMedium is invalid";
  if (!["inches", "millimeters"].includes(v.units)) return "units is invalid";
  if (!["fixed_portrait", "fixed_landscape", "supports_both", "square"].includes(v.orientationBehavior)) return "orientationBehavior is invalid";
  if (!["none", "disc_bound"].includes(v.bindingType)) return "bindingType is invalid";
  if (!["none", "left", "right", "mirrored"].includes(v.bindingEdgeBehavior)) return "bindingEdgeBehavior is invalid";
  for (const field of ["finishedWidth", "finishedHeight"]) if (v[field] != null && (!Number.isFinite(Number(v[field])) || Number(v[field]) <= 0)) return `${field} must be positive`;
  const nonnegative = numberChecks(v, ["bleed", "outerSafeMargin", "bindingSafeZone"]);
  if (nonnegative) return nonnegative;
  if (v.outputMedium === "print" && (v.finishedWidth == null || v.finishedHeight == null)) return "print profiles require dimensions";
  if (v.bindingType === "disc_bound" && !(Number(v.bindingSafeZone) > 0)) return "disc-bound profiles require a positive bindingSafeZone";
  if (v.bindingType === "disc_bound" && v.bindingEdgeBehavior === "none") return "disc-bound profiles require a binding edge behavior";
  if (v.bindingType === "none" && (Number(v.bindingSafeZone) !== 0 || v.bindingEdgeBehavior !== "none")) return "unbound profiles cannot have a binding zone or binding edge";
  if (v.outputMedium === "digital" && v.punchTemplateId != null) return "digital profiles cannot have a punch template";
  if (v.bindingType !== "disc_bound" && v.punchTemplateId != null) return "only disc-bound profiles can have a punch template";
  if (v.finishedWidth != null && v.finishedHeight != null) {
    const margin = Number(v.outerSafeMargin ?? 0);
    const bindingInset = v.bindingType === "disc_bound" ? Math.max(margin, Number(v.bindingSafeZone ?? 0)) : margin;
    if (Number(v.finishedWidth) - margin - bindingInset <= 0 || Number(v.finishedHeight) - 2 * margin <= 0) return "margins must leave positive usable dimensions";
  }
  return null;
}
function validatePunch(v: Record<string, any>) {
  if (typeof v.name !== "string" || !v.name.trim()) return "name is required";
  if (typeof v.code !== "string" || !v.code.trim()) return "code is required";
  if (v.bindingType !== "disc_bound") return "bindingType is invalid";
  if (!["draft", "testing", "approved", "archived"].includes(v.status)) return "status is invalid";
  if (!["inches", "millimeters"].includes(v.units)) return "units is invalid";
  return numberChecks(v, ["referencePageHeight", "punchCenterSpacing", "edgeOffset", "mushroomHeadDiameter", "stemWidth", "stemDepth", "topOffset", "bottomOffset", "manufacturingTolerance"], ["discCount", "version"]);
}
async function resolvePunchTemplate(id: string) {
  const [template] = await db.select().from(wsPunchTemplatesTable)
    .where(eq(wsPunchTemplatesTable.id, id)).limit(1);
  return template;
}

router.get("/v1/editorial/production-profiles", async (_req, res) => {
  const rows = await db.select({ profile: wsProductionProfilesTable, punchTemplate: wsPunchTemplatesTable })
    .from(wsProductionProfilesTable)
    .leftJoin(wsPunchTemplatesTable, eq(wsProductionProfilesTable.punchTemplateId, wsPunchTemplatesTable.id))
    .orderBy(wsProductionProfilesTable.name);
  res.json({ production_profiles: rows.map(({ profile, punchTemplate }) => profileResponse(profile, punchTemplate)) });
});
router.post("/v1/editorial/production-profiles", async (req, res) => {
  const v: Record<string, any> = { status: "draft", units: "inches", bleed: 0, outerSafeMargin: 0, bindingType: "none", bindingSafeZone: 0, bindingEdgeBehavior: "none", ...bodyValues(req.body, profileFields) };
  const error = validateProfile(v);
  if (error) { res.status(400).json({ error }); return; }
  try {
    const punchTemplate = v.punchTemplateId ? await resolvePunchTemplate(v.punchTemplateId) : undefined;
    if (v.punchTemplateId && !punchTemplate) { res.status(400).json({ error: "punchTemplateId is invalid" }); return; }
    const punchTemplateVersion = punchTemplate?.version ?? null;
    const [row] = await db.insert(wsProductionProfilesTable).values({
      id: randomUUID(),
      ...v,
      name: v.name.trim(),
      code: v.code.trim().toUpperCase(),
      punchTemplateVersion,
      punchTemplateSnapshot: punchTemplate ?? null,
    } as any).returning();
    res.status(201).json({ production_profile: profileResponse(row, punchTemplate ?? null) });
  }
  catch (err) { editorialDbError(err, res, "create production profile"); }
});
router.get("/v1/editorial/production-profiles/:id", async (req, res) => {
  const [result] = await db.select({ profile: wsProductionProfilesTable, punchTemplate: wsPunchTemplatesTable })
    .from(wsProductionProfilesTable)
    .leftJoin(wsPunchTemplatesTable, eq(wsProductionProfilesTable.punchTemplateId, wsPunchTemplatesTable.id))
    .where(eq(wsProductionProfilesTable.id, req.params.id as string)).limit(1);
  if (!result) { res.status(404).json({ error: "Production profile not found" }); return; }
  res.json({ production_profile: profileResponse(result.profile, result.punchTemplate) });
});
router.patch("/v1/editorial/production-profiles/:id", async (req, res) => {
  const [current] = await db.select().from(wsProductionProfilesTable).where(eq(wsProductionProfilesTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "Production profile not found" }); return; }
  const patch = bodyValues(req.body, profileFields);
  const v = { ...current, ...patch };
  const error = validateProfile(v);
  if (error) { res.status(400).json({ error }); return; }
  try {
    const punchTemplateIdChanged = patch.punchTemplateId !== undefined && patch.punchTemplateId !== current.punchTemplateId;
    const repinPunchTemplate = req.body?.repinPunchTemplate === true;
    const targetPunchTemplateId = punchTemplateIdChanged ? patch.punchTemplateId : repinPunchTemplate ? current.punchTemplateId : undefined;
    const shouldResolvePunchTemplate = Boolean(targetPunchTemplateId);
    const punchTemplate = targetPunchTemplateId
      ? await resolvePunchTemplate(targetPunchTemplateId)
      : undefined;
    if (shouldResolvePunchTemplate && !punchTemplate) { res.status(400).json({ error: "punchTemplateId is invalid" }); return; }
    const unlinked = patch.punchTemplateId === null;
    const punchTemplateVersion = unlinked
      ? null
      : punchTemplate?.version ?? current.punchTemplateVersion;
    const punchTemplateSnapshot = unlinked
      ? null
      : punchTemplate ?? current.punchTemplateSnapshot;
    const normalizedPatch = {
      ...patch,
      ...(typeof patch.name === "string" ? { name: patch.name.trim() } : {}),
      ...(typeof patch.code === "string" ? { code: patch.code.trim().toUpperCase() } : {}),
      punchTemplateVersion,
      punchTemplateSnapshot,
    };
    const [row] = await db.update(wsProductionProfilesTable).set(normalizedPatch).where(eq(wsProductionProfilesTable.id, req.params.id as string)).returning();
    const responsePunchTemplate = row.punchTemplateId
      ? (punchTemplate ?? await resolvePunchTemplate(row.punchTemplateId))
      : null;
    res.json({ production_profile: profileResponse(row, responsePunchTemplate ?? null) });
  }
  catch (err) { editorialDbError(err, res, "update production profile"); }
});

router.get("/v1/editorial/punch-templates", async (_req, res) => { res.json({ punch_templates: await db.select().from(wsPunchTemplatesTable).orderBy(wsPunchTemplatesTable.name) }); });
router.post("/v1/editorial/punch-templates", async (req, res) => {
  const v: Record<string, any> = { bindingType: "disc_bound", status: "draft", units: "inches", version: 1, ...bodyValues(req.body, punchFields) };
  const error = validatePunch(v);
  if (error) { res.status(400).json({ error }); return; }
  try { const [row] = await db.insert(wsPunchTemplatesTable).values({ id: randomUUID(), ...v, name: v.name.trim(), code: v.code.trim().toUpperCase() }).returning(); res.status(201).json({ punch_template: row }); } catch (err) { editorialDbError(err, res, "create punch template"); }
});
router.get("/v1/editorial/punch-templates/:id", async (req, res) => { const [row] = await db.select().from(wsPunchTemplatesTable).where(eq(wsPunchTemplatesTable.id, req.params.id as string)).limit(1); if (!row) { res.status(404).json({ error: "Punch template not found" }); return; } res.json({ punch_template: row }); });
router.patch("/v1/editorial/punch-templates/:id", async (req, res) => {
  const [current] = await db.select().from(wsPunchTemplatesTable).where(eq(wsPunchTemplatesTable.id, req.params.id as string)).limit(1);
  if (!current) { res.status(404).json({ error: "Punch template not found" }); return; }
  const patch = bodyValues(req.body, punchFields);
  const error = validatePunch({ ...current, ...patch }); if (error) { res.status(400).json({ error }); return; }
  const normalizedPatch = {
    ...patch,
    ...(typeof patch.name === "string" ? { name: patch.name.trim() } : {}),
    ...(typeof patch.code === "string" ? { code: patch.code.trim().toUpperCase() } : {}),
  };
  try { const [row] = await db.update(wsPunchTemplatesTable).set(normalizedPatch).where(eq(wsPunchTemplatesTable.id, req.params.id as string)).returning(); res.json({ punch_template: row }); } catch (err) { editorialDbError(err, res, "update punch template"); }
});

// ── Component Specs ───────────────────────────────────────────────────────────

router.get("/v1/editorial/component-specs", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  const componentType = req.query.component_type as string | undefined;
  try {
    const conditions = [];
    if (worldId) conditions.push(eq(wsComponentSpecsTable.worldId, worldId));
    if (componentType) conditions.push(eq(wsComponentSpecsTable.componentType, componentType));
    const rows = await db.select().from(wsComponentSpecsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(wsComponentSpecsTable.name);
    res.json({ component_specs: rows });
  } catch (err) {
    logger.error({ err }, "editorial: list component specs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/component-specs", async (req: Request, res: Response) => {
  const { world_id, name, component_type, content, production_profile_id, productionProfileId } = req.body;
  if (!world_id || !name?.trim() || !component_type?.trim()) {
    res.status(400).json({ error: "world_id, name, and component_type are required" });
    return;
  }
  try {
    const [row] = await db.insert(wsComponentSpecsTable)
      .values({ id: crypto.randomUUID(), worldId: world_id, name: name.trim(), componentType: component_type, content: content ?? "", productionProfileId: production_profile_id ?? productionProfileId ?? null })
      .returning();
    res.status(201).json({ component_spec: row });
  } catch (err) {
    logger.error({ err }, "editorial: create component spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/component-specs/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(wsComponentSpecsTable)
      .where(eq(wsComponentSpecsTable.id, req.params.id as string)).limit(1);
    if (!row) { res.status(404).json({ error: "Component spec not found" }); return; }
    res.json({ component_spec: row });
  } catch (err) {
    logger.error({ err }, "editorial: get component spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/v1/editorial/component-specs/:id", async (req: Request, res: Response) => {
  const { name, content, production_profile_id, productionProfileId } = req.body;
  try {
    const [row] = await db.update(wsComponentSpecsTable)
      .set({ ...(name !== undefined ? { name } : {}), ...(content !== undefined ? { content } : {}), ...((production_profile_id !== undefined || productionProfileId !== undefined) ? { productionProfileId: production_profile_id ?? productionProfileId ?? null } : {}) })
      .where(eq(wsComponentSpecsTable.id, req.params.id as string)).returning();
    if (!row) { res.status(404).json({ error: "Component spec not found" }); return; }
    res.json({ component_spec: row });
  } catch (err) {
    logger.error({ err }, "editorial: update component spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Prompt Modules ────────────────────────────────────────────────────────────

router.get("/v1/editorial/prompt-modules", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  try {
    const rows = await db.select().from(wsPromptModulesTable)
      .where(worldId ? eq(wsPromptModulesTable.worldId, worldId) : undefined)
      .orderBy(wsPromptModulesTable.name);
    res.json({ prompt_modules: rows });
  } catch (err) {
    logger.error({ err }, "editorial: list prompt modules");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/prompt-modules", async (req: Request, res: Response) => {
  const { world_id, name, content, section = "general" } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  if (!isPromptModuleSection(section)) {
    res.status(400).json({ error: "section must be world, style, or general" });
    return;
  }
  try {
    const [row] = await db.insert(wsPromptModulesTable)
      .values({ id: crypto.randomUUID(), worldId: world_id, name: name.trim(), section, content: sanitizeEditorialRichText(content ?? "") })
      .returning();
    res.status(201).json({ prompt_module: row });
  } catch (err) {
    logger.error({ err }, "editorial: create prompt module");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/prompt-modules/:id", async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(wsPromptModulesTable)
      .where(eq(wsPromptModulesTable.id, req.params.id as string)).limit(1);
    if (!row) { res.status(404).json({ error: "Prompt module not found" }); return; }
    res.json({ prompt_module: row });
  } catch (err) {
    logger.error({ err }, "editorial: get prompt module");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/v1/editorial/prompt-modules/:id", async (req: Request, res: Response) => {
  const { name, content, dependency_ids, section } = req.body;
  if (section !== undefined && !isPromptModuleSection(section)) {
    res.status(400).json({ error: "section must be world, style, or general" });
    return;
  }
  try {
    const [row] = await db.update(wsPromptModulesTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(content !== undefined ? { content: sanitizeEditorialRichText(content) } : {}),
        ...(dependency_ids !== undefined ? { dependencyIds: dependency_ids } : {}),
        ...(section !== undefined ? { section } : {}),
      })
      .where(eq(wsPromptModulesTable.id, req.params.id as string)).returning();
    if (!row) { res.status(404).json({ error: "Prompt module not found" }); return; }
    res.json({ prompt_module: row });
  } catch (err) {
    logger.error({ err }, "editorial: update prompt module");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Component Sets lookup ─────────────────────────────────────────────────────
// Returns distinct non-null component_set values used in this world's specs.

router.get("/v1/editorial/component-sets", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  try {
    const rows = await db
      .selectDistinct({ componentSet: wsProductionSpecsTable.componentSet })
      .from(wsProductionSpecsTable)
      .where(worldId ? eq(wsProductionSpecsTable.worldId, worldId) : undefined)
      .orderBy(wsProductionSpecsTable.componentSet);
    const sets = rows.map(r => r.componentSet).filter(Boolean) as string[];
    res.json({ component_sets: sets });
  } catch (err) {
    logger.error({ err }, "editorial: component-sets");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Production Specs ──────────────────────────────────────────────────────────

router.get("/v1/editorial/specs", async (req: Request, res: Response) => {
  const worldId = req.query.world_id as string | undefined;
  const collectionId = req.query.collection_id as string | undefined;
  const status = req.query.status as string | undefined;

  try {
    const conditions = [];
    if (worldId) conditions.push(eq(wsProductionSpecsTable.worldId, worldId));
    if (collectionId) conditions.push(eq(wsProductionSpecsTable.collectionId, collectionId));
    if (status) conditions.push(eq(wsProductionSpecsTable.status, status));

    const rows = await db
      .select()
      .from(wsProductionSpecsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(wsProductionSpecsTable.updatedAt));

    const previewRows = rows.length > 0
      ? await db
          .select({
            specPageId: worldsmithSpecPreviewsTable.specPageId,
            previewObjectPath: worldsmithSpecPreviewsTable.previewObjectPath,
          })
          .from(worldsmithSpecPreviewsTable)
          .where(and(
            inArray(worldsmithSpecPreviewsTable.specPageId, rows.map(row => row.id)),
            eq(worldsmithSpecPreviewsTable.status, "success"),
            eq(worldsmithSpecPreviewsTable.dryRun, false),
          ))
          .orderBy(desc(worldsmithSpecPreviewsTable.createdAt))
      : [];
    const latestPreviewBySpec = new Map<string, string>();
    for (const preview of previewRows) {
      if (preview.previewObjectPath && !latestPreviewBySpec.has(preview.specPageId)) {
        latestPreviewBySpec.set(preview.specPageId, preview.previewObjectPath);
      }
    }

    res.json({
      specs: rows.map(row => {
        const previewObjectPath = latestPreviewBySpec.get(row.id);
        return {
          ...row,
          previewUrl: previewObjectPath ? `/api/storage${previewObjectPath}` : null,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, "editorial: list specs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/editorial/production-spec-export.pdf", async (req: Request, res: Response) => {
  const collectionId = String(req.query.collection_id ?? "").trim();
  const volumeId = String(req.query.volume_id ?? "").trim();
  if ((!collectionId && !volumeId) || (collectionId && volumeId)) {
    res.status(400).json({ error: "Provide exactly one of collection_id or volume_id" });
    return;
  }

  try {
    const [requestedVolume] = volumeId
      ? await db.select().from(wsVolumesTable).where(eq(wsVolumesTable.id, volumeId)).limit(1)
      : [];
    if (volumeId && !requestedVolume) {
      res.status(404).json({ error: "Volume not found" });
      return;
    }
    const resolvedCollectionId = requestedVolume?.collectionId ?? collectionId;
    if (!resolvedCollectionId) {
      res.status(422).json({ error: "The selected volume is not assigned to a collection" });
      return;
    }
    const [collection] = await db.select().from(wsCollectionsTable)
      .where(eq(wsCollectionsTable.id, resolvedCollectionId)).limit(1);
    if (!collection || (requestedVolume && requestedVolume.worldId !== collection.worldId)) {
      res.status(404).json({ error: "Collection not found" });
      return;
    }
    const [world] = await db.select({ name: worldsmithWorldsTable.name })
      .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, collection.worldId)).limit(1);

    const specConditions = [eq(wsProductionSpecsTable.collectionId, collection.id)];
    if (requestedVolume) specConditions.push(eq(wsProductionSpecsTable.volumeId, requestedVolume.id));
    const specs = await db.select().from(wsProductionSpecsTable)
      .where(and(...specConditions))
      .orderBy(wsProductionSpecsTable.productionItem);
    if (specs.length === 0) {
      res.status(404).json({ error: "No Production Specs were found for this export" });
      return;
    }

    const specIds = specs.map(spec => spec.id);
    const [previews, packages] = await Promise.all([
      db.select().from(worldsmithSpecPreviewsTable)
        .where(and(
          inArray(worldsmithSpecPreviewsTable.specPageId, specIds),
          eq(worldsmithSpecPreviewsTable.status, "success"),
          eq(worldsmithSpecPreviewsTable.dryRun, false),
        ))
        .orderBy(desc(worldsmithSpecPreviewsTable.createdAt)),
      db.select().from(worldsmithProductionPackagesTable)
        .where(and(
          inArray(worldsmithProductionPackagesTable.productionSpecId, specIds),
          eq(worldsmithProductionPackagesTable.status, "success"),
        ))
        .orderBy(desc(worldsmithProductionPackagesTable.createdAt)),
    ]);
    const previewPathBySpec = new Map<string, string>();
    for (const preview of previews) {
      if (preview.previewObjectPath && !previewPathBySpec.has(preview.specPageId)) {
        previewPathBySpec.set(preview.specPageId, preview.previewObjectPath);
      }
    }
    const packageBySpec = new Map<string, typeof packages[number]>();
    for (const productionPackage of packages) {
      const current = packageBySpec.get(productionPackage.productionSpecId);
      if (!current || productionPackage.isReviewCandidate) {
        packageBySpec.set(productionPackage.productionSpecId, productionPackage);
      }
    }

    const storage = new ObjectStorageService();
    const readObject = async (path: string | undefined): Promise<Buffer | null> => {
      if (!path?.startsWith("/objects/")) return null;
      try {
        const file = await storage.getObjectEntityFile(path);
        const [buffer] = await file.download();
        return buffer;
      } catch (err) {
        logger.warn({ err, path }, "editorial: export image unavailable");
        return null;
      }
    };
    const items = await Promise.all(specs.map(async spec => {
      const productionPackage = packageBySpec.get(spec.id);
      const [reviewImage, finalArtwork] = await Promise.all([
        readObject(previewPathBySpec.get(spec.id)),
        readObject(productionPackage?.providerRequestId ?? undefined),
      ]);
      return {
        productionItem: spec.productionItem || "Untitled Spec",
        specId: spec.specId,
        componentType: spec.componentType,
        status: spec.status,
        readinessScore: spec.readinessScore,
        designIntent: spec.designIntent,
        narrativePurpose: spec.narrativePurpose,
        requiredContent: spec.requiredContent,
        reviewCriteria: spec.reviewCriteria,
        canonDependency: spec.canonDependency,
        orientation: spec.orientation,
        frontBackStyle: spec.frontBackStyle,
        writingSpacePercent: spec.writingSpacePercent,
        reviewImage,
        finalArtwork,
      };
    }));
    const pdf = await buildProductionSpecPdf({
      collectionName: collection.name,
      volumeName: requestedVolume?.name,
      worldName: world?.name,
      items,
    });
    const scopeName = requestedVolume?.name ?? collection.name;
    const filename = `${scopeName}-production-specifications.pdf`
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    logger.error({ err, collectionId, volumeId }, "editorial: Production Spec PDF export failed");
    res.status(500).json({ error: "Production Spec PDF export failed" });
  }
});

// Component-type → 3-letter code used in auto-generated spec IDs
const SPEC_TYPE_ABBR: Record<string, string> = {
  "Hero Paper":          "HRP",
  "Decorative Paper":    "DCP",
  "Journal Card":        "JRC",
  "Coordinating Paper":  "CDP",
  "Ephemera Sheet":      "EPH",
  "Notepaper":           "NTP",
  "Endpaper":            "ENP",
  "Washi Tape":          "WSH",
};

async function generateProductionSpecId(
  worldId: string,
  worldCode: string,
  componentType: string,
): Promise<string> {
  const typeAbbr = SPEC_TYPE_ABBR[componentType] ?? componentType.slice(0, 3).toUpperCase();
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(wsProductionSpecsTable)
    .where(and(
      eq(wsProductionSpecsTable.worldId, worldId),
      eq(wsProductionSpecsTable.componentType, componentType),
    ));
  return `${worldCode.toUpperCase()}-${typeAbbr}-${String((cnt ?? 0) + 1).padStart(3, "0")}`;
}

async function validateProductionSpecLinks(
  spec: Partial<InsertWsProductionSpec>,
): Promise<string | null> {
  if (!spec.worldId) return "World is required.";
  const canonIds = [...new Set((spec.canonRecordIds ?? []) as string[])];
  const moduleIds = [...new Set((spec.promptModuleIds ?? []) as string[])];
  const [collection, volume, styleGuide, componentSpec, canonRecords, promptModules] = await Promise.all([
    spec.collectionId
      ? db.select({ id: wsCollectionsTable.id, worldId: wsCollectionsTable.worldId })
          .from(wsCollectionsTable).where(eq(wsCollectionsTable.id, spec.collectionId)).limit(1)
      : Promise.resolve([]),
    spec.volumeId
      ? db.select({ id: wsVolumesTable.id, worldId: wsVolumesTable.worldId })
          .from(wsVolumesTable).where(eq(wsVolumesTable.id, spec.volumeId)).limit(1)
      : Promise.resolve([]),
    spec.styleGuideId
      ? db.select({ id: wsStyleGuidesTable.id, worldId: wsStyleGuidesTable.worldId })
          .from(wsStyleGuidesTable).where(eq(wsStyleGuidesTable.id, spec.styleGuideId)).limit(1)
      : Promise.resolve([]),
    spec.componentSpecId
      ? db.select({ id: wsComponentSpecsTable.id, worldId: wsComponentSpecsTable.worldId })
          .from(wsComponentSpecsTable).where(eq(wsComponentSpecsTable.id, spec.componentSpecId)).limit(1)
      : Promise.resolve([]),
    canonIds.length
      ? db.select({ id: wsCanonRecordsTable.id, worldId: wsCanonRecordsTable.worldId })
          .from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, canonIds))
      : Promise.resolve([] as Array<{ id: string; worldId: string }>),
    moduleIds.length
      ? db.select({ id: wsPromptModulesTable.id, worldId: wsPromptModulesTable.worldId })
          .from(wsPromptModulesTable).where(inArray(wsPromptModulesTable.id, moduleIds))
      : Promise.resolve([] as Array<{ id: string; worldId: string }>),
  ]);

  const singleLinks = [
    ["Collection", spec.collectionId, collection[0]],
    ["Volume", spec.volumeId, volume[0]],
    ["Style guide", spec.styleGuideId, styleGuide[0]],
    ["Component spec", spec.componentSpecId, componentSpec[0]],
  ] as const;
  for (const [label, id, record] of singleLinks) {
    if (id && (!record || record.worldId !== spec.worldId)) {
      return `${label} must exist and belong to the selected world.`;
    }
  }
  if (canonRecords.length !== canonIds.length || canonRecords.some(record => record.worldId !== spec.worldId)) {
    return "Every canon record must exist and belong to the selected world.";
  }
  if (promptModules.length !== moduleIds.length || promptModules.some(record => record.worldId !== spec.worldId)) {
    return "Every prompt module must exist and belong to the selected world.";
  }
  return null;
}

router.post("/v1/editorial/specs", async (req: Request, res: Response) => {
  const {
    world_id, collection_id, volume_id,
    production_item, spec_id, component_type, component_set,
    design_intent, narrative_purpose, required_content, review_criteria,
    writing_space_percent, orientation, front_back_style,
    canon_dependency, canon_record_ids,
    payload_version, prompt_payload,
    style_guide_id, component_spec_id, prompt_module_ids,
    wizard_step,
    draft,
  } = req.body;

  if (!world_id || typeof world_id !== "string" || !world_id.trim()) {
    res.status(400).json({ error: "world_id is required" });
    return;
  }
  if (!draft && (!production_item?.trim() || !component_type?.trim())) {
    res.status(400).json({ error: "world_id, production_item, and component_type are required" });
    return;
  }
  if (draft !== undefined && typeof draft !== "boolean") {
    res.status(400).json({ error: "draft must be a boolean" });
    return;
  }
  const resolvedWizardStep = wizard_step === undefined ? 0 : Number(wizard_step);
  if (!Number.isInteger(resolvedWizardStep) || resolvedWizardStep < 0 || resolvedWizardStep > 4) {
    res.status(400).json({ error: "wizard_step must be an integer between 0 and 4" });
    return;
  }

  try {
    // Validate that the world exists — the worldId column has no DB-level FK
    // constraint, so we guard here to avoid silently creating orphaned specs.
    const [worldRecord] = await db
      .select({ id: worldsmithWorldsTable.id, code: worldsmithWorldsTable.code })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, world_id))
      .limit(1);

    if (!worldRecord) {
      res.status(422).json({
        error: "A required linked record (world, collection, style guide, or component spec) does not exist.",
        code: "LINKED_RECORD_NOT_FOUND",
      });
      return;
    }

    // Auto-generate spec_id only once the identity is complete. A draft can
    // legitimately have no spec ID until its first screen is finished.
    let resolvedSpecId = spec_id?.trim() || null;
    if (!resolvedSpecId && production_item?.trim() && component_type?.trim()) {
      resolvedSpecId = await generateProductionSpecId(world_id, worldRecord.code, component_type.trim());
    }

    const partial: Partial<InsertWsProductionSpec> = {
      worldId: world_id,
      collectionId: collection_id,
      volumeId: volume_id,
      productionItem: production_item?.trim() || null,
      specId: resolvedSpecId,
      componentType: component_type?.trim() || null,
      componentSet: component_set?.trim() || null,
      designIntent: sanitizeEditorialRichText(design_intent ?? ""),
      narrativePurpose: sanitizeEditorialRichText(narrative_purpose ?? ""),
      requiredContent: sanitizeEditorialRichText(required_content ?? ""),
      reviewCriteria: sanitizeEditorialRichText(review_criteria ?? ""),
      writingSpacePercent: writing_space_percent,
      orientation,
      frontBackStyle: front_back_style,
      canonDependency: canon_dependency ?? "None",
      canonRecordIds: canon_record_ids ?? [],
      payloadVersion: payload_version,
      promptPayload: prompt_payload ?? "",
      styleGuideId: style_guide_id,
      componentSpecId: component_spec_id,
      promptModuleIds: prompt_module_ids ?? [],
      wizardStep: resolvedWizardStep,
      wizardComplete: !draft,
    };

    const readinessScore = computeReadinessScore(partial);
    const status = derivePipelineStatus(partial, readinessScore);
    const linkError = await validateProductionSpecLinks(partial);
    if (linkError) {
      res.status(422).json({ error: linkError, code: "LINKED_RECORD_NOT_FOUND" });
      return;
    }

    const [row] = await db
      .insert(wsProductionSpecsTable)
      .values({
        id: crypto.randomUUID(),
        ...partial,
        status,
        readinessScore,
        createdBy: (req.user as any)?.id,
      } as InsertWsProductionSpec)
      .returning();

    res.status(201).json({ spec: row });
  } catch (err) {
    editorialDbError(err, res, "create spec");
  }
});

router.get("/v1/editorial/specs/:id", async (req: Request, res: Response) => {
  try {
    const [spec] = await db
      .select()
      .from(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, req.params.id as string))
      .limit(1);

    if (!spec) { res.status(404).json({ error: "Spec not found" }); return; }

    // Enrich: resolve linked records for the relationships panel
    const [collection, volume, styleGuide, componentSpec, canonRecords, promptModules] = await Promise.all([
      spec.collectionId
        ? db.select({ id: wsCollectionsTable.id, name: wsCollectionsTable.name })
            .from(wsCollectionsTable).where(eq(wsCollectionsTable.id, spec.collectionId)).limit(1)
        : Promise.resolve([]),
      spec.volumeId
        ? db.select({ id: wsVolumesTable.id, name: wsVolumesTable.name, code: wsVolumesTable.code })
            .from(wsVolumesTable).where(eq(wsVolumesTable.id, spec.volumeId)).limit(1)
        : Promise.resolve([]),
      spec.styleGuideId
        ? db.select().from(wsStyleGuidesTable).where(eq(wsStyleGuidesTable.id, spec.styleGuideId)).limit(1)
        : Promise.resolve([]),
      spec.componentSpecId
        ? db.select().from(wsComponentSpecsTable).where(eq(wsComponentSpecsTable.id, spec.componentSpecId)).limit(1)
        : Promise.resolve([]),
      (spec.canonRecordIds as string[]).length > 0
        ? db.select().from(wsCanonRecordsTable)
            .where(
              or(...((spec.canonRecordIds as string[]).map(id => eq(wsCanonRecordsTable.id, id))))
            )
        : Promise.resolve([]),
      (spec.promptModuleIds as string[]).length > 0
        ? db.select().from(wsPromptModulesTable)
            .where(
              or(...((spec.promptModuleIds as string[]).map(id => eq(wsPromptModulesTable.id, id))))
            )
        : Promise.resolve([]),
    ]);

    res.json({
      spec,
      relationships: {
        collection: collection[0] ?? null,
        volume: volume[0] ?? null,
        style_guide: styleGuide[0] ?? null,
        component_spec: componentSpec[0] ?? null,
        canon_records: canonRecords,
        prompt_modules: promptModules,
      },
    });
  } catch (err) {
    logger.error({ err }, "editorial: get spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mutable spec fields: linkage fields that evolve during the editorial
// process (payload, canon links, prompt modules, style guide, component spec).
// Identity and creative-direction fields remain immutable after creation so
// the prompt identity (and its derived promptHash) stays stable.
router.patch("/v1/editorial/specs/:id", async (req: Request, res: Response) => {
  const specId = req.params.id as string;
  try {
    const [existing] = await db
      .select()
      .from(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, specId))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "Spec not found" }); return; }

    const isDraft = !existing.wizardComplete;
    const body = req.body ?? {};
    const mutableUpdate: Partial<InsertWsProductionSpec> = {};

    const addString = (
      bodyKey: string,
      column: keyof InsertWsProductionSpec,
      sanitize = false,
      emptyAsNull = true,
    ) => {
      if (body[bodyKey] === undefined) return;
      if (body[bodyKey] !== null && typeof body[bodyKey] !== "string") {
        throw new Error(`${bodyKey} must be a string or null`);
      }
      const value = body[bodyKey] === null ? null : body[bodyKey].trim();
      (mutableUpdate as Record<string, unknown>)[column] = sanitize
        ? sanitizeEditorialRichText(value ?? "")
        : (emptyAsNull ? (value || null) : (value ?? ""));
    };
    const addArray = (bodyKey: string, column: keyof InsertWsProductionSpec) => {
      if (body[bodyKey] === undefined) return;
      if (body[bodyKey] !== null && !Array.isArray(body[bodyKey])) {
        throw new Error(`${bodyKey} must be an array or null`);
      }
      if (body[bodyKey] !== null && body[bodyKey].some((value: unknown) => typeof value !== "string")) {
        throw new Error(`${bodyKey} must contain only strings`);
      }
      (mutableUpdate as Record<string, unknown>)[column] = body[bodyKey] ?? [];
    };

    if (isDraft) {
      addString("production_item", "productionItem");
      addString("spec_id", "specId");
      addString("component_type", "componentType");
      addString("component_set", "componentSet");
      addString("design_intent", "designIntent", true);
      addString("narrative_purpose", "narrativePurpose", true);
      addString("required_content", "requiredContent", true);
      addString("review_criteria", "reviewCriteria", true);
      addString("orientation", "orientation");
      addString("front_back_style", "frontBackStyle");
      addString("payload_version", "payloadVersion");
      addString("prompt_payload", "promptPayload", false, false);
      addString("collection_id", "collectionId");
      addString("volume_id", "volumeId");
      addString("style_guide_id", "styleGuideId");
      addString("component_spec_id", "componentSpecId");
      addArray("canon_record_ids", "canonRecordIds");
      addArray("prompt_module_ids", "promptModuleIds");

      if (body.writing_space_percent !== undefined) {
        const value = body.writing_space_percent;
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)) {
          throw new Error("writing_space_percent must be between 0 and 100");
        }
        mutableUpdate.writingSpacePercent = value;
      }
      if (body.canon_dependency !== undefined) {
        if (typeof body.canon_dependency !== "string") throw new Error("canon_dependency must be a string");
        mutableUpdate.canonDependency = body.canon_dependency.trim() || "None";
      }
      if (body.wizard_step !== undefined) {
        const value = Number(body.wizard_step);
        if (!Number.isInteger(value) || value < 0 || value > 4) {
          throw new Error("wizard_step must be an integer between 0 and 4");
        }
        mutableUpdate.wizardStep = value;
      }
      if (body.finalize !== undefined && typeof body.finalize !== "boolean") {
        throw new Error("finalize must be a boolean");
      }
    } else {
      // Completed records still protect creative direction, but admins can
      // correct the visible identity and print metadata when a record was
      // created with a typo or wrong component label.
      addString("production_item", "productionItem");
      addString("spec_id", "specId");
      addString("component_type", "componentType");
      addString("component_set", "componentSet");
      addString("orientation", "orientation");
      addString("front_back_style", "frontBackStyle");
      addString("current_version", "currentVersion", false, false);
      if (body.writing_space_percent !== undefined) {
        const value = body.writing_space_percent;
        if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)) {
          throw new Error("writing_space_percent must be between 0 and 100");
        }
        mutableUpdate.writingSpacePercent = value;
      }
      addString("prompt_payload", "promptPayload", false, false);
      addString("payload_version", "payloadVersion");
      addString("collection_id", "collectionId");
      addString("volume_id", "volumeId");
      addArray("canon_record_ids", "canonRecordIds");
      addArray("prompt_module_ids", "promptModuleIds");
      addString("style_guide_id", "styleGuideId");
      addString("component_spec_id", "componentSpecId");
    }

    if (Object.keys(mutableUpdate).length === 0) {
      res.status(400).json({
        error: isDraft
          ? "No draft fields provided."
          : "No editable fields provided.",
        code: "NO_MUTABLE_FIELDS",
        mutable_fields: isDraft
          ? [
              "production_item", "spec_id", "component_type", "component_set",
              "design_intent", "narrative_purpose", "required_content", "review_criteria",
              "writing_space_percent", "orientation", "front_back_style",
              "canon_dependency", "canon_record_ids", "payload_version", "prompt_payload",
              "collection_id", "volume_id",
              "style_guide_id", "component_spec_id", "prompt_module_ids", "wizard_step",
            ]
          : [
              "production_item", "spec_id", "component_type", "component_set",
              "orientation", "front_back_style", "current_version", "writing_space_percent",
              "prompt_payload", "payload_version", "collection_id", "volume_id", "canon_record_ids",
              "prompt_module_ids", "style_guide_id", "component_spec_id",
            ],
      });
      return;
    }

    const merged = { ...existing, ...mutableUpdate };
    if (!isDraft && (!merged.productionItem?.trim() || !merged.componentType?.trim())) {
      res.status(400).json({
        error: "production_item and component_type are required for a completed spec",
        code: "INCOMPLETE_IDENTITY",
      });
      return;
    }
    const linkError = await validateProductionSpecLinks(merged);
    if (linkError) {
      res.status(422).json({ error: linkError, code: "LINKED_RECORD_NOT_FOUND" });
      return;
    }
    if (isDraft && body.finalize === true) {
      if (!merged.productionItem?.trim() || !merged.componentType?.trim()) {
        res.status(400).json({
          error: "production_item and component_type are required to finish a draft",
          code: "INCOMPLETE_IDENTITY",
        });
        return;
      }
      if (!merged.specId) {
        const [world] = await db
          .select({ code: worldsmithWorldsTable.code })
          .from(worldsmithWorldsTable)
          .where(eq(worldsmithWorldsTable.id, merged.worldId))
          .limit(1);
        if (!world) {
          res.status(422).json({ error: "World not found", code: "LINKED_RECORD_NOT_FOUND" });
          return;
        }
        mutableUpdate.specId = await generateProductionSpecId(
          merged.worldId,
          world.code,
          merged.componentType,
        );
        merged.specId = mutableUpdate.specId;
      }
      mutableUpdate.wizardComplete = true;
      merged.wizardComplete = true;
    }
    const readinessScore = computeReadinessScore(merged);
    const status = derivePipelineStatus(merged, readinessScore);
    const persistedStatus = sql<string>`case
      when lower(${wsProductionSpecsTable.status}) = 'approved' then 'approved'
      else ${status}
    end`;

    const [updated] = await db
      .update(wsProductionSpecsTable)
      .set({ ...mutableUpdate, readinessScore, status: persistedStatus, updatedAt: new Date() })
      .where(eq(wsProductionSpecsTable.id, specId))
      .returning();

    res.json({ spec: updated });
  } catch (err) {
    if (err instanceof Error && /must be/.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
    editorialDbError(err, res, "patch spec");
  }
});

router.post("/v1/editorial/specs/:id/approve", async (req: Request, res: Response) => {
  const specId = req.params.id as string;
  try {
    const outcome = await db.transaction(async (tx) => {
      // Serialize approval with any concurrent record update. The row is read
      // again only after the lock is held, so prerequisites and transition are
      // evaluated against one durable version.
      await tx.execute(sql`
        select id
        from ${wsProductionSpecsTable}
        where ${wsProductionSpecsTable.id} = ${specId}
        for update
      `);
      const [existing] = await tx
        .select()
        .from(wsProductionSpecsTable)
        .where(eq(wsProductionSpecsTable.id, specId))
        .limit(1);

      if (!existing) return { kind: "missing" as const };
      if (existing.status.trim().toLowerCase() === "approved") {
        return { kind: "approved" as const, spec: existing, alreadyApproved: true };
      }

      const checks = readinessChecks(existing);
      const isCompiled = existing.compiledPromptStatus.trim().toLowerCase() === "compiled";
      const approvalBlocked = existing.wizardComplete !== true
        || !isCompiled
        || !payloadReady(checks)
        || !canonClear(checks);

      if (approvalBlocked) {
        return {
          kind: "blocked" as const,
          missing: checks.filter(check => !check.done).map(check => check.label),
          prerequisites: [
            ...(existing.wizardComplete !== true ? ["Complete the Production Spec record"] : []),
            ...(!isCompiled ? ["Compile the Specification Board"] : []),
            ...(!payloadReady(checks) ? ["Complete the prompt payload and link its prompt modules"] : []),
            ...(!canonClear(checks) ? ["Resolve the canon dependency"] : []),
          ],
        };
      }

      const [updated] = await tx
        .update(wsProductionSpecsTable)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(wsProductionSpecsTable.id, specId))
        .returning();
      return { kind: "approved" as const, spec: updated, alreadyApproved: false };
    });

    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Spec not found", code: "SPEC_NOT_FOUND" });
      return;
    }
    if (outcome.kind === "blocked") {
      res.status(422).json({
        error: "The Specification Board is not ready for approval.",
        code: "SPEC_APPROVAL_PREREQUISITES",
        missing: outcome.missing,
        prerequisites: outcome.prerequisites,
      });
      return;
    }
    res.json({ spec: outcome.spec, already_approved: outcome.alreadyApproved });
  } catch (err) {
    editorialDbError(err, res, "approve spec");
  }
});

router.delete("/v1/editorial/specs/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await db.transaction(async (tx) => {
      const id = req.params.id as string;
      await tx.delete(worldsmithProductionPackagesTable)
        .where(eq(worldsmithProductionPackagesTable.productionSpecId, id));
      await tx.delete(worldsmithRunsTable)
        .where(eq(worldsmithRunsTable.productionSpecId, id));
      const [row] = await tx
        .delete(wsProductionSpecsTable)
        .where(eq(wsProductionSpecsTable.id, id))
        .returning();
      return row;
    });
    if (!deleted) { res.status(404).json({ error: "Spec not found" }); return; }
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, "editorial: delete spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Publish to Notion ─────────────────────────────────────────────────────────

router.post("/v1/editorial/specs/:id/publish", async (req: Request, res: Response) => {
  const specId = req.params.id as string;
  const dryRun = req.query.dry === "true" || req.body.dry_run === true;

  try {
    const [spec] = await db
      .select()
      .from(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, specId))
      .limit(1);
    if (!spec) { res.status(404).json({ error: "Spec not found" }); return; }
    if (!spec.wizardComplete || !spec.productionItem?.trim() || !spec.componentType?.trim()) {
      res.status(422).json({
        error: "Complete the Production Spec identity before publishing.",
        code: "INCOMPLETE_DRAFT",
      });
      return;
    }

    // Get world config for Notion DB ID
    const [world] = await db
      .select()
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, spec.worldId))
      .limit(1);

    const notionDbId = world?.notionProductionDbId;

    // Build the diff preview
    const diffPreview = {
      "Production Item": spec.productionItem,
      "Component Type": spec.componentType,
      "Design Intent": editorialRichTextToPlainText(spec.designIntent) || "(empty)",
      "Narrative Purpose": editorialRichTextToPlainText(spec.narrativePurpose) || "(empty)",
      "Required Content": editorialRichTextToPlainText(spec.requiredContent) || "(empty)",
      "Canon Dependency": spec.canonDependency,
      "Payload Version": spec.payloadVersion || "(not set)",
      "Prompt Payload": spec.promptPayload ? `${spec.promptPayload.slice(0, 100)}…` : "(empty)",
    };

    if (dryRun) {
      res.json({
        dry_run: true,
        spec_id: specId,
        production_item: spec.productionItem,
        notion_db_id: notionDbId ?? null,
        diff: diffPreview,
        message: "Dry run — no Notion writes made.",
      });
      return;
    }

    if (!notionDbId) {
      res.status(422).json({
        error: "World has no Notion Production DB configured. Set notion_production_db_id on the world record.",
        code: "NO_NOTION_DB",
        spec_id: specId,
      });
      return;
    }

    // Build Notion properties
    const props: Record<string, unknown> = {
      Name: { title: [{ text: { content: spec.productionItem } }] },
      "Component Type": selectProp(spec.componentType),
      "World": richTextProp(spec.worldId),
      "Canon Dependency": selectProp(spec.canonDependency),
    };
    const designIntent = editorialRichTextToPlainText(spec.designIntent);
    const narrativePurpose = editorialRichTextToPlainText(spec.narrativePurpose);
    const requiredContent = editorialRichTextToPlainText(spec.requiredContent);
    if (designIntent) props["Design Intent"] = richTextProp(designIntent);
    if (narrativePurpose) props["Narrative Purpose"] = richTextProp(narrativePurpose);
    if (requiredContent) props["Required Content"] = richTextProp(requiredContent);
    if (spec.payloadVersion) props["Payload Version"] = selectProp(spec.payloadVersion);
    if (spec.promptPayload) props["Prompt Payload"] = richTextProp(spec.promptPayload.slice(0, 2000));
    if (spec.orientation) props["Orientation"] = selectProp(spec.orientation);
    if (spec.specId) props["Spec ID"] = richTextProp(spec.specId);

    let notionPageId = spec.notionPageId;
    try {
      if (notionPageId) {
        await updatePage(notionPageId, props);
      } else {
        const page = await createPage(notionDbId, props);
        notionPageId = page.id;
      }
    } catch (notionErr) {
      logger.error({ err: notionErr, specId }, "editorial: Notion publish failed");
      res.status(502).json({ error: "Notion write failed", detail: String(notionErr), code: "NOTION_WRITE_FAILED" });
      return;
    }

    const now = new Date();
    const [updated] = await db
      .update(wsProductionSpecsTable)
      .set({ notionPageId, syncedAt: now, status: "published" })
      .where(eq(wsProductionSpecsTable.id, specId))
      .returning();

    res.json({
      published: true,
      spec_id: specId,
      notion_page_id: notionPageId,
      notion_page_url: `https://notion.so/${notionPageId?.replace(/-/g, "")}`,
      synced_at: now.toISOString(),
      spec: updated,
    });
  } catch (err) {
    logger.error({ err }, "editorial: publish spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Stories CRUD ──────────────────────────────────────────────────────────────

const STORY_STATUSES = ["draft", "planned", "active", "archived"] as const;
const STORY_SUGGESTION_STATUSES = ["draft", "planned", "active"] as const;
const isStoryStatus = (value: unknown): value is typeof STORY_STATUSES[number] =>
  typeof value === "string" && (STORY_STATUSES as readonly string[]).includes(value);

// Suggest world-aware storylines without treating existing rich editorial content
// as prompt markup. Story summaries, canon, and World Bible prose are reduced to
// plain text before they enter the model context.
router.post("/v1/editorial/stories/suggest", async (req: Request, res: Response) => {
  const { world_id } = req.body as { world_id?: string };
  if (!world_id) {
    res.status(400).json({ error: "world_id is required" });
    return;
  }

  try {
    const cached = await getDailySuggestions(world_id, "stories");
    if (cached?.current) {
      res.json({
        suggestions: cached.suggestions,
        generatedAt: cached.generatedAt,
        nextRefreshAt: cached.nextRefreshAt,
        canRefresh: false,
        cached: true,
      });
      return;
    }
    const [world] = await db
      .select()
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, world_id))
      .limit(1);
    if (!world) {
      res.status(404).json({ error: "World not found" });
      return;
    }

    const [canonRecords, existingStories] = await Promise.all([
      db.select({
        name: wsCanonRecordsTable.name,
        canonType: wsCanonRecordsTable.canonType,
        narrativeDetails: wsCanonRecordsTable.narrativeDetails,
        status: wsCanonRecordsTable.status,
      })
        .from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.worldId, world_id))
        .orderBy(wsCanonRecordsTable.name)
        .limit(80),
      db.select({
        title: wsStoriesTable.title,
        summary: wsStoriesTable.summary,
        status: wsStoriesTable.status,
      })
        .from(wsStoriesTable)
        .where(eq(wsStoriesTable.worldId, world_id))
        .orderBy(wsStoriesTable.sortOrder, wsStoriesTable.createdAt)
        .limit(30),
    ]);

    const worldBible = [
      world.visualPalette ? `Visual Palette: ${editorialRichTextToPlainText(world.visualPalette)}` : "",
      world.proseVoice ? `Prose Voice: ${editorialRichTextToPlainText(world.proseVoice)}` : "",
      world.atmosphericNotes ? `Atmospheric Notes: ${editorialRichTextToPlainText(world.atmosphericNotes)}` : "",
      world.materialWorld ? `Material World: ${editorialRichTextToPlainText(world.materialWorld)}` : "",
      Array.isArray(world.worldRules) && world.worldRules.length > 0
        ? `World Rules:\n${(world.worldRules as string[]).map(rule => `  - ${editorialRichTextToPlainText(rule)}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");

    const canonLines = canonRecords.length > 0
      ? canonRecords.map(record => {
        const detail = editorialRichTextToPlainText(record.narrativeDetails).slice(0, 280);
        return `- ${record.name} [${record.canonType ?? "canon"}; ${record.status}]${detail ? ` — ${detail}` : ""}`;
      }).join("\n")
      : "(no canon records yet)";
    const storyLines = existingStories.length > 0
      ? existingStories.map(story => {
        const summary = editorialRichTextToPlainText(story.summary).slice(0, 420);
        return `- ${story.title} [${story.status}]${summary ? ` — ${summary}` : ""}`;
      }).join("\n")
      : "(no storylines yet)";

    const systemPrompt = "You are a WorldSmith story editor. You identify compelling missing adventures that emerge from a world's canon, atmosphere, and physical storytelling possibilities. Your suggestions are specific, emotionally grounded, and distinct from existing storylines.";
    const userMessage = `World: ${world.name}${world.description ? ` — ${editorialRichTextToPlainText(world.description)}` : ""}

## World Bible
${worldBible || "(not yet written)"}

## Existing Canon
${canonLines}

## Existing Storylines
${storyLines}

## Task
Suggest exactly 4 distinct new storylines this world is ready to tell. Each should use concrete canon or a meaningful gap in the World Bible, while leaving room for future physical keepsakes, clues, letters, maps, or journals. Do not repeat an existing storyline's premise or title.

Return ONLY a JSON array (no markdown fences or preamble). Every item must have:
- "title": a specific, evocative storyline title
- "rationale": 1–2 sentences explaining the opportunity this storyline creates for the world
- "narrativePromise": 2–4 sentences describing who wants what, what complicates it, and what a reader will carry forward
- "recommendedStatus": one of draft, planned, active`;

    const result = await callAi(
      [{ role: "user", content: userMessage }],
      process.env.DEFAULT_AI_PROVIDER ?? "chatgpt",
      systemPrompt,
    );

    let suggestions: unknown[] = [];
    try {
      const clean = result.content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) suggestions = parsed.slice(0, 4);
    } catch {
      const match = result.content.match(/\[[\s\S]*\]/);
      if (match) {
        try { suggestions = JSON.parse(match[0]); } catch { /* give up */ }
      }
    }

    const validStatuses = new Set<string>(STORY_SUGGESTION_STATUSES);
    const sanitised = suggestions
      .filter((suggestion): suggestion is Record<string, unknown> => typeof suggestion === "object" && suggestion !== null)
      .map(suggestion => ({
        title: typeof suggestion.title === "string" ? suggestion.title.trim().slice(0, 120) : "Untitled storyline",
        rationale: typeof suggestion.rationale === "string" ? suggestion.rationale.trim().slice(0, 450) : "",
        narrativePromise: typeof suggestion.narrativePromise === "string" ? suggestion.narrativePromise.trim().slice(0, 1_200) : "",
        recommendedStatus: typeof suggestion.recommendedStatus === "string" && validStatuses.has(suggestion.recommendedStatus)
          ? suggestion.recommendedStatus
          : "draft",
      }))
      .filter(suggestion => suggestion.title.length > 0);

    const generatedAt = await saveDailySuggestions(world_id, "stories", sanitised);
    res.json({
      suggestions: sanitised,
      world: { name: world.name, code: world.code },
      generatedAt,
      nextRefreshAt: new Date(generatedAt.getTime() + SUGGESTION_REFRESH_MS),
      canRefresh: false,
      cached: false,
    });
  } catch (err) {
    logger.error({ err }, "editorial: suggest storylines");
    res.status(502).json({ error: "Could not generate storylines. Try again.", code: "AI_ERROR" });
  }
});

// List stories for a world
router.get("/v1/editorial/stories", async (req: Request, res: Response) => {
  try {
    const worldId = req.query.world_id as string;
    if (!worldId) { res.status(400).json({ error: "world_id required" }); return; }
    const stories = await db
      .select()
      .from(wsStoriesTable)
      .where(eq(wsStoriesTable.worldId, worldId))
      .orderBy(wsStoriesTable.sortOrder, wsStoriesTable.createdAt);
    const storyIds = stories.map(s => s.id);
    const acts = storyIds.length > 0
      ? await db.select().from(wsStoryActsTable)
          .where(inArray(wsStoryActsTable.storyId, storyIds))
          .orderBy(wsStoryActsTable.storyId, wsStoryActsTable.actNumber)
      : [];
    const actsById: Record<string, typeof acts> = {};
    for (const act of acts) {
      if (!actsById[act.storyId]) actsById[act.storyId] = [];
      actsById[act.storyId].push(act);
    }
    res.json({ stories: stories.map(s => ({ ...s, acts: actsById[s.id] ?? [] })) });
  } catch (err) {
    logger.error({ err }, "editorial: list stories");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch one storyline with its movements for the full-page editor.
router.get("/v1/editorial/stories/:id", async (req: Request, res: Response) => {
  try {
    const [story] = await db
      .select()
      .from(wsStoriesTable)
      .where(eq(wsStoriesTable.id, req.params.id as string))
      .limit(1);
    if (!story) {
      res.status(404).json({ error: "Story not found" });
      return;
    }
    const acts = await db
      .select()
      .from(wsStoryActsTable)
      .where(eq(wsStoryActsTable.storyId, story.id))
      .orderBy(wsStoryActsTable.actNumber);
    res.json({ story: { ...story, acts } });
  } catch (err) {
    logger.error({ err }, "editorial: get story");
    res.status(500).json({ error: "Internal server error" });
  }
});

// World-level narrative map: stories, canon records, and their saved links.
// This keeps the visual Story Map grounded in actual editorial relationships.
router.get("/v1/editorial/story-connections", async (req: Request, res: Response) => {
  try {
    const worldId = req.query.world_id as string;
    if (!worldId) { res.status(400).json({ error: "world_id required" }); return; }
    const selectedStoryId = typeof req.query.story_id === "string" ? req.query.story_id : null;
    const requestedLimit = Number(req.query.limit ?? 80);
    const linkLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 160)) : 80;

    const storyRows = await db.select({
      id: wsStoriesTable.id,
      title: wsStoriesTable.title,
      summary: wsStoriesTable.summary,
      status: wsStoriesTable.status,
    })
      .from(wsStoriesTable)
      .where(eq(wsStoriesTable.worldId, worldId))
      .orderBy(wsStoriesTable.sortOrder, wsStoriesTable.createdAt);

    if (selectedStoryId && !storyRows.some(story => story.id === selectedStoryId)) {
      res.status(404).json({ error: "Story not found in this world" });
      return;
    }

    const storyIds = storyRows.map(story => story.id);
    const acts = storyIds.length > 0
      ? await db.select({
        id: wsStoryActsTable.id,
        storyId: wsStoryActsTable.storyId,
        actNumber: wsStoryActsTable.actNumber,
        title: wsStoryActsTable.title,
      })
        .from(wsStoryActsTable)
        .where(inArray(wsStoryActsTable.storyId, storyIds))
        .orderBy(wsStoryActsTable.storyId, wsStoryActsTable.actNumber)
      : [];
    const actsByStory = new Map<string, typeof acts>();
    for (const act of acts) {
      const existing = actsByStory.get(act.storyId) ?? [];
      existing.push(act);
      actsByStory.set(act.storyId, existing);
    }

    const linkWhere = selectedStoryId
      ? and(
        eq(wsCanonRecordsTable.worldId, worldId),
        eq(wsStoriesTable.worldId, worldId),
        eq(wsCanonRecordStoryLinksTable.storyId, selectedStoryId),
      )
      : and(eq(wsCanonRecordsTable.worldId, worldId), eq(wsStoriesTable.worldId, worldId));

    const [canonRecords, links, totalLinkRows] = await Promise.all([
      db.select({
        id: wsCanonRecordsTable.id,
        name: wsCanonRecordsTable.name,
        canonType: wsCanonRecordsTable.canonType,
        status: wsCanonRecordsTable.status,
      })
        .from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.worldId, worldId))
        .orderBy(wsCanonRecordsTable.name)
        .limit(160),
      db.select({
        storyId: wsCanonRecordStoryLinksTable.storyId,
        storyTitle: wsStoriesTable.title,
        canonRecordId: wsCanonRecordStoryLinksTable.canonRecordId,
        recordName: wsCanonRecordsTable.name,
        canonType: wsCanonRecordsTable.canonType,
        actId: wsCanonRecordStoryLinksTable.actId,
        actNumber: wsStoryActsTable.actNumber,
        actTitle: wsStoryActsTable.title,
      })
        .from(wsCanonRecordStoryLinksTable)
        .innerJoin(wsCanonRecordsTable, eq(wsCanonRecordStoryLinksTable.canonRecordId, wsCanonRecordsTable.id))
        .innerJoin(wsStoriesTable, eq(wsCanonRecordStoryLinksTable.storyId, wsStoriesTable.id))
        .leftJoin(wsStoryActsTable, eq(wsCanonRecordStoryLinksTable.actId, wsStoryActsTable.id))
        .where(linkWhere)
        .limit(linkLimit),
      db.select({ count: sql<number>`count(*)` })
        .from(wsCanonRecordStoryLinksTable)
        .innerJoin(wsCanonRecordsTable, eq(wsCanonRecordStoryLinksTable.canonRecordId, wsCanonRecordsTable.id))
        .innerJoin(wsStoriesTable, eq(wsCanonRecordStoryLinksTable.storyId, wsStoriesTable.id))
        .where(linkWhere),
    ]);

    const totalLinks = Number(totalLinkRows[0]?.count ?? 0);
    res.json({
      stories: storyRows.map(story => ({ ...story, acts: actsByStory.get(story.id) ?? [] })),
      canonRecords,
      links,
      totalLinks,
      linksTruncated: totalLinks > links.length,
      recordsTruncated: canonRecords.length === 160,
    });
  } catch (err) {
    logger.error({ err }, "editorial: list story connections");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a story
router.post("/v1/editorial/stories", async (req: Request, res: Response) => {
  try {
    const { world_id, title, summary, status } = req.body;
    if (!world_id || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "world_id and title required" });
      return;
    }
    if (status !== undefined && !isStoryStatus(status)) {
      res.status(400).json({ error: "status is not supported" });
      return;
    }
    if (summary !== undefined && typeof summary !== "string") {
      res.status(400).json({ error: "summary must be a string" });
      return;
    }
    const [story] = await db.insert(wsStoriesTable).values({
      id: randomUUID(),
      worldId: world_id,
      title: title.trim(),
      summary: sanitizeEditorialRichText(summary ?? ""),
      status: status ?? "draft",
    }).returning();
    res.status(201).json({ story });
  } catch (err) {
    logger.error({ err }, "editorial: create story");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update a story
router.patch("/v1/editorial/stories/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, summary, status, sort_order } = req.body;
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      res.status(400).json({ error: "title must be a non-empty string" });
      return;
    }
    if (status !== undefined && !isStoryStatus(status)) {
      res.status(400).json({ error: "status is not supported" });
      return;
    }
    if (summary !== undefined && typeof summary !== "string") {
      res.status(400).json({ error: "summary must be a string" });
      return;
    }
    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = typeof title === "string" ? title.trim() : title;
    if (summary !== undefined) update.summary = sanitizeEditorialRichText(summary ?? "");
    if (status !== undefined) update.status = status;
    if (sort_order !== undefined) update.sortOrder = sort_order;
    const [story] = await db.update(wsStoriesTable).set(update).where(eq(wsStoriesTable.id, id as string)).returning();
    if (!story) { res.status(404).json({ error: "Story not found" }); return; }
    res.json({ story });
  } catch (err) {
    logger.error({ err }, "editorial: update story");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a story
router.delete("/v1/editorial/stories/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, req.params.id as string));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "editorial: delete story");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List acts for a story
router.get("/v1/editorial/stories/:id/acts", async (req: Request, res: Response) => {
  try {
    const acts = await db.select().from(wsStoryActsTable)
      .where(eq(wsStoryActsTable.storyId, req.params.id as string))
      .orderBy(wsStoryActsTable.actNumber);
    res.json({ acts });
  } catch (err) {
    logger.error({ err }, "editorial: list acts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create an act
router.post("/v1/editorial/stories/:id/acts", async (req: Request, res: Response) => {
  try {
    const { title, tagline, act_number, world_id } = req.body;
    if (!title || !world_id) { res.status(400).json({ error: "title and world_id required" }); return; }
    const [act] = await db.insert(wsStoryActsTable).values({
      id: randomUUID(),
      storyId: req.params.id as string,
      worldId: world_id,
      actNumber: act_number ?? 1,
      title,
      tagline: tagline ?? "",
    }).returning();
    res.status(201).json({ act });
  } catch (err) {
    logger.error({ err }, "editorial: create act");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update an act
router.patch("/v1/editorial/acts/:id", async (req: Request, res: Response) => {
  try {
    const { title, tagline, act_number } = req.body;
    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title;
    if (tagline !== undefined) update.tagline = tagline;
    if (act_number !== undefined) update.actNumber = act_number;
    const [act] = await db.update(wsStoryActsTable).set(update).where(eq(wsStoryActsTable.id, req.params.id as string)).returning();
    if (!act) { res.status(404).json({ error: "Act not found" }); return; }
    res.json({ act });
  } catch (err) {
    logger.error({ err }, "editorial: update act");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete an act
router.delete("/v1/editorial/acts/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, req.params.id as string));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "editorial: delete act");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List journal prompts for a canon record
router.get("/v1/editorial/canon-records/:id/journal-prompts", async (req: Request, res: Response) => {
  try {
    const prompts = await db.select().from(wsJournalPromptsTable)
      .where(eq(wsJournalPromptsTable.recordId, req.params.id as string))
      .orderBy(wsJournalPromptsTable.sortOrder, wsJournalPromptsTable.createdAt);
    res.json({ journal_prompts: prompts });
  } catch (err) {
    logger.error({ err }, "editorial: list journal prompts");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a journal prompt
router.post("/v1/editorial/canon-records/:id/journal-prompts", async (req: Request, res: Response) => {
  try {
    const { prompt_text, hint_label, story_id, sort_order } = req.body;
    if (!prompt_text) { res.status(400).json({ error: "prompt_text required" }); return; }
    const [prompt] = await db.insert(wsJournalPromptsTable).values({
      id: randomUUID(),
      recordId: req.params.id as string,
      storyId: story_id ?? null,
      promptText: prompt_text,
      hintLabel: hint_label ?? "",
      sortOrder: sort_order ?? 0,
    }).returning();
    res.status(201).json({ journal_prompt: prompt });
  } catch (err) {
    logger.error({ err }, "editorial: create journal prompt");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a journal prompt
router.delete("/v1/editorial/journal-prompts/:id", async (req: Request, res: Response) => {
  try {
    await db.delete(wsJournalPromptsTable).where(eq(wsJournalPromptsTable.id, req.params.id as string));
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "editorial: delete journal prompt");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List encounters for a canon record (location)
router.get("/v1/editorial/canon-records/:id/encounters", async (req: Request, res: Response) => {
  try {
    const encounters = await db.select().from(wsEncountersTable)
      .where(eq(wsEncountersTable.locationRecordId, req.params.id as string))
      .orderBy(wsEncountersTable.createdAt);
    res.json({ encounters });
  } catch (err) {
    logger.error({ err }, "editorial: list encounters");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Link a canon record to a story
router.post("/v1/editorial/canon-records/:id/story-links", async (req: Request, res: Response) => {
  try {
    const { story_id, act_id } = req.body;
    if (!story_id) { res.status(400).json({ error: "story_id required" }); return; }

    const result = await db.transaction(async tx => {
      const [record] = await tx.select({ worldId: wsCanonRecordsTable.worldId })
        .from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.id, req.params.id as string))
        .limit(1);
      if (!record) return { error: "CANON_RECORD_NOT_FOUND" as const };

      const [story] = await tx.select({ worldId: wsStoriesTable.worldId })
        .from(wsStoriesTable)
        .where(eq(wsStoriesTable.id, story_id))
        .limit(1);
      if (!story) return { error: "STORY_NOT_FOUND" as const };
      if (record.worldId !== story.worldId) return { error: "WORLD_MISMATCH" as const };

      if (act_id) {
        const [act] = await tx.select({ storyId: wsStoryActsTable.storyId })
          .from(wsStoryActsTable)
          .where(eq(wsStoryActsTable.id, act_id))
          .limit(1);
        if (!act || act.storyId !== story_id) return { error: "ACT_MISMATCH" as const };
      }

      await tx.insert(wsCanonRecordStoryLinksTable).values({
        canonRecordId: req.params.id as string,
        storyId: story_id,
        actId: act_id ?? null,
      }).onConflictDoUpdate({
        target: [wsCanonRecordStoryLinksTable.canonRecordId, wsCanonRecordStoryLinksTable.storyId],
        set: { actId: act_id ?? null },
      });
      return { ok: true as const };
    });

    if ("error" in result) {
      const status = result.error === "CANON_RECORD_NOT_FOUND" || result.error === "STORY_NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: result.error });
      return;
    }
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "editorial: create story link");
    res.status(500).json({ error: "Internal server error" });
  }
});

// List story links for a canon record
router.get("/v1/editorial/canon-records/:id/story-links", async (req: Request, res: Response) => {
  try {
    const links = await db.select({
      storyId: wsCanonRecordStoryLinksTable.storyId,
      actId: wsCanonRecordStoryLinksTable.actId,
      storyTitle: wsStoriesTable.title,
      storyStatus: wsStoriesTable.status,
    })
    .from(wsCanonRecordStoryLinksTable)
    .leftJoin(wsStoriesTable, eq(wsCanonRecordStoryLinksTable.storyId, wsStoriesTable.id))
    .where(eq(wsCanonRecordStoryLinksTable.canonRecordId, req.params.id as string));
    res.json({ story_links: links });
  } catch (err) {
    logger.error({ err }, "editorial: list story links");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove a story link
router.delete("/v1/editorial/canon-records/:id/story-links/:storyId", async (req: Request, res: Response) => {
  try {
    await db.delete(wsCanonRecordStoryLinksTable)
      .where(
        and(
          eq(wsCanonRecordStoryLinksTable.canonRecordId, req.params.id as string),
          eq(wsCanonRecordStoryLinksTable.storyId, req.params.storyId as string),
        )
      );
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "editorial: delete story link");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Editorial context snapshots ─────────────────────────────────────────────
// All local editorial entities use the same provenance/status/publish contract.
// The renderer deliberately serializes fields verbatim; it never derives prose.
const editorialSnapshotResources: Record<string, { getTable: () => any; kind: string; global?: boolean }> = {
  "production-specs": { getTable: () => wsProductionSpecsTable, kind: "production spec" },
  "component-specs": { getTable: () => wsComponentSpecsTable, kind: "component spec" },
  "style-guides": { getTable: () => wsStyleGuidesTable, kind: "style guide" },
  "prompt-modules": { getTable: () => wsPromptModulesTable, kind: "prompt module" },
  collections: { getTable: () => wsCollectionsTable, kind: "collection" },
  volumes: { getTable: () => wsVolumesTable, kind: "volume" },
  "production-profiles": { getTable: () => wsProductionProfilesTable, kind: "production profile", global: true },
  "punch-templates": { getTable: () => wsPunchTemplatesTable, kind: "punch template", global: true },
};

async function persistEditorialSnapshotFailure(
  definition: { getTable: () => any; kind: string; global?: boolean },
  id: string,
  message: string,
) {
  const table = definition.getTable();
  const [record] = await db.select().from(table).where(eq(table.id, id)).limit(1).catch(() => []);
  if (!record) return;
  await db.insert(wsContextSnapshotsTable).values({
    entityType: definition.kind.replace(/ /g, "_"),
    entityId: record.id,
    worldId: record.worldId ?? null,
    githubPath: editorialSnapshotPath(definition.kind, {
      id: record.id,
      name: record.name ?? record.productionItem ?? record.code,
      worldId: definition.global ? null : record.worldId,
    }),
    status: "sync_failed",
    lastError: message.slice(0, 500),
  }).onConflictDoUpdate({
    target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
    set: { status: "sync_failed", lastError: message.slice(0, 500), updatedAt: new Date() },
  }).catch(() => undefined);
}

async function buildEditorialSnapshot(resource: string, id: string) {
  const definition = editorialSnapshotResources[resource];
  if (!definition) return null;
  const table = definition.getTable();
  const [record] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  if (!record) return null;
  let sourceUpdatedAt = record.updatedAt as Date;
  const relationships: Array<{ label: string; id: string; name: string }> = [];
  if (record.worldId) {
    const [world] = await db.select({
      id: worldsmithWorldsTable.id,
      name: worldsmithWorldsTable.name,
      updatedAt: worldsmithWorldsTable.updatedAt,
    })
      .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, record.worldId)).limit(1);
    if (world) {
      relationships.push({ label: "World", id: world.id, name: world.name });
      if (world.updatedAt > sourceUpdatedAt) sourceUpdatedAt = world.updatedAt;
    }
  }
  const relationTables = [
    { key: "collectionId", label: "Collection", table: wsCollectionsTable },
    { key: "volumeId", label: "Volume", table: wsVolumesTable },
    { key: "styleGuideId", label: "Style Guide", table: wsStyleGuidesTable },
    { key: "componentSpecId", label: "Component Spec", table: wsComponentSpecsTable },
    { key: "productionProfileId", label: "Production Profile", table: wsProductionProfilesTable },
    { key: "punchTemplateId", label: "Punch Template", table: wsPunchTemplatesTable },
  ];
  for (const relation of relationTables) {
    const relatedId = record[relation.key];
    if (!relatedId) continue;
    const [target] = await db.select({
      id: relation.table.id,
      name: relation.table.name,
      updatedAt: relation.table.updatedAt,
    })
      .from(relation.table).where(eq(relation.table.id, relatedId)).limit(1);
    if (target) {
      relationships.push({ label: relation.label, id: target.id, name: target.name });
      if (target.updatedAt > sourceUpdatedAt) sourceUpdatedAt = target.updatedAt;
    }
  }
  const arrayRelations = [
    { key: "promptModuleIds", label: "Prompt Module", table: wsPromptModulesTable },
    { key: "canonRecordIds", label: "Canon Record", table: wsCanonRecordsTable },
    { key: "dependencyIds", label: "Prompt Module dependency", table: wsPromptModulesTable },
  ];
  for (const relation of arrayRelations) {
    const ids = Array.isArray(record[relation.key]) ? record[relation.key] : [];
    if (!ids.length) continue;
    const targets = await db.select({
      id: relation.table.id,
      name: relation.table.name,
      updatedAt: relation.table.updatedAt,
    })
      .from(relation.table).where(inArray(relation.table.id, ids));
    for (const target of targets) {
      relationships.push({ label: relation.label, id: target.id, name: target.name });
      if (target.updatedAt > sourceUpdatedAt) sourceUpdatedAt = target.updatedAt;
    }
  }
  const path = editorialSnapshotPath(definition.kind, {
    id: record.id,
    name: record.name ?? record.productionItem ?? record.code,
    worldId: definition.global ? null : record.worldId,
  });
  return {
    record,
    path,
    markdown: renderEditorialSnapshot(definition.kind, record, relationships),
    relationships,
    sourceUpdatedAt,
  };
}

router.get("/v1/editorial/:resource/:id/context-snapshot", async (req, res) => {
  const resource = req.params.resource as string;
  const definition = editorialSnapshotResources[resource];
  if (!definition) { res.status(404).json({ error: "Context snapshot resource not found" }); return; }
  try {
    const built = await buildEditorialSnapshot(resource, req.params.id as string);
    if (!built) { res.status(404).json({ error: `${definition.kind} not found` }); return; }
    const [stored] = await db.select().from(wsContextSnapshotsTable).where(and(
      eq(wsContextSnapshotsTable.entityType, definition.kind.replace(/ /g, "_")),
      eq(wsContextSnapshotsTable.entityId, built.record.id),
    )).limit(1);
    const status = !stored?.lastSnapshotAt ? (stored?.status === "sync_failed" ? "sync_failed" : "not_generated")
      : !stored.recordUpdatedAt || built.sourceUpdatedAt > stored.recordUpdatedAt ? "out_of_date" : "current";
    res.json({ snapshot: { status, githubPath: stored?.githubPath ?? built.path,
      githubCommitSha: stored?.githubCommitSha ?? null, lastSnapshotAt: stored?.lastSnapshotAt ?? null,
      recordUpdatedAt: stored?.recordUpdatedAt ?? null, lastError: stored?.lastError ?? null,
      autoSync: stored?.autoSync ?? false } });
  } catch (err) { logger.error({ err, resource }, "editorial: get context snapshot status"); res.status(500).json({ error: "Context Snapshot status could not be loaded" }); }
});

router.post("/v1/editorial/:resource/:id/context-snapshot", async (req, res) => {
  const resource = req.params.resource as string;
  const definition = editorialSnapshotResources[resource];
  if (!definition) { res.status(404).json({ error: "Context snapshot resource not found" }); return; }
  try {
    const built = await buildEditorialSnapshot(resource, req.params.id as string);
    if (!built) { res.status(404).json({ error: `${definition.kind} not found` }); return; }
    const published = await new ContextSnapshotGitHubPublisher().publish(
      built.path, built.markdown, `context: update ${definition.kind} for ${built.record.name ?? built.record.id}`,
    );
    const now = new Date();
    const [snapshot] = await db.insert(wsContextSnapshotsTable).values({
      entityType: definition.kind.replace(/ /g, "_"), entityId: built.record.id, worldId: built.record.worldId ?? null,
      githubPath: published.path, githubCommitSha: published.commitSha, status: "current",
      contentHash: snapshotHash(built.markdown), recordUpdatedAt: built.sourceUpdatedAt, lastSnapshotAt: now, lastError: null,
    }).onConflictDoUpdate({
      target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
      set: { worldId: built.record.worldId ?? null, githubPath: published.path, githubCommitSha: published.commitSha,
        status: "current", contentHash: snapshotHash(built.markdown), recordUpdatedAt: built.sourceUpdatedAt,
        lastSnapshotAt: now, lastError: null, updatedAt: now },
    }).returning();
    res.json({ snapshot });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Context Snapshot sync failed";
    await persistEditorialSnapshotFailure(definition, req.params.id as string, message);
    res.status(502).json({ error: message });
  }
});

router.patch("/v1/editorial/:resource/:id/context-snapshot", async (req, res) => {
  const definition = editorialSnapshotResources[req.params.resource as string];
  if (!definition) { res.status(404).json({ error: "Context snapshot resource not found" }); return; }
  if (typeof req.body?.auto_sync !== "boolean" && typeof req.body?.autoSync !== "boolean") {
    res.status(400).json({ error: "auto_sync must be a boolean" }); return;
  }
  const [snapshot] = await db.update(wsContextSnapshotsTable)
    .set({ autoSync: req.body.auto_sync ?? req.body.autoSync, updatedAt: new Date() })
    .where(and(eq(wsContextSnapshotsTable.entityType, definition.kind.replace(/ /g, "_")),
      eq(wsContextSnapshotsTable.entityId, req.params.id as string))).returning();
  if (!snapshot) { res.status(404).json({ error: "Context snapshot has not been generated" }); return; }
  res.json({ snapshot });
});

// Compatibility surface used by the Editorial admin cards. Unlike the
// internal v1 resource endpoints, this surface returns the status object
// directly under `status`, matching apiFetch consumers.
router.get("/worldsmith/editorial/context-snapshots/:resource/:id/status", async (req, res) => {
  const definition = editorialSnapshotResources[req.params.resource as string];
  if (!definition) { res.status(404).json({ error: "Context snapshot resource not found" }); return; }
  try {
    const built = await buildEditorialSnapshot(req.params.resource as string, req.params.id as string);
    if (!built) { res.status(404).json({ error: `${definition.kind} not found` }); return; }
    const [stored] = await db.select().from(wsContextSnapshotsTable).where(and(
      eq(wsContextSnapshotsTable.entityType, definition.kind.replace(/ /g, "_")),
      eq(wsContextSnapshotsTable.entityId, built.record.id),
    )).limit(1);
    const snapshot = {
      status: !stored?.lastSnapshotAt ? (stored?.status === "sync_failed" ? "sync_failed" : "not_generated")
        : !stored.recordUpdatedAt || built.sourceUpdatedAt > stored.recordUpdatedAt ? "out_of_date" : "current",
      githubPath: stored?.githubPath ?? built.path, githubCommitSha: stored?.githubCommitSha ?? null,
      lastSnapshotAt: stored?.lastSnapshotAt ?? null, recordUpdatedAt: stored?.recordUpdatedAt ?? null,
      lastError: stored?.lastError ?? null, autoSync: stored?.autoSync ?? false,
    };
    res.json({ status: snapshot });
  } catch (err) { logger.error({ err }, "editorial: get compatibility context status"); res.status(500).json({ error: "Context Snapshot status could not be loaded" }); }
});

router.post("/worldsmith/editorial/context-snapshots/:resource/:id/update", async (req, res) => {
  const resource = req.params.resource as string;
  const definition = editorialSnapshotResources[resource];
  if (!definition) { res.status(404).json({ error: "Context snapshot resource not found" }); return; }
  try {
    const built = await buildEditorialSnapshot(resource, req.params.id as string);
    if (!built) { res.status(404).json({ error: `${definition.kind} not found` }); return; }
    const published = await new ContextSnapshotGitHubPublisher().publish(
      built.path, built.markdown, `context: update ${definition.kind} for ${built.record.name ?? built.record.id}`,
    );
    const now = new Date();
    const [snapshot] = await db.insert(wsContextSnapshotsTable).values({
      entityType: definition.kind.replace(/ /g, "_"), entityId: built.record.id, worldId: built.record.worldId ?? null,
      githubPath: published.path, githubCommitSha: published.commitSha, status: "current",
      contentHash: snapshotHash(built.markdown), recordUpdatedAt: built.sourceUpdatedAt, lastSnapshotAt: now, lastError: null,
    }).onConflictDoUpdate({
      target: [wsContextSnapshotsTable.entityType, wsContextSnapshotsTable.entityId],
      set: { worldId: built.record.worldId ?? null, githubPath: published.path, githubCommitSha: published.commitSha,
        status: "current", contentHash: snapshotHash(built.markdown), recordUpdatedAt: built.sourceUpdatedAt,
        lastSnapshotAt: now, lastError: null, updatedAt: now },
    }).returning();
    res.json({ status: { ...snapshot, status: "current" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Context Snapshot sync failed";
    await persistEditorialSnapshotFailure(definition, req.params.id as string, message);
    res.status(502).json({ error: message });
  }
});

export default router;
