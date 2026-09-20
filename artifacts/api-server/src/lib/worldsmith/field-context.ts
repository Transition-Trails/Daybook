/** Generation-facing compilation helpers for the Field Architecture payloads. */
export type VocabularyLabels = Record<string, string> | Map<string, string>;
export type FieldSource = { source: string; value: unknown; clause?: string };
export type FieldContext = {
  identity?: string;
  locks?: Array<{ value?: string; strength?: string; positivePrompt?: string; negativePrompt?: string; appliesToLifeStages?: string[]; lifeStages?: string[]; source?: string; approvalStatus?: string }>;
  variant?: Record<string, unknown>;
  anchor?: Record<string, unknown>;
  guardrails?: string | string[];
  negativeConstraints?: string[];
  positiveConstraints?: string[];
  profile?: Record<string, unknown>;
  knowledge?: Array<Record<string, unknown>>;
  reveals?: Array<Record<string, unknown>>;
  vocabulary?: VocabularyLabels;
  visibility?: string;
  spoilerLevel?: string;
  audience?: string;
  lifeStage?: string;
  sources?: FieldSource[];
  assets?: Array<Record<string, unknown>>;
};

export type CompiledFieldContext = {
  prompt: string;
  negativePrompt: string;
  sources: string[];
  attributions: Array<{ clause: string; source: string }>;
  warnings: string[];
};

const hiddenVisibility = new Set(["private", "secret", "author_only", "author only", "withheld"]);
const spoilerRank: Record<string, number> = { none: 0, mild: 1, major: 2, endgame: 3 };
const acceptedLocks = new Set(["accepted", "approved", "canon", ""]);

function labels(value: VocabularyLabels | undefined, key: string): string {
  if (!value) return key.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return value instanceof Map ? (value.get(key) ?? key) : (value[key] ?? key);
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.filter(v => typeof v === "string").join(", ");
  return typeof value === "string" ? value.trim() : "";
}
function visible(item: Record<string, unknown>, context: FieldContext): boolean {
  const visibility = String(item.visibility ?? item.disclosure ?? "").toLowerCase();
  if (hiddenVisibility.has(visibility)) return false;
  const status = String(item.approvalStatus ?? item.approval_status ?? "").toLowerCase();
  if (status && !acceptedLocks.has(status)) return false;
  const level = String(item.spoilerLevel ?? item.spoiler_level ?? "").toLowerCase();
  const allowed = spoilerRank[String(context.spoilerLevel ?? "none").toLowerCase()] ?? 0;
  return (spoilerRank[level] ?? 0) <= allowed;
}
function clause(value: unknown, key: string, context: FieldContext): string {
  const raw = text(value);
  return raw ? `${labels(context.vocabulary, key)}: ${raw}` : "";
}
function stable(items: string[]): string[] {
  return [...new Set(items.map(v => v.trim()).filter(Boolean))];
}

/** Compiles structured profile data while retaining clause-level provenance. */
export function compileImageContext(context: FieldContext): CompiledFieldContext {
  const prompt: string[] = [], negative: string[] = [], attributions: Array<{ clause: string; source: string }> = [], warnings: string[] = [];
  const add = (value: string, source: string, target = prompt) => {
    if (!value) return;
    target.push(value);
    attributions.push({ clause: value, source });
  };
  if (context.identity) add(context.identity, "identity");
  for (const lock of [...(context.locks ?? [])].sort((a, b) => `${a.strength}:${a.value}`.localeCompare(`${b.strength}:${b.value}`))) {
    if (lock.approvalStatus && !acceptedLocks.has(lock.approvalStatus.toLowerCase())) continue;
    const stages = lock.appliesToLifeStages ?? lock.lifeStages;
    if (stages?.length && context.lifeStage && !stages.includes(context.lifeStage)) continue;
    add(lock.positivePrompt || lock.value || "", lock.source || "identity-lock");
    if (lock.negativePrompt) add(lock.negativePrompt, lock.source || "identity-lock", negative);
  }
  const addSection = (values: Record<string, unknown> | undefined, source: string) => {
    for (const [name, value] of Object.entries(values ?? {}).sort()) {
      if (typeof value === "string" || Array.isArray(value)) {
        const raw = text(value).toLowerCase();
        if (["unresolved", "unknown", "conflict", "disputed"].includes(raw)) warnings.push(`${name} is ${raw}`);
        add(clause(value, name, context), source);
      }
    }
  };
  addSection(context.variant, "variant");
  addSection(context.profile, "profile");
  for (const item of [...(context.knowledge ?? []), ...(context.reveals ?? [])]
    .filter(item => visible(item, context))
    .sort((a, b) => String(a.id ?? a.topic ?? "").localeCompare(String(b.id ?? b.topic ?? "")))) {
    const value = text(item.belief ?? item.objectiveTruth ?? item.truth ?? item.text);
    if (value) add(value, String(item.source ?? item.id ?? "knowledge"));
  }
  addSection(context.anchor, "environment-anchor");
  for (const asset of [...(context.assets ?? [])].filter(asset => visible(asset, context))
    .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")))) {
    add(text(asset.positiveGuidance ?? asset.generationPrompt), `asset:${String(asset.id ?? "unknown")}`);
    add(text(asset.negativeGuidance), `asset:${String(asset.id ?? "unknown")}`, negative);
  }
  for (const value of context.positiveConstraints ?? []) add(value, "positive-constraint");
  for (const value of context.negativeConstraints ?? []) add(value, "negative-constraint", negative);
  const guards = Array.isArray(context.guardrails) ? context.guardrails : [context.guardrails ?? ""];
  for (const value of guards) add(value, "guardrail", negative);
  return { prompt: stable(prompt).join(", "), negativePrompt: stable(negative).join(", "), sources: stable(attributions.map(a => a.source)), attributions, warnings };
}

export function compileCharacterContext(context: FieldContext): CompiledFieldContext {
  return compileImageContext(context);
}
export function compileEnvironmentContext(context: FieldContext): CompiledFieldContext {
  return compileImageContext(context);
}

export function compileStoryContext(parts: Array<{ source: string; text?: string | null; visibility?: string; spoilerLevel?: string; approved?: boolean; section?: string }>, options: Partial<FieldContext> = {}): CompiledFieldContext {
  const warnings: string[] = [], attributions: Array<{ clause: string; source: string }> = [];
  const sectionOrder = ["identity", "beats", "scenes", "characters", "relationships", "locations", "objects", "lore", "events", "guardrails", "reveals"];
  const usable = parts.filter(part => {
    if (part.approved === false || ["rejected", "superseded"].includes(String((part as Record<string, unknown>).status ?? "").toLowerCase())
      || hiddenVisibility.has(String(part.visibility ?? "").toLowerCase())) return false;
    const max = spoilerRank[String(options.spoilerLevel ?? "none").toLowerCase()] ?? 0;
    return (spoilerRank[String(part.spoilerLevel ?? "none").toLowerCase()] ?? 0) <= max && !!part.text?.trim();
  }).sort((a, b) => {
    const section = (value: string | undefined) => sectionOrder.indexOf(value ?? "") + 1 || 99;
    return section(a.section) - section(b.section) || a.source.localeCompare(b.source);
  }).map(part => {
    const value = `${labels(options.vocabulary, part.source)}: ${part.text!.trim()}`;
    attributions.push({ clause: value, source: part.source });
    return value;
  });
  const context = stable(usable).join("\n");
  return { prompt: context, negativePrompt: "", sources: stable(attributions.map(a => a.source)), attributions, warnings };
}

export function resolveVocabularyLabel(key: string, vocabulary?: VocabularyLabels): string {
  return labels(vocabulary, key);
}