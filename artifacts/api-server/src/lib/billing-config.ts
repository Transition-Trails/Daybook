import { db, plansTable } from "@workspace/db";
import { isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import { getConfiguredStripePriceId } from "./stripe-price";

/**
 * Report a misconfigured billing catalog without preventing the API from
 * accepting requests. Stripe Price IDs are environment-specific and must be
 * present on at least one plan before checkout can succeed.
 */
export async function checkBillingConfiguration(): Promise<void> {
  try {
    const planRows = await db
      .select({ stripePriceId: plansTable.stripePriceId })
      .from(plansTable)
      .where(isNotNull(plansTable.stripePriceId));

    if (!planRows.some(plan => getConfiguredStripePriceId(plan.stripePriceId))) {
      logger.error(
        "Billing configuration missing: no plan has a Stripe Price ID",
      );
    }
  } catch (err) {
    logger.error({ err }, "Billing startup configuration check failed");
  }
}