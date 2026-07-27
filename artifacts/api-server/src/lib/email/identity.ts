import { db } from "@workspace/db";
import {
  storeEmailConfigTable,
  storesTable,
  storeMembersTable,
  usersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const PLATFORM_DOMAIN = process.env.EMAIL_FROM_DOMAIN ?? "notifications.example.com";
const PLATFORM_NAME   = process.env.EMAIL_PLATFORM_NAME ?? "Daybook";

export interface EmailIdentity {
  from: string;      // RFC 5322  "Display Name <addr@domain>"
  replyTo: string;   // always a no-reply address
  tier: "platform" | "custom";
}

/**
 * Resolves the sending identity for a given store.
 * Returns tier-2 (custom domain) when the store has a verified domain;
 * otherwise falls back to tier-1 (platform domain, store display name).
 * Callers never branch on tier — always use this helper.
 */
export async function resolveEmailIdentity(
  storeId: string | null,
  storeName?: string,
): Promise<EmailIdentity> {
  const displayName  = storeName ?? PLATFORM_NAME;
  const tier1From    = `${displayName} <notifications@${PLATFORM_DOMAIN}>`;
  const tier1ReplyTo = `no-reply@${PLATFORM_DOMAIN}`;

  if (!storeId) {
    return { from: tier1From, replyTo: tier1ReplyTo, tier: "platform" };
  }

  const [cfg] = await db
    .select()
    .from(storeEmailConfigTable)
    .where(eq(storeEmailConfigTable.storeId, storeId))
    .limit(1);

  const cfgDisplayName = cfg?.fromDisplayName ?? displayName;

  if (
    cfg?.domainStatus === "verified" &&
    cfg?.fromDomain &&
    cfg?.fromLocalPart
  ) {
    return {
      from:    `${cfgDisplayName} <${cfg.fromLocalPart}@${cfg.fromDomain}>`,
      replyTo: `no-reply@${cfg.fromDomain}`,
      tier:    "custom",
    };
  }

  // Tier-1 fallback — platform domain, store display name in the From
  return {
    from:    `${cfgDisplayName} <notifications@${PLATFORM_DOMAIN}>`,
    replyTo: tier1ReplyTo,
    tier:    "platform",
  };
}

// ── Lookup helpers (used by senders.ts) ──────────────────────────────────────

export async function getEmailForUser(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return u?.email ?? null;
}

export async function getStoreName(storeId: string): Promise<string> {
  const [s] = await db
    .select({ name: storesTable.name })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);
  return s?.name ?? storeId;
}

export async function getStoreOwnerEmail(storeId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: usersTable.email })
    .from(storeMembersTable)
    .innerJoin(usersTable, eq(storeMembersTable.userId, usersTable.id))
    .where(
      and(
        eq(storeMembersTable.storeId, storeId),
        eq(storeMembersTable.role, "store_owner"),
      ),
    )
    .limit(1);
  return row?.email ?? null;
}
