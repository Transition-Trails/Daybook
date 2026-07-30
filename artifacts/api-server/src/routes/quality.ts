/**
 * Quality-check + audit-log API (super_admin only).
 *
 * GET  /quality-check            — run all checks, return full report
 * GET  /quality-check/:kind/:id  — run checks for a single item
 * GET  /audit-log                — recent audit entries, filterable by action/scope/actor
 *
 * Used by the quality-checker and audit-coverage Playwright invariant specs.
 */
import { Router, type IRouter, type Request } from "express";
import { requireSuperAdmin } from "../middleware/requireRole";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  runFullQualityCheck,
  checkThemes,
  checkPacks,
  checkStickerAssets,
  checkEditions,
  checkRecipes,
  checkPlannerConfigs,
  checkFontCoverage,
} from "../lib/quality-checker";

const router: IRouter = Router();

// ── Full report ───────────────────────────────────────────────────────────────

router.get("/quality-check", requireSuperAdmin, async (_req, res) => {
  try {
    const report = await runFullQualityCheck();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "quality check failed", detail: String(err) });
  }
});

// ── Single-item check ─────────────────────────────────────────────────────────

router.get("/quality-check/:kind/:id", requireSuperAdmin, async (req, res) => {
  const { kind, id } = req.params as { kind: string; id: string };
  try {
    let results;
    switch (kind) {
      case "theme":          results = await checkThemes([id]); break;
      case "pack":           results = await checkPacks([id]); break;
      case "sticker_asset":  results = await checkStickerAssets([id]); break;
      case "edition":        results = await checkEditions([id]); break;
      case "recipe":         results = await checkRecipes([id]); break;
      case "planner_config": results = await checkPlannerConfigs([id]); break;
      case "font_coverage":  results = checkFontCoverage(); break;
      default:
        res.status(400).json({ error: `unknown kind: ${kind}` });
        return;
    }
    if (!results.length) {
      res.status(404).json({ error: "item not found" });
      return;
    }
    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: "check failed", detail: String(err) });
  }
});

// ── Audit log query ───────────────────────────────────────────────────────────

router.get("/audit-log", requireSuperAdmin, async (req: Request, res) => {
  try {
    const { action, scope, actorUserId, since, limit } = req.query as Record<string, string>;
    const conditions = [];
    if (action)       conditions.push(eq(auditLogTable.action, action));
    if (scope)        conditions.push(eq(auditLogTable.scope, scope));
    if (actorUserId)  conditions.push(eq(auditLogTable.actorUserId, actorUserId));
    if (since)        conditions.push(gte(auditLogTable.createdAt, new Date(since)));

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(Number(limit ?? 100));

    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: "audit log query failed", detail: String(err) });
  }
});

export default router;
