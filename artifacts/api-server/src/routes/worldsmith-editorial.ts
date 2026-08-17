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
import { requireAuth } from "../lib/auth-middleware";
import { requireSuperAdmin } from "../middleware/requireRole";
import { db } from "@workspace/db";
import {
  wsCollectionsTable,
  wsVolumesTable,
  wsCanonRecordsTable,
  wsCanonRecordRelationsTable,
  wsStyleGuidesTable,
  wsComponentSpecsTable,
  wsPromptModulesTable,
  wsProductionSpecsTable,
  wsPromptPayloadsTable,
  worldsmithWorldsTable,
  type InsertWsProductionSpec,
  type InsertWsCanonRecord,
} from "@workspace/db";
import { and, eq, inArray, like, desc, or, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";
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

// Apply super-admin guard to all editorial routes
router.use(requireAuth, requireSuperAdmin);

// ── Readiness score helper ────────────────────────────────────────────────────

export function computeReadinessScore(spec: Partial<InsertWsProductionSpec>): number {
  const canonIds = (spec.canonRecordIds ?? []) as string[];
  const moduleIds = (spec.promptModuleIds ?? []) as string[];
  const payload = spec.promptPayload ?? "";
  const dep = spec.canonDependency ?? "None";

  const checks = [
    // Identity (4)
    !!spec.productionItem?.trim(),
    !!spec.componentType?.trim(),
    !!spec.worldId?.trim(),
    !!(spec.collectionId?.trim() || spec.volumeId?.trim()),
    // Creative direction (4)
    !!spec.designIntent?.trim(),
    !!spec.narrativePurpose?.trim(),
    !!spec.requiredContent?.trim(),
    !!spec.orientation?.trim(),
    // Payload (3)
    !!spec.payloadVersion?.trim(),
    payload.trim().length > 30,
    payload.includes("shared_prompt") || payload.includes("asset_role"),
    // Canon & Governance (3)
    dep !== "None" || canonIds.length > 0 || !!spec.styleGuideId,
    !!spec.styleGuideId?.trim(),
    dep === "None" || canonIds.length > 0,
    // Related records (4)
    !!spec.componentSpecId?.trim(),
    moduleIds.length > 0,
    !!spec.reviewCriteria?.trim(),
    !!(spec.specId?.trim()),
  ];

  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function derivePipelineStatus(spec: Partial<InsertWsProductionSpec>, readinessScore: number): string {
  const dep = spec.canonDependency ?? "None";
  const canonIds = (spec.canonRecordIds ?? []) as string[];
  const payload = spec.promptPayload ?? "";

  if (spec.compiledPromptStatus === "Compiled") return "compiled";
  if (spec.notionPageId && spec.syncedAt) return "published";

  // Check for blocking issues
  const needsCanon = dep === "Canon Reference" || dep === "Canon Defining";
  if (needsCanon && canonIds.length === 0) return "blocked";

  if (!spec.productionItem?.trim() || !spec.componentType?.trim()) return "draft";
  if (!payload.trim()) return "draft";

  if (readinessScore >= 60) return "canon_clear";
  if (readinessScore >= 30) return "payload_ready";
  return "draft";
}

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
  const { world_id, name, canon_type, narrative_details, historical_context, visual_notes } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    const id = crypto.randomUUID();
    const [row] = await db
      .insert(wsCanonRecordsTable)
      .values({
        id,
        worldId: world_id,
        name: name.trim(),
        canonType: canon_type,
        narrativeDetails: narrative_details ?? "",
        historicalContext: historical_context ?? "",
        visualNotes: visual_notes ?? "",
        createdBy: (req.user as any)?.id,
      })
      .returning();
    res.status(201).json({ canon_record: row });
  } catch (err) {
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
  if (s.includes("character") || s.includes("person") || s.includes("figure")) return "character";
  if (s.includes("location")  || s.includes("place")  || s.includes("geo"))    return "location";
  if (s.includes("object")    || s.includes("artefact")|| s.includes("item"))  return "object";
  if (s.includes("event")     || s.includes("incident"))                        return "event";
  if (s.includes("lore")      || s.includes("myth")    || s.includes("legend")) return "lore";
  if (s.includes("atmosphere")|| s.includes("mood")    || s.includes("tone"))   return "atmosphere";
  if (s.includes("material")  || s.includes("texture") || s.includes("fabric")) return "material";
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
    // Strategy: delete all existing outgoing edges for synced records first,
    // then batch-insert fresh edges — ensures stale links are cleared.
    const syncedLocalIds = [...notionIdToLocalId.values()];
    if (syncedLocalIds.length > 0) {
      await db
        .delete(wsCanonRecordRelationsTable)
        .where(
          sql`${wsCanonRecordRelationsTable.fromRecordId} = ANY(${sql.raw(
            `ARRAY[${syncedLocalIds.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`,
          )})`,
        );
    }

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

    if (edgePairs.length > 0) {
      await db.insert(wsCanonRecordRelationsTable).values(edgePairs).onConflictDoNothing();
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

router.patch("/v1/editorial/canon-records/:id", async (req: Request, res: Response) => {
  const {
    name, canon_type, narrative_details, historical_context, visual_notes,
    emotional_register, sensory_clauses, register_locked,
    narrative_visibility, temporal_scope, canon_stability,
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
  try {
    const [row] = await db
      .update(wsCanonRecordsTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(canon_type !== undefined ? { canonType: canon_type } : {}),
        ...(narrative_details !== undefined ? { narrativeDetails: narrative_details } : {}),
        ...(historical_context !== undefined ? { historicalContext: historical_context } : {}),
        ...(visual_notes !== undefined ? { visualNotes: visual_notes } : {}),
        ...(emotional_register !== undefined ? { emotionalRegister: emotional_register } : {}),
        ...(sensory_clauses !== undefined ? { sensoryClauses: sensory_clauses } : {}),
        ...(register_locked !== undefined ? { registerLocked: register_locked } : {}),
        ...(narrative_visibility !== undefined ? { narrativeVisibility: narrative_visibility } : {}),
        ...(temporal_scope !== undefined ? { temporalScope: temporal_scope } : {}),
        ...(canon_stability !== undefined ? { canonStability: canon_stability } : {}),
      })
      .where(eq(wsCanonRecordsTable.id, req.params.id as string))
      .returning();
    if (!row) { res.status(404).json({ error: "Canon record not found" }); return; }

    // Write the three new fields back to Notion if this record is linked to a page
    if (row.notionPageId) {
      const notionProps: Record<string, unknown> = {};
      if (emotional_register !== undefined) {
        // null means clear the select; non-null sets it
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
      if (Object.keys(notionProps).length > 0) {
        try {
          await updatePage(row.notionPageId, notionProps);
        } catch (notionErr) {
          // Non-fatal — log and continue; local save already succeeded
          logger.warn({ err: notionErr, id: row.id }, "editorial: failed to write canon fields to Notion (non-fatal)");
        }
      }
    }

    res.json({ canon_record: row });
  } catch (err) {
    logger.error({ err }, "editorial: update canon record");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Valid status transitions for canon records
const CANON_TRANSITIONS: Record<string, string[]> = {
  proposed:     ["under_review", "rejected"],
  under_review: ["accepted", "superseded", "rejected", "proposed"],
  accepted:     ["superseded"],
  superseded:   [],
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

    res.json({ canon_record: updated });
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

    // Apply transition to all
    await db
      .update(wsCanonRecordsTable)
      .set({ status })
      .where(sql`${wsCanonRecordsTable.id} = ANY(${sql.raw(`ARRAY[${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(",")}]`)})`);

    res.json({ updated: records.length, status });
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
  const { world_id, name, content } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    const [row] = await db
      .insert(wsStyleGuidesTable)
      .values({ id: crypto.randomUUID(), worldId: world_id, name: name.trim(), content: content ?? "" })
      .returning();
    res.status(201).json({ style_guide: row });
  } catch (err) {
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
  const { name, content } = req.body;
  try {
    const [row] = await db.update(wsStyleGuidesTable)
      .set({ ...(name !== undefined ? { name } : {}), ...(content !== undefined ? { content } : {}) })
      .where(eq(wsStyleGuidesTable.id, req.params.id as string))
      .returning();
    if (!row) { res.status(404).json({ error: "Style guide not found" }); return; }
    res.json({ style_guide: row });
  } catch (err) {
    logger.error({ err }, "editorial: update style guide");
    res.status(500).json({ error: "Internal server error" });
  }
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
  const { world_id, name, component_type, content } = req.body;
  if (!world_id || !name?.trim() || !component_type?.trim()) {
    res.status(400).json({ error: "world_id, name, and component_type are required" });
    return;
  }
  try {
    const [row] = await db.insert(wsComponentSpecsTable)
      .values({ id: crypto.randomUUID(), worldId: world_id, name: name.trim(), componentType: component_type, content: content ?? "" })
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
  const { name, content } = req.body;
  try {
    const [row] = await db.update(wsComponentSpecsTable)
      .set({ ...(name !== undefined ? { name } : {}), ...(content !== undefined ? { content } : {}) })
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
  const { world_id, name, content } = req.body;
  if (!world_id || !name?.trim()) {
    res.status(400).json({ error: "world_id and name are required" });
    return;
  }
  try {
    const [row] = await db.insert(wsPromptModulesTable)
      .values({ id: crypto.randomUUID(), worldId: world_id, name: name.trim(), content: content ?? "" })
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
  const { name, content, dependency_ids } = req.body;
  try {
    const [row] = await db.update(wsPromptModulesTable)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(dependency_ids !== undefined ? { dependencyIds: dependency_ids } : {}),
      })
      .where(eq(wsPromptModulesTable.id, req.params.id as string)).returning();
    if (!row) { res.status(404).json({ error: "Prompt module not found" }); return; }
    res.json({ prompt_module: row });
  } catch (err) {
    logger.error({ err }, "editorial: update prompt module");
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

    res.json({ specs: rows });
  } catch (err) {
    logger.error({ err }, "editorial: list specs");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/v1/editorial/specs", async (req: Request, res: Response) => {
  const {
    world_id, collection_id, volume_id,
    production_item, spec_id, component_type, component_set,
    design_intent, narrative_purpose, required_content, review_criteria,
    writing_space_percent, orientation, front_back_style,
    canon_dependency, canon_record_ids,
    payload_version, prompt_payload,
    style_guide_id, component_spec_id, prompt_module_ids,
  } = req.body;

  if (!world_id || !production_item?.trim() || !component_type?.trim()) {
    res.status(400).json({ error: "world_id, production_item, and component_type are required" });
    return;
  }

  try {
    const partial: Partial<InsertWsProductionSpec> = {
      worldId: world_id,
      collectionId: collection_id,
      volumeId: volume_id,
      productionItem: production_item.trim(),
      specId: spec_id,
      componentType: component_type.trim(),
      componentSet: component_set,
      designIntent: design_intent ?? "",
      narrativePurpose: narrative_purpose ?? "",
      requiredContent: required_content ?? "",
      reviewCriteria: review_criteria ?? "",
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
    };

    const readinessScore = computeReadinessScore(partial);
    const status = derivePipelineStatus(partial, readinessScore);

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
    logger.error({ err }, "editorial: create spec");
    res.status(500).json({ error: "Internal server error" });
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
    const [styleGuide, componentSpec, canonRecords, promptModules] = await Promise.all([
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

router.patch("/v1/editorial/specs/:id", async (req: Request, res: Response) => {
  const specId = req.params.id as string;
  const {
    production_item, spec_id, component_type, component_set, collection_id, volume_id,
    design_intent, narrative_purpose, required_content, review_criteria,
    writing_space_percent, orientation, front_back_style,
    canon_dependency, canon_record_ids,
    payload_version, prompt_payload,
    style_guide_id, component_spec_id, prompt_module_ids,
    status: explicitStatus,
  } = req.body;

  try {
    const [existing] = await db
      .select()
      .from(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, specId))
      .limit(1);

    if (!existing) { res.status(404).json({ error: "Spec not found" }); return; }

    const merged: Partial<InsertWsProductionSpec> = {
      worldId: existing.worldId,
      collectionId: collection_id !== undefined ? collection_id : existing.collectionId,
      volumeId: volume_id !== undefined ? volume_id : existing.volumeId,
      productionItem: production_item !== undefined ? production_item.trim() : existing.productionItem,
      specId: spec_id !== undefined ? spec_id : existing.specId,
      componentType: component_type !== undefined ? component_type.trim() : existing.componentType,
      componentSet: component_set !== undefined ? component_set : existing.componentSet,
      designIntent: design_intent !== undefined ? design_intent : existing.designIntent,
      narrativePurpose: narrative_purpose !== undefined ? narrative_purpose : existing.narrativePurpose,
      requiredContent: required_content !== undefined ? required_content : existing.requiredContent,
      reviewCriteria: review_criteria !== undefined ? review_criteria : existing.reviewCriteria,
      writingSpacePercent: writing_space_percent !== undefined ? writing_space_percent : existing.writingSpacePercent,
      orientation: orientation !== undefined ? orientation : existing.orientation,
      frontBackStyle: front_back_style !== undefined ? front_back_style : existing.frontBackStyle,
      canonDependency: canon_dependency !== undefined ? canon_dependency : existing.canonDependency,
      canonRecordIds: canon_record_ids !== undefined ? canon_record_ids : existing.canonRecordIds,
      payloadVersion: payload_version !== undefined ? payload_version : existing.payloadVersion,
      promptPayload: prompt_payload !== undefined ? prompt_payload : existing.promptPayload,
      styleGuideId: style_guide_id !== undefined ? style_guide_id : existing.styleGuideId,
      componentSpecId: component_spec_id !== undefined ? component_spec_id : existing.componentSpecId,
      promptModuleIds: prompt_module_ids !== undefined ? prompt_module_ids : existing.promptModuleIds,
      // Always carry forward the compile/publish state so that editing content
      // fields does NOT silently downgrade a compiled or published spec.
      compiledPromptStatus: existing.compiledPromptStatus,
      notionPageId: existing.notionPageId,
      syncedAt: existing.syncedAt,
    };

    const readinessScore = computeReadinessScore(merged);

    // Only recompute pipeline status when no explicit override is supplied AND
    // the spec is not already in a terminal state (compiled / published).
    // This prevents a content-field edit from wiping out publish/compile state.
    const terminalStatus = existing.status === "compiled" || existing.status === "published";
    const derivedStatus = terminalStatus
      ? existing.status
      : derivePipelineStatus(merged, readinessScore);

    const [updated] = await db
      .update(wsProductionSpecsTable)
      .set({
        ...merged,
        readinessScore,
        status: explicitStatus ?? derivedStatus,
      })
      .where(eq(wsProductionSpecsTable.id, specId))
      .returning();

    res.json({ spec: updated });
  } catch (err) {
    logger.error({ err }, "editorial: update spec");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/v1/editorial/specs/:id", async (req: Request, res: Response) => {
  try {
    const [deleted] = await db
      .delete(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, req.params.id as string))
      .returning();
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
      "Design Intent": spec.designIntent || "(empty)",
      "Narrative Purpose": spec.narrativePurpose || "(empty)",
      "Required Content": spec.requiredContent || "(empty)",
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
    if (spec.designIntent) props["Design Intent"] = richTextProp(spec.designIntent);
    if (spec.narrativePurpose) props["Narrative Purpose"] = richTextProp(spec.narrativePurpose);
    if (spec.requiredContent) props["Required Content"] = richTextProp(spec.requiredContent);
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

export default router;
