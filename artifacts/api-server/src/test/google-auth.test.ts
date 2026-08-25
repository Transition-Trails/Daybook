import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const user: Record<string, unknown> = {};
  const selectWhere = vi.fn(async () => [user]);
  const returning = vi.fn(async () => [{ id: "u-google" }]);
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  return {
    user,
    selectWhere,
    returning,
    updateWhere,
    set,
    markDisconnected: vi.fn(async () => true),
    db: {
      select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
      update: vi.fn(() => ({ set })),
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  usersTable: {
    id: "id",
    googleAccessToken: "google_access_token",
    googleTokenExpiry: "google_token_expiry",
    googleTokenVersion: "google_token_version",
    googleDisconnectedAt: "google_disconnected_at",
    googleDisconnectReason: "google_disconnect_reason",
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn(() => "eq"),
}));
vi.mock("../lib/google-connection-state.js", () => ({
  markGoogleConnectionDisconnected: mocks.markDisconnected,
}));

import {
  getValidGoogleToken,
  GoogleAuthError,
} from "../lib/google-auth.js";

describe("Google token lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.selectWhere.mockClear();
    mocks.returning.mockClear();
    mocks.updateWhere.mockClear();
    mocks.set.mockClear();
    mocks.markDisconnected.mockClear();
    Object.assign(mocks.user, {
      id: "u-google",
      googleAccessToken: "expired-token",
      googleRefreshToken: "refresh-token",
      googleTokenExpiry: new Date(Date.now() - 60_000),
      googleTokenVersion: 0,
      googleDisconnectedAt: null,
      googleDisconnectReason: null,
    });
  });

  it("retries a temporary provider failure and preserves the connection", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "renewed-token",
        expires_in: 3600,
      }), { status: 200 }));

    await expect(getValidGoogleToken("u-google")).resolves.toBe("renewed-token");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mocks.markDisconnected).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      googleAccessToken: "renewed-token",
      googleDisconnectedAt: null,
      googleDisconnectReason: null,
    }));
  });

  it("clears the connection only for Google's invalid_grant response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: "Token has been expired or revoked.",
    }), { status: 400 }));

    await expect(getValidGoogleToken("u-google")).rejects.toMatchObject({
      name: "GoogleAuthError",
      reason: "disconnected",
    });
    expect(mocks.markDisconnected).toHaveBeenCalledWith(
      "u-google",
      "Token has been expired or revoked.",
      0,
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("does not restore a stale successful refresh after another request disconnects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      access_token: "stale-renewed-token",
      expires_in: 3600,
    }), { status: 200 }));
    mocks.returning.mockImplementationOnce(async () => {
      // Model the atomic terminal-disconnect write winning between our read and
      // version-qualified refresh update.
      Object.assign(mocks.user, {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        googleTokenVersion: 1,
        googleDisconnectedAt: new Date(),
        googleDisconnectReason: "Token revoked",
      });
      return [];
    });

    await expect(getValidGoogleToken("u-google")).rejects.toMatchObject({
      name: "GoogleAuthError",
      reason: "disconnected",
    });
  });
});