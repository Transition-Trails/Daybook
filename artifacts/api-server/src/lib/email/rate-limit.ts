import { db } from "@workspace/db";
import { storeEmailConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DAILY_LIMIT    = parseInt(process.env.EMAIL_TIER1_DAILY_LIMIT ?? "200", 10);
const UPGRADE_VOLUME = parseInt(process.env.EMAIL_TIER1_MONTHLY_UPGRADE_THRESHOLD ?? "1000", 10);

// In-memory daily counters (reset automatically when the date changes).
// Process-restart resets them; the DB suspension flag is the durable source of truth.
const dailyCounts = new Map<string, { date: string; count: number }>();

/**
 * Check and increment the per-store tier-1 rate limit.
 * Throws RateLimitError if the store is suspended or has hit its daily cap.
 * Only call this for tier-1 (platform-domain) sends.
 */
export async function checkTier1RateLimit(storeId: string): Promise<void> {
  const [cfg] = await db
    .select({
      tier1Suspended: storeEmailConfigTable.tier1Suspended,
      monthlyVolume:  storeEmailConfigTable.monthlyVolume,
    })
    .from(storeEmailConfigTable)
    .where(eq(storeEmailConfigTable.storeId, storeId))
    .limit(1);

  if (cfg?.tier1Suspended) {
    throw new RateLimitError(
      `Store ${storeId} tier-1 sending is suspended`,
      "suspended",
    );
  }

  if (cfg && cfg.monthlyVolume >= UPGRADE_VOLUME) {
    console.warn(
      `[email:rate] store ${storeId} monthly volume ${cfg.monthlyVolume} ≥ threshold ${UPGRADE_VOLUME} — prompt upgrade`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const entry = dailyCounts.get(storeId);

  if (!entry || entry.date !== today) {
    dailyCounts.set(storeId, { date: today, count: 1 });
    return;
  }

  if (entry.count >= DAILY_LIMIT) {
    throw new RateLimitError(
      `Store ${storeId} hit the daily email limit (${DAILY_LIMIT})`,
      "daily_limit",
    );
  }

  entry.count++;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly reason: "suspended" | "daily_limit",
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}
