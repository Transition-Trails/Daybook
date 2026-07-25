/**
 * Sticker pipeline smoke test — full end-to-end coverage without a browser.
 *
 * Strategy:
 *   Same fake-auth pattern as rbac.test.ts: Express app with req.isAuthenticated()
 *   + req.user injected, real development database, per-run unique IDs, cleanup in afterAll.
 *
 * Coverage:
 *   1. Happy path  — create sticker (full pipeline), verify transparent PNG & fields
 *   2. Cricut      — SVG cut-path exists, non-trivial point count, bounding box fits viewBox
 *   3. Pack ops    — bulk add to pack; sticker appears in pack via GET /:id
 *   4. List        — scope=in-pack filter returns the sticker; scope=unassigned does not
 *   5. Error paths — non-image data URL, corrupt bytes, no-clear-background, oversized file,
 *                    duplicate live name (409)
 *   6. Audit       — at least one audit row written for the actor after the happy-path create
 *
 * Run: pnpm --filter @workspace/api-server test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import sharp from "sharp";
import { db } from "@workspace/db";
import {
  stickersLibraryTable,
  packStickersTable,
  stickerPacksTable,
  stylePresetsTable,
  auditLogTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import stickersRouter from "../routes/stickers.js";
import {
  removeBackground,
  applyBorderAndSize,
  generateCutlineSvg,
} from "../lib/imageProcessing.js";

// ── Per-run unique IDs ─────────────────────────────────────────────────────────
const RUN = Math.random().toString(36).slice(2, 10);

// ── Test actor (must exist in DB — seeded by scripts/src/seed.ts) ─────────────
const ALPHA_OWNER: User = {
  id: "u-alpha-owner",
  email: "owner@store-alpha.com",
  name: "Alpha Owner",
  role: "user",
  platformRole: null,
  provider: "google",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: true,
  aiProvider: "claude",
  connections: {
    googleDrive: false,
    googleCalendar: false,
    googleTasks: false,
    googleDocs: false,
    notion: false,
  },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const STORE_ID = "store-alpha";

// ── Minimal test app factory (bypasses passport/session entirely) ─────────────
function makeApp(user: User | null) {
  const app = express();
  // 10 MB limit — sticker bodies include base64 image data
  app.use(express.json({ limit: "10mb" }));

  // Silence pino-http's req.log used inside route catch blocks
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req as any).log = {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    };
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

  app.use("/api", stickersRouter);
  return app;
}

// ── Image helpers (generate deterministic test PNGs via sharp) ────────────────

/**
 * 64×64 PNG with a white background and a red circle in the centre.
 * Corners are white → BFS samples white as background colour → removes all white
 * pixels → the red circle remains opaque, everything else becomes transparent.
 */
async function makeWhiteBackgroundImage(
  w = 64,
  h = 64,
  circleRgb = { r: 200, g: 80, b: 80 },
): Promise<string> {
  const channels = 4;
  const pixels = Buffer.alloc(w * h * channels, 255); // fill RGBA white
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 3;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < radius) {
        const i = (y * w + x) * channels;
        pixels[i] = circleRgb.r;
        pixels[i + 1] = circleRgb.g;
        pixels[i + 2] = circleRgb.b;
        pixels[i + 3] = 255;
      }
    }
  }

  const png = await sharp(pixels, {
    raw: { width: w, height: h, channels },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * 64×64 PNG where each of the 4 corners has a distinct, saturated colour and
 * all other pixels are mid-grey.  BFS averages the corner colours → produces
 * an intermediate hue that no pixel matches within tolerance 35 → queue stays
 * empty → removeBackground throws UserImageError (no clear background).
 */
async function makeMultiCornerImage(): Promise<string> {
  const w = 64;
  const h = 64;
  const channels = 4;
  const pixels = Buffer.alloc(w * h * channels, 128); // fill RGBA mid-grey
  // Set full alpha for all pixels
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;

  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * channels;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  };

  setPixel(0, 0, 255, 0, 0); // top-left: red
  setPixel(w - 1, 0, 0, 255, 0); // top-right: green
  setPixel(0, h - 1, 0, 0, 255); // bottom-left: blue
  setPixel(w - 1, h - 1, 255, 255, 0); // bottom-right: yellow

  const png = await sharp(pixels, {
    raw: { width: w, height: h, channels },
  })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Decode a processedImageData data-URL and return the raw RGBA pixel buffer + metadata. */
async function decodeProcessedImage(
  dataUrl: string,
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const b64 = dataUrl.replace(/^data:image\/[a-z+]+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

/** Count pixels with alpha === 0 (fully transparent). */
function countTransparent(pixels: Uint8Array): number {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] === 0) count++;
  }
  return count;
}

/** Count pixels with alpha > 0 (any visible content). */
function countOpaque(pixels: Uint8Array): number {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0) count++;
  }
  return count;
}

/**
 * Parse the SVG path `d` attribute and return all (x, y) coordinate pairs.
 * Only handles M and L commands (absolute, space-separated) — which is all
 * our generateCutlineSvg emits.
 */
function parseSvgPathPoints(svg: string): Array<[number, number]> {
  const dMatch = svg.match(/\s+d="([^"]+)"/);
  if (!dMatch) return [];
  const d = dMatch[1];
  const points: Array<[number, number]> = [];
  // Each token is one of: M x y | L x y | Z
  const tokens = d.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "M" || t === "L") {
      const x = parseFloat(tokens[i + 1]);
      const y = parseFloat(tokens[i + 2]);
      if (!isNaN(x) && !isNaN(y)) points.push([x, y]);
      i += 3;
    } else {
      i += 1; // Z or unknown
    }
  }
  return points;
}

/** Extract viewBox "0 0 w h" from an SVG string → { width, height }. */
function parseSvgViewBox(svg: string): { width: number; height: number } | null {
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!m) return null;
  return { width: parseFloat(m[1]), height: parseFloat(m[2]) };
}

// ── Shared state ──────────────────────────────────────────────────────────────
const ownerApp = makeApp(ALPHA_OWNER);
const unauthApp = makeApp(null);

const cleanups: Array<() => Promise<unknown>> = [];
let createdStickerId = ""; // filled in happy-path test
let testPackId = `stkpk-test-${RUN}`;

// ── Global setup / teardown ───────────────────────────────────────────────────
beforeAll(async () => {
  // Create an owned sticker pack for store-alpha to use in pack-ops tests.
  await db
    .insert(stickerPacksTable)
    .values({
      id: testPackId,
      name: `Smoke Test Pack ${RUN}`,
      tags: ["test"],
      price: 0,
      status: "draft",
      origin: "owned",
      globalAvailable: false,
      authoredByStoreId: STORE_ID,
      planners: ["all"],
    })
    .onConflictDoNothing();

  cleanups.push(() =>
    db.delete(packStickersTable).where(eq(packStickersTable.packId, testPackId)),
  );
  cleanups.push(() =>
    db.delete(stickerPacksTable).where(eq(stickerPacksTable.id, testPackId)),
  );
});

afterAll(async () => {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {
      /* ignore cleanup errors */
    }
  }
  // Sweep any audit log rows written by our test actor
  await db
    .delete(auditLogTable)
    .where(eq(auditLogTable.actorUserId, ALPHA_OWNER.id))
    .catch(() => {});

  // Close the pool so vitest exits cleanly
  const { pool } = await import("@workspace/db");
  await pool.end().catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// 0. Direct function diagnostics (no HTTP — isolates the pipeline functions)
// ─────────────────────────────────────────────────────────────────────────────
describe("0. Direct function diagnostics", () => {
  it("removeBackground produces transparent pixels on white-bg image", async () => {
    const src = await makeWhiteBackgroundImage(64, 64);
    const result = await removeBackground(src);
    const { pixels, width, height } = await decodeProcessedImage(result);
    const transparent = countTransparent(pixels);
    const opaque = countOpaque(pixels);
    expect(transparent).toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(0);
    expect(transparent / (width * height)).toBeGreaterThan(0.1);
  });

  it("applyBorderAndSize with sizeInMm preserves opaque pixels", async () => {
    const src = await makeWhiteBackgroundImage(96, 96);
    const bgRemoved = await removeBackground(src);
    const resized = await applyBorderAndSize(bgRemoved, "none", null, null, 25);
    const { pixels, width, height } = await decodeProcessedImage(resized);
    const transparent = countTransparent(pixels);
    const opaque = countOpaque(pixels);
    expect(width).toBe(94); // Math.round((25/25.4)*96) = 94
    expect(height).toBe(94);
    expect(transparent).toBeGreaterThan(0);
    expect(opaque).toBeGreaterThan(0);
  });

  it("generateCutlineSvg produces a path for an opaque circle on transparent bg", async () => {
    const src = await makeWhiteBackgroundImage(96, 96);
    const bgRemoved = await removeBackground(src);
    // Test cutline directly on bg-removed image (no resize)
    const svg = await generateCutlineSvg(bgRemoved);
    expect(svg).toContain("<path");
    const points = parseSvgPathPoints(svg);
    expect(points.length).toBeGreaterThan(3);
  });

  it("generateCutlineSvg after applyBorderAndSize produces a path", async () => {
    const src = await makeWhiteBackgroundImage(96, 96);
    const bgRemoved = await removeBackground(src);
    const resized = await applyBorderAndSize(bgRemoved, "none", null, null, 25);
    const svg = await generateCutlineSvg(resized);
    expect(svg).toContain("<path");
    const points = parseSvgPathPoints(svg);
    expect(points.length).toBeGreaterThan(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Happy path — create sticker, verify pipeline output
// ─────────────────────────────────────────────────────────────────────────────
describe("1. Happy path — create → pipeline → verify", () => {
  it("POST /stores/:storeId/stickers → 201 with processedImageData", async () => {
    const imageBase64 = await makeWhiteBackgroundImage();

    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({
        name: `Smoke Sticker ${RUN}`,
        tags: ["smoke", "test"],
        functionType: "checkbox",
        imageBase64,
        borderStyle: "none",
        status: "draft",
        exportTargets: { goodnotes: true, ink: true, cricut: false },
      });

    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;

    // Basic fields
    expect(body.id).toMatch(/^stk_/);
    expect(body.name).toBe(`Smoke Sticker ${RUN}`);
    expect(body.functionType).toBe("checkbox");
    expect(body.status).toBe("draft");
    expect(body.origin).toBe("owned");
    expect(body.authoredByStoreId).toBe(STORE_ID);
    expect(Array.isArray(body.tags)).toBe(true);
    expect((body.tags as string[]).includes("smoke")).toBe(true);

    // Pipeline output present
    expect(typeof body.processedImageData).toBe("string");
    expect((body.processedImageData as string).startsWith("data:image/png;base64,")).toBe(true);
    expect(body.cutlineSvg).toBeNull(); // cricut=false

    createdStickerId = body.id as string;

    // Register cleanup
    cleanups.push(() =>
      db.delete(stickersLibraryTable).where(eq(stickersLibraryTable.id, createdStickerId)),
    );
  });

  it("processedImageData has transparent pixels (background removed)", async () => {
    const row = await db
      .select({ processedImageData: stickersLibraryTable.processedImageData })
      .from(stickersLibraryTable)
      .where(eq(stickersLibraryTable.id, createdStickerId))
      .then((r) => r[0]);

    expect(row).toBeTruthy();
    const { pixels, width, height } = await decodeProcessedImage(
      row!.processedImageData!,
    );
    const total = width * height;
    const transparent = countTransparent(pixels);
    const opaque = countOpaque(pixels);

    // Background was removed: some transparent pixels exist
    expect(transparent).toBeGreaterThan(0);
    // Subject (circle) still exists: some opaque pixels remain
    expect(opaque).toBeGreaterThan(0);
    // At least 10% of the image should be transparent (the white background ring)
    expect(transparent / total).toBeGreaterThan(0.1);
  });

  it("row persisted in DB with correct origin and authoredByStoreId", async () => {
    const [row] = await db
      .select()
      .from(stickersLibraryTable)
      .where(eq(stickersLibraryTable.id, createdStickerId));

    expect(row).toBeTruthy();
    expect(row!.origin).toBe("owned");
    expect(row!.authoredByStoreId).toBe(STORE_ID);
    expect(row!.functionType).toBe("checkbox");
    expect(row!.status).toBe("draft");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cricut cut-line
// ─────────────────────────────────────────────────────────────────────────────
describe("2. Cricut cut-line — SVG path assertions", () => {
  let cricutStickerId = "";

  it("POST with exportTargets.cricut=true → 201 with cutlineSvg", async () => {
    const imageBase64 = await makeWhiteBackgroundImage(96, 96);

    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({
        name: `Smoke Cricut ${RUN}`,
        functionType: "decorative",
        imageBase64,
        borderStyle: "none",
        sizeInMm: 25,
        exportTargets: { goodnotes: true, ink: true, cricut: true },
      });

    expect(res.status).toBe(201);
    const body = res.body as Record<string, unknown>;

    expect(typeof body.cutlineSvg).toBe("string");
    expect(body.cutlineSvg as string).toContain("<svg");
    expect(body.cutlineSvg as string).toContain("<path");

    cricutStickerId = body.id as string;
    cleanups.push(() =>
      db.delete(stickersLibraryTable).where(eq(stickersLibraryTable.id, cricutStickerId)),
    );
  });

  it("cutlineSvg has a non-trivial point count (>3 path vertices)", async () => {
    const [row] = await db
      .select({ cutlineSvg: stickersLibraryTable.cutlineSvg })
      .from(stickersLibraryTable)
      .where(eq(stickersLibraryTable.id, cricutStickerId));

    expect(row?.cutlineSvg).toBeTruthy();
    const points = parseSvgPathPoints(row!.cutlineSvg!);
    expect(points.length).toBeGreaterThan(3);
  });

  it("cutlineSvg viewBox dimensions match the sizeInMm=25 target (~94 px at 96 DPI)", async () => {
    const [row] = await db
      .select({ cutlineSvg: stickersLibraryTable.cutlineSvg, processedImageData: stickersLibraryTable.processedImageData })
      .from(stickersLibraryTable)
      .where(eq(stickersLibraryTable.id, cricutStickerId));

    const vb = parseSvgViewBox(row!.cutlineSvg!);
    expect(vb).not.toBeNull();

    // 25 mm at 96 DPI = Math.round((25 / 25.4) * 96) = 94 px
    const expectedPx = Math.round((25 / 25.4) * 96);
    expect(vb!.width).toBe(expectedPx);
    expect(vb!.height).toBe(expectedPx);
  });

  it("all SVG path points lie within the declared viewBox", async () => {
    const [row] = await db
      .select({ cutlineSvg: stickersLibraryTable.cutlineSvg })
      .from(stickersLibraryTable)
      .where(eq(stickersLibraryTable.id, cricutStickerId));

    const svg = row!.cutlineSvg!;
    const vb = parseSvgViewBox(svg)!;
    const points = parseSvgPathPoints(svg);

    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(vb.width + 1); // +1 for rounding
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(vb.height + 1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pack operations
// ─────────────────────────────────────────────────────────────────────────────
describe("3. Pack operations — bulk add, GET :id membership", () => {
  it("POST bulk/add-to-pack → adds sticker to pack", async () => {
    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers/bulk/add-to-pack`)
      .send({ ids: [createdStickerId], packId: testPackId });

    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    expect(res.body.skipped).toBe(0);
  });

  it("GET /stickers/:id → packs[] includes testPackId", async () => {
    const res = await request(ownerApp).get(
      `/api/stores/${STORE_ID}/stickers/${createdStickerId}`,
    );
    expect(res.status).toBe(200);

    const packs = res.body.packs as Array<{ packId: string }>;
    expect(Array.isArray(packs)).toBe(true);
    expect(packs.some((p) => p.packId === testPackId)).toBe(true);
  });

  it("GET /stickers?scope=in-pack → sticker appears in results", async () => {
    const res = await request(ownerApp).get(
      `/api/stores/${STORE_ID}/stickers?scope=in-pack`,
    );
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(createdStickerId);
  });

  it("GET /stickers?scope=in-pack → createdStickerId NOT in unassigned list", async () => {
    const res = await request(ownerApp).get(
      `/api/stores/${STORE_ID}/stickers?scope=unassigned`,
    );
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain(createdStickerId);
  });

  it("GET /stickers → packCount is 1 for the created sticker", async () => {
    const res = await request(ownerApp).get(`/api/stores/${STORE_ID}/stickers`);
    expect(res.status).toBe(200);
    const row = (res.body as Array<{ id: string; packCount: number }>).find(
      (r) => r.id === createdStickerId,
    );
    expect(row).toBeTruthy();
    expect(row!.packCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Audit log
// ─────────────────────────────────────────────────────────────────────────────
describe("4. Audit log — write verified", () => {
  it("at least one audit row exists for actor + sticker.create action", async () => {
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.actorUserId, ALPHA_OWNER.id));

    const createRow = rows.find(
      (r) =>
        (r.action === "sticker.create" || r.action === "sticker.publish") &&
        r.targetId === createdStickerId,
    );
    expect(createRow).toBeTruthy();
    expect(createRow!.scope).toBe(STORE_ID);
    expect(createRow!.targetType).toBe("sticker");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Error path hardening
// ─────────────────────────────────────────────────────────────────────────────
describe("5. Error paths", () => {
  // ── 5a. Non-image data URL ────────────────────────────────────────────────
  it("imageBase64 not a data:image/... URL → 400", async () => {
    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({
        name: `Error Test Non-Image ${RUN}`,
        functionType: "flag",
        imageBase64: "data:text/plain;base64,aGVsbG8=",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/data:image/i);
  });

  // ── 5b. Corrupt image bytes ───────────────────────────────────────────────
  it("corrupt base64 (valid data URL, invalid image bytes) → 400", async () => {
    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({
        name: `Error Test Corrupt ${RUN}`,
        functionType: "flag",
        // "AAAA" decodes to 3 null bytes — not a valid PNG/JPEG
        imageBase64: "data:image/png;base64,AAAAAAAAAA==",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/decoded|corrupt|format|image/i);
  });

  // ── 5c. No clear background ───────────────────────────────────────────────
  it("image with no uniform background colour → 400 with actionable message", async () => {
    const imageBase64 = await makeMultiCornerImage();

    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({
        name: `Error Test No-BG ${RUN}`,
        functionType: "decorative",
        imageBase64,
      });

    expect(res.status).toBe(400);
    // Message must tell the user what to fix
    expect(res.body.error).toMatch(/background/i);
    expect(res.body.error).toMatch(/solid|uniform/i);
  });

  // ── 5d. Oversized file ────────────────────────────────────────────────────
  it("image > 5 MB (decoded) → 400 too-large error before pipeline runs", async () => {
    // 5.1 MB of random bytes → base64 string
    const bigBuf = Buffer.alloc(5.1 * 1024 * 1024, 0xab);
    const bigB64 = `data:image/png;base64,${bigBuf.toString("base64")}`;

    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({
        name: `Error Test Oversize ${RUN}`,
        functionType: "banner",
        imageBase64: bigB64,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5\s*MB|too large|size/i);
  });

  // ── 5e. Duplicate live name → 409 ────────────────────────────────────────
  it("duplicate live sticker name → 409 with existingId", async () => {
    const dupName = `Dupe Live ${RUN}`;
    const imageBase64 = await makeWhiteBackgroundImage();

    // Create + publish the first sticker
    const first = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({ name: dupName, functionType: "tab", imageBase64, status: "live" });
    expect(first.status).toBe(201);

    const firstId = (first.body as { id: string }).id;
    cleanups.push(() =>
      db.delete(stickersLibraryTable).where(eq(stickersLibraryTable.id, firstId)),
    );

    // Attempt to create another with the same name
    const second = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({ name: dupName, functionType: "tab", imageBase64, status: "live" });
    expect(second.status).toBe(409);
    expect(second.body.existingId).toBe(firstId);
  });

  // ── 5f. Unauthenticated → 401 ─────────────────────────────────────────────
  it("unauthenticated request → 401", async () => {
    const res = await request(unauthApp).get(
      `/api/stores/${STORE_ID}/stickers`,
    );
    expect(res.status).toBe(401);
  });

  // ── 5g. Missing required fields ───────────────────────────────────────────
  it("missing name → 400", async () => {
    const imageBase64 = await makeWhiteBackgroundImage();
    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({ functionType: "flag", imageBase64 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it("invalid functionType → 400", async () => {
    const imageBase64 = await makeWhiteBackgroundImage();
    const res = await request(ownerApp)
      .post(`/api/stores/${STORE_ID}/stickers`)
      .send({ name: `FT Error ${RUN}`, functionType: "invalid-type", imageBase64 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/functionType/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sticker Studio — batch, text-set, presets (new routes added in Task #35)
// ─────────────────────────────────────────────────────────────────────────────

import stickerPresetsRouter from "../routes/sticker-presets.js";
import type { StylePreset } from "@workspace/db";

/** Combined app: stickersRouter + stickerPresetsRouter mounted under /api */
function makeStudioApp(user: User | null) {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    (_req as unknown as Record<string, unknown>).log = {
      error: () => {}, warn: () => {}, info: () => {}, debug: () => {},
    };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as unknown as Record<string, unknown>;
    r.isAuthenticated = () => user !== null;
    r.user = user ?? undefined;
    next();
  });
  app.use("/api", stickersRouter);
  app.use("/api", stickerPresetsRouter);
  return app;
}

describe("Sticker Studio — batch create", () => {
  let studioOwnerApp: ReturnType<typeof makeStudioApp>;

  beforeAll(() => {
    studioOwnerApp = makeStudioApp(ALPHA_OWNER);
  });

  it("batch: empty items array → 400", async () => {
    const res = await request(studioOwnerApp)
      .post(`/api/stores/${STORE_ID}/stickers/batch`)
      .send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/i);
  });

  it("batch: over-limit → 400", async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ name: `sticker-${i}`, imageBase64: "data:image/png;base64,abc", functionType: "tab" }));
    const res = await request(studioOwnerApp)
      .post(`/api/stores/${STORE_ID}/stickers/batch`)
      .send({ items });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/i);
  });

  it("batch: one valid item + one item missing name → partial result", async () => {
    const imageBase64 = await makeWhiteBackgroundImage();
    const items = [
      {
        name: `BatchSmoke-${RUN}`,
        imageBase64,
        functionType: "decorative",
        exportTargets: { goodnotes: true, ink: true, cricut: false },
      },
      {
        // missing name — should fail gracefully
        imageBase64,
        functionType: "decorative",
      },
    ];

    const res = await request(studioOwnerApp)
      .post(`/api/stores/${STORE_ID}/stickers/batch`)
      .send({ items });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(1);

    // Successful item has an id
    const ok = res.body.results.find((r: { status: string }) => r.status === "ok");
    expect(ok?.id).toBeTruthy();

    // Failed item has a reason
    const failed = res.body.results.find((r: { status: string }) => r.status === "failed");
    expect(failed?.reason).toBeTruthy();
  });
});

describe("Sticker Studio — text-set generate", () => {
  let studioOwnerApp: ReturnType<typeof makeStudioApp>;

  beforeAll(() => {
    studioOwnerApp = makeStudioApp(ALPHA_OWNER);
  });

  it("text-set invalid setType → 400", async () => {
    const res = await request(studioOwnerApp)
      .post(`/api/stores/${STORE_ID}/stickers/generate/text-set`)
      .send({ setType: "not-a-real-set" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/setType/i);
  });

  it("text-set dates-1-31 → creates 31 draft stickers", async () => {
    const res = await request(studioOwnerApp)
      .post(`/api/stores/${STORE_ID}/stickers/generate/text-set`)
      .send({ setType: "dates-1-31", color: "#1A202C", sizeInMm: 12 });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(31);
    expect(Array.isArray(res.body.ids)).toBe(true);
    expect(res.body.ids).toHaveLength(31);

    // Verify the first sticker was actually persisted in the DB
    const [row] = await db
      .select({ id: stickersLibraryTable.id, name: stickersLibraryTable.name, status: stickersLibraryTable.status, generationType: stickersLibraryTable.generationType })
      .from(stickersLibraryTable)
      .where(eq(stickersLibraryTable.id, res.body.ids[0]));
    expect(row).toBeTruthy();
    expect(row.status).toBe("draft");
    expect(row.generationType).toBe("text-set");
    expect(row.name).toContain("dates-1-31");
  }, 60_000);
});

describe("Sticker Studio — style presets CRUD", () => {
  let studioOwnerApp: ReturnType<typeof makeStudioApp>;
  let createdPresetId: string;

  beforeAll(() => {
    studioOwnerApp = makeStudioApp(ALPHA_OWNER);
  });

  afterAll(async () => {
    // Clean up any presets created in this run
    if (createdPresetId) {
      await db.delete(stylePresetsTable).where(eq(stylePresetsTable.id, createdPresetId)).catch(() => {});
    }
  });

  it("create style preset → 201 with correct fields", async () => {
    const presetName = `Test Preset ${RUN}`;
    const res = await request(studioOwnerApp)
      .post(`/api/stores/${STORE_ID}/sticker-presets`)
      .send({
        name: presetName,
        borderStyle: "thin",
        borderWidth: 1.5,
        borderColor: "#FFFFFF",
        sizeInMm: 25,
        shadowStyle: "soft",
        shadowLiftPx: 4,
        exportTargets: { goodnotes: true, ink: true, cricut: false },
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(presetName);
    expect(res.body.borderStyle).toBe("thin");
    expect(res.body.shadowStyle).toBe("soft");
    expect(res.body.storeId).toBe(STORE_ID);
    createdPresetId = res.body.id;
  });

  it("list style presets → includes created preset", async () => {
    const res = await request(studioOwnerApp)
      .get(`/api/stores/${STORE_ID}/sticker-presets`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: StylePreset) => p.id === createdPresetId);
    expect(found).toBeTruthy();
  });

  it("patch style preset → reflects update", async () => {
    const res = await request(studioOwnerApp)
      .patch(`/api/stores/${STORE_ID}/sticker-presets/${createdPresetId}`)
      .send({ shadowStyle: "lifted", shadowLiftPx: 8 });
    expect(res.status).toBe(200);
    expect(res.body.shadowStyle).toBe("lifted");
    expect(res.body.shadowLiftPx).toBe(8);
  });

  it("delete style preset → 204", async () => {
    const res = await request(studioOwnerApp)
      .delete(`/api/stores/${STORE_ID}/sticker-presets/${createdPresetId}`);
    expect(res.status).toBe(204);
    createdPresetId = ""; // don't double-delete in afterAll

    // Verify it's gone
    const check = await request(studioOwnerApp)
      .get(`/api/stores/${STORE_ID}/sticker-presets/${createdPresetId || "nonexistent"}`);
    expect(check.status).toBe(404);
  });

  it("get preset from another store → 403", async () => {
    const res = await request(studioOwnerApp)
      .get(`/api/stores/store-beta/sticker-presets`);
    expect(res.status).toBe(403);
  });
});
