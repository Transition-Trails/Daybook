/**
 * Support / issue-reporting routes.
 *
 * Routing:
 *   Store owner / staff  →  platform queue  (recipientScope = "platform")
 *   Buyer / unauthenticated  →  store queue  (recipientScope = storeId)
 *
 * Cross-store isolation is enforced on every read: buyers only see tickets
 * scoped to their own store, store owners only see their store's queue,
 * super admins see the platform queue and may pass ?storeId= for store queues.
 *
 * Screenshots go to object storage via the existing presigned-URL flow;
 * base64 is never stored in the ticket row.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  ticketsTable,
  ticketRepliesTable,
  plannerConfigsTable,
  generationJobsTable,
  helpContentTable,
  editionsTable,
  themesTable,
} from "@workspace/db";
import { eq, and, or, desc, inArray, sql } from "drizzle-orm";
import {
  resolveStoreActor,
  resolveStoreActorOptional,
} from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

// ── Area → keyword mapping for article relevance scoring ─────────────────────
const AREA_KEYWORDS: Record<string, string[]> = {
  "building-planner":  ["planner", "generation", "generate", "build", "preview", "studio", "font", "template"],
  "stickers-packs":    ["sticker", "cutout", "halo", "cut path", "svg", "index sheet", "pack"],
  "exported-pdf":      ["pdf", "export", "link", "page size", "e-ink", "eink", "print", "file"],
  "drive-sync":        ["drive", "sync", "google", "folder", "permission", "save", "missing"],
  "my-storefront":     ["storefront", "listing", "theme", "publish", "edition", "store"],
  "account-billing":   ["billing", "plan", "subscription", "seat", "invoice", "payment"],
  "opening-planner":   ["open", "goodnotes", "notability", "noteshelf", "import", "app"],
  "links-not-working": ["link", "tab", "date", "navigation", "jump", "hyperlink"],
  "using-stickers":    ["sticker", "import", "resize", "place", "cut", "cutout"],
  "printing-cutting":  ["print", "cut", "cricut", "silhouette", "registration", "colour"],
  "something-missing": ["download", "missing", "file", "link", "arrived", "delivery"],
  "something-else":    [],
};

// ── GET /support/articles ─────────────────────────────────────────────────────
// Live article matching — called as area + symptoms change.
// No auth required; scope param narrows to store articles when supplied.
router.get(
  "/support/articles",
  resolveStoreActorOptional,
  async (req: Request, res: Response): Promise<void> => {
    const { area = "", symptoms = "", scope = "platform" } = req.query as {
      area?: string;
      symptoms?: string;
      scope?: string;
    };

    try {
      const areaTerms = AREA_KEYWORDS[area] ?? [];
      const symptomTerms = symptoms
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const allTerms = [...new Set([...areaTerms, ...symptomTerms])];

      if (allTerms.length === 0) {
        res.json({ articles: [] });
        return;
      }

      const scopeFilter =
        scope !== "platform"
          ? or(
              eq(helpContentTable.scope, "platform"),
              eq(helpContentTable.scope, scope),
            )
          : eq(helpContentTable.scope, "platform");

      const rawArticles = await db
        .select({
          id: helpContentTable.id,
          title: helpContentTable.title,
          body: helpContentTable.body,
          category: helpContentTable.category,
        })
        .from(helpContentTable)
        .where(and(eq(helpContentTable.status, "live"), scopeFilter))
        .limit(60);

      const scored = rawArticles
        .map((article) => {
          const hay = `${article.title} ${article.body} ${article.category}`.toLowerCase();
          const titleHay = article.title.toLowerCase();
          const catHay = article.category.toLowerCase();

          let score = 0;
          let titleHit = false;

          for (const term of allTerms) {
            if (titleHay.includes(term)) {
              score += 3;
              if (symptomTerms.includes(term)) titleHit = true;
            } else if (catHay.includes(term)) {
              score += 2;
            } else if (hay.includes(term)) {
              score += 1;
            }
          }

          const confidence: "EXACT MATCH" | "LIKELY" | "RELATED" | null =
            titleHit ? "EXACT MATCH" : score >= 4 ? "LIKELY" : score > 0 ? "RELATED" : null;

          return { ...article, score, confidence };
        })
        .filter((a) => a.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((a) => ({
          id: a.id,
          title: a.title,
          excerpt:
            a.body.slice(0, 150).trimEnd() +
            (a.body.length > 150 ? "…" : ""),
          confidence: a.confidence,
        }));

      res.json({ articles: scored });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── GET /support/recent-activity ──────────────────────────────────────────────
// Last 6 planner builds for the authenticated user — enriched for Step 2 display.
router.get(
  "/support/recent-activity",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.query as { storeId?: string };

    try {
      const whereClause = storeId
        ? and(
            eq(plannerConfigsTable.userId, actor.userId),
            eq(plannerConfigsTable.storeId, storeId),
          )
        : eq(plannerConfigsTable.userId, actor.userId);

      const builds = await db
        .select()
        .from(plannerConfigsTable)
        .where(whereClause)
        .orderBy(desc(plannerConfigsTable.updatedAt))
        .limit(6);

      // Enrich: edition names
      const editionIds = [
        ...new Set(builds.map((b) => b.editionId).filter(Boolean) as string[]),
      ];
      const editions =
        editionIds.length > 0
          ? await db
              .select({ id: editionsTable.id, name: editionsTable.name })
              .from(editionsTable)
              .where(inArray(editionsTable.id, editionIds))
          : [];
      const editionMap = Object.fromEntries(editions.map((e) => [e.id, e]));

      // Enrich: theme names
      const themeIds = [
        ...new Set(
          builds.map((b) => b.style?.themeId).filter(Boolean) as string[],
        ),
      ];
      const themes =
        themeIds.length > 0
          ? await db
              .select({ id: themesTable.id, name: themesTable.name })
              .from(themesTable)
              .where(inArray(themesTable.id, themeIds))
          : [];
      const themeMap = Object.fromEntries(themes.map((t) => [t.id, t]));

      // Enrich: last generation job
      const plannerIds = builds.map((b) => b.id);
      const jobs =
        plannerIds.length > 0
          ? await db
              .select()
              .from(generationJobsTable)
              .where(inArray(generationJobsTable.plannerId, plannerIds))
              .orderBy(desc(generationJobsTable.createdAt))
              .limit(plannerIds.length * 2)
          : [];
      const lastJobMap: Record<string, (typeof jobs)[0]> = {};
      for (const j of jobs) {
        if (!lastJobMap[j.plannerId]) lastJobMap[j.plannerId] = j;
      }

      const result = builds.map((b, i) => {
        const edition = b.editionId ? editionMap[b.editionId] : null;
        const theme = b.style?.themeId ? themeMap[b.style.themeId] : null;
        const lastJob = lastJobMap[b.id];

        const device =
          b.output?.einkDevice
            ? cap(b.output.einkDevice)
            : b.style?.size ?? "iPad 4:3";

        const meta = b.generatedAt
          ? `Generated ${ago(new Date(b.generatedAt))} · ${b.style?.size ?? "iPad 4:3"} · ${device}`
          : `Created ${ago(new Date(b.createdAt))} · not yet generated`;

        return {
          id: b.id,
          name: edition?.name ?? "Untitled planner",
          type: b.productType,
          generatedAt: b.generatedAt,
          meta,
          badge: i === 0 ? "MOST RECENT" : null,
          // Passed to diagnostics card
          style: b.style,
          setup: b.setup,
          output: b.output,
          storeId: b.storeId,
          themeName: theme?.name ?? b.style?.themeId ?? null,
          editionName: edition?.name ?? null,
          lastJobStatus: lastJob?.status ?? null,
          lastJobError: lastJob?.errorMessage ?? null,
        };
      });

      res.json({ builds: result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── GET /support/tickets/mine ─────────────────────────────────────────────────
router.get(
  "/support/tickets/mine",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    try {
      const tickets = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.reporterUserId, actor.userId))
        .orderBy(desc(ticketsTable.createdAt))
        .limit(20);
      res.json({ tickets });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── GET /support/inbox ────────────────────────────────────────────────────────
// Super admin: all platform tickets.
// Store owner/staff: pass ?storeId= to see that store's buyer queue.
router.get(
  "/support/inbox",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId, status } = req.query as {
      storeId?: string;
      status?: string;
    };

    try {
      let scope: string;

      if (actor.isSuperAdmin && !storeId) {
        scope = "platform";
      } else {
        const sid = storeId ?? actor.storeId;
        if (!sid) {
          res.status(400).json({ error: "storeId required" });
          return;
        }
        // Must be super admin OR store_owner/staff of that store
        if (
          !actor.isSuperAdmin &&
          (actor.storeId !== sid ||
            !["store_owner", "store_staff"].includes(actor.storeRole ?? ""))
        ) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
        scope = sid;
      }

      const where = status
        ? and(
            eq(ticketsTable.recipientScope, scope),
            eq(ticketsTable.status, status),
          )
        : eq(ticketsTable.recipientScope, scope);

      const tickets = await db
        .select()
        .from(ticketsTable)
        .where(where)
        .orderBy(desc(ticketsTable.createdAt))
        .limit(50);

      // Reply counts
      const ids = tickets.map((t) => t.id);
      const counts =
        ids.length > 0
          ? await db
              .select({
                ticketId: ticketRepliesTable.ticketId,
                count: sql<number>`count(*)::int`,
              })
              .from(ticketRepliesTable)
              .where(inArray(ticketRepliesTable.ticketId, ids))
              .groupBy(ticketRepliesTable.ticketId)
          : [];
      const countMap = Object.fromEntries(counts.map((c) => [c.ticketId, c.count]));

      res.json({
        tickets: tickets.map((t) => ({ ...t, replyCount: countMap[t.id] ?? 0 })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── GET /support/tickets/:id ──────────────────────────────────────────────────
router.get(
  "/support/tickets/:id",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };

    try {
      const [ticket] = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.id, id))
        .limit(1);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      const canView =
        ticket.reporterUserId === actor.userId ||
        (ticket.recipientScope === "platform" && actor.isSuperAdmin) ||
        (ticket.recipientScope !== "platform" &&
          actor.storeId === ticket.recipientScope &&
          ["store_owner", "store_staff"].includes(actor.storeRole ?? ""));

      if (!canView) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const replies = await db
        .select()
        .from(ticketRepliesTable)
        .where(eq(ticketRepliesTable.ticketId, id))
        .orderBy(ticketRepliesTable.createdAt);

      res.json({ ticket, replies });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── POST /support/tickets ─────────────────────────────────────────────────────
router.post(
  "/support/tickets",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const {
      area,
      symptoms = [],
      body,
      buildRef,
      storeId,
      screenshotRefs = [],
      extraDiagnostics = {},
    } = req.body as {
      area: string;
      symptoms?: string[];
      body?: string;
      buildRef?: string;
      storeId?: string;
      screenshotRefs?: string[];
      extraDiagnostics?: Record<string, unknown>;
    };

    if (!area?.trim()) {
      res.status(400).json({ error: "area is required" });
      return;
    }

    try {
      const isOwnerTier =
        actor.isSuperAdmin ||
        actor.storeRole === "store_owner" ||
        actor.storeRole === "store_staff";

      const reporterRole = actor.isSuperAdmin
        ? "super_admin"
        : (actor.storeRole ?? "buyer");

      const recipientScope = isOwnerTier
        ? "platform"
        : (storeId ?? actor.storeId ?? "platform");

      // Assemble diagnostics from the selected build
      let diagnostics: Record<string, unknown> = { ...extraDiagnostics };
      if (buildRef) {
        try {
          const [build] = await db
            .select()
            .from(plannerConfigsTable)
            .where(
              and(
                eq(plannerConfigsTable.id, buildRef),
                eq(plannerConfigsTable.userId, actor.userId),
              ),
            )
            .limit(1);

          if (build) {
            const [lastJob] = await db
              .select()
              .from(generationJobsTable)
              .where(eq(generationJobsTable.plannerId, buildRef))
              .orderBy(desc(generationJobsTable.createdAt))
              .limit(1);

            const themeId = build.style?.themeId;
            const [theme] = themeId
              ? await db
                  .select({ name: themesTable.name })
                  .from(themesTable)
                  .where(eq(themesTable.id, themeId))
                  .limit(1)
              : [null];

            const editionId = build.editionId;
            const [edition] = editionId
              ? await db
                  .select({ name: editionsTable.name })
                  .from(editionsTable)
                  .where(eq(editionsTable.id, editionId))
                  .limit(1)
              : [null];

            diagnostics = {
              ...diagnostics,
              buildId: build.id,
              productType: build.productType,
              editionName: edition?.name ?? null,
              themeName: theme?.name ?? null,
              paletteId: build.style?.paletteId ?? null,
              size: build.style?.size ?? null,
              einkDevice: build.output?.einkDevice ?? null,
              weekStart: build.setup?.weekStart ?? null,
              monthCount: build.setup?.monthCount ?? null,
              datingMode: build.setup?.datingMode ?? null,
              generatedAt: build.generatedAt,
              lastJobStatus: lastJob?.status ?? null,
              lastJobError: lastJob?.errorMessage ?? null,
            };
          }
        } catch {
          // Non-fatal — diagnostics failure must never block ticket creation
        }
      }

      const [ticket] = await db
        .insert(ticketsTable)
        .values({
          reporterUserId: actor.userId,
          reporterRole,
          recipientScope,
          storeId: storeId ?? actor.storeId ?? null,
          area,
          symptoms,
          body: body?.trim() || null,
          buildRef: buildRef ?? null,
          screenshotRefs,
          diagnostics,
          status: "open",
        })
        .returning();

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: reporterRole,
        scope: recipientScope,
        action: "ticket.create",
        targetType: "ticket",
        targetId: ticket.id,
        metadata: {
          area,
          tier: isOwnerTier ? "owner" : "buyer",
          symptomCount: symptoms.length,
          hasBuildRef: !!buildRef,
          hasScreenshot: screenshotRefs.length > 0,
        },
      });

      res.status(201).json({ ticket });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── POST /support/tickets/:id/replies ─────────────────────────────────────────
router.post(
  "/support/tickets/:id/replies",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };
    const { body } = req.body as { body?: string };

    if (!body?.trim()) {
      res.status(400).json({ error: "body is required" });
      return;
    }

    try {
      const [ticket] = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.id, id))
        .limit(1);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      const isReporter = ticket.reporterUserId === actor.userId;
      const isScopeAdmin =
        (ticket.recipientScope === "platform" && actor.isSuperAdmin) ||
        (ticket.recipientScope !== "platform" &&
          actor.storeId === ticket.recipientScope &&
          ["store_owner", "store_staff"].includes(actor.storeRole ?? ""));

      if (!isReporter && !isScopeAdmin) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const authorRole =
        actor.isSuperAdmin
          ? "super_admin"
          : (actor.storeRole ?? "buyer");

      const [reply] = await db
        .insert(ticketRepliesTable)
        .values({
          ticketId: id,
          authorUserId: actor.userId,
          authorRole,
          body: body.trim(),
        })
        .returning();

      if (isScopeAdmin) {
        await db
          .update(ticketsTable)
          .set({ status: "replied", updatedAt: new Date() })
          .where(eq(ticketsTable.id, id));
      }

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: authorRole,
        scope: ticket.recipientScope,
        action: "ticket.reply",
        targetType: "ticket",
        targetId: id,
        metadata: { replyId: reply.id },
      });

      res.status(201).json({ reply });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── PATCH /support/tickets/:id/status ─────────────────────────────────────────
router.patch(
  "/support/tickets/:id/status",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: string };
    const VALID = ["open", "replied", "fixed", "closed"] as const;

    if (!status || !VALID.includes(status as (typeof VALID)[number])) {
      res.status(400).json({ error: `status must be one of: ${VALID.join(", ")}` });
      return;
    }

    try {
      const [ticket] = await db
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.id, id))
        .limit(1);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      const canUpdate =
        (ticket.recipientScope === "platform" && actor.isSuperAdmin) ||
        (ticket.recipientScope !== "platform" &&
          actor.storeId === ticket.recipientScope &&
          ["store_owner", "store_staff"].includes(actor.storeRole ?? ""));

      if (!canUpdate) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      await db
        .update(ticketsTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(ticketsTable.id, id));

      await writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.isSuperAdmin ? "super_admin" : (actor.storeRole ?? "user"),
        scope: ticket.recipientScope,
        action: "ticket.status_change",
        targetType: "ticket",
        targetId: id,
        metadata: { fromStatus: ticket.status, toStatus: status },
      });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function ago(date: Date): string {
  const ms = Date.now() - date.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(m, 1)} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 8) return `${d} day${d === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default router;
