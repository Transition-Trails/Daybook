import { describe, expect, it } from "vitest";
import { computePromptHash } from "../lib/worldsmith/prompt-hasher.js";

const base = {
  payload_version: "PP-2.0",
  compiled_prompt: "A grounded prompt",
  negative_prompt: "No text",
  generation_provider: "replit_ai_integrations",
  model_name: "gpt-image-2",
  generation_settings: { size: "1024x1024", quality: "medium" },
};

describe("WorldSmith prompt hash generation identity", () => {
  it("changes when the effective image model changes", () => {
    expect(computePromptHash(base)).not.toBe(computePromptHash({ ...base, model_name: "gpt-image-1" }));
  });

  it("changes when the effective image settings change", () => {
    expect(computePromptHash(base)).not.toBe(computePromptHash({
      ...base,
      generation_settings: { size: "1440x1440", quality: "medium" },
    }));
  });
});