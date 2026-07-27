/**
 * Store email-settings API — custom domain registration and verification.
 *
 * Routes:
 *   GET    /store/:storeId/email-settings         — current config + DNS records
 *   PUT    /store/:storeId/email-settings         — update display name / local-part
 *   POST   /store/:storeId/email-settings/domain  — register domain with Resend
 *   POST   /store/:storeId/email-settings/domain/verify — trigger DNS check
 *   DELETE /store/:storeId/email-settings/domain  — remove custom domain
 *   GET    /super/email/deliverability            — per-store send/bounce/complaint table
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { storeEmailConfigTable, emailLogTable, storesTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { requireSuperAdmin, requireStoreAccess, resolveStoreActor } from "../middleware/requireRole";
import { registerDomain, verifyDomain, deleteDomain } from "../lib/email/domain-verify";

const router = Router();

// ── GET /store/:storeId/email-settings ────────────────────────────────────────
router.get(
  "/store/:storeId/email-settings",
  resolveStoreActor,
  requireStoreAccess("store_owner"),
  async (req, res) => {
    const { storeId } = req.params as { storeId: string };

    const [cfg] = await db
      .select()
      .from(storeEmailConfigTable)
      .where(eq(storeEmailConfigTable.storeId, storeId))
      .limit(1);

    res.json({ config: cfg ?? null });
  },
);

// ── PUT /store/:storeId/email-settings ────────────────────────────────────────
router.put(
  "/store/:storeId/email-settings",
  resolveStoreActor,
  requireStoreAccess("store_owner"),
  async (req, res) => {
    const { storeId } = req.params as { storeId: string };
    const { fromDisplayName, fromLocalPart } = req.body as {
      fromDisplayName?: string;
      fromLocalPart?: string;
    };

    await db
      .insert(storeEmailConfigTable)
      .values({
        storeId,
        fromDisplayName: fromDisplayName ?? null,
        fromLocalPart: fromLocalPart ?? null,
        domainStatus: "not_started",
        tier1Suspended: false,
      })
      .onConflictDoUpdate({
        target: storeEmailConfigTable.storeId,
        set: {
          ...(fromDisplayName !== undefined ? { fromDisplayName } : {}),
          ...(fromLocalPart  !== undefined ? { fromLocalPart }  : {}),
          updatedAt: new Date(),
        },
      });

    const [cfg] = await db
      .select()
      .from(storeEmailConfigTable)
      .where(eq(storeEmailConfigTable.storeId, storeId))
      .limit(1);

    res.json({ config: cfg });
  },
);

// ── POST /store/:storeId/email-settings/domain ───────────────────────────────
// Register a sending domain with Resend and store the DNS records to configure.
router.post(
  "/store/:storeId/email-settings/domain",
  resolveStoreActor,
  requireStoreAccess("store_owner"),
  async (req, res) => {
    const { storeId } = req.params as { storeId: string };
    const { fromDomain, fromLocalPart } = req.body as {
      fromDomain: string;
      fromLocalPart?: string;
    };

    if (!fromDomain) {
      res.status(400).json({ error: "fromDomain is required" });
      return;
    }

    let info;
    try {
      info = await registerDomain(fromDomain);
    } catch (err) {
      res.status(502).json({ error: String(err) });
      return;
    }

    await db
      .insert(storeEmailConfigTable)
      .values({
        storeId,
        fromDomain,
        fromLocalPart: fromLocalPart ?? "hello",
        domainStatus: info.status,
        resendDomainId: info.id,
        dnsRecords: info.records,
        tier1Suspended: false,
      })
      .onConflictDoUpdate({
        target: storeEmailConfigTable.storeId,
        set: {
          fromDomain,
          fromLocalPart: fromLocalPart ?? "hello",
          domainStatus: info.status,
          resendDomainId: info.id,
          dnsRecords: info.records,
          lastVerifyError: null,
          updatedAt: new Date(),
        },
      });

    res.json({ domain: info });
  },
);

// ── POST /store/:storeId/email-settings/domain/verify ────────────────────────
// Trigger Resend DNS check and sync the result back to our DB.
router.post(
  "/store/:storeId/email-settings/domain/verify",
  resolveStoreActor,
  requireStoreAccess("store_owner"),
  async (req, res) => {
    const { storeId } = req.params as { storeId: string };

    const [cfg] = await db
      .select()
      .from(storeEmailConfigTable)
      .where(eq(storeEmailConfigTable.storeId, storeId))
      .limit(1);

    if (!cfg?.resendDomainId) {
      res.status(400).json({ error: "No domain registered — call POST /domain first" });
      return;
    }

    let info;
    try {
      info = await verifyDomain(cfg.resendDomainId);
    } catch (err) {
      await db
        .update(storeEmailConfigTable)
        .set({ lastVerifyError: String(err), lastVerifyCheckAt: new Date() })
        .where(eq(storeEmailConfigTable.storeId, storeId));
      res.status(502).json({ error: String(err) });
      return;
    }

    const isVerified = info.status === "verified";
    const now = new Date();

    await db
      .update(storeEmailConfigTable)
      .set({
        domainStatus: info.status,
        dnsRecords: info.records,
        lastVerifyCheckAt: now,
        lastVerifyError: null,
        ...(isVerified ? { dkimVerifiedAt: now, spfVerifiedAt: now } : {}),
      })
      .where(eq(storeEmailConfigTable.storeId, storeId));

    res.json({ domain: info });
  },
);

// ── DELETE /store/:storeId/email-settings/domain ─────────────────────────────
router.delete(
  "/store/:storeId/email-settings/domain",
  resolveStoreActor,
  requireStoreAccess("store_owner"),
  async (req, res) => {
    const { storeId } = req.params as { storeId: string };

    const [cfg] = await db
      .select()
      .from(storeEmailConfigTable)
      .where(eq(storeEmailConfigTable.storeId, storeId))
      .limit(1);

    if (cfg?.resendDomainId) {
      await deleteDomain(cfg.resendDomainId).catch(e =>
        console.warn("[email] Resend domain delete failed (continuing):", e),
      );
    }

    await db
      .update(storeEmailConfigTable)
      .set({
        fromDomain: null,
        fromLocalPart: null,
        domainStatus: "not_started",
        resendDomainId: null,
        dnsRecords: null,
        dkimVerifiedAt: null,
        spfVerifiedAt: null,
        lastVerifyCheckAt: null,
        lastVerifyError: null,
        updatedAt: new Date(),
      })
      .where(eq(storeEmailConfigTable.storeId, storeId));

    res.json({ ok: true });
  },
);

// ── GET /super/email/deliverability ──────────────────────────────────────────
// Per-store send/bounce/complaint summary for super admins.
router.get(
  "/super/email/deliverability",
  requireSuperAdmin,
  async (_req, res) => {
    // Join storesTable with storeEmailConfigTable and aggregate email_log
    const rows = await db
      .select({
        storeId:       storesTable.id,
        storeName:     storesTable.name,
        domainStatus:  storeEmailConfigTable.domainStatus,
        fromDomain:    storeEmailConfigTable.fromDomain,
        tier1Suspended:storeEmailConfigTable.tier1Suspended,
        suspendedReason:storeEmailConfigTable.suspendedReason,
        bounceCount:   storeEmailConfigTable.bounceCount,
        complaintCount:storeEmailConfigTable.complaintCount,
        monthlyVolume: storeEmailConfigTable.monthlyVolume,
      })
      .from(storesTable)
      .leftJoin(storeEmailConfigTable, eq(storesTable.id, storeEmailConfigTable.storeId))
      .orderBy(desc(storeEmailConfigTable.monthlyVolume));

    // Recent 30-day send counts per store from email_log
    const logCounts = await db
      .select({
        storeId: emailLogTable.storeId,
        total:   sql<number>`count(*)::int`,
        sent:    sql<number>`count(*) filter (where status = 'sent' or status = 'delivered')::int`,
        failed:  sql<number>`count(*) filter (where status = 'failed')::int`,
      })
      .from(emailLogTable)
      .where(sql`created_at > now() - interval '30 days'`)
      .groupBy(emailLogTable.storeId);

    const logByStore = Object.fromEntries(logCounts.map(r => [r.storeId, r]));

    const result = rows.map(r => ({
      ...r,
      ...( logByStore[r.storeId] ?? { total: 0, sent: 0, failed: 0 }),
      bounceRate:
        (r.monthlyVolume ?? 0) > 0
          ? ((r.bounceCount ?? 0) / (r.monthlyVolume ?? 1)) * 100
          : 0,
      complaintRate:
        (r.monthlyVolume ?? 0) > 0
          ? ((r.complaintCount ?? 0) / (r.monthlyVolume ?? 1)) * 100
          : 0,
    }));

    res.json({ stores: result });
  },
);

// ── POST /super/email/stores/:storeId/unsuspend ───────────────────────────────
router.post(
  "/super/email/stores/:storeId/unsuspend",
  requireSuperAdmin,
  async (req, res) => {
    const { storeId } = req.params as { storeId: string };
    await db
      .update(storeEmailConfigTable)
      .set({ tier1Suspended: false, suspendedReason: null, updatedAt: new Date() })
      .where(eq(storeEmailConfigTable.storeId, storeId));
    res.json({ ok: true });
  },
);

export default router;
