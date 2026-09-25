import { z } from "zod";

const childId = z.string().min(1).max(200);
const text = (max: number) => z.string().max(max);
const withUniqueIds = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).max(100)
  .superRefine((items, ctx) => {
    const ids = new Set<string>();
    items.forEach((item, index) => {
      const id = (item as { id: string }).id;
      if (ids.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "id"], message: "IDs must be unique within the collection" });
      ids.add(id);
    });
  });

export const worldEditorialFieldSchemas = {
  worldPremise: text(10_000).nullable(),
  foundationalHistory: text(30_000).nullable(),
  centralDramaticQuestion: text(5_000).nullable(),
  coreThemes: z.array(text(500)).max(50),
  narrativePillars: withUniqueIds(z.object({
    id: childId, name: text(500), description: text(10_000),
  }).strict()),
  historicalEras: withUniqueIds(z.object({
    id: childId, name: text(500), order: z.number().int().min(0).max(100_000),
    summary: text(10_000), narrativeCondition: text(10_000).optional(),
    approximatePeriod: text(500).nullable().optional(), notes: text(10_000).nullable().optional(),
  }).strict()),
  institutions: withUniqueIds(z.object({
    id: childId, name: text(500), type: text(200).optional(),
    description: text(10_000), roleInWorld: text(10_000).optional(), notes: text(10_000).optional(),
  }).strict()),
  economyAndResources: text(20_000).nullable(),
  knowledgeAndAuthority: text(20_000).nullable(),
  currentWorldState: text(20_000).nullable(),
  narrativeGravity: text(10_000).nullable(),
  conflictGrammar: text(10_000).nullable(),
  discoveryRules: text(10_000).nullable(),
  storyGuardrails: z.array(text(5_000)).max(100),
  continuityAnchors: withUniqueIds(z.object({
    id: childId, label: text(500), statement: text(10_000),
    severity: z.enum(["advisory", "important", "critical"]).optional(),
  }).strict()),
  openQuestions: withUniqueIds(z.object({
    id: childId, question: text(5_000), notes: text(10_000).optional(),
    status: z.enum(["open", "developing", "deferred"]).optional(),
  }).strict()),
  visualGuardrails: z.array(text(5_000)).max(100),
  imageDirection: text(10_000).nullable(),
} satisfies Record<string, z.ZodTypeAny>;

export const worldEditorialFieldNames = Object.keys(worldEditorialFieldSchemas) as Array<keyof typeof worldEditorialFieldSchemas>;

export function validateWorldEditorialFields(source: Record<string, unknown>): { valid: true } | { valid: false; field: string; message: string } {
  for (const field of worldEditorialFieldNames) {
    if (!(field in source)) continue;
    const parsed = worldEditorialFieldSchemas[field].safeParse(source[field]);
    if (!parsed.success) return { valid: false, field, message: parsed.error.message };
  }
  return { valid: true };
}