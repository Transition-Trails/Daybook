// These keys correspond to the vocabKey props in CanonRecordEditor and CanonTypeForms.
// A vocabulary belongs to a field and a world, not to an individual Canon record.
export const recordTypeFields = {
  character: [
    "pronouns", "life_stage", "occupation_or_role", "social_position", "family_position",
    "marital_state", "education", "financial_security", "public_reputation",
    "apparent_life_stage", "height", "build", "face_shape", "complexion_depth",
    "skin_undertone", "eye_color", "eye_character", "hair_color", "hair_texture",
    "hair_length", "hair_arrangement", "facial_hair", "distinguishing_features",
    "posture", "movement", "wardrobe_formality", "garment_condition", "palette",
    "textile_preference", "pattern", "accessories", "grooming", "narrative_role",
    "arc_type", "starting_condition", "core_desire", "core_need", "core_fear",
    "misconception", "resisted_change", "ending_condition", "speech_register",
    "sentence_rhythm", "directness", "emotional_openness", "humor", "conflict_style",
    "affection_style", "vocabulary_tendencies", "category", "strength",
    "knowledge_state", "confidence", "source", "disclosure", "access",
  ],
  location: [
    "location_scale", "primary_function", "ownership", "condition", "access",
    "population_density", "setting_character", "dominant_materials",
  ],
  object: ["object_class", "scale", "material", "condition", "authenticity", "story_function"],
  event: ["event_type", "temporal_precision", "event_status", "consequence_scale"],
  lore: ["lore_type", "origin", "acceptance", "truth_status"],
  atmosphere: ["emotional_register", "intensity", "duration"],
  material: ["object_class", "rarity", "material"],
  relationship: [
    "relationship_type", "directionality", "phase", "emotional_valence", "trust",
    "power_balance", "public_visibility", "dependency", "primary_tension", "story_function",
  ],
  motif: ["motif_class", "recurrence", "evolution"],
} as const;

export type CanonRecordType = keyof typeof recordTypeFields;

export const canonRecordTypes: { key: CanonRecordType; label: string }[] = [
  { key: "character", label: "Character" },
  { key: "location", label: "Location" },
  { key: "object", label: "Object" },
  { key: "event", label: "Event" },
  { key: "lore", label: "Lore" },
  { key: "atmosphere", label: "Atmosphere" },
  { key: "material", label: "Material" },
  { key: "relationship", label: "Relationship" },
  { key: "motif", label: "Motif" },
];

export const sharedFields = [
  "canon_stability", "narrative_visibility", "temporal_scope", "importance",
  "spoiler_level", "evidence_confidence", "source_type",
] as const;

export function fieldsForType(type: CanonRecordType): string[] {
  return [...new Set([...sharedFields, ...recordTypeFields[type]])];
}

export function fieldLabel(key: string): string {
  return key.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}