import { describe, expect, it } from "vitest";
import { reservationScopeKey, conservativeTextReservation, conservativeImageReservation } from "../lib/ai-admission";
import { aiDedupeKey, billableInputChars, openAiBaseUrlForCredentialSource, shouldKeepReservationUnaccounted } from "../lib/ai-proxy";

describe("AI governance admission", () => {
  it("uses one global scope for platform-funded calls", () => {
    expect(reservationScopeKey("platform", "store-a", "chatgpt", 10))
      .toBe(reservationScopeKey("platform", "store-b", "chatgpt", 10));
    expect(reservationScopeKey("platform", "store-a", "chatgpt", 10))
      .toBe(reservationScopeKey("platform", "store-a", "chatgpt", 10));
  });

  it("keeps store-funded scopes isolated", () => {
    expect(reservationScopeKey("store", "store-a", "chatgpt"))
      .not.toBe(reservationScopeKey("store", "store-b", "chatgpt"));
  });

  it("shares quota locks across models but keeps dedupe model-specific", () => {
    expect(reservationScopeKey("store", "store-a", "chatgpt", 11))
      .toBe(reservationScopeKey("store", "store-a", "chatgpt", 11));
    expect(aiDedupeKey("chatgpt", "hash", "store-a", "gpt-5"))
      .not.toBe(aiDedupeKey("chatgpt", "hash", "store-a", "gpt-image-2"));
  });

  it("binds database credentials to direct OpenAI despite integration configuration", () => {
    expect(openAiBaseUrlForCredentialSource("database", "https://integration.invalid/v1"))
      .toBe("https://api.openai.com/v1");
    expect(openAiBaseUrlForCredentialSource("legacy-integration", "https://integration.invalid/v1"))
      .toBe("https://integration.invalid/v1");
  });

  it("reserves conservatively from prompt and output budgets", () => {
    expect(conservativeTextReservation(4000, 100, 200, true)).toBe(1);
    expect(conservativeTextReservation(4000, 10000, 10000, true)).toBe(31);
    expect(conservativeTextReservation(4000, 10000, 10000, false)).toBe(0);
  });

  it("reserves the priced image amount when monthly quota is active", () => {
    expect(conservativeImageReservation(25, true)).toBe(25);
    expect(() => conservativeImageReservation(null, true)).toThrow(/positive AI image pricing/);
    expect(() => conservativeTextReservation(4000, 0, 100, true)).toThrow(/positive AI text pricing/);
    expect(conservativeImageReservation(25, false)).toBe(0);
  });

  it("counts all billable text inputs", () => {
    expect(billableInputChars([{ role: "user", content: "hello" }], "system", {
      textAttachments: [{ name: "doc", text: "body" }],
      imageAttachments: [{ name: "x", mediaType: "image/png", base64: "abcd" }],
    })).toBe(5 + 6 + 3 + 4 + 1 + 4);
  });

  it("counts structured multimodal message strings and data fields", () => {
    const structured = [{ type: "text", text: "hello" }, { type: "image_url", image_url: { url: "data:image/png;base64,ABCD" } }];
    expect(billableInputChars([{ role: "user", content: structured as unknown as string }])).toBe(
      "text".length + "hello".length + "image_url".length + "data:image/png;base64,ABCD".length,
    );
  });

  it("keeps monthly reservations when provider omits usage", () => {
    expect(shouldKeepReservationUnaccounted(true)).toBe(true);
    expect(shouldKeepReservationUnaccounted(true, 10, 20)).toBe(true);
    expect(shouldKeepReservationUnaccounted(true, 10, 20, undefined)).toBe(true);
    expect(shouldKeepReservationUnaccounted(true, 10, 20, 2)).toBe(false);
    expect(shouldKeepReservationUnaccounted(false)).toBe(false);
  });
});