/**
 * AI proxy — attachment provider translation.
 *
 * Ensures the base64 attachment representation supplied by WorldSmith reaches
 * every supported provider in that provider's native multimodal format.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAi } from "../lib/ai-proxy.js";

const messages = [{ role: "user" as const, content: "Use this as a reference." }];
const options = {
  textAttachments: [{ name: "brief.txt", text: "Muted greens, foxed paper, copper ink." }],
  imageAttachments: [{ name: "swatch.png", mediaType: "image/png", base64: "aW1hZ2UtYnl0ZXM=" }],
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-openai-key";
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://openai.example/v1";
  process.env.GEMINI_API_KEY = "test-gemini-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  delete process.env.GEMINI_API_KEY;
});

describe("callAi attachment provider translation", () => {
  it("sends document text and an image_url block to ChatGPT", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: "Done." } }],
      model: "gpt-5",
      usage: {},
    }));
    vi.stubGlobal("fetch", fetchMock);

    await callAi(messages, "chatgpt", undefined, options);

    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(requestBody.model).toBe("gpt-5");
    expect(requestBody.max_completion_tokens).toBe(2048);
    expect(requestBody).not.toHaveProperty("max_tokens");
    const content = requestBody.messages[0].content;
    expect(content).toContainEqual({
      type: "text",
      text: "[Attached document: brief.txt]\nMuted greens, foxed paper, copper ink.",
    });
    expect(content).toContainEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,aW1hZ2UtYnl0ZXM=" },
    });
  });

  it("sends document text and inline image data to Gemini", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: "Done." }] } }],
      usageMetadata: {},
    }));
    vi.stubGlobal("fetch", fetchMock);

    await callAi(messages, "gemini", undefined, options);

    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const parts = requestBody.contents[0].parts;
    expect(parts).toContainEqual({
      text: "[Attached document: brief.txt]\nMuted greens, foxed paper, copper ink.",
    });
    expect(parts).toContainEqual({
      inline_data: { mime_type: "image/png", data: "aW1hZ2UtYnl0ZXM=" },
    });
  });
});