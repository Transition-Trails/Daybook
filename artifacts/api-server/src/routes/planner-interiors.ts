/**
 * Immutable authored planner interiors.
 * Version rows are write-once: edits always create a new revision and editions
 * choose when to move their pin, preserving reproducible customer exports.
 */
import { Router, type Request, type Response } from "express";
import { db, editionsTable, plannerInteriorsTable, plannerInteriorVersionsTable, storesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { buildInteriorPdf } from "../lib/planner-interior-renderer";
import { SvgContractError, validateInteriorDefinition } from "../lib/svg-contract";

const router = Router();

function readId(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizedDefinition(manifest: unknown, assets: unknown) {
  const validated = validateInteriorDefinition(
    manifest as Parameters<typeof validateInteriorDefinition>[0],
    assets as Parameters<typeof validateInteriorDefinition>[1],
  );
  return {
    manifest: manifest as Parameters<typeof validateInteriorDefinition>[0],
    assets: Object.fromEntries(Object.entries(validated).map(([id, template]) => [id, template.svg])),
  };
}

function respondToDefinitionError(req: Request, res: Response, error: unknown): boolean {
  if (error instanceof SvgContractError) {
    req.log.warn({ error: error.message }, "Rejected planner interior definition");
    res.status(400).json({ error: error.message });
    return true;
  }
  return false;
}

router.get("/v1/planner-interiors", requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const interiors = await db.select().from(plannerInteriorsTable).orderBy(desc(plannerInteriorsTable.updatedAt));
  res.json(interiors);
});

router.post("/v1/planner-interiors", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const body = req.body as { storeId?: string; name?: string; manifest?: unknown; assets?: unknown };
  if (!body.storeId?.trim() || !body.name?.trim()) {
    res.status(400).json({ error: "storeId and name are required" });
    return;
  }
  const [store] = await db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.id, body.storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  let definition: ReturnType<typeof sanitizedDefinition>;
  try {
    definition = sanitizedDefinition(body.manifest, body.assets);
  } catch (error) {
    if (respondToDefinitionError(req, res, error)) return;
    throw error;
  }

  const result = await db.transaction(async (tx) => {
    const [interior] = await tx
      .insert(plannerInteriorsTable)
      .values({ storeId: body.storeId!, name: body.name!.trim() })
      .returning();
    const [version] = await tx
      .insert(plannerInteriorVersionsTable)
      .values({ interiorId: interior.id, version: 1, manifest: definition.manifest, assets: definition.assets })
      .returning();
    const [updated] = await tx
      .update(plannerInteriorsTable)
      .set({ currentVersionId: version.id })
      .where(eq(plannerInteriorsTable.id, interior.id))
      .returning();
    return { interior: updated, version };
  });

  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: body.storeId,
    action: "planner_interior.create",
    targetType: "planner_interior",
    targetId: result.interior.id,
    metadata: { version: 1 },
  });
  res.status(201).json(result);
});

router.get("/v1/planner-interiors/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = readId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Interior id is required" });
    return;
  }
  const [interior] = await db.select().from(plannerInteriorsTable).where(eq(plannerInteriorsTable.id, id));
  if (!interior) {
    res.status(404).json({ error: "Planner interior not found" });
    return;
  }
  const versions = await db
    .select()
    .from(plannerInteriorVersionsTable)
    .where(eq(plannerInteriorVersionsTable.interiorId, id))
    .orderBy(desc(plannerInteriorVersionsTable.version));
  res.json({ interior, versions });
});

router.post("/v1/planner-interiors/:id/versions", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const id = readId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Interior id is required" });
    return;
  }
  const [interior] = await db.select().from(plannerInteriorsTable).where(eq(plannerInteriorsTable.id, id));
  if (!interior) {
    res.status(404).json({ error: "Planner interior not found" });
    return;
  }
  const body = req.body as { manifest?: unknown; assets?: unknown };
  let definition: ReturnType<typeof sanitizedDefinition>;
  try {
    definition = sanitizedDefinition(body.manifest, body.assets);
  } catch (error) {
    if (respondToDefinitionError(req, res, error)) return;
    throw error;
  }
  const [latest] = await db
    .select({ version: plannerInteriorVersionsTable.version })
    .from(plannerInteriorVersionsTable)
    .where(eq(plannerInteriorVersionsTable.interiorId, id))
    .orderBy(desc(plannerInteriorVersionsTable.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;
  const result = await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(plannerInteriorVersionsTable)
      .values({ interiorId: id, version: nextVersion, manifest: definition.manifest, assets: definition.assets })
      .returning();
    const [updatedInterior] = await tx
      .update(plannerInteriorsTable)
      .set({ currentVersionId: version.id })
      .where(eq(plannerInteriorsTable.id, id))
      .returning();
    return { interior: updatedInterior, version };
  });
  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: interior.storeId,
    action: "planner_interior.version.create",
    targetType: "planner_interior",
    targetId: id,
    metadata: { version: nextVersion },
  });
  res.status(201).json(result);
});

const previewInterior = async (req: Request, res: Response): Promise<void> => {
  const id = readId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Interior id is required" });
    return;
  }
  const versionQuery = Array.isArray(req.query.versionId) ? req.query.versionId[0] : req.query.versionId;
  const versionId = typeof versionQuery === "string"
    ? versionQuery
    : typeof req.body?.versionId === "string" ? req.body.versionId : undefined;
  const [version] = await db
    .select()
    .from(plannerInteriorVersionsTable)
    .where(
      versionId
        ? and(eq(plannerInteriorVersionsTable.id, versionId), eq(plannerInteriorVersionsTable.interiorId, id))
        : eq(plannerInteriorVersionsTable.interiorId, id),
    )
    .orderBy(desc(plannerInteriorVersionsTable.version))
    .limit(1);
  if (!version) {
    res.status(404).json({ error: "Planner interior version not found" });
    return;
  }
  try {
    const result = await buildInteriorPdf(version.manifest, version.assets, {
      title: typeof req.body?.title === "string" ? req.body.title : undefined,
      subtitle: typeof req.body?.subtitle === "string" ? req.body.subtitle : undefined,
      year: typeof req.body?.year === "number" ? req.body.year : undefined,
      themeColors: Array.isArray(req.body?.themeColors) ? req.body.themeColors : undefined,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=planner-interior-v${version.version}.pdf`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Preview-Pages", String(result.pageCount));
    res.setHeader("X-Link-Annotations", String(result.totalLinkAnnotations));
    res.send(Buffer.from(result.buffer));
  } catch (error) {
    if (respondToDefinitionError(req, res, error)) return;
    req.log.error({ error }, "Planner interior preview failed");
    res.status(500).json({ error: "Planner interior preview failed" });
  }
};

// POST supports programmatic preview requests; GET lets an authenticated admin
// open a PDF in a new browser tab without manufacturing a client-side blob.
router.post("/v1/planner-interiors/:id/preview", requireSuperAdmin, previewInterior);
router.get("/v1/planner-interiors/:id/preview", requireSuperAdmin, previewInterior);

router.post("/v1/editions/:editionId/pin-interior", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const actor = req.actor!;
  const editionId = readId(req.params.editionId);
  const versionId = typeof req.body?.versionId === "string" ? req.body.versionId : "";
  if (!editionId || !versionId) {
    res.status(400).json({ error: "editionId and versionId are required" });
    return;
  }
  const [edition] = await db.select().from(editionsTable).where(eq(editionsTable.id, editionId));
  if (!edition) {
    res.status(404).json({ error: "Edition not found" });
    return;
  }
  const [version] = await db.select().from(plannerInteriorVersionsTable).where(eq(plannerInteriorVersionsTable.id, versionId));
  if (!version) {
    res.status(404).json({ error: "Planner interior version not found" });
    return;
  }
  const [updated] = await db
    .update(editionsTable)
    .set({ interiorVersionId: version.id })
    .where(eq(editionsTable.id, editionId))
    .returning();
  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: edition.authoredByStoreId ?? "platform",
    action: "edition.interior.pin",
    targetType: "edition",
    targetId: editionId,
    metadata: { interiorVersionId: version.id },
  });
  res.json(updated);
});

export default router;