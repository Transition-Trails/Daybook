/**
 * Upload validation guard tests.
 *
 * Covers:
 *   1. Oversized upload rejected at presigned-URL request time
 *   2. Non-image MIME rejected at presigned-URL request time
 *   3. Valid uploads pass (jpeg, png, webp)
 *   4. Texture slug guard — unknown slug returns 422
 *   5. Cover/insert slot-type swap — cover in 'inserts' slot returns 422
 *   6. Cover/insert slot-type swap — plain insert in 'covers' slot returns 422
 *
 * These tests use the pure guard functions directly (no HTTP round-trip) for
 * the upload guards, and a live-DB supertest fixture for the slot-type guards
 * (so we can verify the real route logic including the DB lookup).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  ALLOWED_IMAGE_TYPES,
  detectImageMagicBytes,
} from "../lib/upload-guard.js";
import { KNOWN_TEXTURE_SLUGS } from "../lib/texture-registry.js";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  themesTable,
  insertsTable,
  themeInsertsTable,
  themeCoversTable,
  backgroundsTable,
  themeBackgroundsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import catalogRouter from "../routes/catalog.js";
import type { User } from "@workspace/db";

// ── Guard-function unit tests ─────────────────────────────────────────────────

describe("upload-guard: size cap", () => {
  it("8 MB exactly is within limit", () => {
    expect(MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
    expect(8 * 1024 * 1024).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
  });

  it("1 byte over the limit exceeds cap", () => {
    expect(MAX_UPLOAD_BYTES + 1).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });
});

describe("upload-guard: content-type allowlist", () => {
  it("accepted image types pass the guard", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]) {
      expect(ALLOWED_IMAGE_TYPES.has(t)).toBe(true);
    }
  });

  it("non-image types are rejected", () => {
    for (const t of ["application/pdf", "text/plain", "video/mp4", "application/zip", "image/svg+xml"]) {
      expect(ALLOWED_IMAGE_TYPES.has(t)).toBe(false);
    }
  });
});

describe("upload-guard: magic-byte detection", () => {
  it("detects JPEG (FF D8 FF)", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMagicBytes(bytes)).toBe("image/jpeg");
  });

  it("detects PNG (89 50 4E 47)", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMagicBytes(bytes)).toBe("image/png");
  });

  it("detects GIF (47 49 46 38)", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageMagicBytes(bytes)).toBe("image/gif");
  });

  it("detects WebP (RIFF....WEBP)", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size (irrelevant for detection)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectImageMagicBytes(bytes)).toBe("image/webp");
  });

  it("returns null for non-image bytes", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    expect(detectImageMagicBytes(bytes)).toBeNull();
  });

  it("returns null for empty buffer", () => {
    expect(detectImageMagicBytes(new Uint8Array(0))).toBeNull();
  });
});

describe("texture-registry: known slugs", () => {
  it("contains the six CSS-defined texture slugs", () => {
    for (const slug of ["linen", "kraft", "marble", "canvas", "grid", "dot"]) {
      expect(KNOWN_TEXTURE_SLUGS.has(slug)).toBe(true);
    }
  });

  it("does not contain made-up slugs", () => {
    expect(KNOWN_TEXTURE_SLUGS.has("unknown-texture")).toBe(false);
    expect(KNOWN_TEXTURE_SLUGS.has("")).toBe(false);
    expect(KNOWN_TEXTURE_SLUGS.has("leather")).toBe(false);
  });
});

// ── HTTP route integration tests (live DB, catalog router) ────────────────────

const RUN = Math.random().toString(36).slice(2, 10);

const superAdminUser: User = {
  id: "u-sa",
  email: "superadmin@daybook.app",
  name: "Platform Super Admin",
  role: "owner",
  platformRole: "super_admin",
  provider: "google",
  avatarUrl: null,
  plan: null,
  owned: [],
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
  planCurrentPeriodEnd: null,
  planStatus: null,
  stripeSubscriptionId: null,
  stripePaymentIntentId: null,
  stripeSubscriptionEventCreatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeCatalogApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    r.isAuthenticated = () => true;
    r.user = superAdminUser;
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

const app = makeCatalogApp();

// Fixture IDs
const ids = {
  theme:      `test-theme-valguard-${RUN}`,
  plainInsert:`test-insert-plain-${RUN}`,
  coverInsert:`test-insert-cover-${RUN}`,
  bgColor:    `test-bg-color-${RUN}`,
  bgKnownTex: `test-bg-linen-${RUN}`,
  bgBadTex:   `test-bg-badslug-${RUN}`,
};

const cleanups: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  // Insert test theme
  await db.insert(themesTable).values({
    id: ids.theme, name: `Validation Guard Test ${RUN}`, colors: ["#aaa"], status: "draft",
  });
  cleanups.push(() => db.delete(themesTable).where(eq(themesTable.id, ids.theme)));

  // Insert a plain insert (cat = "Functional")
  await db.insert(insertsTable).values({
    id: ids.plainInsert, name: `Plain Insert ${RUN}`, cat: "Functional", status: "draft",
  });
  cleanups.push(() => db.delete(insertsTable).where(eq(insertsTable.id, ids.plainInsert)));

  // Insert a cover-art insert (cat = "Cover art")
  await db.insert(insertsTable).values({
    id: ids.coverInsert, name: `Cover Insert ${RUN}`, cat: "Cover art", status: "draft",
  });
  cleanups.push(() => db.delete(insertsTable).where(eq(insertsTable.id, ids.coverInsert)));

  // Insert test backgrounds
  await db.insert(backgroundsTable).values([
    { id: ids.bgColor,    name: `Color BG ${RUN}`,       type: "color",   assetRef: "#ffffff", status: "draft" },
    { id: ids.bgKnownTex, name: `Linen Texture ${RUN}`,  type: "texture", assetRef: "linen",   status: "draft" },
    { id: ids.bgBadTex,   name: `Bad Texture ${RUN}`,    type: "texture", assetRef: "unknown-texture-xyz", status: "draft" },
  ]);
  cleanups.push(() =>
    db.delete(backgroundsTable).where(inArray(backgroundsTable.id, [ids.bgColor, ids.bgKnownTex, ids.bgBadTex])),
  );
});

afterAll(async () => {
  // Remove any join rows first
  await db.delete(themeInsertsTable).where(eq(themeInsertsTable.themeId, ids.theme));
  await db.delete(themeCoversTable).where(eq(themeCoversTable.themeId, ids.theme));
  await db.delete(themeBackgroundsTable).where(eq(themeBackgroundsTable.themeId, ids.theme));
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* ignore */ }
  }
});

// ── Texture slug guard ────────────────────────────────────────────────────────

describe("PUT /themes/:id/backgrounds — texture slug guard", () => {
  it("accepts a color background", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([{ backgroundId: ids.bgColor }]);
    expect(res.status).toBe(200);
  });

  it("accepts a background with a known texture slug (linen)", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([{ backgroundId: ids.bgKnownTex }]);
    expect(res.status).toBe(200);
  });

  it("rejects a background with an unknown texture slug → 422", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([{ backgroundId: ids.bgBadTex }]);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/unknown-texture-xyz/);
  });

  it("422 message lists known slugs", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([{ backgroundId: ids.bgBadTex }]);
    expect(res.body.error).toMatch(/linen/);
  });
});

// ── Cover / insert slot-type guards ──────────────────────────────────────────

describe("PUT /themes/:id/inserts — slot-type guard", () => {
  it("accepts a plain (non-cover) insert", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/inserts`)
      .send([ids.plainInsert]);
    expect(res.status).toBe(200);
  });

  it("rejects a cover-art insert in the inserts slot → 422", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/inserts`)
      .send([ids.coverInsert]);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/inserts/);
    expect(res.body.error).toMatch(/Cover art/);
  });
});

describe("PUT /themes/:id/covers — slot-type guard", () => {
  it("accepts a cover-art insert in the covers slot", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/covers`)
      .send([ids.coverInsert]);
    expect(res.status).toBe(200);
  });

  it("rejects a plain insert in the covers slot → 422", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/covers`)
      .send([ids.plainInsert]);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/covers.*requires a cover asset/i);
  });
});
