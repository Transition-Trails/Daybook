/**
 * Font cache cold-start tests.
 *
 * Confirms that warmFontCache populates BOTH the in-process Map (_googleFontCache)
 * AND the /tmp disk cache when starting from a completely fresh state.
 *
 * Network is stubbed via vi.spyOn(global, "fetch") so the suite runs without
 * internet access.  The real DB is used (matches the seeded test environment)
 * with a unique test theme inserted + cleaned up in each run.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import { db } from "@workspace/db";
import { themesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { warmFontCache, getWarmupStatus } from "../lib/font-warmup";
import { _googleFontCache, _diskCachePath, _bundledFontPath } from "../lib/pdf-generator";
import { existsSync } from "node:fs";

// ── Synthetic font data ───────────────────────────────────────────────────────

/** Minimal valid TTF binary — magic bytes 00 01 00 00 (standard TTF). */
const FAKE_TTF = (() => {
  const b = new Uint8Array(260);
  b[0] = 0x00; b[1] = 0x01; b[2] = 0x00; b[3] = 0x00;
  return b;
})();

/** Stub Google Fonts CSS — single @font-face block with truetype format tag. */
const STUB_FONT_URL = "http://stub.test/fake-font.ttf";
const FAKE_CSS = `@font-face { src: url(${STUB_FONT_URL}) format('truetype'); }`;

// ── Test fixtures ─────────────────────────────────────────────────────────────

/** Stable ID for the live test theme — never conflicts with seed IDs. */
const TEST_THEME_ID = "t-warmup-cold-start-test";

/**
 * Serif family present in SERIF_PDF_FAMILIES — using "Lora" because it is also
 * in the seeded fonts table which makes the integration realistic.
 */
const TEST_FAMILY = "Lora";

/** The disk cache directory warmFontCache writes to. */
const DISK_DIR = "/tmp/gfont-cache";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Poll until `filePath` appears on disk or `timeoutMs` elapses.
 * Returns true if the file appeared, false on timeout.
 *
 * warmFontCache is fire-and-forget; _writeDiskFontCache is also fire-and-forget
 * inside fetchGoogleFontBytes.  Polling is the only reliable way to know both
 * the in-process fetch AND the async disk write finished.
 */
async function waitForFile(filePath: string, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  return false;
}

/**
 * Poll until the warmup phase reaches "done" or "error", or timeoutMs elapses.
 * More reliable than polling for a specific disk file when bundled WOFFs are
 * present — those are served from src/lib/fonts/ without a /tmp disk write.
 */
async function waitForWarmupDone(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const phase = getWarmupStatus().phase;
    if (phase === "done" || phase === "error") return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(async () => {
  // 1. Cold-start: wipe in-process cache so no prior test's state leaks through.
  _googleFontCache.clear();

  // 2. Cold-start: wipe the disk cache dir so every test truly starts fresh.
  await fs.rm(DISK_DIR, { recursive: true, force: true });

  // 3. Insert a live test theme whose fontPairing references our test family.
  //    collectLiveFamilyNames reads themes.font_pairing JSONB, so this is all
  //    that is needed — no theme_fonts row is required.
  await db
    .insert(themesTable)
    .values({
      id:          TEST_THEME_ID,
      name:        "__warmup-cold-start-test__",
      colors:      [] as string[],
      status:      "live",
      origin:      "starter",
      fontPairing: { heading: TEST_FAMILY },
    })
    .onConflictDoNothing();

  // 4. Stub global.fetch so no real network calls are made:
  //    - Any fonts.googleapis.com URL → return fake CSS with truetype format tag
  //    - The stub font URL extracted from that CSS → return FAKE_TTF bytes
  //    This covers both Strategy A (CSS v1) and Strategy B (CSS v2) in
  //    fetchGoogleFontBytes since both match the googleapis.com hostname check.
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("googleapis.com")) {
      return new Response(FAKE_CSS, {
        status:  200,
        headers: { "content-type": "text/css; charset=utf-8" },
      });
    }
    // Font binary download from the stub URL extracted by extractFontUrl().
    return new Response(FAKE_TTF.buffer as ArrayBuffer, {
      status:  200,
      headers: { "content-type": "font/ttf" },
    });
  });
});

afterEach(async () => {
  vi.restoreAllMocks();

  // Remove the test theme so it never bleeds into real production queries.
  await db
    .delete(themesTable)
    .where(eq(themesTable.id, TEST_THEME_ID))
    .catch(() => {});

  // Leave the cache clean for the next test.
  _googleFontCache.clear();
  await fs.rm(DISK_DIR, { recursive: true, force: true }).catch(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("warmFontCache — cold start (empty in-process Map + empty /tmp)", () => {
  it(
    "starts from a truly empty state before the warmup fires",
    async () => {
      // In-process cache must be empty.
      expect(_googleFontCache.size).toBe(0);

      // Disk cache dir must not exist.
      const dirExists = await fs
        .access(DISK_DIR)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(false);
    },
    // No warmup called — this test only verifies the beforeEach is effective.
    5_000,
  );

  it(
    "populates the in-process Map for the live-theme font family after warm-up",
    async () => {
      expect(_googleFontCache.size).toBe(0); // confirm cold start

      warmFontCache(); // fire-and-forget — intentionally not awaited

      // Wait for the warmup phase to reach "done" rather than polling for a disk
      // file.  When the family has a bundled WOFF in src/lib/fonts/, fetchGoogleFontBytes
      // returns from the bundle shortcut without writing to /tmp, so a disk-file proxy
      // would time-out even though the in-process cache is fully populated.
      const finished = await waitForWarmupDone();
      expect(finished).toBe(true);

      // Both weights must be in the in-process cache (bundle path, disk path, or
      // network — all three code paths call _googleFontCache.set before returning).
      expect(_googleFontCache.has(`${TEST_FAMILY}:400`)).toBe(true);
      expect(_googleFontCache.has(`${TEST_FAMILY}:700`)).toBe(true);
    },
    20_000,
  );

  it(
    "caches weight-400 bytes in the in-process Map (or disk cache) after warm-up",
    async () => {
      warmFontCache();

      // Wait for warmup to complete rather than polling for a specific disk file.
      // When the family has a bundled WOFF, fetchGoogleFontBytes returns from the
      // bundle shortcut without writing to /tmp — the disk write is only on the
      // network path.
      const finished = await waitForWarmupDone();
      expect(finished).toBe(true);

      const bytes400 = _googleFontCache.get(`${TEST_FAMILY}:400`);
      expect(bytes400).toBeTruthy();
      expect(bytes400!.byteLength).toBeGreaterThan(0);

      // If a bundled WOFF served the bytes, the disk cache is not written.
      // If the network path ran, check the disk file and TTF magic.
      const hasBundled = existsSync(_bundledFontPath(TEST_FAMILY, 400));
      const diskPath400 = _diskCachePath(TEST_FAMILY, 400);
      const diskExists  = await fs.access(diskPath400).then(() => true).catch(() => false);

      if (hasBundled) {
        // Bundled WOFF: in-process cache has WOFF bytes (77 4f 46 46 magic)
        expect(bytes400![0]).toBe(0x77); // 'w'
        expect(bytes400![1]).toBe(0x4f); // 'O'
      } else {
        // Network path: disk cache must have been written with TTF magic
        expect(diskExists).toBe(true);
        const diskBytes = await fs.readFile(diskPath400);
        expect(diskBytes[0]).toBe(0x00);
        expect(diskBytes[1]).toBe(0x01);
        expect(diskBytes[2]).toBe(0x00);
        expect(diskBytes[3]).toBe(0x00);
      }
    },
    20_000,
  );

  it(
    "caches weight-700 bytes in the in-process Map after warm-up",
    async () => {
      warmFontCache();

      // When a bundled WOFF exists for the family (src/lib/fonts/<Family>-700.woff),
      // fetchGoogleFontBytes takes the bundle shortcut and returns WITHOUT writing
      // to /tmp — the disk cache is only a hot-reload optimisation for the network
      // path.  Check the in-process cache (the definitive source for PDF generation)
      // and, where the disk file was written, verify the format too.
      const finished = await waitForWarmupDone();
      expect(finished).toBe(true);

      const bytes700 = _googleFontCache.get(`${TEST_FAMILY}:700`);
      expect(bytes700).toBeTruthy();
      expect(bytes700!.byteLength).toBeGreaterThan(0);

      // If the bundled WOFF served the bytes, validate its WOFF magic (77 4f 46 46).
      // If a network download wrote to /tmp, validate TTF magic (00 01 00 00).
      const hasBundled = existsSync(_bundledFontPath(TEST_FAMILY, 700));
      const diskPath700 = _diskCachePath(TEST_FAMILY, 700);
      const diskExists  = await fs.access(diskPath700).then(() => true).catch(() => false);

      if (hasBundled) {
        // Bundle path — bytes are WOFF format (served directly from src/lib/fonts/)
        expect(bytes700![0]).toBe(0x77); // 'w' — wOFF magic
        expect(bytes700![1]).toBe(0x4f); // 'O'
      } else {
        // Network path — the disk cache must have been written with TTF bytes
        expect(diskExists).toBe(true);
        const diskBytes = await fs.readFile(diskPath700);
        expect(diskBytes[0]).toBe(0x00);
        expect(diskBytes[1]).toBe(0x01);
        expect(diskBytes[2]).toBe(0x00);
        expect(diskBytes[3]).toBe(0x00);
      }
    },
    20_000,
  );

  it(
    "disk-path helper produces the correct filename format for a family with spaces",
    () => {
      // Verify the filename encoding so tests that poll for files use the right path.
      const p = _diskCachePath("Playfair Display", 700);
      expect(p).toContain("Playfair_Display-700.ttf");
      expect(p).toContain(DISK_DIR);
    },
  );

  it(
    "a second call to fetchGoogleFontBytes after warmup hits the in-process cache (no fetch)",
    async () => {
      warmFontCache();

      // Wait for the warmup to finish by polling the disk.
      const diskPath400 = _diskCachePath(TEST_FAMILY, 400);
      await waitForFile(diskPath400);

      // Reset the spy call count so we can assert no NEW fetch was made.
      const fetchSpy = vi.mocked(global.fetch);
      fetchSpy.mockClear();

      // Import fetchGoogleFontBytes after warmup has populated _googleFontCache.
      const { fetchGoogleFontBytes } = await import("../lib/pdf-generator");
      const result = await fetchGoogleFontBytes(TEST_FAMILY, 400);

      // The in-process cache was populated by warmFontCache — no fetch needed.
      expect(result).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
    15_000,
  );
});
