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
import { findSameStoreName } from "../lib/store-name-dedup";

const router = Router();
const HOUSE_STORE_ID = "store-house";

function readId(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function previewOptionsFromQuery(query: Record<string, unknown>): {
  title?: string;
  subtitle?: string;
  year?: number;
  themeColors?: string[];
} {
  const title = readId(query.title as string | string[] | undefined);
  const subtitle = readId(query.subtitle as string | string[] | undefined);
  const rawYear = query.year;
  const yearQuery = readId(rawYear as string | string[] | undefined);
  const year = typeof rawYear === "number" && Number.isInteger(rawYear) && rawYear >= 1000 && rawYear <= 9999
    ? rawYear
    : yearQuery && /^\d{4}$/.test(yearQuery) ? Number(yearQuery) : undefined;
  const rawThemeColors = query.themeColors;
  const themeColors = (Array.isArray(rawThemeColors) ? rawThemeColors : [rawThemeColors])
    .flatMap((value) => typeof value === "string" ? value.split(",") : [])
    .map((value) => value.trim())
    .filter(Boolean);
  return { title, subtitle, year, themeColors: themeColors.length ? themeColors : undefined };
}

export function canPinInterior(editionStoreId: string | null, interiorStoreId: string): boolean {
  return interiorStoreId === editionStoreId || interiorStoreId === HOUSE_STORE_ID;
}

function validatedDefinition(manifest: unknown, assets: unknown) {
  const validated = validateInteriorDefinition(
    manifest as Parameters<typeof validateInteriorDefinition>[0],
    assets as Parameters<typeof validateInteriorDefinition>[1],
  );
  return {
    manifest: manifest as Parameters<typeof validateInteriorDefinition>[0],
    assets: Object.fromEntries(Object.entries(validated).map(([id, template]) => [id, template.svg])),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

/**
 * Allocates a revision while holding the read and write in one transaction.
 * The unique index is authoritative; one retry makes the expected concurrent
 * collision transparent to two admins saving at the same time.
 */
async function createInteriorVersion(
  interiorId: string,
  definition: ReturnType<typeof validatedDefinition>,
): Promise<{
  interior: typeof plannerInteriorsTable.$inferSelect;
  version: typeof plannerInteriorVersionsTable.$inferSelect;
}> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [latest] = await tx
          .select({ version: plannerInteriorVersionsTable.version })
          .from(plannerInteriorVersionsTable)
          .where(eq(plannerInteriorVersionsTable.interiorId, interiorId))
          .orderBy(desc(plannerInteriorVersionsTable.version))
          .limit(1);
        const nextVersion = (latest?.version ?? 0) + 1;
        const [version] = await tx
          .insert(plannerInteriorVersionsTable)
          .values({ interiorId, version: nextVersion, manifest: definition.manifest, assets: definition.assets })
          .returning();
        const [interior] = await tx
          .update(plannerInteriorsTable)
          .set({ currentVersionId: version.id })
          .where(eq(plannerInteriorsTable.id, interiorId))
          .returning();
        return { interior, version };
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 1) throw error;
    }
  }
  throw new Error("Unable to allocate planner interior version");
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
  let definition: ReturnType<typeof validatedDefinition>;
  try {
    definition = validatedDefinition(body.manifest, body.assets);
  } catch (error) {
    if (respondToDefinitionError(req, res, error)) return;
    throw error;
  }

  const existing = await findSameStoreName(plannerInteriorsTable, body.storeId, body.name);
  if (existing) {
    const result = await createInteriorVersion(existing.id, definition);
    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: body.storeId,
      action: "planner_interior.version.create",
      targetType: "planner_interior",
      targetId: existing.id,
      metadata: { version: result.version.version, upserted: true },
    });
    res.json({ ...result, upserted: true });
    return;
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
  let definition: ReturnType<typeof validatedDefinition>;
  try {
    definition = validatedDefinition(body.manifest, body.assets);
  } catch (error) {
    if (respondToDefinitionError(req, res, error)) return;
    throw error;
  }
  const result = await createInteriorVersion(id, definition);
  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: interior.storeId,
    action: "planner_interior.version.create",
    targetType: "planner_interior",
    targetId: id,
    metadata: { version: result.version.version },
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
  const bodyOptions = previewOptionsFromQuery(
    (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>,
  );
  const queryOptions = previewOptionsFromQuery(req.query as Record<string, unknown>);
  const title = queryOptions.title ?? bodyOptions.title;
  const subtitle = queryOptions.subtitle ?? bodyOptions.subtitle;
  const year = queryOptions.year ?? bodyOptions.year;
  const themeColors = queryOptions.themeColors ?? bodyOptions.themeColors;
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
      title,
      subtitle,
      year,
      themeColors: themeColors?.length ? themeColors : undefined,
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
  const [versionWithInterior] = await db
    .select({
      version: plannerInteriorVersionsTable,
      interiorStoreId: plannerInteriorsTable.storeId,
    })
    .from(plannerInteriorVersionsTable)
    .innerJoin(plannerInteriorsTable, eq(plannerInteriorsTable.id, plannerInteriorVersionsTable.interiorId))
    .where(eq(plannerInteriorVersionsTable.id, versionId));
  if (!versionWithInterior) {
    res.status(404).json({ error: "Planner interior version not found" });
    return;
  }
  if (!canPinInterior(edition.authoredByStoreId, versionWithInterior.interiorStoreId)) {
    res.status(400).json({ error: "Interior belongs to a different store" });
    return;
  }
  const [updated] = await db
    .update(editionsTable)
    .set({ interiorVersionId: versionWithInterior.version.id })
    .where(eq(editionsTable.id, editionId))
    .returning();
  await writeAudit(db, {
    actorUserId: actor.userId,
    actorRole: actor.effectiveRole,
    scope: edition.authoredByStoreId ?? "platform",
    action: "edition.interior.pin",
    targetType: "edition",
    targetId: editionId,
    metadata: { interiorVersionId: versionWithInterior.version.id },
  });
  res.json(updated);
});

export default router;