/**
 * WorldSmith compiler — missing-required-fields tests.
 *
 * Confirms that the compiler returns a structured 422 (not a 500 crash) when
 * the Production Specification is missing one of the three required fields, and
 * that a Notion 404 also produces a structured `failed` response rather than an
 * unhandled server error.
 *
 * Strategy:
 *   - Mock `getPage` in notion-client so we control what the Notion API returns.
 *   - Mock the run-repository so no database writes are needed.
 *   - Mount the worldsmith Express router with a synthetic auth middleware and
 *     exercise it via supertest to validate HTTP-level status codes too.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import type { User } from "@workspace/db";

// ── Module mocks (must be declared before any import that pulls them in) ──────

// vi.mock factories are hoisted above variable declarations, so mockGetPage
// must be created with vi.hoisted() to be accessible inside the factory.
const { mockGetPage } = vi.hoisted(() => ({ mockGetPage: vi.fn() }));

vi.mock("../lib/worldsmith/run-repository.js", () => ({
  createRun: vi.fn().mockResolvedValue("run-test-001"),
  updateRun: vi.fn().mockResolvedValue(undefined),
  failRun: vi.fn().mockResolvedValue(undefined),
  getRun: vi.fn().mockResolvedValue(null),
  getRunsBySpec: vi.fn().mockResolvedValue([]),
  failStaleRunsForSpec: vi.fn().mockResolvedValue(0),
}));

vi.mock("../lib/worldsmith/daybook-adapter.js", () => ({
  upsertAsset: vi.fn().mockResolvedValue({ asset_id: "test-asset" }),
  getAsset: vi.fn().mockResolvedValue(null),
  getAssetBySpec: vi.fn().mockResolvedValue(null),
  buildAssetId: vi.fn().mockReturnValue("test-asset-id"),
  buildFilename: vi.fn().mockReturnValue("test-file.json"),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NP = any;

vi.mock("../lib/notion-client.js", () => {
  return {
    _setOnRetry: vi.fn(),
    getPage: mockGetPage,
    getPageText: vi.fn().mockResolvedValue(""),
    updatePage: vi.fn().mockResolvedValue(undefined),
    createPage: vi.fn().mockResolvedValue({ id: "notion-new-page" }),
    richTextProp: (v: string) => ({ type: "rich_text", rich_text: [{ text: { content: v } }] }),
    selectProp: (v: string) => ({ type: "select", select: { name: v } }),
    relationProp: (ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) }),
    extractTitle(prop: NP): string {
      if (!prop) return "";
      if (prop.type === "title") return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
      if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
      return "";
    },
    extractRichText(prop: NP): string {
      if (!prop) return "";
      if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
      if (prop.type === "title") return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
      return "";
    },
    extractSelect(prop: NP): string {
      if (!prop) return "";
      if (prop.type === "select") return prop.select?.name ?? "";
      if (prop.type === "status") return prop.status?.name ?? "";
      return "";
    },
    extractMultiSelect(prop: NP): string[] {
      if (!prop) return [];
      if (prop.type === "multi_select") return (prop.multi_select ?? []).map((o: NP) => o.name ?? "");
      return [];
    },
    extractRelation(prop: NP): string[] {
      if (!prop) return [];
      if (prop.type === "relation") return (prop.relation ?? []).map((r: NP) => r.id ?? "");
      return [];
    },
    extractNumber(prop: NP): number | undefined {
      if (!prop) return undefined;
      if (prop.type === "number") return prop.number ?? undefined;
      return undefined;
    },
    extractUrl(prop: NP): string | undefined {
      if (!prop) return undefined;
      if (prop.type === "url") return prop.url ?? undefined;
      return undefined;
    },
    extractCheckbox(prop: NP): boolean {
      if (!prop) return false;
      if (prop.type === "checkbox") return prop.checkbox ?? false;
      return false;
    },
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { runCompilation } from "../lib/worldsmith/orchestrator.js";
import worldsmithRouter from "../routes/worldsmith.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal Notion-like page object with the given text-property values. */
function makePage(
  id: string,
  fields: Record<string, string | undefined>,
) {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      properties[key] = {
        type: "rich_text",
        rich_text: value ? [{ plain_text: value }] : [],
      };
    }
  }
  return { id, properties, url: `https://notion.so/${id}` };
}

/**
 * Build a page whose given keys are Notion relation properties pointing to the
 * supplied page IDs.  Other keys are built as rich_text, exactly like makePage.
 */
function makePageWithRelations(
  id: string,
  textFields: Record<string, string | undefined>,
  relationFields: Record<string, string[]>,
) {
  const page = makePage(id, textFields);
  for (const [key, ids] of Object.entries(relationFields)) {
    page.properties[key] = {
      type: "relation",
      relation: ids.map((rid) => ({ id: rid })),
    };
  }
  return page;
}

// Must be a valid 32-char hex UUID so normalizeNotionId() in the HTTP route
// handler doesn't reject it with 400 before calling runCompilation.
const SPEC_ID = "43fb4f74-303e-4f3f-8fdb-aea9294ca3f4";

const superAdminUser: User = {
  id: "u-test-sa",
  email: "test@daybook.app",
  name: "Test Super Admin",
  role: "owner",
  platformRole: "super_admin",
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
  planCurrentPeriodEnd: null,
  planStatus: null,
  stripeSubscriptionId: null,
  stripePaymentIntentId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeApp() {
  const app = express();
  app.use(express.json());
  // Silence pino logs during tests
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log = {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    };
    next();
  });
  // Inject a synthetic authenticated super-admin user
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    r.isAuthenticated = () => true;
    r.user = superAdminUser;
    next();
  });
  app.use("/api", worldsmithRouter);
  return app;
}

const app = makeApp();

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure NOTION_TOKEN is set so the orchestrator doesn't bail at stage 1
  process.env.NOTION_TOKEN = "test-token-not-real";
  vi.clearAllMocks();
});

// ── Orchestrator unit tests ───────────────────────────────────────────────────

describe("runCompilation — Missing World", () => {
  it("returns status=failed with code MISSING_WORLD", async () => {
    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        // World intentionally absent
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
      }),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("MISSING_WORLD");
    expect(result.failed_stage).toBe("resolve_world");
    expect(result.retry_safe).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("MISSING_WORLD");
  });
});

describe("runCompilation — Missing Component Type", () => {
  it("returns status=failed with code MISSING_COMPONENT_TYPE", async () => {
    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        World: "Thornvale",
        // Component Type intentionally absent
        "Payload Version": "PP-1.0",
      }),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("MISSING_COMPONENT_TYPE");
    expect(result.failed_stage).toBe("resolve_component_type");
    expect(result.retry_safe).toBe(false);
    expect(result.errors![0].code).toBe("MISSING_COMPONENT_TYPE");
  });
});

describe("runCompilation — Missing Payload Version", () => {
  it("returns status=failed with code MISSING_PAYLOAD_VERSION", async () => {
    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        World: "Thornvale",
        "Component Type": "Cover Art",
        // Payload Version intentionally absent
      }),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("MISSING_PAYLOAD_VERSION");
    expect(result.failed_stage).toBe("validate_payload_version");
    expect(result.retry_safe).toBe(false);
    expect(result.errors![0].code).toBe("MISSING_PAYLOAD_VERSION");
    expect(result.errors![0].message).toContain("Set it to PP-2.0");
    expect(result.errors![0].message).toContain("PP-1.0 remains supported only for legacy payloads");
  });
});

describe("runCompilation — Notion 404", () => {
  it("returns a structured failed response rather than throwing", async () => {
    mockGetPage.mockRejectedValue(
      new Error("Notion API GET /pages/spec-missing → 404: page not found"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    // Must be a structured response, not an unhandled exception
    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_PAGE_NOT_FOUND");
    expect(result.failed_stage).toBe("fetch_production_spec");
    // Notion 404 is retryable (transient connectivity issue or stale ID)
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
  });
});

describe("WorldSmith preflight — unavailable Notion page", () => {
  it("returns an actionable 404 instead of a server error for a valid but unavailable page ID", async () => {
    mockGetPage.mockRejectedValue(
      new Error("Notion API GET /pages/spec-missing → 404: Could not find page with ID"),
    );

    const res = await request(app)
      .get(`/api/v1/worldsmith/preflight?spec_id=${SPEC_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("SPEC_NOT_FOUND");
    expect(res.body.error).toContain("could not be found");
    expect(res.body.error).toContain("page ID");
    expect(res.body.error).toContain("Notion integration");
  });

  it("returns a distinct access-denied response when the page is not shared", async () => {
    const inaccessible = Object.assign(
      new Error("Notion API GET /pages/spec-restricted → 403: restricted_resource"),
      { status: 403 },
    );
    mockGetPage.mockRejectedValue(inaccessible);

    const res = await request(app)
      .get(`/api/v1/worldsmith/preflight?spec_id=${SPEC_ID}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SPEC_ACCESS_DENIED");
    expect(res.body.error).toContain("Share the page");
    expect(res.body.error).toContain("WorldSmith Notion integration");
  });
});

describe("runCompilation — Notion network timeout", () => {
  it("returns a structured failed response (not an unhandled rejection)", async () => {
    const timeoutErr = new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443");
    mockGetPage.mockRejectedValue(timeoutErr);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("fetch_production_spec");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_UNREACHABLE");
  });

  it("treats an AbortError as unreachable (not a crash)", async () => {
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    mockGetPage.mockRejectedValue(abortErr);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.retry_safe).toBe(true);
  });
});

describe("runCompilation — Notion 429 rate-limit", () => {
  it("returns a structured failed response with retry_safe=true", async () => {
    mockGetPage.mockRejectedValue(
      new Error("Notion API GET /pages/spec-test → 429: Too Many Requests"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_RATE_LIMITED");
    expect(result.failed_stage).toBe("fetch_production_spec");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_RATE_LIMITED");
  });
});

// ── HTTP integration tests — confirm the route maps status → HTTP code ────────

describe("POST /api/v1/prompt-compilations — HTTP status codes", () => {
  it("Missing World → 422 (not 500)", async () => {
    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
      }),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe("MISSING_WORLD");
    expect(res.body.status).toBe("failed");
  });

  it("Missing Component Type → 422 (not 500)", async () => {
    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        World: "Thornvale",
        "Payload Version": "PP-1.0",
      }),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe("MISSING_COMPONENT_TYPE");
  });

  it("Missing Payload Version → 422 (not 500)", async () => {
    mockGetPage.mockResolvedValue(
      makePage(SPEC_ID, {
        World: "Thornvale",
        "Component Type": "Cover Art",
      }),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(422);
    expect(res.body.error_code).toBe("MISSING_PAYLOAD_VERSION");
  });

  it("Notion 404 → 503 structured response (not 500 crash)", async () => {
    mockGetPage.mockRejectedValue(
      new Error("Notion API GET /pages/spec-missing → 404: page not found"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    // Must be a structured JSON body, not a bare 500 Internal Server Error
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_PAGE_NOT_FOUND");
    // errors array must be present and populated
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("Notion network timeout → 503 structured response (not 500 crash)", async () => {
    mockGetPage.mockRejectedValue(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_UNREACHABLE");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("Notion 429 rate-limit → 503 structured response with retry_safe=true", async () => {
    mockGetPage.mockRejectedValue(
      new Error("Notion API GET /pages/spec-test → 429: Too Many Requests"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_RATE_LIMITED");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("omitting notion_production_spec_id → 400 before any Notion call", async () => {
    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ operation: "validate_and_compile" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MISSING_SPEC_ID");
    // getPage should never have been called
    expect(mockGetPage).not.toHaveBeenCalled();
  });
});

// ── Inner resolver error classification ───────────────────────────────────────
// These tests confirm that timeout / 429 errors that occur while fetching a
// *dependent* record (Style Guide, Component Spec, Prompt Module, Canon Record)
// surface as NOTION_UNREACHABLE / NOTION_RATE_LIMITED rather than the generic
// "_NOT_FOUND" codes that used to mask the real failure.

const STYLE_GUIDE_ID = "sg-test-001";
const MODULE_ID = "mod-test-001";
const COMPONENT_SPEC_ID = "cs-test-001";
const CANON_RECORD_ID = "cr-test-001";

/** A valid production spec page that links a Style Guide and a Prompt Module. */
function makeFullSpecPage() {
  return makePageWithRelations(
    SPEC_ID,
    {
      World: "Thornvale",
      "Component Type": "Cover Art",
      "Payload Version": "PP-1.0",
    },
    {
      "Style Guide": [STYLE_GUIDE_ID],
      "Prompt Modules": [MODULE_ID],
    },
  );
}

/**
 * A valid production spec page that links a Component Specification.
 * No Style Guide so the resolver reaches Component Spec on the second getPage call.
 */
function makeSpecWithComponentSpec() {
  return makePageWithRelations(
    SPEC_ID,
    {
      World: "Thornvale",
      "Component Type": "Cover Art",
      "Payload Version": "PP-1.0",
    },
    {
      "Component Specification": [COMPONENT_SPEC_ID],
    },
  );
}

/**
 * A valid production spec page that links Canon Records.
 * No Style Guide, Component Spec, or Prompt Modules so the resolver reaches
 * Canon Records on the second getPage call.
 */
function makeSpecWithCanonRecords() {
  return makePageWithRelations(
    SPEC_ID,
    {
      World: "Thornvale",
      "Component Type": "Cover Art",
      "Payload Version": "PP-1.0",
    },
    {
      "Canon Records": [CANON_RECORD_ID],
    },
  );
}

describe("runCompilation — Style Guide network timeout", () => {
  it("returns NOTION_UNREACHABLE (not STYLE_GUIDE_NOT_FOUND) when the Style Guide fetch times out", async () => {
    // First call: production spec succeeds
    mockGetPage.mockResolvedValueOnce(makeFullSpecPage());
    // Second call: style guide times out
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("resolve_style_guide");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_UNREACHABLE");
  });

  it("treats Style Guide AbortError as NOTION_UNREACHABLE", async () => {
    mockGetPage.mockResolvedValueOnce(makeFullSpecPage());
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    mockGetPage.mockRejectedValueOnce(abortErr);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("resolve_style_guide");
    expect(result.retry_safe).toBe(true);
  });
});

describe("runCompilation — Style Guide 429 rate-limit", () => {
  it("returns NOTION_RATE_LIMITED (not STYLE_GUIDE_NOT_FOUND) when Notion rate-limits the Style Guide fetch", async () => {
    mockGetPage.mockResolvedValueOnce(makeFullSpecPage());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/sg-test-001 → 429: Too Many Requests"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_RATE_LIMITED");
    expect(result.failed_stage).toBe("resolve_style_guide");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_RATE_LIMITED");
  });
});

describe("runCompilation — Style Guide genuine 404", () => {
  it("returns STYLE_GUIDE_NOT_FOUND when the Style Guide page truly does not exist", async () => {
    mockGetPage.mockResolvedValueOnce(makeFullSpecPage());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/sg-test-001 → 404: Could not find page with ID"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("STYLE_GUIDE_NOT_FOUND");
    expect(result.failed_stage).toBe("resolve_style_guide");
    expect(result.retry_safe).toBe(true);
  });
});

describe("POST /api/v1/prompt-compilations — inner resolver HTTP status codes", () => {
  it("Style Guide timeout → 503 NOTION_UNREACHABLE (not 500 crash)", async () => {
    mockGetPage.mockResolvedValueOnce(makeFullSpecPage());
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_UNREACHABLE");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("Style Guide 429 → 503 NOTION_RATE_LIMITED (not 500 crash)", async () => {
    mockGetPage.mockResolvedValueOnce(makeFullSpecPage());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/sg-test-001 → 429: Too Many Requests"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_RATE_LIMITED");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

// ── Component Spec error classification ───────────────────────────────────────

describe("runCompilation — Component Spec network timeout", () => {
  it("returns NOTION_UNREACHABLE (not COMPONENT_SPEC_NOT_FOUND) when the Component Spec fetch times out", async () => {
    // First call: production spec succeeds (with a Component Specification relation)
    mockGetPage.mockResolvedValueOnce(makeSpecWithComponentSpec());
    // Second call: component spec times out
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("resolve_component_spec");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_UNREACHABLE");
  });

  it("treats Component Spec AbortError as NOTION_UNREACHABLE", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithComponentSpec());
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    mockGetPage.mockRejectedValueOnce(abortErr);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("resolve_component_spec");
    expect(result.retry_safe).toBe(true);
  });
});

describe("runCompilation — Component Spec 429 rate-limit", () => {
  it("returns NOTION_RATE_LIMITED (not COMPONENT_SPEC_NOT_FOUND) when Notion rate-limits the Component Spec fetch", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithComponentSpec());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/cs-test-001 → 429: Too Many Requests"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_RATE_LIMITED");
    expect(result.failed_stage).toBe("resolve_component_spec");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_RATE_LIMITED");
  });
});

describe("runCompilation — Component Spec genuine 404", () => {
  it("returns COMPONENT_SPEC_NOT_FOUND when the Component Spec page truly does not exist", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithComponentSpec());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/cs-test-001 → 404: Could not find page with ID"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("COMPONENT_SPEC_NOT_FOUND");
    expect(result.failed_stage).toBe("resolve_component_spec");
    expect(result.retry_safe).toBe(true);
  });
});

// ── Canon Record error classification ────────────────────────────────────────

describe("runCompilation — Canon Record network timeout", () => {
  it("returns NOTION_UNREACHABLE (not CANON_RECORD_NOT_FOUND) when the Canon Record fetch times out", async () => {
    // First call: production spec succeeds (with a Canon Records relation, no other deps)
    mockGetPage.mockResolvedValueOnce(makeSpecWithCanonRecords());
    // Second call: canon record times out
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("resolve_canon_records");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_UNREACHABLE");
  });

  it("treats Canon Record AbortError as NOTION_UNREACHABLE", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithCanonRecords());
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    mockGetPage.mockRejectedValueOnce(abortErr);

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_UNREACHABLE");
    expect(result.failed_stage).toBe("resolve_canon_records");
    expect(result.retry_safe).toBe(true);
  });
});

describe("runCompilation — Canon Record 429 rate-limit", () => {
  it("returns NOTION_RATE_LIMITED (not CANON_RECORD_NOT_FOUND) when Notion rate-limits the Canon Record fetch", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithCanonRecords());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/cr-test-001 → 429: Too Many Requests"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("NOTION_RATE_LIMITED");
    expect(result.failed_stage).toBe("resolve_canon_records");
    expect(result.retry_safe).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0].code).toBe("NOTION_RATE_LIMITED");
  });
});

describe("runCompilation — Canon Record genuine 404", () => {
  it("returns CANON_RECORD_NOT_FOUND when the Canon Record page truly does not exist", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithCanonRecords());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/cr-test-001 → 404: Could not find page with ID"),
    );

    const result = await runCompilation(
      { notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true },
      "test-user",
    );

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("CANON_RECORD_NOT_FOUND");
    expect(result.failed_stage).toBe("resolve_canon_records");
    expect(result.retry_safe).toBe(true);
  });
});

describe("POST /api/v1/prompt-compilations — Component Spec and Canon Record HTTP status codes", () => {
  it("Component Spec timeout → 503 NOTION_UNREACHABLE (not 500 crash)", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithComponentSpec());
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_UNREACHABLE");
    expect(res.body.failed_stage).toBe("resolve_component_spec");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("Component Spec 429 → 503 NOTION_RATE_LIMITED (not 500 crash)", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithComponentSpec());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/cs-test-001 → 429: Too Many Requests"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_RATE_LIMITED");
    expect(res.body.failed_stage).toBe("resolve_component_spec");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("Canon Record timeout → 503 NOTION_UNREACHABLE (not 500 crash)", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithCanonRecords());
    mockGetPage.mockRejectedValueOnce(
      new Error("connect ETIMEDOUT 2a00:1450:4001:82b::200a:443"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_UNREACHABLE");
    expect(res.body.failed_stage).toBe("resolve_canon_records");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("Canon Record 429 → 503 NOTION_RATE_LIMITED (not 500 crash)", async () => {
    mockGetPage.mockResolvedValueOnce(makeSpecWithCanonRecords());
    mockGetPage.mockRejectedValueOnce(
      new Error("Notion API GET /pages/cr-test-001 → 429: Too Many Requests"),
    );

    const res = await request(app)
      .post("/api/v1/prompt-compilations")
      .send({ notion_production_spec_id: SPEC_ID, operation: "validate_and_compile", dry_run: true });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("failed");
    expect(res.body.error_code).toBe("NOTION_RATE_LIMITED");
    expect(res.body.failed_stage).toBe("resolve_canon_records");
    expect(res.body.retry_safe).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});
