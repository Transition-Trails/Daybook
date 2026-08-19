/**
 * WorldSmith copilot — attachment handling tests.
 *
 * Verifies:
 *  a) Image attachment: builds correct multimodal AiCallOptions and calls callAi with it.
 *  b) Document attachment: decodes base64 text and passes it as textAttachments.
 *  c) Oversized document (> 50 000 chars) is rejected with 400.
 *  d) Unknown/unsupported image media type is rejected with 400.
 *  e) Text-only request (no attachment) continues to work unchanged.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import type { User } from "@workspace/db";

// ── vi.hoisted ────────────────────────────────────────────────────────────────

const { mockCallAi, mockDbResult } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockDbResult: { value: [] as unknown[] },
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("../lib/ai-proxy.js", () => ({
  callAi: mockCallAi,
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const superAdminUser: User = {
  id: "u-sa-attach",
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
  app.use(express.json({ limit: "10mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const r = req as any;
    r.isAuthenticated = () => true;
    r.user = superAdminUser;
    next();
  });
  app.use("/api", worldsmithRouter);
  return app;
}

const app = makeApp();

/** Encode a string as a base64 data URI for text/plain */
function textDataUri(text: string): string {
  return `data:text/plain;base64,${Buffer.from(text).toString("base64")}`;
}

/** Build a minimal fake PNG base64 data URI (1×1 PNG) */
const TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_B64}`;

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult.value = [];
  mockCallAi.mockResolvedValue({ content: "A fine reply.", provider: "claude", model: "claude-opus-4-5" });
  process.env.DEFAULT_AI_PROVIDER = "claude";
});

// ── (a) Image attachment ──────────────────────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — image attachment", () => {
  it("calls callAi with imageAttachments on the options arg when an image is attached", async () => {
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "editorial",
        message: "What colours does this image use?",
        history: [],
        context: {},
        attachmentDataUrl: TINY_PNG_DATA_URI,
        attachmentMediaType: "image/png",
        attachmentKind: "image",
        attachmentName: "swatch.png",
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages, , , options] = mockCallAi.mock.calls[0] as Parameters<typeof mockCallAi>;

    // The final user message should be text-only (options carries the image)
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "What colours does this image use?",
    });

    // Options must contain the image attachment
    expect(options).toBeDefined();
    expect(options.imageAttachments).toHaveLength(1);
    expect(options.imageAttachments[0]).toMatchObject({
      base64: TINY_PNG_B64,
      mediaType: "image/png",
      name: "swatch.png",
    });
    expect(options.textAttachments).toBeUndefined();
  });

  it("normalises image/jpg to image/jpeg in the attachment block", async () => {
    const jpgDataUri = `data:image/jpg;base64,${TINY_PNG_B64}`;

    await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "spec",
        message: "Describe this.",
        history: [],
        context: {},
        attachmentDataUrl: jpgDataUri,
        attachmentMediaType: "image/jpg",
        attachmentKind: "image",
        attachmentName: "ref.jpg",
      });

    const [, , , options] = mockCallAi.mock.calls[0] as Parameters<typeof mockCallAi>;
    expect(options.imageAttachments[0].mediaType).toBe("image/jpeg");
  });

  it.each(["claude", "chatgpt", "gemini"] as const)(
    "passes the vision attachment through when %s is the configured provider",
    async (provider) => {
      process.env.DEFAULT_AI_PROVIDER = provider;

      const res = await request(app)
        .post("/api/v1/worldsmith/copilot")
        .send({
          surface: "editorial",
          message: "Use this visual reference.",
          history: [],
          context: {},
          attachmentDataUrl: TINY_PNG_DATA_URI,
          attachmentMediaType: "image/png",
          attachmentKind: "image",
          attachmentName: "reference.png",
        });

      expect(res.status).toBe(200);
      const [, configuredProvider, , options] = mockCallAi.mock.calls[0] as Parameters<typeof mockCallAi>;
      expect(configuredProvider).toBe(provider);
      expect(options.imageAttachments[0]).toMatchObject({
        base64: TINY_PNG_B64,
        mediaType: "image/png",
        name: "reference.png",
      });
    },
  );
});

// ── (b) Document attachment ───────────────────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — document attachment", () => {
  it("decodes base64 text and passes it as textAttachments", async () => {
    const docText = "The Amber Archive — world overview.\nWychcombe was founded in 1847.";
    const dataUri = textDataUri(docText);

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "editorial",
        message: "Summarise this document.",
        history: [],
        context: {},
        attachmentDataUrl: dataUri,
        attachmentMediaType: "text/plain",
        attachmentKind: "document",
        attachmentName: "overview.txt",
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [, , , options] = mockCallAi.mock.calls[0] as Parameters<typeof mockCallAi>;
    expect(options).toBeDefined();
    expect(options.textAttachments).toHaveLength(1);
    expect(options.textAttachments[0]).toMatchObject({
      text: docText,
      name: "overview.txt",
    });
    expect(options.imageAttachments).toBeUndefined();
  });
});

// ── (c) Oversized document ────────────────────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — oversized document", () => {
  it("returns 400 when the decoded text exceeds 50 000 characters", async () => {
    const longText = "A".repeat(50_001);
    const dataUri = textDataUri(longText);

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .set("content-type", "application/json")
      .send(
        JSON.stringify({
          surface: "spec",
          message: "Read this.",
          history: [],
          context: {},
          attachmentDataUrl: dataUri,
          attachmentMediaType: "text/plain",
          attachmentKind: "document",
          attachmentName: "too-big.txt",
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ATTACHMENT_TOO_LONG");
    expect(mockCallAi).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/worldsmith/copilot — oversized image", () => {
  it("returns 400 before calling AI when decoded image bytes exceed 4 MB", async () => {
    const tooLargeBase64 = Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64");

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "spec",
        message: "Read this reference.",
        history: [],
        context: {},
        attachmentDataUrl: `data:image/png;base64,${tooLargeBase64}`,
        attachmentMediaType: "image/png",
        attachmentKind: "image",
        attachmentName: "too-large.png",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ATTACHMENT_TOO_LARGE");
    expect(mockCallAi).not.toHaveBeenCalled();
  });
});

// ── (d) Unknown image media type ──────────────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — unsupported image type", () => {
  it("returns 400 for a non-allowlisted image MIME type", async () => {
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "spec",
        message: "Look at this.",
        history: [],
        context: {},
        attachmentDataUrl: `data:image/tiff;base64,${TINY_PNG_B64}`,
        attachmentMediaType: "image/tiff",
        attachmentKind: "image",
        attachmentName: "scan.tiff",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ATTACHMENT_TYPE");
    expect(mockCallAi).not.toHaveBeenCalled();
  });
});

// ── (e) Text-only request (no attachment) ─────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — no attachment", () => {
  it("calls callAi without options when no attachment is supplied", async () => {
    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "story",
        message: "Who is Lady Mireth?",
        history: [],
        context: {},
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [, , , options] = mockCallAi.mock.calls[0] as Parameters<typeof mockCallAi>;
    // options should be undefined — no attachment was supplied
    expect(options).toBeUndefined();
  });
});
