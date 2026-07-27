import app from "./app";
import { logger } from "./lib/logger";
import { warmFontCache } from "./lib/font-warmup";
import { schedulePeriodicDomainVerify } from "./lib/email/domain-recheck";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Pre-fetch Google Font binaries for all live-theme font families so that
  // the very first planner export on a fresh container pays zero network latency.
  // Fire-and-forget — never blocks the HTTP server from accepting requests.
  warmFontCache();

  // Start background job: re-verify custom email domains every 4 h so a
  // broken domain is caught automatically rather than waiting for owner action.
  schedulePeriodicDomainVerify();
});
