/**
 * Store Profile & Voice routes (store-scoped, audited)
 *
 * GET  /stores/:storeId/profile   — owner + staff + super_admin (read)
 * PUT  /stores/:storeId/profile   — owner + super_admin (upsert)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { storeProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStoreAccess } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

// ── GET /stores/:storeId/profile ─────────────────────────────────────────────

router.get(
  "/stores/:storeId/profile",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const { storeId } = req.params as { storeId: string };
    const [profile] = await db
      .select()
      .from(storeProfilesTable)
      .where(eq(storeProfilesTable.storeId, storeId));

    // Return empty shell if not yet created — caller treats null facts/voice as "not set up"
    res.json(profile ?? { storeId, facts: {}, voice: {} });
  },
);

// ── PUT /stores/:storeId/profile ─────────────────────────────────────────────
// Full upsert — owner or super_admin only.

router.put(
  "/stores/:storeId/profile",
  requireStoreAccess("store_owner"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    const { facts, voice } = req.body as {
      facts?: Record<string, unknown>;
      voice?: Record<string, unknown>;
    };

    if (!facts && !voice) {
      res.status(400).json({ error: "facts or voice (or both) required" });
      return;
    }

    // Fetch existing to merge — we PATCH semantically even though the route is PUT
    const [existing] = await db
      .select()
      .from(storeProfilesTable)
      .where(eq(storeProfilesTable.storeId, storeId));

    const mergedFacts = { ...(existing?.facts ?? {}), ...(facts ?? {}) };
    const mergedVoice = { ...(existing?.voice ?? {}), ...(voice ?? {}) };

    const [profile] = await db
      .insert(storeProfilesTable)
      .values({
        storeId,
        facts: mergedFacts as import("@workspace/db").StoreProfileFacts,
        voice: mergedVoice as import("@workspace/db").StoreProfileVoice,
      })
      .onConflictDoUpdate({
        target: storeProfilesTable.storeId,
        set: {
          facts: mergedFacts as import("@workspace/db").StoreProfileFacts,
          voice: mergedVoice as import("@workspace/db").StoreProfileVoice,
          updatedAt: new Date(),
        },
      })
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: storeId,
      action: existing ? "store.profile.update" : "store.profile.create",
      targetType: "store_profile",
      targetId: storeId,
      metadata: { hasFacts: !!facts, hasVoice: !!voice },
    });

    res.json(profile);
  },
);

export default router;
