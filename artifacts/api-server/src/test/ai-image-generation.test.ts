import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateImage,
  resolveImageGenerationMetadata,
  validateImageGenerationConfiguration,
} from "../lib/ai-proxy.js";

function imageResponse() {
  return new Response(JSON.stringify({
    data: [{ b64_json: "cHJveHktaW1hZ2U=" }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://openai.example/v1";
  process.env.WS_IMAGE_MODEL = "gpt-image-2";
  delete process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  delete process.env.WS_IMAGE_MODEL;
  delete process.env.WS_IMAGE_ALLOW_EXPERIMENTAL_SIZES;
});

describe("shared GPT Image generation", () => {
  it("sends the confirmed GPT Image 2 proxy contract and returns effective metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(imageResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateImage("An archival paper study", {
      size: "1024x1024",
      quality: "low",
    });

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      model: "gpt-image-2",
      prompt: "An archival paper study",
      n: 1,
      size: "1024x1024",
      quality: "low",
    });
    expect(result).toMatchObject({
      dataUrl: "data:image/png;base64,cHJveHktaW1hZ2U=",
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      settings: { size: "1024x1024", quality: "low" },
    });
  });

  it("makes legacy model mappings visible in the resolved effective settings", () => {
    process.env.WS_IMAGE_MODEL = "gpt-image-1";
    expect(resolveImageGenerationMetadata({ size: "1792x1024", quality: "hd" }))
      .toMatchObject({ model: "gpt-image-1", settings: { size: "1536x1024", quality: "high" } });
  });

  it("fails at startup for unsupported image models instead of silently falling back", () => {
    process.env.WS_IMAGE_MODEL = "dall-e-3";
    expect(validateImageGenerationConfiguration).toThrow('Unsupported WS_IMAGE_MODEL "dall-e-3"');
  });
});