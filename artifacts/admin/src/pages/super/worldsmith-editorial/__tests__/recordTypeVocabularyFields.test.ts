import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { recordTypeFields, sharedFields } from "../recordTypeVocabularyFields";

describe("Canon record vocabulary field picker", () => {
  it("includes every selectable Canon profile and shared metadata field", () => {
    const root = process.cwd();
    const forms = readFileSync(resolve(root, "src/components/worldsmith/editorial/CanonTypeForms.tsx"), "utf8");
    const editor = readFileSync(resolve(root, "src/pages/super/worldsmith-editorial/CanonRecordEditor.tsx"), "utf8");
    const listed = new Set<string>([...sharedFields, ...Object.values(recordTypeFields).flat()]);
    const formKeys = [...forms.matchAll(/vocabKey="([^"]+)"/g)].map(match => match[1]);
    const sharedKeys = [...editor.slice(editor.indexOf("Global Metadata"), editor.indexOf("Global Metadata") + 7000).matchAll(/vocabKey="([^"]+)"/g)]
      .map(match => match[1]).filter(key => key !== "workflow_status");
    expect([...new Set([...formKeys, ...sharedKeys])].filter(key => !listed.has(key))).toEqual([]);
  });
});