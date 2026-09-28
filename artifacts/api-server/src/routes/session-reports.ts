import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireSuperAdmin } from "../middleware/requireRole";
import { getSessionReport, listSessionReports } from "../lib/worldsmith/mcp-session-reports";

const router: IRouter = Router();
const listParams = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

router.get("/worldsmith/session-reports", requireSuperAdmin, async (req, res) => {
  const parsed = listParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid pagination" }); return; }
  try {
    res.json(await listSessionReports(parsed.data.limit, parsed.data.offset));
  } catch (err) {
    req.log.error({ err }, "Session report list failed");
    res.status(500).json({ error: "Could not list session reports" });
  }
});

router.get("/worldsmith/session-reports/:id", requireSuperAdmin, async (req, res) => {
  try {
    const report = await getSessionReport(req.params.id as string);
    if (!report) { res.status(404).json({ error: "Session report not found" }); return; }
    res.json({ report });
  } catch (err) {
    req.log.error({ err }, "Session report lookup failed");
    res.status(500).json({ error: "Could not load session report" });
  }
});

export default router;