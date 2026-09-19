# WorldSmith Canon, World-Building, and Story Field Architecture

## Implementation Brief for Replit

### Purpose

Expand WorldSmith's canon and story-building system so it captures enough structured information to produce consistent character images, historically grounded environments, and coherent storylines.

The system should favor controlled picklists over freeform fields wherever a value needs to be filtered, compared, validated, reused in prompts, or kept consistent across records. Prose should remain available where interpretation, nuance, explanation, or narrative voice matters.

This specification covers:

- global canon metadata;
- record-type-specific fields;
- character sheets and visual identity;
- relationships, locations, objects, events, lore, and atmosphere;
- storylines, arcs, scenes, and reveal architecture;
- controlled-vocabulary management;
- generation-ready outputs for images and stories;
- GitHub context-snapshot and image-manifest requirements;
- migration and acceptance criteria.

---

## 1. Core Product Principles

### 1.1 Structured when reusable; prose when interpretive

Use structured fields when the value must support filtering, validation, comparison, consistency checking, or automatic prompt construction.

Use prose fields when the author must explain significance, contradiction, motivation, atmosphere, historical nuance, or dramatic meaning.

### 1.2 Appropriate control by value type

- Use a **single-select** for mutually exclusive states.
- Use a **multi-select chip field** for compatible traits.
- Use a **searchable entity picker** for links to existing canon records.
- Use a **structured repeater** for multiple relationships, variants, possessions, sources, scene anchors, or facts.
- Use **picklist + Custom** only where the supplied taxonomy cannot reasonably cover every world.
- Use **rich text** for narrative interpretation and editorial guidance.
- Use **short text** only for concise unique values such as an alias, occupation, or custom label.

### 1.3 Vocabulary governance

Every controlled option must have:

- a stable machine key;
- a user-facing label;
- an optional description or tooltip;
- active/inactive status;
- display order;
- vocabulary version;
- optional world/project scope.

Never store only the display label. Store the stable key and resolve its current label in the interface.

### 1.4 Unknown is not the same as empty

Where relevant, explicitly support:

- `unknown` — the answer is not known;
- `unresolved` — the author has not decided;
- `not_applicable` — the field does not apply;
- `withheld` — the fact exists but is intentionally hidden from the audience;
- `custom` — a deliberate value outside the shared taxonomy.

### 1.5 Progressive disclosure

The editor must remain approachable. Show essential fields first and place specialist fields in collapsible sections. Only display conditional fields when the selected record type or earlier answer makes them relevant.

---

## 2. Information Architecture

Organize each canon record into three interoperable layers.

### Story layer

Human-readable prose that explains what the record means in the world and why it matters dramatically.

### Canon layer

Structured facts, relationships, states, constraints, permissions, chronology, and evidence.

### Generation layer

Identity locks, visual traits, life-stage variants, environmental traits, scene anchors, reference assets, negative constraints, and generation instructions used to create consistent images and stories.

The interface may present these as friendly sections, but the data model must keep the distinctions clear.

---

## 3. Global Fields for Every Canon Record

### Identity

| Field | Control | Required | Suggested values or behavior |
| --- | --- | --- | --- |
| Record name | Short text | Yes | Unique human-readable name within the world where practical |
| Canon type | Single-select | Yes | Character, Location, Object, Event, Lore, Atmosphere, Material, Relationship, Motif |
| Alternate names | Repeatable short text | No | Aliases, married names, local names, former names |
| One-line definition | Short text | Yes | Plain-language definition suitable for search results and cards |
| Tags | Multi-select | No | World-scoped tags with controlled creation |

### Canon governance

| Field | Control | Required | Picklist values |
| --- | --- | --- | --- |
| Workflow status | Single-select | Yes | Draft, In Review, Accepted, Superseded, Archived |
| Canon stability | Single-select | Yes | Fluid, Developing, Stable, Locked |
| Narrative visibility | Single-select | Yes | Public Knowledge, Limited Knowledge, Private, Secret, Author Only |
| Temporal scope | Single-select | Yes | Timeless, Entire Story, Era-Specific, Life-Stage-Specific, Event-Bound, Scene-Bound |
| Importance | Single-select | Yes | Background, Supporting, Significant, Central, Foundational |
| Spoiler level | Single-select | No | None, Mild, Major, Endgame |
| Evidence confidence | Single-select | No | Speculative, Plausible, Supported, Confirmed, Disputed |
| Source type | Multi-select | No | Direct Observation, Document, Oral Account, Family Tradition, Institutional Record, Physical Evidence, Inference, Authorial Canon |

### Editorial prose

Retain these rich-text sections:

- **Narrative Details** — what the subject is, its story purpose, and its significance.
- **Historical Context** — period-appropriate social, material, legal, economic, technological, and regional context. Prefer era and life-stage framing over unnecessary exact dates.
- **Visual Notes** — art-direction prose that supplements the structured visual profile.
- **Canon Guardrails** — what must not be contradicted, flattened, modernized, exaggerated, or falsely implied.
- **Relationship Details** — interpretation of important relational dynamics beyond structured relationship rows.
- **Character Direction** — required for characters; optional analogous direction for other record types.
- **Confirmed Canon** — concise authoritative facts approved for downstream use.
- **Editorial Notes** — open questions, research needs, continuity risks, production cautions, and future decisions.

---

## 4. Character Profile

### 4.1 Character identity and social position

| Field | Control | Suggested values or behavior |
| --- | --- | --- |
| Pronouns | Single-select + Custom | She/Her, He/Him, They/Them, Custom, Unresolved |
| Life stage | Single-select | Infant, Child, Adolescent, Young Adult, Early Adult, Established Adult, Middle Age, Later Life, Elder |
| Occupation or role | Searchable vocabulary + Custom | World-scoped occupations; allow several with one marked primary |
| Social position | Single-select | Destitute, Laboring Poor, Working Class, Skilled Trade, Lower Middle Class, Middle Class, Upper Middle Class, Gentry, Aristocracy, Royalty, Outside Conventional Class |
| Family position | Single-select + Custom | Only Child, Eldest, Middle, Youngest, Heir, Spare, Ward, Adopted, Stepchild, Custom |
| Marital state | Single-select | Unmarried, Courting, Engaged, Married, Separated, Widowed, Remarried, Not Applicable, Withheld |
| Education | Multi-select | Informal, Apprenticeship, Governess or Tutor, Grammar School, Public School, University, Professional Training, Self-Educated, Unknown |
| Financial security | Single-select | Precarious, Modest, Comfortable, Prosperous, Wealthy, Dependent, Declining, Unknown |
| Public reputation | Multi-select | Respected, Trusted, Admired, Conventional, Eccentric, Formidable, Questioned, Scandalous, Unknown |

### 4.2 Physical identity

| Field | Control | Suggested values |
| --- | --- | --- |
| Apparent life stage | Single-select | Same options as life stage |
| Height | Single-select | Very Short, Short, Average, Tall, Very Tall |
| Build | Multi-select, max 2 | Slight, Lean, Wiry, Average, Broad, Sturdy, Athletic, Soft, Heavyset, Frail |
| Face shape | Single-select | Oval, Round, Square, Rectangular, Heart, Diamond, Long, Angular |
| Complexion depth | Single-select | Very Fair, Fair, Light, Medium, Tan, Deep, Very Deep |
| Skin undertone | Single-select | Cool, Neutral, Warm, Olive, Unknown |
| Eye color | Single-select + Custom | Gray, Blue, Green, Hazel, Amber, Brown, Dark Brown, Custom |
| Eye character | Multi-select, max 3 | Deep-Set, Wide-Set, Close-Set, Hooded, Heavy-Lidded, Alert, Soft, Intense, Watchful |
| Hair color | Single-select + Custom | Black, Dark Brown, Brown, Light Brown, Auburn, Red, Dark Blond, Blond, Gray, White, Custom |
| Hair texture | Single-select | Straight, Wavy, Curly, Coiled, Fine, Coarse |
| Hair length | Single-select | Cropped, Short, Ear-Length, Chin-Length, Shoulder-Length, Long |
| Hair arrangement | Multi-select | Neatly Parted, Loosely Parted, Swept Back, Pinned Up, Braided, Coiled, Covered, Disordered, Receding, Thinning |
| Facial hair | Single-select | None, Clean-Shaven, Stubble, Mustache, Sideburns, Short Beard, Full Beard, Custom |
| Distinguishing features | Multi-select + Custom | Freckles, Scar, Birthmark, Lines at Eyes, Strong Brow, Prominent Nose, Dimple, Weathering, Callused Hands, Ink-Stained Fingers, Spectacles |
| Posture | Multi-select, max 3 | Upright, Formal, Relaxed, Guarded, Stooped, Restless, Grounded, Tense, Graceful, Work-Worn |
| Movement | Multi-select, max 3 | Deliberate, Brisk, Economical, Hesitant, Restless, Graceful, Heavy, Quiet, Precise, Expansive |

### 4.3 Wardrobe and presentation

| Field | Control | Suggested values |
| --- | --- | --- |
| Wardrobe formality | Single-select | Workwear, Informal Domestic, Everyday Respectable, Professional, Visiting, Evening, Ceremonial, Mourning |
| Garment condition | Single-select | Patched, Worn, Serviceable, Well-Kept, Fine, Immaculate, Faded, Newly Made |
| Palette | Multi-select | Black, Charcoal, Slate, Navy, Brown, Tan, Cream, White, Olive, Moss, Forest, Burgundy, Rust, Plum, Muted Blue, Dusty Rose, Custom |
| Textile preference | Multi-select | Wool, Tweed, Linen, Cotton, Silk, Velvet, Leather, Lace, Muslin, Calico, Oilcloth |
| Pattern | Multi-select | Solid, Subtle Stripe, Check, Plaid, Floral, Brocade, Geometric, None |
| Accessories | Multi-select + linked objects | Spectacles, Watch Chain, Brooch, Gloves, Hat, Shawl, Cravat, Tie, Walking Stick, Satchel, Apron, Tools, Jewelry |
| Grooming | Single-select | Immaculate, Neat, Practical, Weathered, Disheveled, Neglected |

### 4.4 Identity locks for image consistency

Create a dedicated **Visual Identity Lock** section. Each row contains:

- trait category;
- canonical value;
- lock strength: Suggestion, Preferred, Required, Immutable;
- applies to life stages;
- positive prompt phrase;
- negative prompt phrase;
- editorial explanation.

Typical immutable locks include facial structure, eye color, hair family, characteristic posture, defining accessories, and features needed to distinguish relatives.

### 4.5 Life-stage variants

Allow multiple variants for the same character without creating separate character records.

Each variant must include:

- variant name;
- life stage;
- story-period label;
- apparent age range;
- active/default status;
- hair changes;
- facial-hair changes;
- health or mobility changes;
- wardrobe profile;
- occupation/status at this stage;
- emotional baseline;
- reference images;
- allowed deviations from the identity lock;
- variant-specific visual notes.

Do not require exact birth dates or exact calendar dates unless the story genuinely depends on them.

### 4.6 Story function and arc

| Field | Control | Picklist values |
| --- | --- | --- |
| Narrative role | Multi-select | Protagonist, Co-Protagonist, Viewpoint Character, Mentor, Ally, Confidant, Romantic Partner, Family Counterpoint, Rival, Antagonist, Foil, Patron, Gatekeeper, Witness, Catalyst, Custodian, Community Voice |
| Arc type | Single-select | Positive Change, Flat or Steadfast, Disillusionment, Corruption, Redemption, Healing, Coming of Age, Fall and Recovery, Tragic Fall, Mystery or Revelation, Legacy |
| Starting condition | Multi-select | Secure, Isolated, Dutiful, Restless, Grieving, Ambitious, Disillusioned, Protected, Burdened, Curious, Distrustful, Hopeful |
| Core desire | Single-select + Custom | Belonging, Security, Recognition, Freedom, Love, Truth, Restoration, Justice, Control, Legacy, Reconciliation, Purpose, Protection |
| Core need | Single-select + Custom | Trust, Humility, Courage, Self-Knowledge, Connection, Agency, Forgiveness, Acceptance, Responsibility, Hope, Boundaries |
| Core fear | Single-select + Custom | Abandonment, Failure, Exposure, Powerlessness, Disorder, Intimacy, Loss, Disgrace, Dependence, Repetition of the Past |
| Misconception | Single-select + Custom | Duty Requires Self-Denial, Control Prevents Loss, Worth Must Be Earned, Vulnerability Is Weakness, Tradition Must Not Change, Love Requires Rescue, Knowledge Equals Wisdom, Custom |
| Resisted change | Multi-select | Asking for Help, Sharing Authority, Accepting Love, Relinquishing Control, Facing the Past, Speaking Truth, Breaking Convention, Assuming Responsibility, Forgiving |
| Ending condition | Same as starting condition | May be unresolved while drafting |

Add prose fields for **Arc Summary**, **Pressure Points**, **Contradiction**, **Narrative Promise**, and **Failure Mode**.

### 4.7 Voice and dialogue

| Field | Control | Picklist values |
| --- | --- | --- |
| Speech register | Single-select | Formal, Educated Conversational, Plainspoken, Regional, Professional, Domestic, Ceremonial, Mixed |
| Sentence rhythm | Multi-select | Concise, Measured, Elaborate, Hesitant, Rapid, Precise, Circular, Storytelling, Fragmented |
| Directness | Single-select | Evasive, Indirect, Diplomatic, Direct, Blunt |
| Emotional openness | Single-select | Closed, Guarded, Selective, Open, Effusive |
| Humor | Multi-select | None, Dry, Wry, Gentle, Playful, Sardonic, Self-Deprecating, Mischievous, Gallows Humor |
| Conflict style | Multi-select | Avoids, Deflects, Appeases, Negotiates, Challenges, Commands, Withdraws, Uses Evidence, Uses Humor |
| Affection style | Multi-select | Practical Help, Time, Gifts, Protection, Touch, Praise, Teasing, Shared Work, Quiet Presence |
| Vocabulary tendencies | Multi-select | Technical, Botanical, Architectural, Legal, Religious, Literary, Domestic, Commercial, Agricultural, Regional |

Retain freeform fields for **Dialogue Notes**, **Repeated Phrases**, **Words Avoided**, and short **Sample Lines**.

### 4.8 Knowledge and access

Use structured fact rows rather than one large text field. Each row contains:

- topic or linked canon record;
- knowledge state: Unaware, Suspicious, Partially Aware, Knows, Expert, Mistaken, Withheld;
- confidence: Low, Medium, High, Certain;
- source: Witnessed, Told Directly, Letter or Document, Gossip, Professional Knowledge, Family Tradition, Inference, Unknown;
- disclosure: Public, Select Circle, Private, Secret, Author Only;
- access: None, Indirect, Occasional, Regular, Privileged, Custodial;
- applicable life stage or story era;
- what the character believes;
- what is objectively true;
- dramatic consequence.

### 4.9 Character direction

Keep **Character Direction** as rich text, supported by structured selectors for:

- performance energy: Restrained, Naturalistic, Warm, Cerebral, Volatile, Reserved, Commanding, Vulnerable;
- audience alignment: Immediate Sympathy, Gradual Trust, Ambivalent, Suspicious, Unreliable, Withheld;
- moral framing: Admirable, Flawed but Sympathetic, Ambiguous, Compromised, Antagonistic, Evolving;
- portrayal cautions: Romanticization, Villainization, Modernized Attitudes, Excessive Melodrama, Comic Caricature, Passive Supporting Role, Anachronistic Independence, Historical Stereotype.

---

## 5. Relationship Records

Relationships should be first-class records when dramatically important, and lightweight linked rows when incidental.

| Field | Control | Picklist values |
| --- | --- | --- |
| From entity | Entity picker | Required |
| To entity | Entity picker | Required |
| Relationship type | Multi-select | Parent, Child, Sibling, Spouse, Romantic, Friend, Confidant, Colleague, Employer, Employee, Mentor, Student, Patron, Client, Rival, Adversary, Neighbor, Caregiver, Ward, Business Partner, Custodian, Community Tie |
| Directionality | Single-select | Mutual, Primarily From, Primarily To, Unequal, Misunderstood |
| Phase | Single-select | Unknown, Newly Formed, Developing, Established, Strained, Estranged, Repaired, Ended, Bereaved |
| Emotional valence | Single-select | Loving, Warm, Respectful, Loyal, Neutral, Ambivalent, Competitive, Resentful, Fearful, Hostile, Grieving |
| Trust | Single-select | None, Fragile, Conditional, Moderate, Strong, Absolute, Misplaced |
| Power balance | Single-select | Balanced, Slightly From-Dominant, Slightly To-Dominant, Strongly From-Dominant, Strongly To-Dominant, Context-Dependent |
| Public visibility | Single-select | Public, Known to Circle, Private, Secret, Misrepresented |
| Dependency | Multi-select | Emotional, Financial, Social, Professional, Legal, Physical, Informational, None |
| Primary tension | Multi-select | Duty vs Desire, Trust, Class, Money, Inheritance, Reputation, Authority, Secrecy, Grief, Jealousy, Ideology, Protection, Distance, Miscommunication |
| Story function | Multi-select | Support, Pressure, Foil, Revelation, Conflict, Reconciliation, Catalyst, Stakes, Comic Relief, Witness |

Include freeform **Relationship Details**, **Unspoken Truth**, **Change Over Time**, **Boundaries**, and **Key Scenes**.

---

## 6. Location Profile

| Field | Control | Picklist values |
| --- | --- | --- |
| Location scale | Single-select | Room, Building, Property, Hamlet, Village, Town, City District, City, Estate, Landscape, Region, Country |
| Primary function | Multi-select | Domestic, Agricultural, Commercial, Industrial, Civic, Religious, Educational, Medical, Recreational, Ceremonial, Transportation, Wild, Ruin |
| Ownership | Single-select + linked entity | Private, Family, Estate, Corporate, Municipal, Ecclesiastical, Crown, Common Land, Contested, Unknown |
| Condition | Single-select | Pristine, Well-Kept, Serviceable, Worn, Neglected, Decaying, Ruined, Under Construction, Under Restoration, Altered |
| Access | Single-select | Open, Public with Limits, Invitation Only, Staff Only, Restricted, Secret, Abandoned, Seasonal |
| Population density | Single-select | Uninhabited, Isolated, Sparse, Moderate, Busy, Crowded |
| Setting character | Multi-select | Formal, Intimate, Domestic, Industrious, Picturesque, Austere, Wild, Sheltered, Exposed, Sacred, Uncanny, Oppressive, Restorative |
| Dominant materials | Multi-select | Local Stone, Brick, Timber, Slate, Thatch, Iron, Glass, Plaster, Tile, Earth, Water, Living Plant Material |
| Natural light | Single-select | Dim, Diffuse, Dappled, Soft, Clear, Harsh, Dramatic, Variable |
| Artificial light | Multi-select | None, Candle, Oil Lamp, Gaslight, Firelight, Early Electric, Industrial, Custom |
| Weather exposure | Single-select | Sheltered, Moderate, Exposed, Severe |
| Seasonal behavior | Multi-select | Floods, Freezes, Blooms, Dries, Becomes Muddy, Becomes Inaccessible, Crowds, Empties, Changes Function, Little Change |

Add rich-text sections for **Spatial Layout**, **Historical Context**, **Sensory Profile**, **Human Use**, **Emotional Effect**, **Changes Over Time**, **Scene Opportunities**, and **Visual Guardrails**.

The sensory profile should also offer controlled tags:

- sound: Quiet, Wind, Water, Birds, Animals, Machinery, Voices, Bells, Traffic, Fire;
- scent: Earth, Rain, Vegetation, Flowers, Woodsmoke, Coal, Oil, Animals, Food, Damp, Paper, Dust;
- tactile: Smooth, Rough, Damp, Dry, Cold, Warm, Drafty, Close, Soft, Gritty;
- atmosphere: Safe, Welcoming, Melancholic, Tense, Watchful, Bustling, Reverent, Secretive, Decaying, Hopeful.

---

## 7. Object and Material Profile

| Field | Control | Picklist values |
| --- | --- | --- |
| Object class | Single-select | Personal, Domestic, Professional, Agricultural, Architectural, Decorative, Documentary, Scientific, Religious, Ceremonial, Mechanical, Commercial, Weapon, Clothing, Botanical |
| Scale | Single-select | Handheld, Portable, Furniture, Room-Scale, Architectural, Landscape Feature |
| Material | Multi-select | Wood, Paper, Leather, Stone, Brick, Iron, Steel, Brass, Copper, Silver, Gold, Glass, Ceramic, Textile, Bone, Plant Material, Composite, Custom |
| Condition | Single-select | New, Pristine, Used, Worn, Repaired, Damaged, Incomplete, Decayed, Restored, Replica |
| Craft level | Single-select | Crude, Utilitarian, Skilled, Fine, Exceptional, Industrially Made |
| Authenticity | Single-select | Original, Modified Original, Restoration, Replacement, Replica, Forgery, Uncertain |
| Rarity | Single-select | Common, Uncommon, Rare, Unique, Unknown |
| Custody | Single-select + entity link | Owned, Borrowed, Entrusted, Inherited, Found, Stolen, Institutional, Contested, Lost |
| Story function | Multi-select | Evidence, Heirloom, Tool, Symbol, MacGuffin, Gift, Burden, Memorial, Key, Record, Disguise, Source of Conflict |

Add prose for **Provenance**, **Use**, **Meaning**, **Wear Pattern**, **Custody History**, **Secrets**, and **Visual Notes**.

---

## 8. Event Profile

| Field | Control | Picklist values |
| --- | --- | --- |
| Event type | Multi-select | Birth, Death, Marriage, Separation, Arrival, Departure, Discovery, Inheritance, Purchase, Sale, Construction, Restoration, Accident, Illness, Crime, Scandal, Trial, Celebration, Disaster, Protest, Business Change, Social Gathering, Natural Event |
| Temporal precision | Single-select | Exact Date, Approximate Date, Season, Year, Era, Relative Sequence, Unknown |
| Event status | Single-select | Planned, Occurred, Rumored, Disputed, Prevented, Ongoing, Recurring |
| Certainty | Single-select | Speculative, Possible, Probable, Confirmed, Disputed |
| Narrative function | Multi-select | Inciting Incident, Catalyst, Complication, Reversal, Revelation, Crisis, Climax, Resolution, Backstory, Foreshadowing |
| Consequence scale | Single-select | Personal, Relationship, Household, Community, Regional, National, Generational |
| Visibility | Single-select | Public, Locally Known, Limited Witnesses, Private, Secret, Misreported |

Provide structured repeaters for **Participants**, **Witnesses**, **Causes**, **Immediate Consequences**, **Long-Term Consequences**, **Evidence**, and **Affected Canon Records**. Retain freeform **Event Narrative** and **Continuity Notes**.

---

## 9. Lore, Principle, Tradition, and Belief Profile

| Field | Control | Picklist values |
| --- | --- | --- |
| Lore type | Multi-select | Principle, Tradition, Belief, Folklore, Custom, Rule, Oath, Legend, Family Story, Professional Practice, Community Memory, Superstition, Institutional Doctrine |
| Origin | Single-select | Known Individual, Family, Community, Institution, Region, Ancient or Untraceable, Disputed, Authorial Construct |
| Acceptance | Single-select | Universal, Majority, Common, Mixed, Minority, Private, Forgotten, Reviving, Disputed |
| Truth status | Single-select | Objectively True, Partly True, Metaphorically True, False but Believed, Deliberate Fiction, Unknown, Irrelevant |
| Enforcement | Single-select | None, Social, Familial, Professional, Religious, Legal, Supernatural, Self-Imposed |
| Flexibility | Single-select | Fixed, Traditionally Interpreted, Adaptable, Contested, Actively Changing |
| Transmission | Multi-select | Oral, Written, Ritual, Apprenticeship, Family Practice, Institutional Teaching, Material Evidence, Example |
| Story use | Multi-select | Theme, Moral Pressure, Conflict, Mystery, Identity, Foreshadowing, World Texture, Plot Rule, Character Test |

Add prose for **Meaning**, **Historical Development**, **Different Interpretations**, **Who Upholds It**, **Who Challenges It**, **Practical Consequences**, **Misuse or Distortion**, and **Canon Guardrails**.

---

## 10. Atmosphere and Motif Profile

### Atmosphere

| Field | Control | Picklist values |
| --- | --- | --- |
| Emotional register | Multi-select | Warm, Hopeful, Intimate, Reflective, Melancholic, Tense, Ominous, Uncanny, Joyful, Austere, Restorative, Romantic, Grieving, Industrious |
| Intensity | Single-select | Subtle, Light, Moderate, Strong, Dominant |
| Sensory emphasis | Multi-select | Light, Color, Sound, Scent, Texture, Temperature, Weather, Space |
| Narrative visibility | Single-select | Background, Noticeable, Foregrounded, Symbolic |
| Duration | Single-select | Momentary, Scene, Sequence, Recurring, Location-Bound, Story-Wide |

### Motif

| Field | Control | Picklist values |
| --- | --- | --- |
| Motif class | Multi-select | Natural, Architectural, Object, Color, Sound, Gesture, Weather, Animal, Plant, Textile, Light, Repeated Phrase |
| Function | Multi-select | Identity, Memory, Warning, Hope, Grief, Transformation, Connection, Division, Stewardship, Time, Secrecy |
| Recurrence | Single-select | Rare, Occasional, Regular, Structural |
| Evolution | Single-select | Static, Accumulates Meaning, Reverses Meaning, Degrades, Restores, Changes Owner |

Use prose for **Interpretation**, **Appearances**, **Variation**, and **Avoided Overstatement**.

---

## 11. Storyline Architecture

The current story model should be expanded beyond title, summary, acts, and encounters.

### Storyline-level fields

| Field | Control | Picklist values |
| --- | --- | --- |
| Status | Single-select | Idea, Outlining, Drafting, Revising, Complete, On Hold, Abandoned |
| Form | Single-select | Novel, Novella, Short Story, Serial, Episode, Interactive Story, Campaign, Side Story |
| Scope | Single-select | Scene, Sequence, Chapter, Subplot, Main Plot, Volume, Series |
| Genre | Multi-select | Historical, Romance, Mystery, Family Drama, Gothic, Adventure, Social Drama, Literary, Domestic, Speculative, Custom |
| Point of view | Multi-select | First Person, Close Third, Limited Third, Omniscient, Epistolary, Multiple Viewpoint, Objective |
| Tense | Single-select | Past, Present, Mixed or Framed |
| Arc shape | Single-select | Quest, Mystery, Restoration, Rise, Fall, Rebirth, Voyage and Return, Tragedy, Comedy, Relationship, Ensemble |
| Primary stakes | Multi-select | Emotional, Relational, Financial, Reputational, Physical, Legal, Social, Moral, Community, Legacy, Existential |
| Reveal stage | Single-select | Unknown to Author, Author Only, Foreshadowed, Partially Revealed, Revealed, Recontextualized |
| Ending type | Single-select | Resolved, Bittersweet, Open, Tragic, Hopeful, Circular, Cliffhanger |

Retain freeform **Premise**, **Narrative Promise**, **Thematic Question**, **Central Conflict**, **Ending Vision**, and **Reader Experience**.

### Story spine

Represent the story spine as ordered structured beats. Each beat contains:

- beat type: Setup, Inciting Incident, First Commitment, Rising Pressure, Midpoint, Reversal, Crisis, Climax, Resolution, Epilogue, Custom;
- title;
- summary;
- point-of-view character;
- location;
- involved characters;
- affected canon records;
- character goal;
- obstacle;
- choice;
- outcome;
- cost;
- knowledge gained or lost;
- relationship change;
- emotional movement;
- setup/payoff links;
- spoiler level;
- status.

### Scene record

Each scene should contain:

- scene purpose: Establish, Advance Plot, Develop Character, Deepen Relationship, Reveal, Conceal, Escalate, Reversal, Payoff, Transition, Atmosphere;
- point-of-view character;
- viewpoint distance: Distant, Standard, Close, Interior;
- location and time-of-day;
- weather and season;
- participants;
- entrance state and exit state;
- immediate goal;
- conflict source;
- turn or decision;
- outcome;
- new information;
- emotional valence and intensity;
- sensory anchors;
- required objects;
- visual composition notes;
- continuity dependencies;
- canon guardrails;
- draft prose or scene description.

### Reveal architecture

Track secrets, mysteries, and delayed information as structured records:

- truth;
- who knows it;
- who believes a false version;
- audience knowledge state;
- first clue;
- reinforcing clues;
- red herrings;
- partial reveal;
- full reveal;
- recontextualization;
- consequences;
- linked scenes and canon records.

---

## 12. Scene Anchors for Image and Story Generation

Add reusable **Scene Anchor** records. A scene anchor is a curated combination of character variant, wardrobe, place, period, mood, action, and visual rules that can be reused in image prompts or story planning.

Each anchor includes:

- name;
- linked character variants;
- linked location;
- season;
- time of day;
- weather;
- lighting;
- wardrobe state;
- key objects;
- activity or pose;
- emotional register;
- relationship state;
- composition: Portrait, Full Body, Two-Shot, Group, Environmental Portrait, Wide Establishing, Detail;
- camera/viewpoint: Eye Level, Low, High, Profile, Three-Quarter, Over-the-Shoulder, Aerial, Macro;
- visual medium: Photorealistic, Painterly Realism, Illustration, Engraving, Watercolor, Concept Art, Custom;
- aspect ratio: Square, Portrait 4:5, Portrait 2:3, Landscape 3:2, Widescreen 16:9, Custom;
- required details;
- prohibited details;
- narrative purpose;
- generation notes.

---

## 13. Image and Reference Asset Management

Images must be attached to records through an explicit asset model rather than anonymous uploads.

Each asset requires:

- stable asset ID;
- linked canon record ID;
- role: Primary Portrait, Alternate Portrait, Full Body, Life-Stage Reference, Wardrobe Reference, Expression Reference, Location Exterior, Location Interior, Object Reference, Mood Reference, Historical Reference, Generated Concept;
- life-stage variant, if relevant;
- title and alt text;
- source: User Upload, Generated, Licensed Reference, Public Domain, External Link;
- creator/source credit;
- rights status;
- generation prompt, if generated;
- generation model/version, if known;
- positive and negative guidance;
- approval status: Draft, Candidate, Approved, Rejected, Superseded;
- canonical strength: Inspiration Only, Preferred, Authoritative;
- width, height, MIME type, file size, checksum;
- created and updated timestamps.

Only approved assets should be used by default in prompt compilation. Rejected assets must never be silently reused.

---

## 14. Prompt Compilation

Build prompts from structured data; do not simply concatenate every field.

### Image prompt compiler order

1. Canon record identity and selected life-stage variant.
2. Immutable and required visual identity locks.
3. Period, region, class, occupation, and historically appropriate wardrobe.
4. Selected scene anchor: location, season, light, action, mood, and composition.
5. Approved signature objects and relationship context.
6. Visual medium and catalog style.
7. Required details.
8. Negative constraints from identity locks, guardrails, and scene anchor.

The compiler must flag contradictions, such as a mourning garment paired with a scene before the relevant bereavement, or a character variant paired with an impossible occupation or relationship phase.

### Story prompt compiler order

1. Storyline promise, thematic question, genre, and period context.
2. Current story beat and scene purpose.
3. Point-of-view character's desire, need, knowledge, voice, and current arc state.
4. Relationship phase, trust, power balance, and unspoken tension.
5. Location function, sensory profile, access, and current condition.
6. Required objects, lore, motifs, and event consequences.
7. Reveal permissions and spoiler limits.
8. Canon guardrails and prohibited implications.

The user should be able to preview the compiled prompt and see which record supplied each clause.

---

## 15. User Experience Requirements

### Picklists

- Searchable when more than approximately ten options exist.
- Keyboard accessible.
- Display descriptions in tooltips or helper text.
- Multi-select values appear as removable chips.
- Frequently used and world-specific values may be promoted, but global defaults remain available.
- `Custom` opens a short text input and optionally offers to submit the value for vocabulary review.
- Inactive values remain readable on old records but cannot be newly selected.

### Conditional sections

- Character fields appear only for Character records.
- Relationship fields appear for Relationship records and character relationship repeaters.
- Life-stage fields appear only when temporal scope is Life-Stage-Specific or the user adds a variant.
- Asset role options should filter by record type.
- Exact date controls appear only when Temporal Precision is Exact Date.
- Hidden/secret fields should expose audience and character knowledge permissions.

### Validation and continuity warnings

Warnings should be informative and non-destructive. Examples:

- a locked visual trait conflicts with a life-stage variant;
- two accepted canon facts contradict one another;
- a relationship references the same entity twice;
- an event uses a participant who lacks access to the location;
- a scene reveals information before the character learns it;
- an image prompt includes a rejected or superseded reference;
- a period-specific item or technology is potentially anachronistic;
- a required field contains `Custom` without an explanation.

Allow authorized users to accept a warning with a written rationale. Do not silently rewrite canon.

---

## 16. Data Model and API Expectations

### Recommended entities

- `canon_records`
- `canon_record_aliases`
- `canon_facts`
- `canon_relationships`
- `character_profiles`
- `character_life_stage_variants`
- `visual_identity_locks`
- `knowledge_entries`
- `location_profiles`
- `object_profiles`
- `event_profiles`
- `lore_profiles`
- `atmosphere_profiles`
- `motif_profiles`
- `storylines`
- `story_beats`
- `story_scenes`
- `reveal_threads`
- `scene_anchors`
- `assets`
- `asset_links`
- `vocabularies`
- `vocabulary_options`
- `record_vocabulary_values`
- `editorial_flags`
- `source_citations`

Use typed profile tables or validated JSON structures for type-specific fields. Do not place all fields in one unvalidated JSON blob. If JSON is used, version each schema and validate it on both the API and client.

### General API behavior

- Preserve existing record IDs and URLs.
- Support partial saves without dropping unknown fields.
- Return machine keys and resolved labels.
- Include vocabulary version in read and export payloads.
- Record author, timestamp, and reason for material canon changes.
- Maintain optimistic concurrency protection.
- Expose validation warnings separately from blocking errors.
- Never treat generated prose or images as accepted canon without an explicit approval action.

---

## 17. GitHub Context Snapshots and Image Export

The `context-snapshots` branch must remain a readable, generation-ready representation of accepted canon.

### Canon Markdown export

Each accepted canon record should export to a stable path based on canon type and record ID. Include:

- record name and ID;
- canon type;
- workflow and governance metadata;
- structured facts rendered as readable tables or lists;
- all editorial prose sections;
- relationships using stable record links;
- character variants and identity locks;
- approved reference images using relative Markdown links;
- timestamps and schema/vocabulary versions.

Do not use names alone as stable identifiers because names can change.

### Image paths

Use deterministic paths such as:

`worlds/{world-slug}/canon/assets/{record-id}/{asset-id}-{safe-filename}`

Do not export signed URLs, secrets, or temporary storage paths.

### Image manifest

Export an `image-manifest.json` containing:

- world ID;
- record ID and name;
- asset ID;
- asset role;
- variant ID, if relevant;
- relative repository path;
- MIME type;
- width and height;
- byte size;
- checksum;
- approval status;
- canonical strength;
- alt text;
- source and rights metadata;
- generated prompt metadata when appropriate;
- updated timestamp.

The snapshot process must support backfilling existing primary images and must produce actionable errors if an asset cannot be downloaded or written. A failed image export must not produce a falsely current snapshot.

---

## 18. Migration Strategy

Implement this in phases to protect existing records and keep the interface usable.

### Phase 1 — Foundation

- Add vocabulary tables, stable keys, versioning, and world-scoped custom options.
- Map existing enums and fields into the new vocabulary model.
- Add the shared global governance fields.
- Preserve all current prose and unknown data.

### Phase 2 — Character and relationship depth

- Add character visual profile, identity locks, life-stage variants, voice, story function, and knowledge entries.
- Add structured relationship records.
- Build the catalog-ready character sheet view.
- Backfill Elias Ashcroft, Clara Bellamy Ashcroft, Frederick Ashcroft, and Thomas Ashcroft as test fixtures without inventing facts.

### Phase 3 — Assets and prompt compilation

- Add explicit asset roles and approval states.
- Implement stable GitHub image export and image manifest.
- Build image and story prompt previews with source attribution.
- Add contradiction warnings.

### Phase 4 — Other canon types

- Add location, object/material, event, lore, atmosphere, and motif profiles.
- Add conditional forms and type-specific catalog views.

### Phase 5 — Story architecture

- Expand storylines, beats, scenes, and reveals.
- Connect scenes to canon facts, character knowledge, relationships, and scene anchors.
- Add continuity checks across the story sequence.

### Migration rules

- Never overwrite prose during automated extraction.
- Suggest structured values inferred from existing prose, but require user confirmation before marking them accepted.
- Track migration source and confidence.
- Preserve unsupported legacy values as `custom` with their original text.
- Make migrations idempotent and safely rerunnable.

---

## 19. Acceptance Criteria

### Controlled vocabulary

- Users can select, search, remove, and replace values without typing common traits repeatedly.
- Values are stored by stable key and remain readable after label changes.
- World-specific options do not pollute the global vocabulary.
- Unknown, unresolved, not applicable, withheld, and custom remain distinct.

### Character consistency

- A character can have one canonical identity with several life-stage variants.
- Immutable identity locks are visible and included in image prompts.
- The system warns when a prompt or variant conflicts with a lock.
- A catalog character sheet can display the primary portrait, full-body reference, identity traits, wardrobe, story function, relationships, and approved variants.

### Story consistency

- Scenes can identify who knows what at that point in the story.
- Relationship states can change over time without erasing earlier phases.
- Revelations link to clues and consequences.
- Story prompts contain relevant canon and omit author-only or future knowledge unless explicitly requested.

### Asset reliability

- Every approved image has an explicit record link and role.
- GitHub snapshots use stable relative paths.
- The manifest contains dimensions, checksums, and approval metadata.
- Rejected images are excluded from default generation context.

### Editorial control

- Generated content is never automatically accepted as canon.
- Warnings do not silently alter records.
- Superseded facts and assets remain traceable.
- Existing records and snapshot URLs continue to work after migration.

### Quality and accessibility

- Forms are keyboard accessible and responsive.
- Long picklists are searchable.
- Collapsible sections preserve entered data.
- Save failures are recoverable and clearly explained.
- Tests cover schema validation, vocabulary behavior, migrations, prompt compilation, conditional fields, asset export, and snapshot generation.

---

## 20. Replit Delivery Requirements

Before coding, inspect the current schema, forms, API routes, snapshot generator, asset storage, and tests. Reuse existing components and conventions where sensible.

Deliver:

1. a concise implementation plan tied to the existing repository;
2. schema migrations and rollback notes;
3. seed data for global vocabularies;
4. world-scoped vocabulary management;
5. type-specific form components with conditional display;
6. character sheet/catalog rendering;
7. prompt compilation with clause-level source attribution;
8. stable asset export and `image-manifest.json`;
9. migration/backfill tooling that does not invent canon;
10. automated tests and a manual QA checklist;
11. documentation for adding future vocabulary values and profile types.

Do not attempt to implement every phase in one unreviewed change. Start with Phase 1 and Phase 2 behind a feature flag, demonstrate the migrated character records, and obtain approval before proceeding to later phases.

When a decision is ambiguous, preserve existing data and surface the choice rather than guessing. WorldSmith is the source of truth; GitHub context snapshots are generated, readable downstream artifacts.

