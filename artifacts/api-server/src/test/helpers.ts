/**
 * Test helpers — minimal Express app with fake auth injection.
 *
 * We deliberately do NOT import app.ts so we skip passport / Google OAuth setup
 * (which requires live env vars). Instead we mount only the routers under test
 * and inject req.isAuthenticated + req.user directly.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import type { User } from "@workspace/db";
import storesRouter from "../routes/stores.js";
import ownedCatalogRouter from "../routes/owned-catalog.js";
import platformRouter from "../routes/platform.js";
import ordersRouter from "../routes/orders.js";

// ── Known seeded users ────────────────────────────────────────────────────────
// These IDs match scripts/src/seed.ts exactly.

const base = {
  provider: "google" as const,
  avatarUrl: null,
  plan: null,
  owned: [] as string[],
  aiEnabled: true,
  aiProvider: "claude",
  connections: { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Partial<User>;

export const USERS = {
  superAdmin: {
    ...base,
    id: "u-sa",
    email: "superadmin@daybook.app",
    name: "Platform Super Admin",
    role: "owner",
    platformRole: "super_admin",
  } as User,

  alphaOwner: {
    ...base,
    id: "u-alpha-owner",
    email: "owner@store-alpha.com",
    name: "Alpha Owner",
    role: "user",
    platformRole: null,
  } as User,

  alphaStaff: {
    ...base,
    id: "u-alpha-staff",
    email: "staff@store-alpha.com",
    name: "Alpha Staff",
    role: "user",
    platformRole: null,
  } as User,

  betaOwner: {
    ...base,
    id: "u-beta-owner",
    email: "owner@store-beta.com",
    name: "Beta Owner",
    role: "user",
    platformRole: null,
  } as User,

  betaSupport: {
    ...base,
    id: "u-beta-support",
    email: "support@store-beta.com",
    name: "Beta Support",
    role: "user",
    platformRole: null,
  } as User,

  gammaOwner: {
    ...base,
    id: "u-gamma-owner",
    email: "owner@store-gamma.com",
    name: "Gamma Owner",
    role: "user",
    platformRole: null,
  } as User,

  /**
   * A user that is NOT in any store's store_members table.
   * We use an ID that was never inserted by the seed, so buildActor
   * will resolve storeRole=null for every storeId.
   */
  noStore: {
    ...base,
    id: "u-no-store",
    email: "nobody@example.com",
    name: "No-Store User",
    role: "user",
    platformRole: null,
  } as User,

  /**
   * Customer role user — inserted into store_members with role='customer'
   * for store-alpha in the global beforeAll. This ID is stable across runs
   * because cleanup removes it in afterAll.
   */
  alphaCustomer: {
    ...base,
    id: "u-test-customer",
    email: "customer@test.example.com",
    name: "Test Customer",
    role: "user",
    platformRole: null,
  } as User,
} as const;

// ── App factory ───────────────────────────────────────────────────────────────

/**
 * Create a bare Express app with:
 *  - JSON body parsing
 *  - Fake auth middleware (injects `user` into req; sets isAuthenticated())
 *  - Silent req.log shim so pino-http error calls don't throw
 *  - The real stores, owned catalog, platform, and orders routers mounted at /api
 *
 * Pass `null` for an unauthenticated request.
 */
export function makeApp(user: User | null) {
  const app = express();
  app.use(express.json());

  // Silence pino-http's req.log (only used in catch blocks inside routes)
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });

  // Inject fake Passport-style auth
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    r.isAuthenticated = () => user !== null;
    r.user = user ?? undefined;
    next();
  });

  app.use("/api", storesRouter);
  app.use("/api", ownedCatalogRouter);
  app.use("/api", platformRouter);
  app.use("/api", ordersRouter);
  return app;
}
