/**
 * Platform-scoped product recipe routes (super_admin only).
 *
 * GET    /platform/recipes           — list all recipes (non-retired by default)
 * POST   /platform/recipes           — create a recipe
 * GET    /platform/recipes/stats     — live count / draft / ships-next-month / renewals
 * GET    /platform/recipes/:id       — get one
 * PATCH  /platform/recipes/:id       — edit fields
 * POST   /platform/recipes/:id/publish — status draft → live
 * POST   /platform/recipes/:id/retire  — status live  → retired
 * DELETE /platform/recipes/:id       — hard-delete draft (soft-retire if live)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { productRecipesTable } from "@workspace/db";
import { eq, sql, and, not } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";
import { callAi } from "../lib/ai-proxy";

const router = Router();

function newId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// ── GET /platform/recipes/stats ──────────────────────────────────────────────

router.get(
  "/platform/recipes/stats",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db.select().from(productRecipesTable);
    const now = new Date();
    const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
    const nextYear  = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();

    const live      = rows.filter(r => r.status === "live").length;
    const draft     = rows.filter(r => r.status === "draft").length;
    const shipsNext = rows.filter(r => {
      const rel = r.release as { month?: number; year?: number } | null;
      return r.status === "draft" && rel?.month === nextMonth && rel?.year === nextYear;
    }).length;
    // renewals citing new recipes: live recipes published in the last 30 days (proxy)
    const renewals  = rows.filter(r => {
      return r.status === "live" && r.buildCount > 0 &&
        r.updatedAt && (Date.now() - new Date(r.updatedAt).getTime()) < 30 * 86400_000;
    }).length;

    res.json({ live, draft, shipsNext, renewalsCitingNew: renewals });
  },
);

// ── GET /platform/recipes ────────────────────────────────────────────────────

router.get(
  "/platform/recipes",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const includeRetired = req.query.retired === "1";
    const rows = await db.select().from(productRecipesTable);
    const filtered = includeRetired ? rows : rows.filter(r => r.status !== "retired");
    res.json(filtered);
  },
);

// ── POST /platform/recipes ───────────────────────────────────────────────────

router.post(
  "/platform/recipes",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const body = req.body as {
      name: string;
      category: string;
      decisionCard?: unknown;
      parts?: string[];
      physicalPath?: unknown;
      claudeBrief?: unknown;
      release?: unknown;
      status?: string;
    };

    if (!body.name?.trim() || !body.category?.trim()) {
      res.status(400).json({ error: "name and category are required" });
      return;
    }

    const [recipe] = await db.insert(productRecipesTable).values({
      id:           newId(),
      name:         body.name.trim(),
      category:     body.category.trim(),
      decisionCard: body.decisionCard ?? null,
      parts:        body.parts ?? [],
      physicalPath: body.physicalPath ?? null,
      claudeBrief:  body.claudeBrief ?? null,
      release:      body.release ?? null,
      status:       (body.status === "live" ? "live" : "draft"),
      buildCount:   0,
    }).returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.create",
      targetType:  "product_recipe",
      targetId:    recipe.id,
      metadata:    { name: recipe.name },
    });

    res.status(201).json(recipe);
  },
);

// ── POST /platform/recipes/draft-from-brief ──────────────────────────────────
// Calls Claude to propose a recipe (type, parts, decision card) from a plain-
// language product description.  Also flags genuine engine gaps.

const DRAFT_SYSTEM_PROMPT = `You are a product recipe architect for Daybook, a platform that generates PDF-based digital planners, journals, sticker packs, and paper-adjacent products for GoodNotes, Notability, and Noteshelf.

A "recipe" defines: the product TYPE, which engine PARTS are on, and the single DECISION the buyer makes at checkout.

## Engine capabilities (authoritative — nothing outside this list exists)

### Supported page sizes (page engine)
A5 (148×210 mm), B6 (125×176 mm), Personal/Filofax (95×171 mm), Half letter (140×216 mm), Letter (216×279 mm), iPad 4:3 (~197×264 mm).
NOT supported: phone portrait (≈58×126 mm or ≈68×147 mm), landscape tablet, any custom trim. Phone-size requires a new profile to be built first.

### Parts and hard constraints
- page recipes:      Layouts — grids, lines, dot, blank. Standard sizes only; no phone trim.
- date engine:       Dated and undated modes, real weekday columns, month rollover. Planner/memory/solo only.
- hyperlink layer:   Internal PDF links. Requires ~30 mm margin. At widths <100 mm there is no room.
- tab rail:          Edge tabs (right or top). Requires ≥35 mm tab-edge margin. NOT viable at phone width (<100 mm wide).
- trackers:          Habit grids, mood logs, run logs, progress bars.
- photo layouts:     Collage frames. Standard page sizes only; no phone trim support.
- imposition:        US Letter (8.5×11") home-printing tile. One sheet size only.
- index sheet:       Auto-generated visual contents page.
- prompt decks:      Curated question/prompt sets for journaling, RPG, reflection.
- cut paths:         SVG Cricut/Silhouette cut lines. Letter and A4 sheet only.

### What does NOT exist yet (common gap triggers)
- Phone-portrait page-size profile (any trim narrower than ~100 mm)
- Landscape tablet trim
- Any custom page size beyond the 6 listed
- Top-bar navigation alternative to the edge tab rail
- A-series sizes smaller than A5

## Product types and their part sets
| Type     | Default on                                              | Available                          | Never                                           |
|----------|---------------------------------------------------------|------------------------------------|-------------------------------------------------|
| planner  | page recipes, date engine, hyperlink layer, tab rail, trackers | photo layouts, imposition, index sheet | prompt decks, cut paths             |
| journal  | page recipes, tab rail, index sheet                     | prompt decks, trackers, imposition | date engine, hyperlink layer, cut paths, photo layouts |
| memory   | photo layouts, page recipes, index sheet                | tab rail, imposition, trackers     | date engine, hyperlink layer, prompt decks, cut paths  |
| solo     | prompt decks, trackers, page recipes                    | tab rail, index sheet, imposition  | date engine, hyperlink layer, photo layouts, cut paths |
| stickers | cut paths, index sheet, imposition                      | (none)                             | page recipes, date engine, hyperlink layer, tab rail, photo layouts, prompt decks, trackers |
| inserts  | page recipes, trackers                                  | hyperlink layer, photo layouts, index sheet | date engine, tab rail, prompt decks, cut paths, imposition |

## Output — respond ONLY with valid JSON, no markdown, no prose outside the JSON

{
  "productType": "planner" | "journal" | "memory" | "solo" | "stickers" | "inserts",
  "partsOn": ["key", ...],
  "partsOff": [{"key": "key", "reason": "one sentence"}],
  "decisionCard": {
    "prompt": "Question?",
    "optionA": {"label": "Label", "consequence": "Full consequence sentence."},
    "optionB": {"label": "Label", "consequence": "Full consequence sentence."}
  },
  "reading": {
    "type": "Type name — one sentence explaining the classification.",
    "partsOn": "Part, part, part — one sentence.",
    "partsOff": "Part — reason. Part — reason.",
    "question": "One sentence explaining why this is the right first question."
  },
  "gaps": [
    {
      "title": "Short gap title",
      "explanation": "Concrete explanation of what is missing and what needs to be built.",
      "severity": "Blocks release" | "Needs a decision"
    }
  ]
}

RULES:
1. Only use part keys from: page recipes, date engine, hyperlink layer, tab rail, trackers, photo layouts, imposition, index sheet, prompt decks, cut paths.
2. partsOff: only list parts that are in the Available column for the chosen type but you deliberately exclude.
3. gaps: include ONLY real technical engine gaps — things the described product genuinely needs that the engine cannot currently do. A standard A5 planner has zero gaps. A phone-sized planner has a Blocks-release gap for the missing phone-trim profile.
4. If no gaps: "gaps": [].`;

router.post(
  "/platform/recipes/draft-from-brief",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { brief } = req.body as { brief?: string };
    if (!brief?.trim()) {
      res.status(400).json({ error: "brief is required" });
      return;
    }

    try {
      const result = await callAi(
        [{ role: "user", content: brief.trim() }],
        "claude",
        DRAFT_SYSTEM_PROMPT,
      );

      // Strip any accidental markdown fences before parsing
      const cleaned = result.content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const draft = JSON.parse(cleaned) as {
        productType: string;
        partsOn: string[];
        partsOff: Array<{ key: string; reason: string }>;
        decisionCard: { prompt: string; optionA: { label: string; consequence: string }; optionB: { label: string; consequence: string } };
        reading: { type: string; partsOn: string; partsOff: string; question: string };
        gaps: Array<{ title: string; explanation: string; severity: string }>;
      };

      res.json(draft);
    } catch (err) {
      const msg = (err as Error).message;
      console.error("[draft-from-brief] Error:", msg);
      res.status(500).json({ error: `Draft failed: ${msg}` });
    }
  },
);

// ── GET /platform/recipes/:id ────────────────────────────────────────────────

router.get(
  "/platform/recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const [recipe] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!recipe) { res.status(404).json({ error: "Recipe not found" }); return; }
    res.json(recipe);
  },
);

// ── PATCH /platform/recipes/:id ──────────────────────────────────────────────

router.patch(
  "/platform/recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }

    const body = req.body as Partial<{
      name: string;
      category: string;
      decisionCard: unknown;
      parts: string[];
      physicalPath: unknown;
      claudeBrief: unknown;
      release: unknown;
    }>;

    const [updated] = await db
      .update(productRecipesTable)
      .set({
        ...(body.name         !== undefined && { name:         body.name }),
        ...(body.category     !== undefined && { category:     body.category }),
        ...(body.decisionCard !== undefined && { decisionCard: body.decisionCard }),
        ...(body.parts        !== undefined && { parts:        body.parts }),
        ...(body.physicalPath !== undefined && { physicalPath: body.physicalPath }),
        ...(body.claudeBrief  !== undefined && { claudeBrief:  body.claudeBrief }),
        ...(body.release      !== undefined && { release:      body.release }),
        updatedAt: new Date(),
      })
      .where(eq(productRecipesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.edit",
      targetType:  "product_recipe",
      targetId:    id,
      metadata:    { name: updated.name },
    });

    res.json(updated);
  },
);

// ── POST /platform/recipes/:id/publish ──────────────────────────────────────

router.post(
  "/platform/recipes/:id/publish",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }
    if (existing.status === "retired") { res.status(409).json({ error: "Cannot publish a retired recipe" }); return; }

    // Block publication when Claude flagged unresolved "Blocks release" engine gaps.
    const briefGaps = ((existing.claudeBrief as Record<string, unknown> | null)?.engineGaps ?? []) as Array<{ severity?: string }>;
    const hasBlocker = briefGaps.some(g => g.severity === "Blocks release");
    if (hasBlocker) {
      res.status(409).json({
        error: "Cannot publish: recipe has unresolved 'Blocks release' engine gaps. Build the required engine features first, then remove the gaps from the recipe.",
        code: "ENGINE_GAPS_BLOCK_RELEASE",
      });
      return;
    }

    const [updated] = await db
      .update(productRecipesTable)
      .set({ status: "live", updatedAt: new Date() })
      .where(eq(productRecipesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.publish",
      targetType:  "product_recipe",
      targetId:    id,
      metadata:    { name: updated.name },
    });

    res.json(updated);
  },
);

// ── POST /platform/recipes/:id/retire ───────────────────────────────────────

router.post(
  "/platform/recipes/:id/retire",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }

    const [updated] = await db
      .update(productRecipesTable)
      .set({ status: "retired", updatedAt: new Date() })
      .where(eq(productRecipesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole:   "super_admin",
      scope:       "platform",
      action:      "recipe.retire",
      targetType:  "product_recipe",
      targetId:    id,
      metadata:    { name: updated.name },
    });

    res.json(updated);
  },
);

// ── DELETE /platform/recipes/:id ─────────────────────────────────────────────

router.delete(
  "/platform/recipes/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    const [existing] = await db.select().from(productRecipesTable).where(eq(productRecipesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Recipe not found" }); return; }

    // Live recipes get soft-retired; drafts can be hard-deleted
    if (existing.status === "live") {
      await db.update(productRecipesTable)
        .set({ status: "retired", updatedAt: new Date() })
        .where(eq(productRecipesTable.id, id));
      await writeAudit(db, {
        actorUserId: actor.userId, actorRole: "super_admin", scope: "platform",
        action: "recipe.retire", targetType: "product_recipe", targetId: id,
        metadata: { name: existing.name, via: "delete" },
      });
      res.json({ ok: true, status: "retired" });
    } else {
      await db.delete(productRecipesTable).where(eq(productRecipesTable.id, id));
      await writeAudit(db, {
        actorUserId: actor.userId, actorRole: "super_admin", scope: "platform",
        action: "recipe.delete", targetType: "product_recipe", targetId: id,
        metadata: { name: existing.name },
      });
      res.json({ ok: true, status: "deleted" });
    }
  },
);

// ── POST /platform/recipes/:id/increment-build ──────────────────────────────
// Called by generation routes to track build usage per recipe.

router.post(
  "/platform/recipes/:id/increment-build",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    await db
      .update(productRecipesTable)
      .set({ buildCount: sql`${productRecipesTable.buildCount} + 1` })
      .where(eq(productRecipesTable.id, id));
    res.json({ ok: true });
  },
);

export default router;
