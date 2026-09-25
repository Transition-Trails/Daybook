import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  db,
  wsCanonRecordsTable,
  mcpCanonHistoryTable,
  worldsmithWorldsTable,
  type User,
} from "@workspace/db";
import {
  buildCanonSummarySource,
  canonSummarySourceHash,
  canonSummaryStatus,
} from "../lib/worldsmith/canon-summary.js";

const { callAi, generateImage } = vi.hoisted(() => ({ callAi: vi.fn(), generateImage: vi.fn() }));

vi.mock("../lib/ai-proxy.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/ai-proxy.js")>();
  return { ...actual, callAi };
});
vi.mock("../lib/worldsmith/image-generation.js", () => ({ generateImage }));

import editorialRouter from "../routes/worldsmith-editorial.js";

const run = randomUUID().slice(0, 8);
const worldId = `summary-world-${run}`;
const characterId = `summary-character-${run}`;
const locationId = `summary-location-${run}`;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testRequest = req as any;
    testRequest.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    testRequest.isAuthenticated = () => true;
    testRequest.user = { id: `summary-admin-${run}`, platformRole: "super_admin" } as User;
    next();
  });
  app.use("/", editorialRouter);
  return app;
}

const app = makeApp();

beforeAll(async () => {
  await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Summary World", code: "SUM" });
  await db.insert(wsCanonRecordsTable).values([
    {
      id: characterId,
      worldId,
      name: "Mara Vale",
      canonType: "character",
      narrativeDetails: "A patient archivist who protects the winter ledger.",
      visualNotes: "Silver-streaked black hair, amber coat, ink-stained hands.",
      canonGuardrails: "Never depict her without the amber coat.",
      confirmedCanon: "She is forty-two.",
    },
    {
      id: locationId,
      worldId,
      name: "North Archive",
      canonType: "location",
      visualNotes: "Frosted glass and dark oak.",
    },
  ]);
});

afterAll(async () => {
  await db.delete(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, characterId));
  await db.delete(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, locationId));
  await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.worldId, worldId));
  await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
});

beforeEach(() => {
  callAi.mockReset();
  generateImage.mockReset();
  generateImage.mockResolvedValue({
    dataUrl: "data:image/png;base64,c3VtbWFyeQ==",
    provider: "test",
    model: "test-image",
    settings: { size: "1024x1024", quality: "medium" },
  });
  callAi.mockResolvedValue({
    content: JSON.stringify({
      prompt: "Mara Vale, a forty-two-year-old archivist with silver-streaked black hair, amber coat, and ink-stained hands. Preserve the winter-ledger context.",
      identity: "Forty-two; silver-streaked black hair; amber coat; ink-stained hands. The amber coat is immutable.",
    }),
    provider: "chatgpt",
    model: "test-model",
    usage: null,
  });
});

describe("Canon prompt summaries", () => {
  it("hashes normalized source deterministically and detects source changes", () => {
    const record = {
      id: "canon-1",
      name: "Mara Vale",
      canonType: "character",
      visualNotes: "Silver hair.\r\nAmber coat.",
      structuredProfile: { age: 42, eyes: "brown" },
      promptSummary: "Compact summary",
      promptSummarySourceHash: "",
    };
    const hash = canonSummarySourceHash(record, "prompt");
    expect(hash).toBe(canonSummarySourceHash({
      ...record,
      visualNotes: "Silver hair.\nAmber coat.",
      structuredProfile: { eyes: "brown", age: 42 },
    }, "prompt"));
    expect(buildCanonSummarySource(record, "identity")).not.toHaveProperty("historicalContext");
    expect(canonSummaryStatus({ ...record, promptSummarySourceHash: hash }, "prompt")).toBe("current");
    expect(canonSummaryStatus({ ...record, visualNotes: "Red hair", promptSummarySourceHash: hash }, "prompt")).toBe("stale");
  });

  it("generates both summaries and marks them stale after source Canon changes", async () => {
    const [before] = await db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, characterId));
    const generated = await request(app)
      .post(`/v1/editorial/canon-records/${characterId}/regenerate-summary`)
      .send({ kind: "both" });

    expect(generated.status).toBe(200);
    expect(generated.body.canon_record).toMatchObject({
      promptSummaryStatus: "current",
      identitySummaryStatus: "current",
      version: before.version + 1,
    });
    expect(callAi).toHaveBeenCalledOnce();
    const summaryHistory = await db.select().from(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, characterId));
    expect(summaryHistory).toHaveLength(1);
    expect(summaryHistory[0]).toMatchObject({
      actorUserId: `summary-admin-${run}`,
      changeType: "canon_summary_regenerated",
    });

    await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({
        world_id: worldId,
        source_record_id: characterId,
        name: "Mara Vale",
        canon_type: "character",
        mode: "primary_portrait",
      })
      .expect(200);
    expect(generateImage.mock.calls[0]?.[0]).toContain("Approved prompt summary:");
    expect(generateImage.mock.calls[0]?.[0]).toContain("Approved identity summary:");

    const changed = await request(app)
      .patch(`/v1/editorial/canon-records/${characterId}`)
      .send({ visual_notes: "Silver-streaked black hair, green coat, ink-stained hands." });

    expect(changed.status).toBe(200);
    expect(changed.body.canon_record.promptSummaryStatus).toBe("stale");
    expect(changed.body.canon_record.identitySummaryStatus).toBe("stale");

    generateImage.mockClear();
    await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({
        world_id: worldId,
        source_record_id: characterId,
        name: "Mara Vale",
        canon_type: "character",
        mode: "primary_portrait",
      })
      .expect(200);
    expect(generateImage.mock.calls[0]?.[0]).not.toContain("Approved prompt summary:");
    expect(generateImage.mock.calls[0]?.[0]).not.toContain("Approved identity summary:");
  });

  it("rejects identity-only generation for non-character Canon", async () => {
    const response = await request(app)
      .post(`/v1/editorial/canon-records/${locationId}/regenerate-summary`)
      .send({ kind: "identity" });

    expect(response.status).toBe(400);
    expect(callAi).not.toHaveBeenCalled();
  });
});