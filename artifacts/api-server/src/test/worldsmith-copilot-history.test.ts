/**
 * WorldSmith copilot — conversation-history semantics tests.
 *
 * Verifies that:
 *  1. A history whose first turn is an assistant message (e.g. the client-side
 *     synthetic greeting) is normalised so the outbound Messages array always
 *     starts with a user turn — required by Anthropic's Messages API.
 *  2. Real generated assistant turns that follow the first user turn are
 *     preserved intact in later exchanges.
 *  3. The generic /copilot surface and the /worlds/:id/bible-copilot endpoint
 *     both apply the same normalization.
 *
 * Strategy:
 *   - Mock `@workspace/db` so DB queries return a world row without touching
 *     the real database.
 *   - Mock `../lib/ai-proxy.js` (callAi) and capture the Messages array that
 *     the route hands it.
 *   - Mount the worldsmith router with a synthetic super-admin middleware,
 *     and drive requests via supertest.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import type { User } from "@workspace/db";

// ── vi.hoisted — variables referenced inside vi.mock factories ────────────────

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

  // Build a fluent drizzle-like builder that resolves with mockDbResult.value
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

  return {
    ...actual,
    db: builder(),
  };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import worldsmithRouter from "../routes/worldsmith.js";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const superAdminUser: User = {
  id: "u-sa-history",
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
  app.use("/api", worldsmithRouter);
  return app;
}

const app = makeApp();

const WORLD_ROW = {
  id: "world-hist-01",
  name: "Thornvale",
  code: "TV",
  description: null,
  visualPalette: "Amber and ochre",
  proseVoice: "Victorian naturalist",
  atmosphericNotes: null,
  materialWorld: null,
  worldRules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDbResult.value = [WORLD_ROW];
  mockCallAi.mockResolvedValue({ content: "A fine reply.", provider: "claude", model: "claude-3-opus" });
  process.env.DEFAULT_AI_PROVIDER = "claude";
});

// ── Generic /v1/worldsmith/copilot ────────────────────────────────────────────

describe("POST /api/v1/worldsmith/copilot — history normalisation", () => {
  it("first outbound message is always a user turn, even when history starts with an assistant message", async () => {
    const historyWithLeadingAssistant = [
      { role: "assistant", content: "Welcome — I'm here to help you develop Thornvale." },
    ];

    const res = await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "story",
        worldId: WORLD_ROW.id,
        field: "summary",
        fieldLabel: "Summary",
        message: "What tone should the story opening have?",
        history: historyWithLeadingAssistant,
        context: { storyTitle: "The Amber Archive", storyActs: [] },
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages] = mockCallAi.mock.calls[0] as [{ role: string; content: string }[], ...unknown[]];

    // The leading assistant message must have been stripped.
    expect(messages[0].role).toBe("user");
    expect(messages[messages.length - 1].role).toBe("user");
    expect(messages[messages.length - 1].content).toBe("What tone should the story opening have?");
  });

  it("preserves real generated assistant turns that follow the first user turn", async () => {
    const multiTurnHistory = [
      // synthetic greeting — should be stripped
      { role: "assistant", content: "Welcome to Thornvale." },
      // first real exchange — must be kept
      { role: "user", content: "Tell me about the opening chapter." },
      { role: "assistant", content: "The opening unfolds at dawn in the amber market." },
    ];

    await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "story",
        message: "Can you expand on that?",
        history: multiTurnHistory,
        context: {},
      });

    expect(mockCallAi).toHaveBeenCalledOnce();
    const [messages] = mockCallAi.mock.calls[0] as [{ role: string; content: string }[], ...unknown[]];

    // Synthetic greeting stripped; subsequent user+assistant turns kept.
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Tell me about the opening chapter.");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("The opening unfolds at dawn in the amber market.");
    // Final user turn is the current message.
    expect(messages[messages.length - 1].role).toBe("user");
    expect(messages[messages.length - 1].content).toBe("Can you expand on that?");
  });

  it("passes through normally when history already starts with a user turn", async () => {
    const normalHistory = [
      { role: "user", content: "How should the visual palette feel?" },
      { role: "assistant", content: "Warm ochre and aged cream, never pure white." },
    ];

    await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "style_guide",
        message: "Give me production specs for the ochre.",
        history: normalHistory,
        context: { guideName: "Visual Language", guideType: "Visual Language" },
      });

    const [messages] = mockCallAi.mock.calls[0] as [{ role: string; content: string }[], ...unknown[]];
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("How should the visual palette feel?");
    expect(messages).toHaveLength(3);
  });

  it("works correctly when history is empty (first user turn only)", async () => {
    await request(app)
      .post("/api/v1/worldsmith/copilot")
      .send({
        surface: "canon_record",
        message: "Who is Lady Mireth?",
        history: [],
        context: { recordName: "Lady Mireth", recordType: "character" },
      });

    const [messages] = mockCallAi.mock.calls[0] as [{ role: string; content: string }[], ...unknown[]];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ role: "user", content: "Who is Lady Mireth?" });
  });
});

// ── /v1/worldsmith/worlds/:id/bible-copilot ───────────────────────────────────

describe("POST /api/v1/worldsmith/worlds/:id/bible-copilot — history normalisation", () => {
  it("strips a leading assistant (greeting) message before calling the AI", async () => {
    const res = await request(app)
      .post(`/api/v1/worldsmith/worlds/${WORLD_ROW.id}/bible-copilot`)
      .send({
        field: "visualPalette",
        message: "Suggest a stronger palette direction.",
        history: [
          { role: "assistant", content: "I've read the Thornvale Bible. Tell me what to develop." },
        ],
        draft: { visualPalette: "Amber and ochre" },
      });

    expect(res.status).toBe(200);
    expect(mockCallAi).toHaveBeenCalledOnce();

    const [messages] = mockCallAi.mock.calls[0] as [{ role: string; content: string }[], ...unknown[]];
    expect(messages[0].role).toBe("user");
    expect(messages[messages.length - 1].content).toBe("Suggest a stronger palette direction.");
  });

  it("preserves real multi-turn history after the first user message", async () => {
    const history = [
      { role: "assistant", content: "I've read the Thornvale Bible." },
      { role: "user", content: "Suggest a palette direction." },
      { role: "assistant", content: "Amber and deep forest green." },
    ];

    await request(app)
      .post(`/api/v1/worldsmith/worlds/${WORLD_ROW.id}/bible-copilot`)
      .send({
        field: "visualPalette",
        message: "Give me the CMYK values.",
        history,
        draft: {},
      });

    const [messages] = mockCallAi.mock.calls[0] as [{ role: string; content: string }[], ...unknown[]];
    expect(messages[0]).toEqual({ role: "user", content: "Suggest a palette direction." });
    expect(messages[1]).toEqual({ role: "assistant", content: "Amber and deep forest green." });
    expect(messages[2]).toEqual({ role: "user", content: "Give me the CMYK values." });
    expect(messages).toHaveLength(3);
  });
});
