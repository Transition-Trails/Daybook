export interface NarrativePillar { id: string; name: string; description: string }
export interface HistoricalEra { id: string; name: string; order: number; summary: string; narrativeCondition?: string; approximatePeriod?: string | null; notes?: string | null }
export interface Institution { id: string; name: string; type?: string; description: string; roleInWorld?: string; notes?: string }
export interface ContinuityAnchor { id: string; label: string; statement: string; severity?: "advisory" | "important" | "critical" }
export interface OpenQuestion { id: string; question: string; notes?: string; status?: "open" | "developing" | "deferred" }

export interface WorldCreativeFields {
  worldPremise?: string | null;
  foundationalHistory?: string | null;
  centralDramaticQuestion?: string | null;
  coreThemes?: string[] | null;
  narrativePillars?: NarrativePillar[] | null;
  historicalEras?: HistoricalEra[] | null;
  institutions?: Institution[] | null;
  economyAndResources?: string | null;
  knowledgeAndAuthority?: string | null;
  currentWorldState?: string | null;
  narrativeGravity?: string | null;
  conflictGrammar?: string | null;
  discoveryRules?: string | null;
  storyGuardrails?: string[] | null;
  continuityAnchors?: ContinuityAnchor[] | null;
  openQuestions?: OpenQuestion[] | null;
  visualGuardrails?: string[] | null;
  imageDirection?: string | null;
  revision?: number;
}

export type CreativeDraft = Required<Omit<WorldCreativeFields, "revision">>;
export function creativeDraft(world: WorldCreativeFields): CreativeDraft {
  return {
    worldPremise: world.worldPremise ?? null,
    foundationalHistory: world.foundationalHistory ?? null,
    centralDramaticQuestion: world.centralDramaticQuestion ?? null,
    coreThemes: world.coreThemes ?? [],
    narrativePillars: world.narrativePillars ?? [],
    historicalEras: (world.historicalEras ?? []).slice().sort((a, b) => a.order - b.order),
    institutions: world.institutions ?? [],
    economyAndResources: world.economyAndResources ?? null,
    knowledgeAndAuthority: world.knowledgeAndAuthority ?? null,
    currentWorldState: world.currentWorldState ?? null,
    narrativeGravity: world.narrativeGravity ?? null,
    conflictGrammar: world.conflictGrammar ?? null,
    discoveryRules: world.discoveryRules ?? null,
    storyGuardrails: world.storyGuardrails ?? [],
    continuityAnchors: world.continuityAnchors ?? [],
    openQuestions: world.openQuestions ?? [],
    visualGuardrails: world.visualGuardrails ?? [],
    imageDirection: world.imageDirection ?? null,
  };
}

export function moveEra(eras: HistoricalEra[], index: number, direction: -1 | 1): HistoricalEra[] {
  const target = index + direction;
  if (target < 0 || target >= eras.length) return eras;
  const reordered = [...eras];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered.map((era, order) => ({ ...era, order }));
}