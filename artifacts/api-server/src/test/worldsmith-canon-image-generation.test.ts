import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import type { User } from "@workspace/db";

const { mockGenerateImage } = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
}));

vi.mock("../lib/worldsmith/image-generation.js", () => ({
  generateImage: mockGenerateImage,
}));

import editorialRouter from "../routes/worldsmith-editorial.js";

const superAdmin = {
  id: "canon-image-test-admin",
  platformRole: "super_admin",
} as User;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authenticatedRequest = req as any;
    authenticatedRequest.isAuthenticated = () => true;
    authenticatedRequest.user = superAdmin;
    next();
  });
  app.use("/", editorialRouter);
  return app;
}

const app = makeApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /v1/editorial/canon-records/generate-image", () => {
  it("keeps canon-specific prompt derivation while returning the audited generation result", async () => {
    mockGenerateImage.mockResolvedValue({
      dataUrl: "data:image/png;base64,Y2Fub24taW1hZ2U=",
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      modelVersion: "2026-08-01",
      settings: { size: "1024x1024", quality: "high" },
    });

    const response = await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({
        name: "The Lantern of Ash",
        canon_type: "object",
        prompt: "Show the lantern lit against a plain dark background.",
        narrative_details: "It appears only at low tide.",
        visual_notes: "Oxidized brass and blue glass.",
      });

    expect(response.status).toBe(200);
    expect(mockGenerateImage).toHaveBeenCalledOnce();
    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.stringContaining("Canon name: The Lantern of Ash."),
      expect.objectContaining({
        size: "1024x1024",
        quality: "medium",
        context: expect.objectContaining({
          userId: "canon-image-test-admin",
          feature: "editorial.canon.generate-image",
        }),
      }),
    );
    expect(mockGenerateImage.mock.calls[0]?.[0]).toContain(
      "Depict the individual object itself as the hero subject",
    );
    expect(mockGenerateImage.mock.calls[0]?.[0]).toContain(
      "Canon direction:\nOxidized brass and blue glass.\nIt appears only at low tide.",
    );
    expect(mockGenerateImage.mock.calls[0]?.[0]).toContain(
      "Editor request:\nShow the lantern lit against a plain dark background.",
    );
    expect(response.body).toEqual({
      image_data_url: "data:image/png;base64,Y2Fub24taW1hZ2U=",
      generation: {
        provider: "replit_ai_integrations",
        model: "gpt-image-2",
        modelVersion: "2026-08-01",
        settings: { size: "1024x1024", quality: "high" },
      },
    });
  });

  it("stops before returning an image when generation fails", async () => {
    mockGenerateImage.mockRejectedValue(new Error("provider unavailable"));

    const response = await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({ name: "The Failed Lantern", canon_type: "object", prompt: "Show it cracked." });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "Image generation could not be completed. Please try again.",
    });
    expect(mockGenerateImage).toHaveBeenCalledOnce();
  });

  it("returns a retryable timeout response when high-quality generation takes too long", async () => {
    const timeoutError = new Error("Image generation timed out after 300 seconds.");
    timeoutError.name = "ImageGenerationTimeoutError";
    mockGenerateImage.mockRejectedValue(timeoutError);

    const response = await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({ name: "The Slow Lantern", canon_type: "object", prompt: "Show it at dusk." });

    expect(response.status).toBe(504);
    expect(response.body).toEqual({
      error: "The image provider did not finish in time. Please try again; your Canon details are safe.",
      code: "IMAGE_GENERATION_TIMEOUT",
      retryable: true,
    });
  });

  it("requires an editor prompt before generating", async () => {
    const response = await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({ name: "The Unspecified Lantern", canon_type: "object" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Describe what the reference image should show.",
    });
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it("generates an isolated Primary Canon Portrait without an editor prompt", async () => {
    mockGenerateImage.mockResolvedValue({
      dataUrl: "data:image/png;base64,cG9ydHJhaXQ=",
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      settings: { size: "1024x1024", quality: "medium" },
    });

    const response = await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({
        name: "Eleanor Harcourt",
        canon_type: "character",
        mode: "primary_portrait",
        visual_notes: "Dark hair, watchful gray eyes, restrained Victorian dress.",
      });

    expect(response.status).toBe(200);
    const submittedPrompt = String(mockGenerateImage.mock.calls[0]?.[0]);
    expect(submittedPrompt).toContain("authoritative Primary Canon Portrait");
    expect(submittedPrompt).toContain("one character only, isolated and centered");
    expect(submittedPrompt).toContain("plain, softly lit warm-neutral studio background");
    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ quality: "medium" }),
    );
  });

  it("keeps long Canon records within the provider prompt limit", async () => {
    mockGenerateImage.mockResolvedValue({
      dataUrl: "data:image/png;base64,Ym91bmRlZA==",
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      settings: { size: "1024x1024", quality: "medium" },
    });
    const longProse = `<p>${"Historically grounded visual detail. ".repeat(500)}</p>`;

    const response = await request(app)
      .post("/v1/editorial/canon-records/generate-image")
      .send({
        name: "Bellamy & Son, Nurserymen and Seedsmen",
        canon_type: "location",
        mode: "reference",
        prompt: "Show the storefront as an isolated architectural reference.",
        visual_notes: longProse,
        narrative_details: longProse,
        historical_context: longProse,
      });

    expect(response.status).toBe(200);
    const submittedPrompt = String(mockGenerateImage.mock.calls[0]?.[0]);
    expect(submittedPrompt.length).toBeLessThanOrEqual(30_000);
    expect(submittedPrompt).toContain("Show the storefront as an isolated architectural reference.");
    expect(submittedPrompt).toContain("Canon name: Bellamy & Son, Nurserymen and Seedsmen.");
  });
});