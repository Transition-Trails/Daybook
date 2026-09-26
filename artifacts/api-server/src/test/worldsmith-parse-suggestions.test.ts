import { describe, expect, it } from "vitest";
import { parseSuggestionArray } from "../lib/worldsmith/parse-suggestions";

describe("WorldSmith suggestion responses", () => {
  it("accepts a JSON array or a fenced array", () => {
    expect(parseSuggestionArray('[{"title":"A story"}]')).toEqual([{ title: "A story" }]);
    expect(parseSuggestionArray('```json\n[{"name":"A place"}]\n```')).toEqual([{ name: "A place" }]);
  });

  it("rejects empty, truncated and malformed results rather than caching them", () => {
    for (const response of ["", "[]", "[{\"title\":", "No ideas", "[null, 42]"]) {
      expect(() => parseSuggestionArray(response)).toThrow("no usable suggestions");
    }
  });
});