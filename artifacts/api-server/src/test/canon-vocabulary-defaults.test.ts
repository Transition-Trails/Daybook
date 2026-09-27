import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getCanonVocabularyDefaults } from "../lib/worldsmith/canon-metadata";

const typeFormsPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../admin/src/components/worldsmith/editorial/CanonTypeForms.tsx");
const recordEditorPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../admin/src/pages/super/worldsmith-editorial/CanonRecordEditor.tsx");
const formTypeByName: Record<string, string> = {
  LocationForm: "location",
  ObjectForm: "object",
  EventForm: "event",
  LoreForm: "lore",
  AtmosphereForm: "atmosphere",
  MotifForm: "motif",
  RelationshipForm: "relationship",
  MaterialForm: "material",
  CharacterIdentityForm: "character",
  CharacterKnowledgeForm: "character",
  LifeStageVariantForm: "character",
  GenerationLocksForm: "character",
};

function staticVocabularyControls(source: string, global = false) {
  const controls: Array<{ recordType: string; key: string; options: Array<{ key: string; label: string }> }> = [];
  for (const match of source.matchAll(/vocabKey="([^"]+)"/g)) {
    if (match[1] === "workflow_status") continue;
    const offset = match.index ?? 0;
    const tagStart = source.lastIndexOf("<", offset);
    const tagEnd = source.indexOf("/>", offset);
    if (tagStart < 0 || tagEnd < 0) continue;
    const tag = source.slice(tagStart, tagEnd);
    if (!/^<\w+Select\b/.test(tag)) continue;
    const optionsText = tag.match(/options=\{\s*\[\s*([\s\S]*?)\s*\]\s*\}/)?.[1];
    if (!optionsText) continue;

    let recordType = "global";
    if (!global) {
      const functionStart = source.lastIndexOf("export function ", offset);
      const functionName = source.slice(functionStart, source.indexOf("(", functionStart)).replace("export function ", "").trim();
      recordType = formTypeByName[functionName] ?? "";
    }
    const options = [...optionsText.matchAll(/\{\s*key:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*\}/g)]
      .map(([, key, label]) => ({ key: key!, label: label! }));
    if (recordType && options.length) controls.push({ recordType, key: match[1]!, options });
  }
  return controls;
}

describe("getCanonVocabularyDefaults", () => {
  it("provides shared global metadata and selectable defaults for all Canon types", () => {
    const defaults = getCanonVocabularyDefaults();
    const recordTypes = ["character", "location", "object", "event", "lore", "atmosphere", "material", "relationship", "motif"];
    const globalKeys = ["canon_stability", "narrative_visibility", "temporal_scope", "importance", "spoiler_level", "evidence_confidence", "source_type"];

    expect(new Set(defaults.map(item => item.recordType))).toEqual(new Set(recordTypes));
    for (const recordType of recordTypes) {
      expect(defaults.filter(item => item.recordType === recordType).map(item => item.key)).toEqual(expect.arrayContaining(globalKeys));
    }
    expect(defaults.some(item => item.key === "workflow_status")).toBe(false);
  });

  it("includes every static UX option while retaining API fallback choices", () => {
    const defaults = getCanonVocabularyDefaults();
    const catalog = new Map(defaults.map(item => [`${item.recordType}:${item.key}`, item]));
    const typeForms = readFileSync(typeFormsPath, "utf8");
    const recordEditor = readFileSync(recordEditorPath, "utf8");
    const controls = [
      ...staticVocabularyControls(typeForms),
      ...staticVocabularyControls(recordEditor, true),
    ];
    expect(controls.length).toBeGreaterThan(90);

    for (const control of controls) {
      const applicableTypes = control.recordType === "global"
        ? ["character", "location", "object", "event", "lore", "atmosphere", "material", "relationship", "motif"]
        : [control.recordType];
      for (const recordType of applicableTypes) {
        const vocabulary = catalog.get(`${recordType}:${control.key}`);
        expect(vocabulary, `${recordType}.${control.key} is represented in the defaults`).toBeDefined();
        for (const option of control.options) {
          expect(vocabulary!.options).toContainEqual(option);
        }
      }
    }

    const materialClasses = catalog.get("material:object_class")!.options.map(option => option.key);
    expect(materialClasses).toEqual(expect.arrayContaining(["organic", "synthetic", "mineral", "composite", "magical"]));
    expect(catalog.get("character:access")!.options.map(option => option.key)).toEqual([
      "none", "indirect", "occasional", "regular", "privileged", "custodial",
    ]);
    expect(catalog.get("object:object_class")!.options.map(option => option.key)).toContain("weapon");
  });
});