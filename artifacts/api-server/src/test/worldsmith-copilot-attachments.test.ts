/**
 * WorldSmith copilot — attachment handling tests.
 *
 * Verifies:
 *  (a) Image path builds the correct multimodal content array and calls callAi with it.
 *  (b) Document path prepends the decoded text as a context block to the user message.
 *  (c) Oversized image payload is rejected with 400.
 *  (d) Oversized document text is rejected with 400.
 *  (e) Unknown / unrecognised image media type is rejected with 400.
 *  (f) Image turns force Claude even when another provider is configured.
 *  (g) Missing attachmentDataUrl when attachmentKind is set → 400.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import type { User } from "@workspace/db";

// ── vi.hoisted — variables referenced inside vi.mock factories ─────────────────

const { mockCallAi, mockDbResult } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockDbResult: { value: [] as unknown[] },
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/ai-proxy.js", () => ({
  callAi: mockCallAi,
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");

  function builder() {
    const self = {
      select: () => self,
      from: () => self,
      where: () => self,
      limit: () => Promise.resolve(mockDbResult.value),
      leftJoin: () => self,
      orderBy: () => self,
      innerJoin: () => self,
    };
    return self;
  }

  return { ...actual, db: builder() };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import worldsmithRouter from "../routes/worldsmith.js";

// ── App fixture ───────────────────────────────────────────────────────────────

const superAdminUser: User = {
  id: "u-sa-attach",
  email: "attach@daybook.app",
  name: "Attach Test Admin",
  role: "owner",
  platformRole: "super_admin",
  provider: "google",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: true,
  aiProvider: "claude",
  connections: {
    googleDrive: false, googleCalendar: false, googleTasks: false,
    googleDocs: false, notion: false,
  },
  googleId: null, googleAccessToken: null, googleRefreshToken: null,
  googleTokenExpiry: null, notionToken: null, passwordHash: null,
  stripeCustomerId: null, planCurrentPeriodEnd: null, planStatus: null,
  stripeSubscriptionId: null, stripePaymentIntentId: null,
  stripeSubscriptionEventCreatedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};

function makeApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).isAuthenticated = () => true;
    (req as any).user = superAdminUser;
    next();
  });
  app.use("/api", worldsmithRouter);
  return app;
}

const app = makeApp();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 1×1 transparent PNG as a base64 string */
const TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;

function textToBase64DataUrl(text: string): string {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  return `data:text/plain;base64,${b64}`;
}

const BASE_BODY = {
  surface: "canon_record",
  message: "Tell me about the colour palette.",
  history: [],
  context: { recordName: "Lady Mireth", recordType: "character" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult.value = [];
  mockCallAi.mockResolvedValue({ content: "A rich reply.", provider: "claude", model: "claude-opus-4-5" });
  process.env.DEFAULT_AI_PROVIDER = "claude";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — image attachment", () => {
  it("(a) builds a multimodal content array for Claude when an image is attached", async () => {
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentDataUrl: TINY_PNG_DATA_URL,
        attachmentMediaType: "image/png",
        attachmentKind: "image",
        attachmentName: "swatch.png",
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages] = mockCallAi.mock.calls[0] as [unknown[], ...unknown[]];
    const lastMsg = messages[messages.length - 1] as {
      role: string;
      content: Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }>;
    };

    expect(lastMsg.role).toBe("user");
    expect(Array.isArray(lastMsg.content)).toBe(true);

    const imageBlock = lastMsg.content.find(b => b.type === "image");
    expect(imageBlock).toBeDefined();
    expect(imageBlock?.source?.type).toBe("base64");
    expect(imageBlock?.source?.media_type).toBe("image/png");
    expect(imageBlock?.source?.data).toBe(TINY_PNG_B64);

    const textBlock = lastMsg.content.find(b => b.type === "text");
    expect(textBlock).toBeDefined();
    expect(textBlock?.text).toBe(BASE_BODY.message);
  });

  it("(c) rejects an image payload exceeding 4 MB with 400", async () => {
    // Generate > 4 MB of base64 data (the bytes themselves need to be > 4 MB)
    const overLimitBytes = Buffer.alloc(4 * 1024 * 1024 + 1, 0xff);
    const bigB64 = overLimitBytes.toString("base64");
    const bigDataUrl = `data:image/png;base64,${bigB64}`;

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentDataUrl: bigDataUrl,
        attachmentMediaType: "image/png",
        attachmentKind: "image",
        attachmentName: "big.png",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ATTACHMENT_TOO_LARGE");
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("(e) rejects an unknown image media type with 400", async () => {
    const b64 = Buffer.from("fake data").toString("base64");
    // TIFF is not an accepted type
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentDataUrl: `data:image/tiff;base64,${b64}`,
        attachmentMediaType: "image/tiff",
        attachmentKind: "image",
        attachmentName: "scan.tiff",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ATTACHMENT_MEDIA_TYPE");
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("(g) rejects request when attachmentKind is set but attachmentDataUrl is missing", async () => {
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentKind: "image",
        attachmentName: "missing.png",
        // no attachmentDataUrl
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ATTACHMENT");
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("(f) routes image-bearing turns through Claude even when another provider is configured", async () => {
    process.env.DEFAULT_AI_PROVIDER = "chatgpt";

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentDataUrl: TINY_PNG_DATA_URL,
        attachmentMediaType: "image/png",
        attachmentKind: "image",
        attachmentName: "swatch.png",
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages, provider] = mockCallAi.mock.calls[0] as [unknown[], string, ...unknown[]];
    const lastMsg = messages[messages.length - 1] as { role: string; content: unknown };

    expect(provider).toBe("claude");
    expect(lastMsg.content).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: TINY_PNG_B64,
        },
      },
      { type: "text", text: BASE_BODY.message },
    ]);
  });
});

describe("POST /api/v1/worldsmith/copilot — document attachment", () => {
  it("(b) prepends decoded document text as a context block before the user message", async () => {
    const docText = "Chapter 1: The amber market opened at dawn.";
    const docDataUrl = textToBase64DataUrl(docText);

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentDataUrl: docDataUrl,
        attachmentMediaType: "text/plain",
        attachmentKind: "document",
        attachmentName: "chapter1.txt",
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages] = mockCallAi.mock.calls[0] as [unknown[], ...unknown[]];
    const lastMsg = messages[messages.length - 1] as { role: string; content: string };

    expect(lastMsg.role).toBe("user");
    expect(typeof lastMsg.content).toBe("string");
    // Must contain the document text
    expect(lastMsg.content).toContain(docText);
    // Must contain the user message after the doc context
    expect(lastMsg.content).toContain(BASE_BODY.message);
    // Document must appear before the user message
    expect(lastMsg.content.indexOf(docText)).toBeLessThan(lastMsg.content.indexOf(BASE_BODY.message));
    // Should carry the file name label
    expect(lastMsg.content).toContain("chapter1.txt");
  });

  it("(d) rejects a document whose decoded text exceeds 50,000 characters with 400", async () => {
    const bigText = "A".repeat(50_001);
    const bigDataUrl = textToBase64DataUrl(bigText);

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        ...BASE_BODY,
        attachmentDataUrl: bigDataUrl,
        attachmentMediaType: "text/plain",
        attachmentKind: "document",
        attachmentName: "too-large.txt",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ATTACHMENT_TOO_LARGE");
    expect(mockCallAi).not.toHaveBeenCalled();
  });

  it("works when no attachment is present (baseline unchanged)", async () => {
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send(BASE_BODY);

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages] = mockCallAi.mock.calls[0] as [unknown[], ...unknown[]];
    const lastMsg = messages[messages.length - 1] as { role: string; content: unknown };

    // Must be a plain string, not a multimodal array
    expect(typeof lastMsg.content).toBe("string");
    expect(lastMsg.content).toBe(BASE_BODY.message);
  });
});
