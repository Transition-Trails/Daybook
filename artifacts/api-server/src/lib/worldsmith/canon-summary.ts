import { createHash } from "node:crypto";

export type CanonSummaryKind = "prompt" | "identity";

type CanonSummaryRecord = {
  id: string;
  name: string;
  canonType?: string | null;
  narrativeDetails?: string | null;
  historicalContext?: string | null;
  visualNotes?: string | null;
  canonGuardrails?: string | null;
  relationshipDetails?: string | null;
  characterDirection?: string | null;
  confirmedCanon?: string | null;
  emotionalRegister?: string | null;
  sensoryClauses?: string | null;
  narrativeVisibility?: string | null;
  temporalScope?: string | null;
  canonStability?: string | null;
  notes?: string | null;
  globalMetadata?: Record<string, unknown> | null;
  structuredProfile?: Record<string, unknown> | null;
  generationProfile?: Record<string, unknown> | null;
  promptSummary?: string | null;
  promptSummarySourceHash?: string | null;
  identitySummary?: string | null;
  identitySummarySourceHash?: string | null;
};

function normalizedText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return typeof value === "string" ? normalizedText(value) : value;
}

export function buildCanonSummarySource(record: CanonSummaryRecord, kind: CanonSummaryKind): Record<string, unknown> {
  const shared = {
    version: 1,
    kind,
    id: record.id,
    name: normalizedText(record.name),
    canonType: normalizedText(record.canonType),
    confirmedCanon: normalizedText(record.confirmedCanon),
    visualNotes: normalizedText(record.visualNotes),
    canonGuardrails: normalizedText(record.canonGuardrails),
    structuredProfile: stableValue(record.structuredProfile ?? {}),
    generationProfile: stableValue(record.generationProfile ?? {}),
  };
  if (kind === "identity") {
    return {
      ...shared,
      characterDirection: normalizedText(record.characterDirection),
      narrativeDetails: normalizedText(record.narrativeDetails),
    };
  }
  return {
    ...shared,
    narrativeDetails: normalizedText(record.narrativeDetails),
    historicalContext: normalizedText(record.historicalContext),
    relationshipDetails: normalizedText(record.relationshipDetails),
    characterDirection: normalizedText(record.characterDirection),
    emotionalRegister: normalizedText(record.emotionalRegister),
    sensoryClauses: normalizedText(record.sensoryClauses),
    narrativeVisibility: normalizedText(record.narrativeVisibility),
    temporalScope: normalizedText(record.temporalScope),
    canonStability: normalizedText(record.canonStability),
    globalMetadata: stableValue(record.globalMetadata ?? {}),
  };
}

export function canonSummarySourceHash(record: CanonSummaryRecord, kind: CanonSummaryKind): string {
  return createHash("sha256").update(JSON.stringify(buildCanonSummarySource(record, kind))).digest("hex");
}

export function canonSummaryStatus(record: CanonSummaryRecord, kind: CanonSummaryKind): "missing" | "current" | "stale" | "not_applicable" {
  if (kind === "identity" && record.canonType !== "character") return "not_applicable";
  const summary = kind === "prompt" ? record.promptSummary : record.identitySummary;
  const storedHash = kind === "prompt" ? record.promptSummarySourceHash : record.identitySummarySourceHash;
  if (!normalizedText(summary)) return "missing";
  if (!storedHash || storedHash !== canonSummarySourceHash(record, kind)) return "stale";
  return "current";
}

export function withCanonSummaryStatus<T extends CanonSummaryRecord>(record: T): T & {
  promptSummaryStatus: ReturnType<typeof canonSummaryStatus>;
  identitySummaryStatus: ReturnType<typeof canonSummaryStatus>;
} {
  return {
    ...record,
    promptSummaryStatus: canonSummaryStatus(record, "prompt"),
    identitySummaryStatus: canonSummaryStatus(record, "identity"),
  };
}

export function normalizeGeneratedSummary(value: unknown, maxChars: number): string {
  const text = normalizedText(typeof value === "string" ? value : "");
  if (!text) throw new Error("The AI did not return a usable summary.");
  return text.slice(0, maxChars);
}