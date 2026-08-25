import app from "./app";
import { logger } from "./lib/logger";
import { validateImageGenerationConfiguration } from "./lib/worldsmith/image-generation";
import { validateWorldsmithPreviewGenerationConfiguration } from "./lib/worldsmith/image-targets";
import { warmFontCache } from "./lib/font-warmup";
import { schedulePeriodicDomainVerify } from "./lib/email/domain-recheck";
import { recoverStaleRuns } from "./lib/worldsmith/run-repository";
import { checkBillingConfiguration } from "./lib/billing-config";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

validateImageGenerationConfiguration();
validateWorldsmithPreviewGenerationConfiguration();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Report a missing Stripe Price ID immediately, but never block the API from
  // serving health checks or accepting a later configuration fix.
  void checkBillingConfiguration();

  // Pre-fetch Google Font binaries for all live-theme font families so that
  // the very first planner export on a fresh container pays zero network latency.
  // Fire-and-forget — never blocks the HTTP server from accepting requests.
  warmFontCache();

  // Start background job: re-verify custom email domains every 4 h so a
  // broken domain is caught automatically rather than waiting for owner action.
  schedulePeriodicDomainVerify();

  // On every startup, recover ALL WorldSmith runs that are still in 'compiling'
  // or 'pending' — regardless of age — because the previous server process is
  // definitively gone and those runs can never complete on their own.
  recoverStaleRuns(0).then((count) => {
    if (count > 0) {
      logger.warn({ count }, "WorldSmith: recovered stale runs on startup");
    }
  }).catch((err) => {
    logger.error({ err }, "WorldSmith: startup stale-run recovery failed");
  });

  // Periodic sweeper: every 5 minutes, fail any run that has been stuck in
  // 'compiling' or 'pending' for more than 30 minutes.  This guards against
  // edge cases where a run starts successfully but hangs without the process
  // actually crashing (e.g. a very slow Notion call that never resolves).
  setInterval(() => {
    recoverStaleRuns(30).then((count) => {
      if (count > 0) {
        logger.warn({ count }, "WorldSmith: periodic sweeper recovered stuck runs");
      }
    }).catch((err) => {
      logger.error({ err }, "WorldSmith: periodic stale-run sweep failed");
    });
  }, 5 * 60 * 1000);
});
