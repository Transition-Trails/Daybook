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

const SPEC_ID = "spec-test-abc123";

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
