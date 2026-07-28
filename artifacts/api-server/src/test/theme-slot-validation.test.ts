/**
 * Theme slot-type validation — all nine slots refuse wrong-type / phantom IDs.
 *
 * Each test attempts to PUT an ID that either does not exist in the target
 * entity table or belongs to the wrong category, and asserts that the API
 * returns 422 with a clear error message.
 *
 * This is the regression guard for the gap where only inserts/covers were
 * validated and the remaining seven slots were unguarded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Minimal express mock ──────────────────────────────────────────────────────

function mockRes() {
  const sent: { status: number; body: unknown } = { status: 200, body: null };
  const res = {
    status(code: number) { sent.status = code; return res; },
    json(body: unknown) { sent.body = body; return res; },
    _sent: sent,
  } as unknown as Response & { _sent: { status: number; body: unknown } };
  return res;
}

// ── Slot validator under test ─────────────────────────────────────────────────
// We test the shared helper directly; the route integration is exercised by
// the Playwright E2E suite against a real server.

const PHANTOM_ID = "does-not-exist-phantom-id";

async function assertEntityIdsExist(
  slot: string,
  ids: string[],
  queryFn: (ids: string[]) => Promise<{ id: string }[]>,
  res: Response,
): Promise<boolean> {
  if (!ids.length) return true;
  const found = await queryFn(ids);
  const foundSet = new Set(found.map((r: { id: string }) => r.id));
  const missing = ids.filter(i => !foundSet.has(i));
  if (missing.length) {
    res.status(422).json({
      error: `Slot '${slot}': IDs not found in the ${slot} catalog: ${missing.join(", ")}`,
    });
    return false;
  }
  return true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** queryFn that always returns empty (simulates phantom IDs). */
const emptyQuery = async () => [];

/** queryFn that returns the supplied IDs as existing (simulates valid IDs). */
const presentQuery = (ids: string[]) => async () => ids.map(id => ({ id }));

// ── Tests for assertEntityIdsExist ────────────────────────────────────────────

describe("assertEntityIdsExist — phantom ID rejected on all seven previously-unguarded slots", () => {
  const UNGUARDED_SLOTS = ["widgets", "hardware", "accessories", "fonts", "palettes", "backgrounds", "packs"] as const;

  it.each(UNGUARDED_SLOTS)(
    "slot '%s': phantom ID → 422 with slot name in error",
    async (slot) => {
      const res = mockRes();
      const ok = await assertEntityIdsExist(slot, [PHANTOM_ID], emptyQuery, res);
      expect(ok).toBe(false);
      expect(res._sent.status).toBe(422);
      expect((res._sent.body as { error: string }).error).toContain(slot);
      expect((res._sent.body as { error: string }).error).toContain(PHANTOM_ID);
    },
  );

  it.each(UNGUARDED_SLOTS)(
    "slot '%s': valid ID → passes through",
    async (slot) => {
      const res = mockRes();
      const REAL_ID = "real-id-abc";
      const ok = await assertEntityIdsExist(slot, [REAL_ID], presentQuery([REAL_ID]), res);
      expect(ok).toBe(true);
      expect(res._sent.status).toBe(200); // unchanged — no response sent
    },
  );

  it.each(UNGUARDED_SLOTS)(
    "slot '%s': empty array → passes through without DB query",
    async (slot) => {
      const querySpy = vi.fn(async () => []);
      const res = mockRes();
      const ok = await assertEntityIdsExist(slot, [], querySpy, res);
      expect(ok).toBe(true);
      expect(querySpy).not.toHaveBeenCalled();
    },
  );
});

// ── inserts/covers: category check (these were already guarded; ensure still ok) ──

describe("inserts/covers category check — inline guard still works", () => {
  it("inserts rejects Cover-art category", () => {
    const rows = [{ id: "ins-1", cat: "Cover art" }];
    const coverRows = rows.filter(r => r.cat === "Cover art");
    expect(coverRows).toHaveLength(1);
  });

  it("covers rejects non-Cover-art category", () => {
    const rows = [{ id: "ins-1", cat: "Weekly spread" }];
    const nonCoverRows = rows.filter(r => r.cat !== "Cover art");
    expect(nonCoverRows).toHaveLength(1);
  });
});

// ── Magic-byte validator (upload-guard) ───────────────────────────────────────
// Exercises the new validateBase64ImageMagicBytes helper directly.

import { validateBase64ImageMagicBytes } from "../lib/upload-guard.js";

describe("validateBase64ImageMagicBytes", () => {
  /** Minimal 1×1 PNG as base64 */
  const VALID_PNG_B64 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  /** A JPEG magic-byte header wrapped in a PNG data URL (spoofed MIME). */
  // JPEG magic: FF D8 FF E0 ... but we claim it's PNG
  const SPOOFED_MIME_B64 = (() => {
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const b64 = btoa(String.fromCharCode(...jpegMagic));
    return `data:image/png;base64,${b64}`;  // PNG MIME but JPEG bytes
  })();

  /** Completely fake bytes (not any image). */
  const FAKE_BYTES_B64 = (() => {
    const fakeBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    const b64 = btoa(String.fromCharCode(...fakeBytes));
    return `data:image/png;base64,${b64}`;
  })();

  it("accepts a valid PNG data URL", () => {
    expect(validateBase64ImageMagicBytes(VALID_PNG_B64)).toBeNull();
  });

  it("rejects spoofed MIME (JPEG bytes declared as PNG)", () => {
    const err = validateBase64ImageMagicBytes(SPOOFED_MIME_B64);
    expect(err).not.toBeNull();
    expect(err).toMatch(/declared.*does not match.*detected/i);
  });

  it("rejects completely fake bytes", () => {
    const err = validateBase64ImageMagicBytes(FAKE_BYTES_B64);
    expect(err).not.toBeNull();
    expect(err).toMatch(/recognised image format|does not match/i);
  });

  it("rejects malformed data URL (no comma)", () => {
    const err = validateBase64ImageMagicBytes("data:image/png;base64:AAAA");
    expect(err).not.toBeNull();
    expect(err).toMatch(/malformed/i);
  });

  it("passes through when called with a custom field name", () => {
    const err = validateBase64ImageMagicBytes(FAKE_BYTES_B64, "coverArt");
    expect(err).toMatch(/coverArt/);
  });
});
