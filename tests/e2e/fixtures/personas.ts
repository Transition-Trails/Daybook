/**
 * CI test personas.
 *
 * These accounts are seeded by scripts/src/seed-ci.ts and exist only in
 * environments where NODE_ENV=test. Never use production credentials here.
 *
 * Login is handled by POST /api/auth/test-login (only active in test mode).
 */

export interface Persona {
  /** Unique key — used as the storageState filename */
  key: string;
  email: string;
  displayName: string;
  /** What this persona is primarily used to test */
  role: "super_admin" | "store_owner" | "store_staff" | "buyer";
  /** Only set for store members */
  storeId?: string;
}

export const PERSONAS = {
  superAdmin: {
    key: "super-admin",
    email: "super@ci.test",
    displayName: "CI Super Admin",
    role: "super_admin",
  },
  ownerA: {
    key: "owner-a",
    email: "owner.a@ci.test",
    displayName: "CI Owner A",
    role: "store_owner",
    storeId: "ci_store_a",
  },
  staffA: {
    key: "staff-a",
    email: "staff.a@ci.test",
    displayName: "CI Staff A",
    role: "store_staff",
    storeId: "ci_store_a",
  },
  ownerB: {
    key: "owner-b",
    email: "owner.b@ci.test",
    displayName: "CI Owner B",
    role: "store_owner",
    storeId: "ci_store_b",
  },
  buyer: {
    key: "buyer",
    email: "buyer@ci.test",
    displayName: "CI Buyer",
    role: "buyer",
  },
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof PERSONAS;
