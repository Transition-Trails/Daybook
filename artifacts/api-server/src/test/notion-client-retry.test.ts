/**
 * Tests for the Notion client's 429 retry / back-off behaviour.
 *
 * Strategy:
 *  - Override global `fetch` with vi.fn() to control what Notion returns.
 *  - Inject a no-op sleep so tests finish instantly.
 *  - Verify retry counts, delay calculations, and final error shapes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const headersObj = new Headers(headers);
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headersObj,
    text: () => Promise.resolve(bodyStr),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response;
}

// ── Module-level setup ─────────────────────────────────────────────────────────

// We import the module dynamically after mocking fetch so each test suite gets
// a clean module (via vi.resetModules in beforeEach).
//
// NOTION_TOKEN must be set before the module loads or headers() throws.
const OLD_TOKEN = process.env.NOTION_TOKEN;

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token";
  vi.resetModules();
});

afterEach(() => {
  process.env.NOTION_TOKEN = OLD_TOKEN;
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("notionFetch — 429 retry", () => {
  it("succeeds on the second attempt when the first returns 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, "rate limited"))
      .mockResolvedValueOnce(makeResponse(200, { id: "page-1", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    const page = await getPage("page-1");
    expect(page.id).toBe("page-1");
    // fetch called twice: once for 429, once for the successful retry
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // sleep called once between attempts
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  it("uses the Retry-After header value (in seconds) as the delay", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, "rate limited", { "Retry-After": "5" }))
      .mockResolvedValueOnce(makeResponse(200, { id: "page-2", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepDelays: number[] = [];
    _setSleep(async (ms) => { sleepDelays.push(ms); });

    await getPage("page-2");

    expect(sleepDelays).toHaveLength(1);
    // 5 seconds → 5000 ms
    expect(sleepDelays[0]).toBe(5_000);
  });

  it("falls back to exponential back-off when Retry-After is absent", async () => {
    // Three 429s then success — tests delays for attempts 0, 1, 2
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, "rate limited"))
      .mockResolvedValueOnce(makeResponse(429, "rate limited"))
      .mockResolvedValueOnce(makeResponse(429, "rate limited"))
      .mockResolvedValueOnce(makeResponse(200, { id: "page-3", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepDelays: number[] = [];
    _setSleep(async (ms) => { sleepDelays.push(ms); });

    await getPage("page-3");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleepDelays).toHaveLength(3);
    // Exponential: 1s, 2s, 4s (2^0, 2^1, 2^2)
    expect(sleepDelays[0]).toBe(1_000);
    expect(sleepDelays[1]).toBe(2_000);
    expect(sleepDelays[2]).toBe(4_000);
  });

  it("caps delay at 30 s regardless of Retry-After or back-off", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(429, "rate limited", { "Retry-After": "120" }))
      .mockResolvedValueOnce(makeResponse(200, { id: "page-4", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepDelays: number[] = [];
    _setSleep(async (ms) => { sleepDelays.push(ms); });

    await getPage("page-4");

    expect(sleepDelays[0]).toBe(30_000);
  });

  it("throws after all 3 retries are exhausted with a message containing '429'", async () => {
    // Four 429s — one initial + three retries — should exhaust all attempts
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(429, "rate limited"));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    await expect(getPage("page-x")).rejects.toThrow(/429/);

    // 1 initial attempt + 3 retries = 4 total fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // sleep called for each of the 3 retry intervals
    expect(sleepMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-429 errors (e.g. 404)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(404, "not found"));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    await expect(getPage("page-missing")).rejects.toThrow(/404/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("does not retry on non-429 errors (e.g. 500)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(500, "internal server error"));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    await expect(getPage("page-broken")).rejects.toThrow(/500/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });
});

describe("notionFetch — network-level retry", () => {
  it("succeeds on the second attempt when the first throws AbortError", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(makeResponse(200, { id: "page-net-1", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    const page = await getPage("page-net-1");
    expect(page.id).toBe("page-net-1");
    // fetch called twice: once for AbortError, once for the successful retry
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // sleep called once between attempts
    expect(sleepMock).toHaveBeenCalledTimes(1);
    // delay should be 1 s (2^0 * 1000) for the first retry
    expect(sleepMock).toHaveBeenCalledWith(1_000);
  });

  it("throws after three consecutive AbortErrors", async () => {
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    const fetchMock = vi.fn().mockRejectedValue(abortError);

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    await expect(getPage("page-net-err")).rejects.toThrow(/aborted/i);

    // 1 initial attempt + 3 retries = 4 total fetch calls
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // sleep called for each of the 3 retry intervals
    expect(sleepMock).toHaveBeenCalledTimes(3);
  });

  // Helpers to build realistic Node fetch error shapes.
  // Node's native fetch (undici) wraps socket errors as:
  //   TypeError("fetch failed") { cause: Error { code: "ECONNRESET" } }
  function makeNodeFetchError(code: string): TypeError {
    const cause = Object.assign(new Error(`connect ${code}`), { code });
    return Object.assign(new TypeError("fetch failed"), { cause });
  }

  it("retries on ECONNRESET wrapped in a Node-style TypeError cause", async () => {
    const connError = makeNodeFetchError("ECONNRESET");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connError)
      .mockResolvedValueOnce(makeResponse(200, { id: "page-net-2", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    const page = await getPage("page-net-2");
    expect(page.id).toBe("page-net-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  it("retries on ECONNREFUSED wrapped in a Node-style TypeError cause", async () => {
    const connError = makeNodeFetchError("ECONNREFUSED");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connError)
      .mockResolvedValueOnce(makeResponse(200, { id: "page-net-4", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    const page = await getPage("page-net-4");
    expect(page.id).toBe("page-net-4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  it("retries on ETIMEDOUT wrapped in a Node-style TypeError cause", async () => {
    const connError = makeNodeFetchError("ETIMEDOUT");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connError)
      .mockResolvedValueOnce(makeResponse(200, { id: "page-net-5", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    const page = await getPage("page-net-5");
    expect(page.id).toBe("page-net-5");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry on non-retryable fetch errors", async () => {
    const genericError = new Error("some unexpected error");
    const fetchMock = vi.fn().mockRejectedValue(genericError);

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    await expect(getPage("page-net-noretry")).rejects.toThrow("some unexpected error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("does not retry on a TypeError whose cause has a non-retryable code", async () => {
    const cause = Object.assign(new Error("something else"), { code: "ENOENT" });
    const wrappedError = Object.assign(new TypeError("fetch failed"), { cause });
    const fetchMock = vi.fn().mockRejectedValue(wrappedError);

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    _setSleep(sleepMock);

    await expect(getPage("page-net-noretry-2")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("uses exponential back-off for consecutive Node-style network errors", async () => {
    const connError = makeNodeFetchError("ECONNRESET");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(connError)
      .mockRejectedValueOnce(connError)
      .mockRejectedValueOnce(connError)
      .mockResolvedValueOnce(makeResponse(200, { id: "page-net-3", properties: {}, url: "" }));

    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    const sleepDelays: number[] = [];
    _setSleep(async (ms) => { sleepDelays.push(ms); });

    await getPage("page-net-3");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleepDelays).toHaveLength(3);
    // Exponential: 1s, 2s, 4s (2^0, 2^1, 2^2)
    expect(sleepDelays[0]).toBe(1_000);
    expect(sleepDelays[1]).toBe(2_000);
    expect(sleepDelays[2]).toBe(4_000);
  });
});

describe("notionFetch — 429 error message / classifyNotionErr compatibility", () => {
  it("thrown error message is recognisable as NOTION_RATE_LIMITED by classifyNotionErr", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(429, "rate limited"));
    vi.stubGlobal("fetch", fetchMock);

    const { _setSleep, getPage } = await import("../lib/notion-client.js");
    _setSleep(vi.fn().mockResolvedValue(undefined));

    let thrown: Error | null = null;
    try {
      await getPage("page-rate");
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).not.toBeNull();
    // classifyNotionErr matches on /429|rate.?limit/i
    expect(thrown!.message).toMatch(/429/);
  });
});

describe("notionFetch — structured lookup failures", () => {
  it("preserves the HTTP status for an unavailable or inaccessible page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeResponse(403, { object: "error", code: "restricted_resource", message: "Could not access page" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { NotionApiError, getPage } = await import("../lib/notion-client.js");

    await expect(getPage("page-restricted")).rejects.toMatchObject({
      name: "NotionApiError",
      status: 403,
      method: "GET",
      path: "/pages/page-restricted",
      notionCode: "restricted_resource",
    });
    await expect(getPage("page-restricted")).rejects.toBeInstanceOf(NotionApiError);
  });
});
