import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import {
  db,
  packStickersTable,
  stickerPacksTable,
  stickerShapeRecipesTable,
  stickersLibraryTable,
} from "@workspace/db";
import { requireStoreAccess } from "../middleware/requireRole";
import { requireSuperAdmin } from "../middleware/requireRole";
import type { ActorContext } from "../lib/roles";
import { writeAudit } from "../lib/audit";
import { adjustCutlineSvgForShadow } from "../lib/imageProcessing";
import { computeLabelFontSize } from "../lib/labelImageGen";
import {
  normalizeRecipeInput,
  recipeToResponse,
  renderShapeRecipe,
  validateShapeRecipeTemplate,
} from "../lib/shape-recipes";
import { SvgContractError } from "../lib/svg-contract";

const router: IRouter = Router();

function genRecipeId(): string {
  return `shr_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function genStickerId(): string {
  return `stk_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function sameStore(actor: ActorContext, storeId: string, res: Response): boolean {
  if (actor.platformRole === "super_admin") return true;
  if (actor.storeId !== storeId) {
    res.status(403).json({ error: "Forbidden: cross-store access denied" });
    return false;
  }
  return true;
}

function validationError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Recipe validation failed";
  res.status(400).json({ error: message });
}

async function ensureUniqueScope(
  origin: "starter" | "owned",
  authoredByStoreId: string | null,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const scope = authoredByStoreId
    ? eq(stickerShapeRecipesTable.authoredByStoreId, authoredByStoreId)
    : isNull(stickerShapeRecipesTable.authoredByStoreId);
  const rows = await db
    .select({ id: stickerShapeRecipesTable.id })
    .from(stickerShapeRecipesTable)
    .where(and(
      eq(stickerShapeRecipesTable.origin, origin),
      scope,
      eq(stickerShapeRecipesTable.slug, slug),
      ...(excludeId ? [ne(stickerShapeRecipesTable.id, excludeId)] : []),
    ));
  return rows.length === 0;
}

async function listRecipes(origin: "starter" | "owned", storeId?: string) {
  const scope = origin === "starter"
    ? and(eq(stickerShapeRecipesTable.origin, "starter"), isNull(stickerShapeRecipesTable.authoredByStoreId))
    : and(eq(stickerShapeRecipesTable.origin, "owned"), eq(stickerShapeRecipesTable.authoredByStoreId, storeId!));
  return db.select().from(stickerShapeRecipesTable).where(scope).orderBy(stickerShapeRecipesTable.name);
}

async function getVisibleRecipe(recipeId: string, storeId: string) {
  const [recipe] = await db
    .select()
    .from(stickerShapeRecipesTable)
    .where(and(
      eq(stickerShapeRecipesTable.id, recipeId),
      or(
        and(eq(stickerShapeRecipesTable.origin, "starter"), isNull(stickerShapeRecipesTable.authoredByStoreId)),
        and(eq(stickerShapeRecipesTable.origin, "owned"), eq(stickerShapeRecipesTable.authoredByStoreId, storeId)),
      ),
    ));
  return recipe ?? null;
}

// ── Store recipe catalog and authoring ─────────────────────────────────────

router.get(
  "/stores/:storeId/sticker-shape-recipes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = (req.params as { storeId: string }).storeId;
    if (!sameStore(actor, storeId, res)) return;
    const [starter, owned] = await Promise.all([listRecipes("starter"), listRecipes("owned", storeId)]);
    res.json([...starter, ...owned].map(recipeToResponse));
  },
);

router.post(
  "/stores/:storeId/sticker-shape-recipes",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = (req.params as { storeId: string }).storeId;
    if (!sameStore(actor, storeId, res)) return;
    const input = normalizeRecipeInput(req.body as Record<string, unknown>);
    try {
      validateShapeRecipeTemplate(input);
      if (!(await ensureUniqueScope("owned", storeId, input.slug))) {
        res.status(409).json({ error: `A recipe with slug "${input.slug}" already exists for this store.` });
        return;
      }
      const [recipe] = await db.insert(stickerShapeRecipesTable).values({
        id: genRecipeId(),
        origin: "owned",
        authoredByStoreId: storeId,
        ...input,
      }).returning();
      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "sticker.shape-recipe.create",
        targetType: "sticker_shape_recipe",
        targetId: recipe.id,
        metadata: { origin: "owned", slug: input.slug },
      });
      res.status(201).json(recipeToResponse(recipe));
    } catch (error) {
      validationError(res, error);
    }
  },
);

router.patch(
  "/stores/:storeId/sticker-shape-recipes/:id",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, id } = req.params as { storeId: string; id: string };
    if (!sameStore(actor, storeId, res)) return;
    const [current] = await db.select().from(stickerShapeRecipesTable).where(and(
      eq(stickerShapeRecipesTable.id, id),
      eq(stickerShapeRecipesTable.origin, "owned"),
      eq(stickerShapeRecipesTable.authoredByStoreId, storeId),
    ));
    if (!current) {
      res.status(404).json({ error: "Owned recipe not found" });
      return;
    }
    const input = normalizeRecipeInput({ ...current, ...(req.body as Record<string, unknown>) });
    try {
      validateShapeRecipeTemplate(input);
      if (!(await ensureUniqueScope("owned", storeId, input.slug, id))) {
        res.status(409).json({ error: `A recipe with slug "${input.slug}" already exists for this store.` });
        return;
      }
      const [recipe] = await db.update(stickerShapeRecipesTable).set(input).where(eq(stickerShapeRecipesTable.id, id)).returning();
      res.json(recipeToResponse(recipe));
    } catch (error) {
      validationError(res, error);
    }
  },
);

// ── Platform starter recipe management ──────────────────────────────────────

router.get(
  "/platform/sticker-shape-recipes",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db.select().from(stickerShapeRecipesTable).orderBy(stickerShapeRecipesTable.origin, stickerShapeRecipesTable.name);
    res.json(rows.map(recipeToResponse));
  },
);

router.post(
  "/platform/sticker-shape-recipes",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const input = normalizeRecipeInput(req.body as Record<string, unknown>);
    try {
      validateShapeRecipeTemplate(input);
      if (!(await ensureUniqueScope("starter", null, input.slug))) {
        res.status(409).json({ error: `A starter recipe with slug "${input.slug}" already exists.` });
        return;
      }
      const [recipe] = await db.insert(stickerShapeRecipesTable).values({
        id: genRecipeId(),
        origin: "starter",
        authoredByStoreId: null,
        ...input,
      }).returning();
      res.status(201).json(recipeToResponse(recipe));
    } catch (error) {
      validationError(res, error);
    }
  },
);

router.post(
  "/platform/sticker-shape-recipes/preview",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const input = normalizeRecipeInput(body);
    try {
      validateShapeRecipeTemplate(input);
      const label = typeof body.label === "string" ? body.label : "Preview";
      const paletteColors = Array.isArray(body.paletteColors) ? body.paletteColors.filter((value): value is string => typeof value === "string") : [];
      const rendered = renderShapeRecipe(
        {
          svgTemplate: input.svgTemplate,
          aspectRatio: input.aspectRatio,
          takesLabel: input.takesLabel,
        },
        {
          primary: paletteColors[0] ?? "#1B2A4A",
          accent: paletteColors[1] ?? "#C87560",
          label,
          labelFontSize: computeLabelFontSize(label) * (validateShapeRecipeTemplate(input).viewBox.width / 400),
          sizeInMm: input.defaultSizeMm,
        },
      );
      const cutlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rendered.viewBox.x} ${rendered.viewBox.y} ${rendered.viewBox.width} ${rendered.viewBox.height}"><path d="${rendered.cutlinePath}" fill="none" stroke="#000000" stroke-width="0.5"/></svg>`;
      res.json({
        processedImageData: `data:image/svg+xml;base64,${Buffer.from(rendered.svg).toString("base64")}`,
        cutlineSvg,
      });
    } catch (error) {
      validationError(res, error);
    }
  },
);

router.patch(
  "/platform/sticker-shape-recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const [current] = await db.select().from(stickerShapeRecipesTable).where(eq(stickerShapeRecipesTable.id, id));
    if (!current) {
      res.status(404).json({ error: "Recipe not found" });
      return;
    }
    const input = normalizeRecipeInput({ ...current, ...(req.body as Record<string, unknown>) });
    try {
      validateShapeRecipeTemplate(input);
      if (!(await ensureUniqueScope(current.origin, current.authoredByStoreId, input.slug, id))) {
        res.status(409).json({ error: `A recipe with slug "${input.slug}" already exists in this scope.` });
        return;
      }
      const [recipe] = await db.update(stickerShapeRecipesTable).set(input).where(eq(stickerShapeRecipesTable.id, id)).returning();
      res.json(recipeToResponse(recipe));
    } catch (error) {
      validationError(res, error);
    }
  },
);

// ── Deterministic recipe rendering ──────────────────────────────────────────

router.post(
  "/stores/:storeId/stickers/render/from-recipe",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const storeId = (req.params as { storeId: string }).storeId;
    if (!sameStore(actor, storeId, res)) return;
    const body = req.body as Record<string, unknown>;
    const recipeId = typeof body.recipeId === "string" ? body.recipeId : "";
    const recipe = await getVisibleRecipe(recipeId, storeId);
    if (!recipe) {
      res.status(404).json({ error: "Recipe not found or not available to this store." });
      return;
    }
    const paletteColors = Array.isArray(body.paletteColors) ? body.paletteColors.filter((v): v is string => typeof v === "string") : [];
    const primary = paletteColors[0] ?? "#2D3748";
    const accent = paletteColors[1] ?? primary;
    const sizeInMm = body.sizeInMm == null ? recipe.defaultSizeMm : Number(body.sizeInMm);
    const label = typeof body.label === "string" ? body.label : "";
    const name = typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : `${recipe.name}${label ? ` — ${label}` : ""}`;
    if (!Number.isFinite(sizeInMm) || sizeInMm <= 0) {
      res.status(400).json({ error: "sizeInMm must be a positive number." });
      return;
    }
    try {
      const contract = validateShapeRecipeTemplate({
        name: recipe.name,
        slug: recipe.slug,
        functionType: recipe.functionType,
        svgTemplate: recipe.svgTemplate,
        aspectRatio: recipe.aspectRatio,
        defaultSizeMm: recipe.defaultSizeMm,
        takesLabel: recipe.takesLabel,
        status: recipe.status,
      });
      const rendered = renderShapeRecipe(recipe, {
        primary,
        accent,
        label,
        labelFontSize: computeLabelFontSize(label) * (contract.viewBox.width / 400),
        sizeInMm,
      });
      const cutline = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rendered.viewBox.x} ${rendered.viewBox.y} ${rendered.viewBox.width} ${rendered.viewBox.height}"><path d="${rendered.cutlinePath}" fill="none" stroke="#000000" stroke-width="0.5"/></svg>`;
      const shadowStyle = typeof body.shadowStyle === "string" ? body.shadowStyle : "none";
      const cutlineSvg = shadowStyle !== "none"
        ? adjustCutlineSvgForShadow(cutline, shadowStyle, Number(body.shadowLiftPx) || 4)
        : cutline;
      const processedImageData = `data:image/svg+xml;base64,${Buffer.from(rendered.svg).toString("base64")}`;
      const packId = typeof body.packId === "string" ? body.packId : null;
      if (packId) {
        const [pack] = await db.select({ id: stickerPacksTable.id }).from(stickerPacksTable).where(and(
          eq(stickerPacksTable.id, packId),
          eq(stickerPacksTable.origin, "owned"),
          eq(stickerPacksTable.authoredByStoreId, storeId),
        ));
        if (!pack) {
          res.status(400).json({ error: "packId must identify a pack owned by this store." });
          return;
        }
      }
      const duplicate = await db.select({ id: stickersLibraryTable.id }).from(stickersLibraryTable).where(and(
        eq(stickersLibraryTable.authoredByStoreId, storeId),
        ne(stickersLibraryTable.status, "deleted"),
        eq(stickersLibraryTable.normalizedName, name.trim().toLowerCase().replace(/\s+/g, " ")),
      ));
      if (duplicate.length) {
        res.status(409).json({ error: `A non-deleted sticker named "${name}" already exists for this store`, existingId: duplicate[0].id });
        return;
      }
      const [sticker] = await db.insert(stickersLibraryTable).values({
        id: genStickerId(),
        name,
        normalizedName: name.trim().toLowerCase().replace(/\s+/g, " "),
        tags: [recipe.functionType, recipe.slug],
        functionType: recipe.functionType,
        status: "draft",
        origin: "owned",
        authoredByStoreId: storeId,
        sizeInMm,
        exportTargets: { goodnotes: true, ink: true, cricut: true },
        generationType: "shape-recipe",
        sourceType: "generated-svg",
        recipeId: recipe.id,
        shadowStyle,
        shadowLiftPx: Number(body.shadowLiftPx) || 4,
        processedImageData,
        cutlineSvg,
      }).returning();
      if (packId) {
        await db.insert(packStickersTable).values({
          packId,
          stickerId: sticker.id,
          position: 0,
        });
      }
      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: storeId,
        action: "sticker.shape-recipe.render",
        targetType: "sticker",
        targetId: sticker.id,
        metadata: { recipeId: recipe.id, sizeInMm, label },
      });
      res.status(201).json({ sticker, processedImageData, cutlineSvg, recipeId: recipe.id });
    } catch (error) {
      if (error instanceof SvgContractError || error instanceof Error) {
        validationError(res, error);
        return;
      }
      res.status(500).json({ error: "Recipe render failed" });
    }
  },
);

export default router;