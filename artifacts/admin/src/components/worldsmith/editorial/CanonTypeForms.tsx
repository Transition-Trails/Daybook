import { SingleSelect, MultiChipSelect, CanonPicker, StructuredRepeater } from "./EditorialFields";

const INK = "var(--admin-ink)";

export function LocationForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SingleSelect
        worldId={worldId} label="Location Scale"
        vocabKey="location_scale"
        value={data.locationScale ?? ""}
        onChange={v => onChange({ ...data, locationScale: v })}
        options={[
          { key: "room", label: "Room" },
          { key: "building", label: "Building" },
          { key: "property", label: "Property" },
          { key: "hamlet", label: "Hamlet" },
          { key: "village", label: "Village" },
          { key: "town", label: "Town" },
          { key: "city_district", label: "City District" },
          { key: "city", label: "City" },
          { key: "estate", label: "Estate" },
          { key: "landscape", label: "Landscape" },
          { key: "region", label: "Region" },
          { key: "country", label: "Country" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Primary Function"
        vocabKey="primary_function"
        values={data.primaryFunction ?? []}
        onChange={v => onChange({ ...data, primaryFunction: v })}
        options={[
          { key: "domestic", label: "Domestic" },
          { key: "agricultural", label: "Agricultural" },
          { key: "commercial", label: "Commercial" },
          { key: "industrial", label: "Industrial" },
          { key: "civic", label: "Civic" },
          { key: "religious", label: "Religious" },
          { key: "educational", label: "Educational" },
          { key: "medical", label: "Medical" },
          { key: "recreational", label: "Recreational" },
          { key: "ceremonial", label: "Ceremonial" },
          { key: "transportation", label: "Transportation" },
          { key: "wild", label: "Wild" },
          { key: "ruin", label: "Ruin" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Ownership"
        vocabKey="ownership"
        value={data.ownership ?? ""}
        onChange={v => onChange({ ...data, ownership: v })}
        options={[
          { key: "private", label: "Private" },
          { key: "family", label: "Family" },
          { key: "estate", label: "Estate" },
          { key: "corporate", label: "Corporate" },
          { key: "municipal", label: "Municipal" },
          { key: "ecclesiastical", label: "Ecclesiastical" },
          { key: "crown", label: "Crown" },
          { key: "common", label: "Common Land" },
          { key: "contested", label: "Contested" },
          { key: "unknown", label: "Unknown" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Condition"
        vocabKey="condition"
        value={data.condition ?? ""}
        onChange={v => onChange({ ...data, condition: v })}
        options={[
          { key: "pristine", label: "Pristine" },
          { key: "well_kept", label: "Well-Kept" },
          { key: "serviceable", label: "Serviceable" },
          { key: "worn", label: "Worn" },
          { key: "neglected", label: "Neglected" },
          { key: "decaying", label: "Decaying" },
          { key: "ruined", label: "Ruined" },
          { key: "construction", label: "Under Construction" },
          { key: "restoration", label: "Under Restoration" },
          { key: "altered", label: "Altered" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Access"
        vocabKey="access"
        value={data.access ?? ""}
        onChange={v => onChange({ ...data, access: v })}
        options={[
          { key: "open", label: "Open" },
          { key: "public_limits", label: "Public with Limits" },
          { key: "invitation", label: "Invitation Only" },
          { key: "staff", label: "Staff Only" },
          { key: "restricted", label: "Restricted" },
          { key: "secret", label: "Secret" },
          { key: "abandoned", label: "Abandoned" },
          { key: "seasonal", label: "Seasonal" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Population Density"
        vocabKey="population_density"
        value={data.populationDensity ?? ""}
        onChange={v => onChange({ ...data, populationDensity: v })}
        options={[
          { key: "uninhabited", label: "Uninhabited" },
          { key: "isolated", label: "Isolated" },
          { key: "sparse", label: "Sparse" },
          { key: "moderate", label: "Moderate" },
          { key: "busy", label: "Busy" },
          { key: "crowded", label: "Crowded" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Setting Character"
        vocabKey="setting_character"
        values={data.settingCharacter ?? []}
        onChange={v => onChange({ ...data, settingCharacter: v })}
        options={[
          { key: "formal", label: "Formal" },
          { key: "intimate", label: "Intimate" },
          { key: "domestic", label: "Domestic" },
          { key: "industrious", label: "Industrious" },
          { key: "picturesque", label: "Picturesque" },
          { key: "austere", label: "Austere" },
          { key: "wild", label: "Wild" },
          { key: "sheltered", label: "Sheltered" },
          { key: "exposed", label: "Exposed" },
          { key: "sacred", label: "Sacred" },
          { key: "uncanny", label: "Uncanny" },
          { key: "oppressive", label: "Oppressive" },
          { key: "restorative", label: "Restorative" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Dominant Materials"
        vocabKey="dominant_materials"
        values={data.dominantMaterials ?? []}
        onChange={v => onChange({ ...data, dominantMaterials: v })}
        options={[
          { key: "stone", label: "Local Stone" },
          { key: "brick", label: "Brick" },
          { key: "timber", label: "Timber" },
          { key: "slate", label: "Slate" },
          { key: "thatch", label: "Thatch" },
          { key: "iron", label: "Iron" },
          { key: "glass", label: "Glass" },
          { key: "plaster", label: "Plaster" },
          { key: "tile", label: "Tile" },
          { key: "earth", label: "Earth" },
          { key: "water", label: "Water" },
          { key: "plant", label: "Living Plant Material" }
        ]}
      />
    </div>
  );
}

export function ObjectForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SingleSelect
        worldId={worldId} label="Object Class"
        vocabKey="object_class"
        value={data.objectClass ?? ""}
        onChange={v => onChange({ ...data, objectClass: v })}
        options={[
          { key: "personal", label: "Personal" },
          { key: "domestic", label: "Domestic" },
          { key: "professional", label: "Professional" },
          { key: "agricultural", label: "Agricultural" },
          { key: "architectural", label: "Architectural" },
          { key: "decorative", label: "Decorative" },
          { key: "documentary", label: "Documentary" },
          { key: "scientific", label: "Scientific" },
          { key: "religious", label: "Religious" },
          { key: "ceremonial", label: "Ceremonial" },
          { key: "mechanical", label: "Mechanical" },
          { key: "commercial", label: "Commercial" },
          { key: "weapon", label: "Weapon" },
          { key: "clothing", label: "Clothing" },
          { key: "botanical", label: "Botanical" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Scale"
        vocabKey="scale"
        value={data.scale ?? ""}
        onChange={v => onChange({ ...data, scale: v })}
        options={[
          { key: "handheld", label: "Handheld" },
          { key: "portable", label: "Portable" },
          { key: "furniture", label: "Furniture" },
          { key: "room", label: "Room-Scale" },
          { key: "architectural", label: "Architectural" },
          { key: "landscape", label: "Landscape Feature" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Material"
        vocabKey="material"
        allowCustom
        values={data.material ?? []}
        onChange={v => onChange({ ...data, material: v })}
        options={[
          { key: "wood", label: "Wood" },
          { key: "paper", label: "Paper" },
          { key: "leather", label: "Leather" },
          { key: "stone", label: "Stone" },
          { key: "brick", label: "Brick" },
          { key: "iron", label: "Iron" },
          { key: "steel", label: "Steel" },
          { key: "brass", label: "Brass" },
          { key: "copper", label: "Copper" },
          { key: "silver", label: "Silver" },
          { key: "gold", label: "Gold" },
          { key: "glass", label: "Glass" },
          { key: "ceramic", label: "Ceramic" },
          { key: "textile", label: "Textile" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Condition"
        vocabKey="condition"
        value={data.condition ?? ""}
        onChange={v => onChange({ ...data, condition: v })}
        options={[
          { key: "new", label: "New" },
          { key: "pristine", label: "Pristine" },
          { key: "used", label: "Used" },
          { key: "worn", label: "Worn" },
          { key: "repaired", label: "Repaired" },
          { key: "damaged", label: "Damaged" },
          { key: "incomplete", label: "Incomplete" },
          { key: "decayed", label: "Decayed" },
          { key: "restored", label: "Restored" },
          { key: "replica", label: "Replica" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Authenticity"
        vocabKey="authenticity"
        value={data.authenticity ?? ""}
        onChange={v => onChange({ ...data, authenticity: v })}
        options={[
          { key: "original", label: "Original" },
          { key: "modified", label: "Modified Original" },
          { key: "restoration", label: "Restoration" },
          { key: "replacement", label: "Replacement" },
          { key: "replica", label: "Replica" },
          { key: "forgery", label: "Forgery" },
          { key: "uncertain", label: "Uncertain" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Story Function"
        vocabKey="story_function"
        values={data.storyFunction ?? []}
        onChange={v => onChange({ ...data, storyFunction: v })}
        options={[
          { key: "evidence", label: "Evidence" },
          { key: "heirloom", label: "Heirloom" },
          { key: "tool", label: "Tool" },
          { key: "symbol", label: "Symbol" },
          { key: "macguffin", label: "MacGuffin" },
          { key: "gift", label: "Gift" },
          { key: "burden", label: "Burden" },
          { key: "memorial", label: "Memorial" },
          { key: "key", label: "Key" },
          { key: "record", label: "Record" },
          { key: "conflict", label: "Source of Conflict" }
        ]}
      />
    </div>
  );
}

export function EventForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MultiChipSelect
        worldId={worldId} label="Event Type"
        vocabKey="event_type"
        values={data.eventType ?? []}
        onChange={v => onChange({ ...data, eventType: v })}
        options={[
          { key: "birth", label: "Birth" },
          { key: "death", label: "Death" },
          { key: "marriage", label: "Marriage" },
          { key: "separation", label: "Separation" },
          { key: "arrival", label: "Arrival" },
          { key: "departure", label: "Departure" },
          { key: "discovery", label: "Discovery" },
          { key: "inheritance", label: "Inheritance" },
          { key: "purchase", label: "Purchase" },
          { key: "sale", label: "Sale" },
          { key: "construction", label: "Construction" },
          { key: "restoration", label: "Restoration" },
          { key: "accident", label: "Accident" },
          { key: "illness", label: "Illness" },
          { key: "crime", label: "Crime" },
          { key: "scandal", label: "Scandal" },
          { key: "trial", label: "Trial" },
          { key: "celebration", label: "Celebration" },
          { key: "disaster", label: "Disaster" },
          { key: "protest", label: "Protest" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Temporal Precision"
        vocabKey="temporal_precision"
        value={data.temporalPrecision ?? ""}
        onChange={v => onChange({ ...data, temporalPrecision: v })}
        options={[
          { key: "exact", label: "Exact Date" },
          { key: "approximate", label: "Approximate Date" },
          { key: "season", label: "Season" },
          { key: "year", label: "Year" },
          { key: "era", label: "Era" },
          { key: "sequence", label: "Relative Sequence" },
          { key: "unknown", label: "Unknown" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Event Status"
        vocabKey="event_status"
        value={data.eventStatus ?? ""}
        onChange={v => onChange({ ...data, eventStatus: v })}
        options={[
          { key: "planned", label: "Planned" },
          { key: "occurred", label: "Occurred" },
          { key: "rumored", label: "Rumored" },
          { key: "disputed", label: "Disputed" },
          { key: "prevented", label: "Prevented" },
          { key: "ongoing", label: "Ongoing" },
          { key: "recurring", label: "Recurring" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Consequence Scale"
        vocabKey="consequence_scale"
        value={data.consequenceScale ?? ""}
        onChange={v => onChange({ ...data, consequenceScale: v })}
        options={[
          { key: "personal", label: "Personal" },
          { key: "relationship", label: "Relationship" },
          { key: "household", label: "Household" },
          { key: "community", label: "Community" },
          { key: "regional", label: "Regional" },
          { key: "national", label: "National" },
          { key: "generational", label: "Generational" }
        ]}
      />
    </div>
  );
}

export function LoreForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MultiChipSelect
        worldId={worldId} label="Lore Type"
        vocabKey="lore_type"
        values={data.loreType ?? []}
        onChange={v => onChange({ ...data, loreType: v })}
        options={[
          { key: "principle", label: "Principle" },
          { key: "tradition", label: "Tradition" },
          { key: "belief", label: "Belief" },
          { key: "folklore", label: "Folklore" },
          { key: "custom", label: "Custom" },
          { key: "rule", label: "Rule" },
          { key: "oath", label: "Oath" },
          { key: "legend", label: "Legend" },
          { key: "family_story", label: "Family Story" },
          { key: "professional", label: "Professional Practice" },
          { key: "community", label: "Community Memory" },
          { key: "superstition", label: "Superstition" },
          { key: "institutional", label: "Institutional Doctrine" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Origin"
        vocabKey="origin"
        value={data.origin ?? ""}
        onChange={v => onChange({ ...data, origin: v })}
        options={[
          { key: "individual", label: "Known Individual" },
          { key: "family", label: "Family" },
          { key: "community", label: "Community" },
          { key: "institution", label: "Institution" },
          { key: "region", label: "Region" },
          { key: "ancient", label: "Ancient or Untraceable" },
          { key: "disputed", label: "Disputed" },
          { key: "authorial", label: "Authorial Construct" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Acceptance"
        vocabKey="acceptance"
        value={data.acceptance ?? ""}
        onChange={v => onChange({ ...data, acceptance: v })}
        options={[
          { key: "universal", label: "Universal" },
          { key: "majority", label: "Majority" },
          { key: "common", label: "Common" },
          { key: "mixed", label: "Mixed" },
          { key: "minority", label: "Minority" },
          { key: "private", label: "Private" },
          { key: "forgotten", label: "Forgotten" },
          { key: "reviving", label: "Reviving" },
          { key: "disputed", label: "Disputed" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Truth Status"
        vocabKey="truth_status"
        value={data.truthStatus ?? ""}
        onChange={v => onChange({ ...data, truthStatus: v })}
        options={[
          { key: "objectively_true", label: "Objectively True" },
          { key: "partly_true", label: "Partly True" },
          { key: "metaphorically_true", label: "Metaphorically True" },
          { key: "false_believed", label: "False but Believed" },
          { key: "deliberate_fiction", label: "Deliberate Fiction" },
          { key: "unknown", label: "Unknown" },
          { key: "irrelevant", label: "Irrelevant" }
        ]}
      />
    </div>
  );
}

export function AtmosphereForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MultiChipSelect
        worldId={worldId} label="Emotional Register"
        vocabKey="emotional_register"
        values={data.emotionalRegister ?? []}
        onChange={v => onChange({ ...data, emotionalRegister: v })}
        options={[
          { key: "warm", label: "Warm" },
          { key: "hopeful", label: "Hopeful" },
          { key: "intimate", label: "Intimate" },
          { key: "reflective", label: "Reflective" },
          { key: "melancholic", label: "Melancholic" },
          { key: "tense", label: "Tense" },
          { key: "ominous", label: "Ominous" },
          { key: "uncanny", label: "Uncanny" },
          { key: "joyful", label: "Joyful" },
          { key: "austere", label: "Austere" },
          { key: "restorative", label: "Restorative" },
          { key: "romantic", label: "Romantic" },
          { key: "grieving", label: "Grieving" },
          { key: "industrious", label: "Industrious" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Intensity"
        vocabKey="intensity"
        value={data.intensity ?? ""}
        onChange={v => onChange({ ...data, intensity: v })}
        options={[
          { key: "subtle", label: "Subtle" },
          { key: "light", label: "Light" },
          { key: "moderate", label: "Moderate" },
          { key: "strong", label: "Strong" },
          { key: "dominant", label: "Dominant" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Duration"
        vocabKey="duration"
        value={data.duration ?? ""}
        onChange={v => onChange({ ...data, duration: v })}
        options={[
          { key: "momentary", label: "Momentary" },
          { key: "scene", label: "Scene" },
          { key: "sequence", label: "Sequence" },
          { key: "recurring", label: "Recurring" },
          { key: "location", label: "Location-Bound" },
          { key: "story", label: "Story-Wide" }
        ]}
      />
    </div>
  );
}

export function MotifForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MultiChipSelect
        worldId={worldId} label="Motif Class"
        vocabKey="motif_class"
        values={data.motifClass ?? []}
        onChange={v => onChange({ ...data, motifClass: v })}
        options={[
          { key: "natural", label: "Natural" },
          { key: "architectural", label: "Architectural" },
          { key: "object", label: "Object" },
          { key: "color", label: "Color" },
          { key: "sound", label: "Sound" },
          { key: "gesture", label: "Gesture" },
          { key: "weather", label: "Weather" },
          { key: "animal", label: "Animal" },
          { key: "plant", label: "Plant" },
          { key: "textile", label: "Textile" },
          { key: "light", label: "Light" },
          { key: "repeated_phrase", label: "Repeated Phrase" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Recurrence"
        vocabKey="recurrence"
        value={data.recurrence ?? ""}
        onChange={v => onChange({ ...data, recurrence: v })}
        options={[
          { key: "rare", label: "Rare" },
          { key: "occasional", label: "Occasional" },
          { key: "regular", label: "Regular" },
          { key: "structural", label: "Structural" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Evolution"
        vocabKey="evolution"
        value={data.evolution ?? ""}
        onChange={v => onChange({ ...data, evolution: v })}
        options={[
          { key: "static", label: "Static" },
          { key: "accumulates", label: "Accumulates Meaning" },
          { key: "reverses", label: "Reverses Meaning" },
          { key: "degrades", label: "Degrades" },
          { key: "restores", label: "Restores" },
          { key: "changes_owner", label: "Changes Owner" }
        ]}
      />
    </div>
  );
}

export function RelationshipForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <CanonPicker
        worldId={worldId}
        label="From Entity"
        value={data.fromEntity ?? ""}
        onChange={v => onChange({ ...data, fromEntity: v })}
      />
      <CanonPicker
        worldId={worldId}
        label="To Entity"
        value={data.toEntity ?? ""}
        onChange={v => onChange({ ...data, toEntity: v })}
      />
      <MultiChipSelect
        worldId={worldId} label="Relationship Type"
        vocabKey="relationship_type"
        values={data.relationshipType ?? []}
        onChange={v => onChange({ ...data, relationshipType: v })}
        options={[
          { key: "parent", label: "Parent" },
          { key: "child", label: "Child" },
          { key: "sibling", label: "Sibling" },
          { key: "spouse", label: "Spouse" },
          { key: "romantic", label: "Romantic" },
          { key: "friend", label: "Friend" },
          { key: "confidant", label: "Confidant" },
          { key: "colleague", label: "Colleague" },
          { key: "employer", label: "Employer" },
          { key: "employee", label: "Employee" },
          { key: "mentor", label: "Mentor" },
          { key: "student", label: "Student" },
          { key: "patron", label: "Patron" },
          { key: "client", label: "Client" },
          { key: "rival", label: "Rival" },
          { key: "adversary", label: "Adversary" },
          { key: "neighbor", label: "Neighbor" },
          { key: "caregiver", label: "Caregiver" },
          { key: "ward", label: "Ward" },
          { key: "business", label: "Business Partner" },
          { key: "custodian", label: "Custodian" },
          { key: "community", label: "Community Tie" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Directionality"
        vocabKey="directionality"
        value={data.directionality ?? ""}
        onChange={v => onChange({ ...data, directionality: v })}
        options={[
          { key: "mutual", label: "Mutual" },
          { key: "primarily_from", label: "Primarily From" },
          { key: "primarily_to", label: "Primarily To" },
          { key: "unequal", label: "Unequal" },
          { key: "misunderstood", label: "Misunderstood" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Phase"
        vocabKey="phase"
        value={data.phase ?? ""}
        onChange={v => onChange({ ...data, phase: v })}
        options={[
          { key: "unknown", label: "Unknown" },
          { key: "newly_formed", label: "Newly Formed" },
          { key: "developing", label: "Developing" },
          { key: "established", label: "Established" },
          { key: "strained", label: "Strained" },
          { key: "estranged", label: "Estranged" },
          { key: "repaired", label: "Repaired" },
          { key: "ended", label: "Ended" },
          { key: "bereaved", label: "Bereaved" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Emotional Valence"
        vocabKey="emotional_valence"
        value={data.emotionalValence ?? ""}
        onChange={v => onChange({ ...data, emotionalValence: v })}
        options={[
          { key: "loving", label: "Loving" },
          { key: "warm", label: "Warm" },
          { key: "respectful", label: "Respectful" },
          { key: "loyal", label: "Loyal" },
          { key: "neutral", label: "Neutral" },
          { key: "ambivalent", label: "Ambivalent" },
          { key: "competitive", label: "Competitive" },
          { key: "resentful", label: "Resentful" },
          { key: "fearful", label: "Fearful" },
          { key: "hostile", label: "Hostile" },
          { key: "grieving", label: "Grieving" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Trust"
        vocabKey="trust"
        value={data.trust ?? ""}
        onChange={v => onChange({ ...data, trust: v })}
        options={[
          { key: "none", label: "None" },
          { key: "fragile", label: "Fragile" },
          { key: "conditional", label: "Conditional" },
          { key: "moderate", label: "Moderate" },
          { key: "strong", label: "Strong" },
          { key: "absolute", label: "Absolute" },
          { key: "misplaced", label: "Misplaced" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Power Balance"
        vocabKey="power_balance"
        value={data.powerBalance ?? ""}
        onChange={v => onChange({ ...data, powerBalance: v })}
        options={[
          { key: "balanced", label: "Balanced" },
          { key: "slightly_from", label: "Slightly From-Dominant" },
          { key: "slightly_to", label: "Slightly To-Dominant" },
          { key: "strongly_from", label: "Strongly From-Dominant" },
          { key: "strongly_to", label: "Strongly To-Dominant" },
          { key: "context", label: "Context-Dependent" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Public Visibility"
        vocabKey="public_visibility"
        value={data.publicVisibility ?? ""}
        onChange={v => onChange({ ...data, publicVisibility: v })}
        options={[
          { key: "public", label: "Public" },
          { key: "circle", label: "Known to Circle" },
          { key: "private", label: "Private" },
          { key: "secret", label: "Secret" },
          { key: "misrepresented", label: "Misrepresented" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Dependency"
        vocabKey="dependency"
        values={data.dependency ?? []}
        onChange={v => onChange({ ...data, dependency: v })}
        options={[
          { key: "emotional", label: "Emotional" },
          { key: "financial", label: "Financial" },
          { key: "social", label: "Social" },
          { key: "professional", label: "Professional" },
          { key: "legal", label: "Legal" },
          { key: "physical", label: "Physical" },
          { key: "informational", label: "Informational" },
          { key: "none", label: "None" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Primary Tension"
        vocabKey="primary_tension"
        values={data.primaryTension ?? []}
        onChange={v => onChange({ ...data, primaryTension: v })}
        options={[
          { key: "duty", label: "Duty vs Desire" },
          { key: "trust", label: "Trust" },
          { key: "class", label: "Class" },
          { key: "money", label: "Money" },
          { key: "inheritance", label: "Inheritance" },
          { key: "reputation", label: "Reputation" },
          { key: "authority", label: "Authority" },
          { key: "secrecy", label: "Secrecy" },
          { key: "grief", label: "Grief" },
          { key: "jealousy", label: "Jealousy" },
          { key: "ideology", label: "Ideology" },
          { key: "protection", label: "Protection" },
          { key: "distance", label: "Distance" },
          { key: "miscommunication", label: "Miscommunication" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Story Function"
        vocabKey="story_function"
        values={data.storyFunction ?? []}
        onChange={v => onChange({ ...data, storyFunction: v })}
        options={[
          { key: "support", label: "Support" },
          { key: "pressure", label: "Pressure" },
          { key: "foil", label: "Foil" },
          { key: "revelation", label: "Revelation" },
          { key: "conflict", label: "Conflict" },
          { key: "reconciliation", label: "Reconciliation" },
          { key: "catalyst", label: "Catalyst" },
          { key: "stakes", label: "Stakes" },
          { key: "comic", label: "Comic Relief" },
          { key: "witness", label: "Witness" }
        ]}
      />
    </div>
  );
}
export function CharacterIdentityForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  const BORDER = "var(--admin-border, var(--admin-border))";
  const INK = "var(--admin-ink, var(--admin-ink))";
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Character Identity & Social Position</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SingleSelect worldId={worldId} label="Pronouns"
        vocabKey="pronouns" value={data.pronouns ?? ""} onChange={v => onChange({ ...data, pronouns: v })} options={[{ key: "she_her", label: "She/Her" }, { key: "he_him", label: "He/Him" }, { key: "they_them", label: "They/Them" }, { key: "unresolved", label: "Unresolved" }]} allowCustom />
          <SingleSelect worldId={worldId} label="Life Stage"
        vocabKey="life_stage" value={data.lifeStage ?? ""} onChange={v => onChange({ ...data, lifeStage: v })} options={[{ key: "infant", label: "Infant" }, { key: "child", label: "Child" }, { key: "adolescent", label: "Adolescent" }, { key: "young_adult", label: "Young Adult" }, { key: "early_adult", label: "Early Adult" }, { key: "established", label: "Established Adult" }, { key: "middle_age", label: "Middle Age" }, { key: "later_life", label: "Later Life" }, { key: "elder", label: "Elder" }]} />
          <MultiChipSelect worldId={worldId} label="Occupation or Role"
        vocabKey="occupation_or_role" allowCustom values={data.occupation ?? []} onChange={v => onChange({ ...data, occupation: v })} options={[]} />
          <SingleSelect worldId={worldId} label="Social Position"
        vocabKey="social_position" value={data.socialPosition ?? ""} onChange={v => onChange({ ...data, socialPosition: v })} options={[{ key: "destitute", label: "Destitute" }, { key: "laboring", label: "Laboring Poor" }, { key: "working", label: "Working Class" }, { key: "skilled", label: "Skilled Trade" }, { key: "lower_middle", label: "Lower Middle Class" }, { key: "middle", label: "Middle Class" }, { key: "upper_middle", label: "Upper Middle Class" }, { key: "gentry", label: "Gentry" }, { key: "aristocracy", label: "Aristocracy" }, { key: "royalty", label: "Royalty" }, { key: "outside", label: "Outside Conventional Class" }]} />
          <SingleSelect worldId={worldId} label="Family Position"
        vocabKey="family_position" value={data.familyPosition ?? ""} onChange={v => onChange({ ...data, familyPosition: v })} options={[{ key: "only_child", label: "Only Child" }, { key: "eldest", label: "Eldest" }, { key: "middle", label: "Middle" }, { key: "youngest", label: "Youngest" }, { key: "heir", label: "Heir" }, { key: "spare", label: "Spare" }, { key: "ward", label: "Ward" }, { key: "adopted", label: "Adopted" }, { key: "stepchild", label: "Stepchild" }]} allowCustom />
          <SingleSelect worldId={worldId} label="Marital State"
        vocabKey="marital_state" value={data.maritalState ?? ""} onChange={v => onChange({ ...data, maritalState: v })} options={[{ key: "unmarried", label: "Unmarried" }, { key: "courting", label: "Courting" }, { key: "engaged", label: "Engaged" }, { key: "married", label: "Married" }, { key: "separated", label: "Separated" }, { key: "widowed", label: "Widowed" }, { key: "remarried", label: "Remarried" }, { key: "not_applicable", label: "Not Applicable" }, { key: "withheld", label: "Withheld" }]} />
          <MultiChipSelect worldId={worldId} label="Education"
        vocabKey="education" values={data.education ?? []} onChange={v => onChange({ ...data, education: v })} options={[{ key: "informal", label: "Informal" }, { key: "apprenticeship", label: "Apprenticeship" }, { key: "governess", label: "Governess or Tutor" }, { key: "grammar_school", label: "Grammar School" }, { key: "public_school", label: "Public School" }, { key: "university", label: "University" }, { key: "professional", label: "Professional Training" }, { key: "self_educated", label: "Self-Educated" }, { key: "unknown", label: "Unknown" }]} />
          <SingleSelect worldId={worldId} label="Financial Security"
        vocabKey="financial_security" value={data.financialSecurity ?? ""} onChange={v => onChange({ ...data, financialSecurity: v })} options={[{ key: "precarious", label: "Precarious" }, { key: "modest", label: "Modest" }, { key: "comfortable", label: "Comfortable" }, { key: "prosperous", label: "Prosperous" }, { key: "wealthy", label: "Wealthy" }, { key: "dependent", label: "Dependent" }, { key: "declining", label: "Declining" }, { key: "unknown", label: "Unknown" }]} />
          <MultiChipSelect worldId={worldId} label="Public Reputation"
        vocabKey="public_reputation" values={data.publicReputation ?? []} onChange={v => onChange({ ...data, publicReputation: v })} options={[{ key: "respected", label: "Respected" }, { key: "trusted", label: "Trusted" }, { key: "admired", label: "Admired" }, { key: "conventional", label: "Conventional" }, { key: "eccentric", label: "Eccentric" }, { key: "formidable", label: "Formidable" }, { key: "questioned", label: "Questioned" }, { key: "scandalous", label: "Scandalous" }, { key: "unknown", label: "Unknown" }]} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Physical Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SingleSelect worldId={worldId} label="Apparent Life Stage"
        vocabKey="apparent_life_stage" value={data.apparentLifeStage ?? ""} onChange={v => onChange({ ...data, apparentLifeStage: v })} options={[{ key: "infant", label: "Infant" }, { key: "child", label: "Child" }, { key: "adolescent", label: "Adolescent" }, { key: "young_adult", label: "Young Adult" }, { key: "early_adult", label: "Early Adult" }, { key: "established", label: "Established Adult" }, { key: "middle_age", label: "Middle Age" }, { key: "later_life", label: "Later Life" }, { key: "elder", label: "Elder" }]} />
          <SingleSelect worldId={worldId} label="Height"
        vocabKey="height" value={data.height ?? ""} onChange={v => onChange({ ...data, height: v })} options={[{ key: "very_short", label: "Very Short" }, { key: "short", label: "Short" }, { key: "average", label: "Average" }, { key: "tall", label: "Tall" }, { key: "very_tall", label: "Very Tall" }]} />
          <MultiChipSelect worldId={worldId} label="Build"
        vocabKey="build" max={2} values={data.build ?? []} onChange={v => onChange({ ...data, build: v })} options={[{ key: "slight", label: "Slight" }, { key: "lean", label: "Lean" }, { key: "wiry", label: "Wiry" }, { key: "average", label: "Average" }, { key: "broad", label: "Broad" }, { key: "sturdy", label: "Sturdy" }, { key: "athletic", label: "Athletic" }, { key: "soft", label: "Soft" }, { key: "heavyset", label: "Heavyset" }, { key: "frail", label: "Frail" }]} />
          <SingleSelect worldId={worldId} label="Face Shape"
        vocabKey="face_shape" value={data.faceShape ?? ""} onChange={v => onChange({ ...data, faceShape: v })} options={[{ key: "oval", label: "Oval" }, { key: "round", label: "Round" }, { key: "square", label: "Square" }, { key: "rectangular", label: "Rectangular" }, { key: "heart", label: "Heart" }, { key: "diamond", label: "Diamond" }, { key: "long", label: "Long" }, { key: "angular", label: "Angular" }]} />
          <SingleSelect worldId={worldId} label="Complexion Depth"
        vocabKey="complexion_depth" value={data.complexionDepth ?? ""} onChange={v => onChange({ ...data, complexionDepth: v })} options={[{ key: "very_fair", label: "Very Fair" }, { key: "fair", label: "Fair" }, { key: "light", label: "Light" }, { key: "medium", label: "Medium" }, { key: "tan", label: "Tan" }, { key: "deep", label: "Deep" }, { key: "very_deep", label: "Very Deep" }]} />
          <SingleSelect worldId={worldId} label="Skin Undertone"
        vocabKey="skin_undertone" value={data.skinUndertone ?? ""} onChange={v => onChange({ ...data, skinUndertone: v })} options={[{ key: "cool", label: "Cool" }, { key: "neutral", label: "Neutral" }, { key: "warm", label: "Warm" }, { key: "olive", label: "Olive" }, { key: "unknown", label: "Unknown" }]} />
          <SingleSelect worldId={worldId} label="Eye Color"
        vocabKey="eye_color" allowCustom value={data.eyeColor ?? ""} onChange={v => onChange({ ...data, eyeColor: v })} options={[{ key: "gray", label: "Gray" }, { key: "blue", label: "Blue" }, { key: "green", label: "Green" }, { key: "hazel", label: "Hazel" }, { key: "amber", label: "Amber" }, { key: "brown", label: "Brown" }, { key: "dark_brown", label: "Dark Brown" }]} />
          <MultiChipSelect worldId={worldId} label="Eye Character"
        vocabKey="eye_character" max={3} values={data.eyeCharacter ?? []} onChange={v => onChange({ ...data, eyeCharacter: v })} options={[{ key: "deep_set", label: "Deep-Set" }, { key: "wide_set", label: "Wide-Set" }, { key: "close_set", label: "Close-Set" }, { key: "hooded", label: "Hooded" }, { key: "heavy_lidded", label: "Heavy-Lidded" }, { key: "alert", label: "Alert" }, { key: "soft", label: "Soft" }, { key: "intense", label: "Intense" }, { key: "watchful", label: "Watchful" }]} />
          <SingleSelect worldId={worldId} label="Hair Color"
        vocabKey="hair_color" allowCustom value={data.hairColor ?? ""} onChange={v => onChange({ ...data, hairColor: v })} options={[{ key: "black", label: "Black" }, { key: "dark_brown", label: "Dark Brown" }, { key: "brown", label: "Brown" }, { key: "light_brown", label: "Light Brown" }, { key: "auburn", label: "Auburn" }, { key: "red", label: "Red" }, { key: "dark_blond", label: "Dark Blond" }, { key: "blond", label: "Blond" }, { key: "gray", label: "Gray" }, { key: "white", label: "White" }]} />
          <SingleSelect worldId={worldId} label="Hair Texture"
        vocabKey="hair_texture" value={data.hairTexture ?? ""} onChange={v => onChange({ ...data, hairTexture: v })} options={[{ key: "straight", label: "Straight" }, { key: "wavy", label: "Wavy" }, { key: "curly", label: "Curly" }, { key: "coiled", label: "Coiled" }, { key: "fine", label: "Fine" }, { key: "coarse", label: "Coarse" }]} />
          <SingleSelect worldId={worldId} label="Hair Length"
        vocabKey="hair_length" value={data.hairLength ?? ""} onChange={v => onChange({ ...data, hairLength: v })} options={[{ key: "cropped", label: "Cropped" }, { key: "short", label: "Short" }, { key: "ear", label: "Ear-Length" }, { key: "chin", label: "Chin-Length" }, { key: "shoulder", label: "Shoulder-Length" }, { key: "long", label: "Long" }]} />
          <MultiChipSelect worldId={worldId} label="Hair Arrangement"
        vocabKey="hair_arrangement" values={data.hairArrangement ?? []} onChange={v => onChange({ ...data, hairArrangement: v })} options={[{ key: "neatly_parted", label: "Neatly Parted" }, { key: "loosely_parted", label: "Loosely Parted" }, { key: "swept_back", label: "Swept Back" }, { key: "pinned_up", label: "Pinned Up" }, { key: "braided", label: "Braided" }, { key: "coiled", label: "Coiled" }, { key: "covered", label: "Covered" }, { key: "disordered", label: "Disordered" }, { key: "receding", label: "Receding" }, { key: "thinning", label: "Thinning" }]} />
          <SingleSelect worldId={worldId} label="Facial Hair"
        vocabKey="facial_hair" value={data.facialHair ?? ""} onChange={v => onChange({ ...data, facialHair: v })} options={[{ key: "none", label: "None" }, { key: "clean_shaven", label: "Clean-Shaven" }, { key: "stubble", label: "Stubble" }, { key: "mustache", label: "Mustache" }, { key: "sideburns", label: "Sideburns" }, { key: "short_beard", label: "Short Beard" }, { key: "full_beard", label: "Full Beard" }]} allowCustom />
          <MultiChipSelect worldId={worldId} label="Distinguishing Features"
        vocabKey="distinguishing_features" allowCustom values={data.distinguishingFeatures ?? []} onChange={v => onChange({ ...data, distinguishingFeatures: v })} options={[{ key: "freckles", label: "Freckles" }, { key: "scar", label: "Scar" }, { key: "birthmark", label: "Birthmark" }, { key: "lines_eyes", label: "Lines at Eyes" }, { key: "strong_brow", label: "Strong Brow" }, { key: "prominent_nose", label: "Prominent Nose" }, { key: "dimple", label: "Dimple" }, { key: "weathering", label: "Weathering" }, { key: "callused", label: "Callused Hands" }, { key: "ink_stained", label: "Ink-Stained Fingers" }, { key: "spectacles", label: "Spectacles" }]} />
          <MultiChipSelect worldId={worldId} label="Posture"
        vocabKey="posture" max={3} values={data.posture ?? []} onChange={v => onChange({ ...data, posture: v })} options={[{ key: "upright", label: "Upright" }, { key: "formal", label: "Formal" }, { key: "relaxed", label: "Relaxed" }, { key: "guarded", label: "Guarded" }, { key: "stooped", label: "Stooped" }, { key: "restless", label: "Restless" }, { key: "grounded", label: "Grounded" }, { key: "tense", label: "Tense" }, { key: "graceful", label: "Graceful" }, { key: "work_worn", label: "Work-Worn" }]} />
          <MultiChipSelect worldId={worldId} label="Movement"
        vocabKey="movement" max={3} values={data.movement ?? []} onChange={v => onChange({ ...data, movement: v })} options={[{ key: "deliberate", label: "Deliberate" }, { key: "brisk", label: "Brisk" }, { key: "economical", label: "Economical" }, { key: "hesitant", label: "Hesitant" }, { key: "restless", label: "Restless" }, { key: "graceful", label: "Graceful" }, { key: "heavy", label: "Heavy" }, { key: "quiet", label: "Quiet" }, { key: "precise", label: "Precise" }, { key: "expansive", label: "Expansive" }]} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Wardrobe and Presentation</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SingleSelect worldId={worldId} label="Wardrobe Formality"
        vocabKey="wardrobe_formality" value={data.wardrobeFormality ?? ""} onChange={v => onChange({ ...data, wardrobeFormality: v })} options={[{ key: "workwear", label: "Workwear" }, { key: "informal", label: "Informal Domestic" }, { key: "everyday", label: "Everyday Respectable" }, { key: "professional", label: "Professional" }, { key: "visiting", label: "Visiting" }, { key: "evening", label: "Evening" }, { key: "ceremonial", label: "Ceremonial" }, { key: "mourning", label: "Mourning" }]} />
          <SingleSelect worldId={worldId} label="Garment Condition"
        vocabKey="garment_condition" value={data.garmentCondition ?? ""} onChange={v => onChange({ ...data, garmentCondition: v })} options={[{ key: "patched", label: "Patched" }, { key: "worn", label: "Worn" }, { key: "serviceable", label: "Serviceable" }, { key: "well_kept", label: "Well-Kept" }, { key: "fine", label: "Fine" }, { key: "immaculate", label: "Immaculate" }, { key: "faded", label: "Faded" }, { key: "newly_made", label: "Newly Made" }]} />
          <MultiChipSelect worldId={worldId} label="Palette"
        vocabKey="palette" allowCustom values={data.palette ?? []} onChange={v => onChange({ ...data, palette: v })} options={[{ key: "black", label: "Black" }, { key: "charcoal", label: "Charcoal" }, { key: "slate", label: "Slate" }, { key: "navy", label: "Navy" }, { key: "brown", label: "Brown" }, { key: "tan", label: "Tan" }, { key: "cream", label: "Cream" }, { key: "white", label: "White" }, { key: "olive", label: "Olive" }, { key: "moss", label: "Moss" }, { key: "forest", label: "Forest" }, { key: "burgundy", label: "Burgundy" }, { key: "rust", label: "Rust" }, { key: "plum", label: "Plum" }, { key: "muted_blue", label: "Muted Blue" }, { key: "dusty_rose", label: "Dusty Rose" }]} />
          <MultiChipSelect worldId={worldId} label="Textile Preference"
        vocabKey="textile_preference" values={data.textilePreference ?? []} onChange={v => onChange({ ...data, textilePreference: v })} options={[{ key: "wool", label: "Wool" }, { key: "tweed", label: "Tweed" }, { key: "linen", label: "Linen" }, { key: "cotton", label: "Cotton" }, { key: "silk", label: "Silk" }, { key: "velvet", label: "Velvet" }, { key: "leather", label: "Leather" }, { key: "lace", label: "Lace" }, { key: "muslin", label: "Muslin" }, { key: "calico", label: "Calico" }, { key: "oilcloth", label: "Oilcloth" }]} />
          <MultiChipSelect worldId={worldId} label="Pattern"
        vocabKey="pattern" values={data.pattern ?? []} onChange={v => onChange({ ...data, pattern: v })} options={[{ key: "solid", label: "Solid" }, { key: "stripe", label: "Subtle Stripe" }, { key: "check", label: "Check" }, { key: "plaid", label: "Plaid" }, { key: "floral", label: "Floral" }, { key: "brocade", label: "Brocade" }, { key: "geometric", label: "Geometric" }, { key: "none", label: "None" }]} />
          <MultiChipSelect worldId={worldId} label="Accessories"
        vocabKey="accessories" allowCustom values={data.accessories ?? []} onChange={v => onChange({ ...data, accessories: v })} options={[{ key: "spectacles", label: "Spectacles" }, { key: "watch_chain", label: "Watch Chain" }, { key: "brooch", label: "Brooch" }, { key: "gloves", label: "Gloves" }, { key: "hat", label: "Hat" }, { key: "shawl", label: "Shawl" }, { key: "cravat", label: "Cravat" }, { key: "tie", label: "Tie" }, { key: "walking_stick", label: "Walking Stick" }, { key: "satchel", label: "Satchel" }, { key: "apron", label: "Apron" }, { key: "tools", label: "Tools" }, { key: "jewelry", label: "Jewelry" }]} />
          <SingleSelect worldId={worldId} label="Grooming"
        vocabKey="grooming" value={data.grooming ?? ""} onChange={v => onChange({ ...data, grooming: v })} options={[{ key: "immaculate", label: "Immaculate" }, { key: "neat", label: "Neat" }, { key: "practical", label: "Practical" }, { key: "weathered", label: "Weathered" }, { key: "disheveled", label: "Disheveled" }, { key: "neglected", label: "Neglected" }]} />
        </div>
      </div>
      
      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Story Function and Arc</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MultiChipSelect worldId={worldId} label="Narrative Role"
        vocabKey="narrative_role" values={data.narrativeRole ?? []} onChange={v => onChange({ ...data, narrativeRole: v })} options={[{ key: "protagonist", label: "Protagonist" }, { key: "co_protagonist", label: "Co-Protagonist" }, { key: "viewpoint", label: "Viewpoint Character" }, { key: "mentor", label: "Mentor" }, { key: "ally", label: "Ally" }, { key: "confidant", label: "Confidant" }, { key: "romantic", label: "Romantic Partner" }, { key: "family_counterpoint", label: "Family Counterpoint" }, { key: "rival", label: "Rival" }, { key: "antagonist", label: "Antagonist" }, { key: "foil", label: "Foil" }, { key: "patron", label: "Patron" }, { key: "gatekeeper", label: "Gatekeeper" }, { key: "witness", label: "Witness" }, { key: "catalyst", label: "Catalyst" }, { key: "custodian", label: "Custodian" }, { key: "community", label: "Community Voice" }]} />
          <SingleSelect worldId={worldId} label="Arc Type"
        vocabKey="arc_type" value={data.arcType ?? ""} onChange={v => onChange({ ...data, arcType: v })} options={[{ key: "positive", label: "Positive Change" }, { key: "flat", label: "Flat or Steadfast" }, { key: "disillusionment", label: "Disillusionment" }, { key: "corruption", label: "Corruption" }, { key: "redemption", label: "Redemption" }, { key: "healing", label: "Healing" }, { key: "coming_of_age", label: "Coming of Age" }, { key: "fall_recovery", label: "Fall and Recovery" }, { key: "tragic", label: "Tragic Fall" }, { key: "mystery", label: "Mystery or Revelation" }, { key: "legacy", label: "Legacy" }]} />
          <MultiChipSelect worldId={worldId} label="Starting Condition"
        vocabKey="starting_condition" values={data.startingCondition ?? []} onChange={v => onChange({ ...data, startingCondition: v })} options={[{ key: "secure", label: "Secure" }, { key: "isolated", label: "Isolated" }, { key: "dutiful", label: "Dutiful" }, { key: "restless", label: "Restless" }, { key: "grieving", label: "Grieving" }, { key: "ambitious", label: "Ambitious" }, { key: "disillusioned", label: "Disillusioned" }, { key: "protected", label: "Protected" }, { key: "burdened", label: "Burdened" }, { key: "curious", label: "Curious" }, { key: "distrustful", label: "Distrustful" }, { key: "hopeful", label: "Hopeful" }]} />
          <SingleSelect worldId={worldId} label="Core Desire"
        vocabKey="core_desire" allowCustom value={data.coreDesire ?? ""} onChange={v => onChange({ ...data, coreDesire: v })} options={[{ key: "belonging", label: "Belonging" }, { key: "security", label: "Security" }, { key: "recognition", label: "Recognition" }, { key: "freedom", label: "Freedom" }, { key: "love", label: "Love" }, { key: "truth", label: "Truth" }, { key: "restoration", label: "Restoration" }, { key: "justice", label: "Justice" }, { key: "control", label: "Control" }, { key: "legacy", label: "Legacy" }, { key: "reconciliation", label: "Reconciliation" }, { key: "purpose", label: "Purpose" }, { key: "protection", label: "Protection" }]} />
          <SingleSelect worldId={worldId} label="Core Need"
        vocabKey="core_need" allowCustom value={data.coreNeed ?? ""} onChange={v => onChange({ ...data, coreNeed: v })} options={[{ key: "trust", label: "Trust" }, { key: "humility", label: "Humility" }, { key: "courage", label: "Courourage" }, { key: "self_knowledge", label: "Self-Knowledge" }, { key: "connection", label: "Connection" }, { key: "agency", label: "Agency" }, { key: "forgiveness", label: "Forgiveness" }, { key: "acceptance", label: "Acceptance" }, { key: "responsibility", label: "Responsibility" }, { key: "hope", label: "Hope" }, { key: "boundaries", label: "Boundaries" }]} />
          <SingleSelect worldId={worldId} label="Core Fear"
        vocabKey="core_fear" allowCustom value={data.coreFear ?? ""} onChange={v => onChange({ ...data, coreFear: v })} options={[{ key: "abandonment", label: "Abandonment" }, { key: "failure", label: "Failure" }, { key: "exposure", label: "Exposure" }, { key: "powerlessness", label: "Powerlessness" }, { key: "disorder", label: "Disorder" }, { key: "intimacy", label: "Intimacy" }, { key: "loss", label: "Loss" }, { key: "disgrace", label: "Disgrace" }, { key: "dependence", label: "Dependence" }, { key: "repetition", label: "Repetition of the Past" }]} />
          <SingleSelect worldId={worldId} label="Misconception"
        vocabKey="misconception" allowCustom value={data.misconception ?? ""} onChange={v => onChange({ ...data, misconception: v })} options={[{ key: "duty", label: "Duty Requires Self-Denial" }, { key: "control", label: "Control Prevents Loss" }, { key: "worth", label: "Worth Must Be Earned" }, { key: "vulnerability", label: "Vulnerability Is Weakness" }, { key: "tradition", label: "Tradition Must Not Change" }, { key: "love", label: "Love Requires Rescue" }, { key: "knowledge", label: "Knowledge Equals Wisdom" }]} />
          <MultiChipSelect worldId={worldId} label="Resisted Change"
        vocabKey="resisted_change" values={data.resistedChange ?? []} onChange={v => onChange({ ...data, resistedChange: v })} options={[{ key: "asking", label: "Asking for Help" }, { key: "sharing", label: "Sharing Authority" }, { key: "accepting", label: "Accepting Love" }, { key: "relinquishing", label: "Relinquishing Control" }, { key: "facing", label: "Facing the Past" }, { key: "speaking", label: "Speaking Truth" }, { key: "breaking", label: "Breaking Convention" }, { key: "assuming", label: "Assuming Responsibility" }, { key: "forgiving", label: "Forgiving" }]} />
          <MultiChipSelect worldId={worldId} label="Ending Condition"
        vocabKey="ending_condition" values={data.endingCondition ?? []} onChange={v => onChange({ ...data, endingCondition: v })} options={[{ key: "secure", label: "Secure" }, { key: "isolated", label: "Isolated" }, { key: "dutiful", label: "Dutiful" }, { key: "restless", label: "Restless" }, { key: "grieving", label: "Grieving" }, { key: "ambitious", label: "Ambitious" }, { key: "disillusioned", label: "Disillusioned" }, { key: "protected", label: "Protected" }, { key: "burdened", label: "Burdened" }, { key: "curious", label: "Curious" }, { key: "distrustful", label: "Distrustful" }, { key: "hopeful", label: "Hopeful" }]} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Voice and Dialogue</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SingleSelect worldId={worldId} label="Speech Register"
        vocabKey="speech_register" value={data.speechRegister ?? ""} onChange={v => onChange({ ...data, speechRegister: v })} options={[{ key: "formal", label: "Formal" }, { key: "educated", label: "Educated Conversational" }, { key: "plainspoken", label: "Plainspoken" }, { key: "regional", label: "Regional" }, { key: "professional", label: "Professional" }, { key: "domestic", label: "Domestic" }, { key: "ceremonial", label: "Ceremonial" }, { key: "mixed", label: "Mixed" }]} />
          <MultiChipSelect worldId={worldId} label="Sentence Rhythm"
        vocabKey="sentence_rhythm" values={data.sentenceRhythm ?? []} onChange={v => onChange({ ...data, sentenceRhythm: v })} options={[{ key: "concise", label: "Concise" }, { key: "measured", label: "Measured" }, { key: "elaborate", label: "Elaborate" }, { key: "hesitant", label: "Hesitant" }, { key: "rapid", label: "Rapid" }, { key: "precise", label: "Precise" }, { key: "circular", label: "Circular" }, { key: "storytelling", label: "Storytelling" }, { key: "fragmented", label: "Fragmented" }]} />
          <SingleSelect worldId={worldId} label="Directness"
        vocabKey="directness" value={data.directness ?? ""} onChange={v => onChange({ ...data, directness: v })} options={[{ key: "evasive", label: "Evasive" }, { key: "indirect", label: "Indirect" }, { key: "diplomatic", label: "Diplomatic" }, { key: "direct", label: "Direct" }, { key: "blunt", label: "Blunt" }]} />
          <SingleSelect worldId={worldId} label="Emotional Openness"
        vocabKey="emotional_openness" value={data.emotionalOpenness ?? ""} onChange={v => onChange({ ...data, emotionalOpenness: v })} options={[{ key: "closed", label: "Closed" }, { key: "guarded", label: "Guarded" }, { key: "selective", label: "Selective" }, { key: "open", label: "Open" }, { key: "effusive", label: "Effusive" }]} />
          <MultiChipSelect worldId={worldId} label="Humor"
        vocabKey="humor" values={data.humor ?? []} onChange={v => onChange({ ...data, humor: v })} options={[{ key: "none", label: "None" }, { key: "dry", label: "Dry" }, { key: "wry", label: "Wry" }, { key: "gentle", label: "Gentle" }, { key: "playful", label: "Playful" }, { key: "sardonic", label: "Sardonic" }, { key: "self_deprecating", label: "Self-Deprecating" }, { key: "mischievous", label: "Mischievous" }, { key: "gallows", label: "Gallows Humor" }]} />
          <MultiChipSelect worldId={worldId} label="Conflict Style"
        vocabKey="conflict_style" values={data.conflictStyle ?? []} onChange={v => onChange({ ...data, conflictStyle: v })} options={[{ key: "avoids", label: "Avoids" }, { key: "deflects", label: "Deflects" }, { key: "appeases", label: "Appeases" }, { key: "negotiates", label: "Negotiates" }, { key: "challenges", label: "Challenges" }, { key: "commands", label: "Commands" }, { key: "withdraws", label: "Withdraws" }, { key: "uses_evidence", label: "Uses Evidence" }, { key: "uses_humor", label: "Uses Humor" }]} />
          <MultiChipSelect worldId={worldId} label="Affection Style"
        vocabKey="affection_style" values={data.affectionStyle ?? []} onChange={v => onChange({ ...data, affectionStyle: v })} options={[{ key: "practical", label: "Practical Help" }, { key: "time", label: "Time" }, { key: "gifts", label: "Gifts" }, { key: "protection", label: "Protection" }, { key: "touch", label: "Touch" }, { key: "praise", label: "Praise" }, { key: "teasing", label: "Teasing" }, { key: "shared_work", label: "Shared Work" }, { key: "quiet", label: "Quiet Presence" }]} />
          <MultiChipSelect worldId={worldId} label="Vocabulary Tendencies"
        vocabKey="vocabulary_tendencies" values={data.vocabularyTendencies ?? []} onChange={v => onChange({ ...data, vocabularyTendencies: v })} options={[{ key: "technical", label: "Technical" }, { key: "botanical", label: "Botanical" }, { key: "architectural", label: "Architectural" }, { key: "legal", label: "Legal" }, { key: "religious", label: "Religious" }, { key: "literary", label: "Literary" }, { key: "domestic", label: "Domestic" }, { key: "commercial", label: "Commercial" }, { key: "agricultural", label: "Agricultural" }, { key: "regional", label: "Regional" }]} />
        </div>
      </div>
    </div>
  );
}

export function GenerationLocksForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId?: string }) {
  const BORDER = "var(--admin-border, var(--admin-border))";
  const INK = "var(--admin-ink, var(--admin-ink))";
  return (
    <div>
      <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Visual Identity Locks</h2>
      <StructuredRepeater
        items={data.identityLocks ?? []}
        onChange={v => onChange({ ...data, identityLocks: v })}
        defaultNewItem={() => ({ traitCategory: "facial_structure", canonicalValue: "", lockStrength: "preferred" })}
        addButtonLabel="Add Identity Lock"
        renderItem={(item, idx, update, remove) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SingleSelect
              worldId={worldId} label="Category"
        vocabKey="category"
              value={item.traitCategory}
              onChange={v => update({ traitCategory: v })}
              options={[
                { key: "facial_structure", label: "Facial Structure" },
                { key: "eye_color", label: "Eye Color" },
                { key: "hair_family", label: "Hair Family" },
                { key: "posture", label: "Posture" },
                { key: "accessory", label: "Accessory" }
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Canonical Value</label>
              <input
                value={item.canonicalValue || ""}
                onChange={e => update({ canonicalValue: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
              />
            </div>
            <SingleSelect
              worldId={worldId} label="Strength"
        vocabKey="strength"
              value={item.lockStrength}
              onChange={v => update({ lockStrength: v })}
              options={[
                { key: "suggestion", label: "Suggestion" },
                { key: "preferred", label: "Preferred" },
                { key: "required", label: "Required" },
                { key: "immutable", label: "Immutable" }
              ]}
            />
          </div>
        )}
      />
    </div>
  );
}

export function CharacterKnowledgeForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  const BORDER = "var(--admin-border, var(--admin-border))";
  const INK = "var(--admin-ink, var(--admin-ink))";
  return (
    <div>
      <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Knowledge and Access</h2>
      <StructuredRepeater
        items={data.knowledge ?? []}
        onChange={v => onChange({ ...data, knowledge: v })}
        defaultNewItem={() => ({ topic: "", knowledgeState: "unaware", confidence: "", source: "", disclosure: "", access: "", believes: "", consequence: "" })}
        addButtonLabel="Add Knowledge Record"
        renderItem={(item, idx, update, remove) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Topic or Linked Canon</label>
              <input
                value={item.topic || ""}
                onChange={e => update({ topic: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
              />
            </div>
            <SingleSelect
              worldId={worldId} label="Knowledge State"
        vocabKey="knowledge_state"
              value={item.knowledgeState}
              onChange={v => update({ knowledgeState: v })}
              options={[
                { key: "unaware", label: "Unaware" },
                { key: "suspicious", label: "Suspicious" },
                { key: "partially", label: "Partially Aware" },
                { key: "knows", label: "Knows" },
                { key: "expert", label: "Expert" },
                { key: "mistaken", label: "Mistaken" },
                { key: "withheld", label: "Withheld" }
              ]}
            />
            <SingleSelect
              worldId={worldId} label="Confidence"
        vocabKey="confidence"
              value={item.confidence}
              onChange={v => update({ confidence: v })}
              options={[
                { key: "low", label: "Low" },
                { key: "medium", label: "Medium" },
                { key: "high", label: "High" },
                { key: "certain", label: "Certain" }
              ]}
            />
            <SingleSelect
              worldId={worldId} label="Source"
        vocabKey="source"
              value={item.source}
              onChange={v => update({ source: v })}
              options={[
                { key: "witnessed", label: "Witnessed" },
                { key: "told", label: "Told Directly" },
                { key: "document", label: "Letter or Document" },
                { key: "gossip", label: "Gossip" },
                { key: "professional", label: "Professional Knowledge" },
                { key: "tradition", label: "Family Tradition" },
                { key: "inference", label: "Inference" },
                { key: "unknown", label: "Unknown" }
              ]}
            />
            <SingleSelect
              worldId={worldId} label="Disclosure"
        vocabKey="disclosure"
              value={item.disclosure}
              onChange={v => update({ disclosure: v })}
              options={[
                { key: "public", label: "Public" },
                { key: "select", label: "Select Circle" },
                { key: "private", label: "Private" },
                { key: "secret", label: "Secret" },
                { key: "author_only", label: "Author Only" }
              ]}
            />
            <SingleSelect
              worldId={worldId} label="Access"
        vocabKey="access"
              value={item.access}
              onChange={v => update({ access: v })}
              options={[
                { key: "none", label: "None" },
                { key: "indirect", label: "Indirect" },
                { key: "occasional", label: "Occasional" },
                { key: "regular", label: "Regular" },
                { key: "privileged", label: "Privileged" },
                { key: "custodial", label: "Custodial" }
              ]}
            />
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>What the character believes</label>
              <textarea
                value={item.believes || ""}
                onChange={e => update({ believes: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Dramatic consequence</label>
              <textarea
                value={item.consequence || ""}
                onChange={e => update({ consequence: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}

export function LifeStageVariantForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  const BORDER = "var(--admin-border, var(--admin-border))";
  const INK = "var(--admin-ink, var(--admin-ink))";
  return (
    <div>
      <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Life-Stage Variants</h2>
      <StructuredRepeater
        items={data.variants ?? []}
        onChange={v => onChange({ ...data, variants: v })}
        defaultNewItem={() => ({ variantName: "", lifeStage: "adult", apparentAgeRange: "", storyPeriodLabel: "", hairChanges: "", facialHairChanges: "", healthMobilityChanges: "", wardrobeProfile: "", occupationStatus: "", emotionalBaseline: "", referenceAssetIds: [] as string[], allowedDeviations: "", visualNotes: "" })}
        addButtonLabel="Add Variant"
        renderItem={(item: any, idx, update, remove) => (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Variant Name</label>
              <input
                value={item.variantName || ""}
                onChange={e => update({ variantName: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
              />
            </div>
            <SingleSelect
              worldId={worldId} label="Life Stage"
        vocabKey="life_stage"
              value={item.lifeStage}
              onChange={v => update({ lifeStage: v })}
              options={[
                { key: "infant", label: "Infant" },
                { key: "child", label: "Child" },
                { key: "adolescent", label: "Adolescent" },
                { key: "young_adult", label: "Young Adult" },
                { key: "early_adult", label: "Early Adult" },
                { key: "established", label: "Established Adult" },
                { key: "middle_age", label: "Middle Age" },
                { key: "later_life", label: "Later Life" },
                { key: "elder", label: "Elder" }
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Apparent Age Range</label>
              <input
                value={item.apparentAgeRange || ""}
                onChange={e => update({ apparentAgeRange: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Story Period Label</label>
              <input
                value={item.storyPeriodLabel || ""}
                onChange={e => update({ storyPeriodLabel: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Hair & Facial Hair Changes</label>
              <textarea
                value={item.hairChanges || ""}
                onChange={e => update({ hairChanges: e.target.value })}
                placeholder="Hair..."
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Facial Hair Changes</label>
              <textarea
                value={item.facialHairChanges || ""}
                onChange={e => update({ facialHairChanges: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Health / Mobility Changes</label>
              <textarea
                value={item.healthMobilityChanges || ""}
                onChange={e => update({ healthMobilityChanges: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Wardrobe Profile</label>
              <textarea
                value={item.wardrobeProfile || ""}
                onChange={e => update({ wardrobeProfile: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Occupation Status</label>
              <textarea
                value={item.occupationStatus || ""}
                onChange={e => update({ occupationStatus: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Emotional Baseline</label>
              <textarea
                value={item.emotionalBaseline || ""}
                onChange={e => update({ emotionalBaseline: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Visual Notes</label>
              <textarea
                value={item.visualNotes || ""}
                onChange={e => update({ visualNotes: e.target.value })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Reference Asset IDs</label>
              <input
                value={item.referenceAssetIds ? (Array.isArray(item.referenceAssetIds) ? item.referenceAssetIds.join(',') : item.referenceAssetIds) : ""}
                onChange={e => update({ referenceAssetIds: e.target.value.split(',').map((s: string) => s.trim()) })}
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
              <label className="text-[11px] font-semibold" style={{ color: INK }}>Allowed Deviations</label>
              <textarea
                value={item.allowedDeviations || ""}
                onChange={e => update({ allowedDeviations: e.target.value })}
                placeholder="Allowed deviations from the identity lock..."
                className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[var(--admin-clay)]/20"
                style={{ borderColor: BORDER }}
                rows={2}
              />
            </div>
          </div>
        )}
      />
    </div>
  );
}

export function MaterialForm({ data, onChange, worldId }: { data: any, onChange: (d: any) => void, worldId: string }) {
  const BORDER = "var(--admin-border, var(--admin-border))";
  const INK = "var(--admin-ink, var(--admin-ink))";
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SingleSelect
        worldId={worldId} label="Material Class"
        vocabKey="object_class"
        value={data.objectClass ?? ""}
        onChange={v => onChange({ ...data, objectClass: v })}
        options={[
          { key: "organic", label: "Organic" },
          { key: "synthetic", label: "Synthetic" },
          { key: "mineral", label: "Mineral" },
          { key: "composite", label: "Composite" },
          { key: "magical", label: "Magical/Alchemical" }
        ]}
      />
      <SingleSelect
        worldId={worldId} label="Rarity"
        vocabKey="rarity"
        value={data.rarity ?? ""}
        onChange={v => onChange({ ...data, rarity: v })}
        options={[
          { key: "common", label: "Common" },
          { key: "uncommon", label: "Uncommon" },
          { key: "rare", label: "Rare" },
          { key: "legendary", label: "Legendary" },
          { key: "unique", label: "Unique" }
        ]}
      />
      <MultiChipSelect
        worldId={worldId} label="Primary Properties"
        vocabKey="material"
        values={data.material ?? []}
        onChange={v => onChange({ ...data, material: v })}
        options={[
          { key: "brittle", label: "Brittle" },
          { key: "ductile", label: "Ductile" },
          { key: "flammable", label: "Flammable" },
          { key: "luminous", label: "Luminous" },
          { key: "toxic", label: "Toxic" },
          { key: "durable", label: "Durable" }
        ]}
        allowCustom
      />
    </div>
  );
}

