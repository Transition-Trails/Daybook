/**
 * CI test-persona seed.
 * Creates five deterministic accounts and two stores used exclusively by
 * Playwright end-to-end tests.  Safe to re-run (idempotent).
 *
 * Run: pnpm --filter @workspace/scripts run seed:ci
 *
 * Persona summary:
 *   super@ci.test       — platform super admin
 *   owner.a@ci.test     — owner of ci_store_a
 *   staff.a@ci.test     — staff of ci_store_a
 *   owner.b@ci.test     — owner of ci_store_b (cross-store isolation tests)
 *   buyer@ci.test       — no store membership (buyer persona)
 */
import { db } from "@workspace/db";
import {
  usersTable,
  storesTable,
  storeMembersTable,
  storeFlagsTable,
} from "@workspace/db";

// ── Deterministic IDs (never change — tests reference them by name) ───────────

const IDS = {
  superAdmin: "ci_super_admin",
  ownerA:     "ci_owner_a",
  staffA:     "ci_staff_a",
  ownerB:     "ci_owner_b",
  buyer:      "ci_buyer",
  storeA:     "ci_store_a",
  storeB:     "ci_store_b",
} as const;

async function main() {
  console.log("🧪 Seeding CI test personas…");

  // ── Users ─────────────────────────────────────────────────────────────────
  await db
    .insert(usersTable)
    .values([
      {
        id:            IDS.superAdmin,
        email:         "super@ci.test",
        name:          "CI Super Admin",
        platformRole:  "super_admin",
      },
      {
        id:    IDS.ownerA,
        email: "owner.a@ci.test",
        name:  "CI Owner A",
      },
      {
        id:    IDS.staffA,
        email: "staff.a@ci.test",
        name:  "CI Staff A",
      },
      {
        id:    IDS.ownerB,
        email: "owner.b@ci.test",
        name:  "CI Owner B",
      },
      {
        id:    IDS.buyer,
        email: "buyer@ci.test",
        name:  "CI Buyer",
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ users (5 CI personas)");

  // ── Stores ────────────────────────────────────────────────────────────────
  await db
    .insert(storesTable)
    .values([
      {
        id:                IDS.storeA,
        name:              "CI Store A",
        slug:              "ci-store-a",
        subscriptionActive: true,
        defaultMode:       "planner",
      },
      {
        id:                IDS.storeB,
        name:              "CI Store B",
        slug:              "ci-store-b",
        subscriptionActive: true,
        defaultMode:       "planner",
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ stores (ci_store_a, ci_store_b)");

  // ── Store memberships ─────────────────────────────────────────────────────
  await db
    .insert(storeMembersTable)
    .values([
      { storeId: IDS.storeA, userId: IDS.ownerA, role: "owner" },
      { storeId: IDS.storeA, userId: IDS.staffA, role: "staff" },
      { storeId: IDS.storeB, userId: IDS.ownerB, role: "owner" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ memberships");

  // ── Store flags (enable features needed for smoke tests) ──────────────────
  await db
    .insert(storeFlagsTable)
    .values([
      { storeId: IDS.storeA, flag: "stickers_enabled",   enabled: true },
      { storeId: IDS.storeA, flag: "marketing_enabled",  enabled: true },
      { storeId: IDS.storeB, flag: "stickers_enabled",   enabled: true },
    ])
    .onConflictDoNothing();
  console.log("  ✓ store flags");

  console.log("✅ CI personas ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-ci failed:", err);
  process.exit(1);
});
