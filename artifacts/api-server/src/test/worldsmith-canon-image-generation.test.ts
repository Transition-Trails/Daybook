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
  role: "owner",
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
        narrative_details: "It appears only at low tide.",
        visual_notes: "Oxidized brass and blue glass.",
      });

    expect(response.status).toBe(200);
    expect(mockGenerateImage).toHaveBeenCalledOnce();
    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.stringContaining("Canon name: The Lantern of Ash."),
      { size: "1024x1024", quality: "high" },
    );
    expect(mockGenerateImage.mock.calls[0]?.[0]).toContain(
      "Depict the individual object itself as the hero subject",
    );
    expect(mockGenerateImage.mock.calls[0]?.[0]).toContain(
      "Canon direction:\nOxidized brass and blue glass.\nIt appears only at low tide.",
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
      .send({ name: "The Failed Lantern", canon_type: "object" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: "Image generation could not be completed. Please try again.",
    });
    expect(mockGenerateImage).toHaveBeenCalledOnce();
  });
});