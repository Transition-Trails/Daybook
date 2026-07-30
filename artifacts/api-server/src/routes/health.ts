import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getWarmupStatus } from "../lib/font-warmup";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * GET /healthz/fonts
 *
 * Returns the font warmup status after server startup.
 * No authentication required — this is a diagnostic/smoke-test endpoint.
 *
 * Response shape:
 *   phase          "pending" | "running" | "done" | "error"
 *   startedAt      ISO timestamp or null
 *   completedAt    ISO timestamp or null
 *   familiesFound  number of font families found in live themes
 *   pairsTotal     total (family × weight) pairs scheduled
 *   pairsLoaded    pairs successfully loaded from bundle/disk/network
 *   pairsFailed    pairs that returned null (network failure / bad format)
 *   familiesCached families currently in the in-process Map cache
 *   fallbacks      families falling back to Helvetica/TimesRoman
 *   bundleGaps     UI-reachable families with no bundled WOFF on disk
 *   ok             true when phase==="done" && pairsFailed===0 && fallbacks.length===0
 *   errorMessage   set when phase==="error"
 *
 * HTTP status:
 *   200  phase==="done" with no failures (fully healthy)
 *   206  phase==="done" but some pairs failed or fallbacks are active
 *   202  phase==="pending" or "running" (warmup in progress)
 *   500  phase==="error"
 */
router.get("/healthz/fonts", (_req, res) => {
  const status = getWarmupStatus();

  const ok =
    status.phase === "done" &&
    status.pairsFailed === 0 &&
    status.fallbacks.length === 0;

  const body = {
    ...status,
    ok,
  };

  let httpStatus: number;
  if (status.phase === "error") {
    httpStatus = 500;
  } else if (status.phase === "pending" || status.phase === "running") {
    httpStatus = 202;
  } else if (!ok) {
    httpStatus = 206; // done but degraded
  } else {
    httpStatus = 200;
  }

  res.status(httpStatus).json(body);
});

export default router;
