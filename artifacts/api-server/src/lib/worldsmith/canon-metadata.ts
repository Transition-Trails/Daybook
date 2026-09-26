import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  auditLogTable, db, mcpCanonHistoryTable, usersTable, worldsmithWorldsTable,
  wsCanonRecordsTable, wsVocabulariesTable, wsVocabularyOptionsTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon";

type Field = { vocab?: string; multiple?: boolean; type?: "string" | "array"; editable?: boolean; maxItems?: number };
type Choice = { key: string; label: string };
const choices = (items: string): Choice[] => items.split(",").filter(Boolean).map(item => {
  const [key, label] = item.split("|");
  return { key: key!, label: label ?? key! };
});

const globalFields: Record<string, Field> = {
  stability: { vocab: "canon_stability" },
  visibility: { vocab: "narrative_visibility" },
  temporalScope: { vocab: "temporal_scope" },
  importance: { vocab: "importance" },
  spoilerLevel: { vocab: "spoiler_level" },
  evidenceConfidence: { vocab: "evidence_confidence" },
  sourceType: { vocab: "source_type", multiple: true },
};

const globalFallback: Record<string, Choice[]> = {
  stability: choices("fluid|Fluid,developing|Developing,stable|Stable,locked|Locked"),
  visibility: choices("public|Public Knowledge,limited|Limited Knowledge,private|Private,secret|Secret,author_only|Author Only"),
  temporalScope: choices("timeless|Timeless,entire_story|Entire Story,era_specific|Era-Specific,life_stage|Life-Stage-Specific,event_bound|Event-Bound,scene_bound|Scene-Bound"),
  importance: choices("background|Background,supporting|Supporting,significant|Significant,central|Central,foundational|Foundational"),
  spoilerLevel: choices("none|None,mild|Mild,major|Major,endgame|Endgame"),
  evidenceConfidence: choices("speculative|Speculative,plausible|Plausible,supported|Supported,confirmed|Confirmed,disputed|Disputed"),
  sourceType: choices("observation|Direct Observation,document|Document,oral|Oral Account,tradition|Family Tradition,institutional|Institutional Record,physical|Physical Evidence,inference|Inference,authorial|Authorial Canon"),
};

// Keys and fallback labels mirror the controls in CanonTypeForms. These are
// presentation fallbacks only; writes still require a currently active DB choice.
const fieldVocab: Record<string, Record<string, Field>> = {
  character: {
    pronouns: { vocab: "pronouns" }, lifeStage: { vocab: "life_stage" },
    occupation: { vocab: "occupation_or_role", multiple: true }, socialPosition: { vocab: "social_position" },
    familyPosition: { vocab: "family_position" }, maritalState: { vocab: "marital_state" },
    education: { vocab: "education", multiple: true }, financialSecurity: { vocab: "financial_security" },
    publicReputation: { vocab: "public_reputation", multiple: true }, apparentLifeStage: { vocab: "apparent_life_stage" },
    height: { vocab: "height" }, build: { vocab: "build", multiple: true, maxItems: 2 }, faceShape: { vocab: "face_shape" },
    complexionDepth: { vocab: "complexion_depth" }, skinUndertone: { vocab: "skin_undertone" },
    eyeColor: { vocab: "eye_color" }, eyeCharacter: { vocab: "eye_character", multiple: true, maxItems: 3 },
    hairColor: { vocab: "hair_color" }, hairTexture: { vocab: "hair_texture" }, hairLength: { vocab: "hair_length" },
    hairArrangement: { vocab: "hair_arrangement", multiple: true }, facialHair: { vocab: "facial_hair" },
    distinguishingFeatures: { vocab: "distinguishing_features", multiple: true }, posture: { vocab: "posture", multiple: true, maxItems: 3 },
    movement: { vocab: "movement", multiple: true, maxItems: 3 }, wardrobeFormality: { vocab: "wardrobe_formality" },
    garmentCondition: { vocab: "garment_condition" }, palette: { vocab: "palette", multiple: true },
    textilePreference: { vocab: "textile_preference", multiple: true }, pattern: { vocab: "pattern", multiple: true },
    accessories: { vocab: "accessories", multiple: true }, grooming: { vocab: "grooming" },
    narrativeRole: { vocab: "narrative_role", multiple: true }, arcType: { vocab: "arc_type" },
    startingCondition: { vocab: "starting_condition", multiple: true }, coreDesire: { vocab: "core_desire" },
    coreNeed: { vocab: "core_need" }, coreFear: { vocab: "core_fear" }, misconception: { vocab: "misconception" },
    resistedChange: { vocab: "resisted_change", multiple: true }, endingCondition: { vocab: "ending_condition", multiple: true },
    speechRegister: { vocab: "speech_register" }, sentenceRhythm: { vocab: "sentence_rhythm", multiple: true },
    directness: { vocab: "directness" }, emotionalOpenness: { vocab: "emotional_openness" },
    humor: { vocab: "humor", multiple: true }, conflictStyle: { vocab: "conflict_style", multiple: true },
    affectionStyle: { vocab: "affection_style", multiple: true }, vocabularyTendencies: { vocab: "vocabulary_tendencies", multiple: true },
    identityLocks: { type: "array", editable: false }, knowledge: { type: "array", editable: false }, variants: { type: "array", editable: false },
  },
  location: {
    locationScale: { vocab: "location_scale" }, primaryFunction: { vocab: "primary_function", multiple: true },
    ownership: { vocab: "ownership" }, condition: { vocab: "condition" }, access: { vocab: "access" },
    populationDensity: { vocab: "population_density" }, settingCharacter: { vocab: "setting_character", multiple: true },
    dominantMaterials: { vocab: "dominant_materials", multiple: true },
  },
  object: {
    objectClass: { vocab: "object_class" }, scale: { vocab: "scale" }, material: { vocab: "material", multiple: true },
    condition: { vocab: "condition" }, authenticity: { vocab: "authenticity" }, storyFunction: { vocab: "story_function", multiple: true },
  },
  event: {
    eventType: { vocab: "event_type", multiple: true }, temporalPrecision: { vocab: "temporal_precision" },
    eventStatus: { vocab: "event_status" }, consequenceScale: { vocab: "consequence_scale" },
  },
  lore: {
    loreType: { vocab: "lore_type", multiple: true }, origin: { vocab: "origin" }, acceptance: { vocab: "acceptance" },
    truthStatus: { vocab: "truth_status" },
  },
  atmosphere: {
    emotionalRegister: { vocab: "emotional_register", multiple: true }, intensity: { vocab: "intensity" }, duration: { vocab: "duration" },
  },
  motif: {
    motifClass: { vocab: "motif_class", multiple: true }, recurrence: { vocab: "recurrence" }, evolution: { vocab: "evolution" },
  },
  relationship: {
    relationshipType: { vocab: "relationship_type", multiple: true }, directionality: { vocab: "directionality" },
    phase: { vocab: "phase" }, emotionalValence: { vocab: "emotional_valence" }, trust: { vocab: "trust" },
    powerBalance: { vocab: "power_balance" }, publicVisibility: { vocab: "public_visibility" },
    dependency: { vocab: "dependency", multiple: true }, primaryTension: { vocab: "primary_tension", multiple: true },
    storyFunction: { vocab: "story_function", multiple: true },
  },
  material: {
    objectClass: { vocab: "object_class" }, rarity: { vocab: "rarity" }, material: { vocab: "material", multiple: true },
  },
};

const fallback: Record<string, Record<string, Choice[]>> = {
  location: {
    locationScale: choices("room|Room,building|Building,property|Property,hamlet|Hamlet,village|Village,town|Town,city_district|City District,city|City,estate|Estate,landscape|Landscape,region|Region,country|Country"),
    primaryFunction: choices("domestic|Domestic,agricultural|Agricultural,commercial|Commercial,industrial|Industrial,civic|Civic,religious|Religious,educational|Educational,medical|Medical,recreational|Recreational,ceremonial|Ceremonial,transportation|Transportation,wild|Wild,ruin|Ruin"),
    ownership: choices("private|Private,family|Family,estate|Estate,corporate|Corporate,municipal|Municipal,ecclesiastical|Ecclesiastical,crown|Crown,common|Common Land,contested|Contested,unknown|Unknown"),
    condition: choices("pristine|Pristine,well_kept|Well-Kept,serviceable|Serviceable,worn|Worn,neglected|Neglected,decaying|Decaying,ruined|Ruined,construction|Under Construction,restoration|Under Restoration,altered|Altered"),
    access: choices("open|Open,public_limits|Public with Limits,invitation|Invitation Only,staff|Staff Only,restricted|Restricted,secret|Secret,abandoned|Abandoned,seasonal|Seasonal"),
    populationDensity: choices("uninhabited|Uninhabited,isolated|Isolated,sparse|Sparse,moderate|Moderate,busy|Busy,crowded|Crowded"),
    settingCharacter: choices("formal|Formal,intimate|Intimate,domestic|Domestic,industrious|Industrious,picturesque|Picturesque,austere|Austere,wild|Wild,sheltered|Sheltered,exposed|Exposed,sacred|Sacred,uncanny|Uncanny,oppressive|Oppressive,restorative|Restorative"),
    dominantMaterials: choices("stone|Local Stone,brick|Brick,timber|Timber,slate|Slate,thatch|Thatch,iron|Iron,glass|Glass,plaster|Plaster,tile|Tile,earth|Earth,water|Water,plant|Living Plant Material"),
  },
  object: {
    objectClass: choices("personal|Personal,domestic|Domestic,professional|Professional,agricultural|Agricultural,architectural|Architectural,decorative|Decorative,documentary|Documentary,scientific|Scientific,religious|Religious,ceremonial|Ceremonial,mechanical|Mechanical,commercial|Commercial,weapon|Weapon,clothing|Clothing,botanical|Botanical"),
    scale: choices("handheld|Handheld,portable|Portable,furniture|Furniture,room|Room-Scale,architectural|Architectural,landscape|Landscape Feature"),
    material: choices("wood|Wood,paper|Paper,leather|Leather,stone|Stone,brick|Brick,iron|Iron,steel|Steel,brass|Brass,copper|Copper,silver|Silver,gold|Gold,glass|Glass,ceramic|Ceramic,textile|Textile"),
    condition: choices("new|New,pristine|Pristine,used|Used,worn|Worn,repaired|Repaired,damaged|Damaged,incomplete|Incomplete,decayed|Decayed,restored|Restored,replica|Replica"),
    authenticity: choices("original|Original,modified|Modified Original,restoration|Restoration,replacement|Replacement,replica|Replica,forgery|Forgery,uncertain|Uncertain"),
    storyFunction: choices("evidence|Evidence,heirloom|Heirloom,tool|Tool,symbol|Symbol,macguffin|MacGuffin,gift|Gift,burden|Burden,memorial|Memorial,key|Key,record|Record,conflict|Source of Conflict"),
  },
  event: {
    eventType: choices("birth|Birth,death|Death,marriage|Marriage,separation|Separation,arrival|Arrival,departure|Departure,discovery|Discovery,inheritance|Inheritance,purchase|Purchase,sale|Sale,construction|Construction,restoration|Restoration,accident|Accident,illness|Illness,crime|Crime,scandal|Scandal,trial|Trial,celebration|Celebration,disaster|Disaster,protest|Protest"),
    temporalPrecision: choices("exact|Exact Date,approximate|Approximate Date,season|Season,year|Year,era|Era,sequence|Relative Sequence,unknown|Unknown"),
    eventStatus: choices("planned|Planned,occurred|Occurred,rumored|Rumored,disputed|Disputed,prevented|Prevented,ongoing|Ongoing,recurring|Recurring"),
    consequenceScale: choices("personal|Personal,relationship|Relationship,household|Household,community|Community,regional|Regional,national|National,generational|Generational"),
  },
  lore: {
    loreType: choices("principle|Principle,tradition|Tradition,belief|Belief,folklore|Folklore,custom|Custom,rule|Rule,oath|Oath,legend|Legend,family_story|Family Story,professional|Professional Practice,community|Community Memory,superstition|Superstition,institutional|Institutional Doctrine"),
    origin: choices("individual|Known Individual,family|Family,community|Community,institution|Institution,region|Region,ancient|Ancient or Untraceable,disputed|Disputed,authorial|Authorial Construct"),
    acceptance: choices("universal|Universal,majority|Majority,common|Common,mixed|Mixed,minority|Minority,private|Private,forgotten|Forgotten,reviving|Reviving,disputed|Disputed"),
    truthStatus: choices("objectively_true|Objectively True,partly_true|Partly True,metaphorically_true|Metaphorically True,false_believed|False but Believed,deliberate_fiction|Deliberate Fiction,unknown|Unknown,irrelevant|Irrelevant"),
  },
  atmosphere: {
    emotionalRegister: choices("warm|Warm,hopeful|Hopeful,intimate|Intimate,reflective|Reflective,melancholic|Melancholic,tense|Tense,ominous|Ominous,uncanny|Uncanny,joyful|Joyful,austere|Austere,restorative|Restorative,romantic|Romantic,grieving|Grieving,industrious|Industrious"),
    intensity: choices("subtle|Subtle,light|Light,moderate|Moderate,strong|Strong,dominant|Dominant"),
    duration: choices("momentary|Momentary,scene|Scene,sequence|Sequence,recurring|Recurring,location|Location-Bound,story|Story-Wide"),
  },
  motif: {
    motifClass: choices("natural|Natural,architectural|Architectural,object|Object,color|Color,sound|Sound,gesture|Gesture,weather|Weather,animal|Animal,plant|Plant,textile|Textile,light|Light,repeated_phrase|Repeated Phrase"),
    recurrence: choices("rare|Rare,occasional|Occasional,regular|Regular,structural|Structural"),
    evolution: choices("static|Static,accumulates|Accumulates Meaning,reverses|Reverses Meaning,degrades|Degrades,restores|Restores,changes_owner|Changes Owner"),
  },
  relationship: {
    relationshipType: choices("parent|Parent,child|Child,sibling|Sibling,spouse|Spouse,romantic|Romantic,friend|Friend,confidant|Confidant,colleague|Colleague,employer|Employer,employee|Employee,mentor|Mentor,student|Student,patron|Patron,client|Client,rival|Rival,adversary|Adversary,neighbor|Neighbor,caregiver|Caregiver,ward|Ward,business|Business Partner,custodian|Custodian,community|Community Tie"),
    directionality: choices("mutual|Mutual,primarily_from|Primarily From,primarily_to|Primarily To,unequal|Unequal,misunderstood|Misunderstood"),
    phase: choices("unknown|Unknown,newly_formed|Newly Formed,developing|Developing,established|Established,strained|Strained,estranged|Estranged,repaired|Repaired,ended|Ended,bereaved|Bereaved"),
    emotionalValence: choices("loving|Loving,warm|Warm,respectful|Respectful,loyal|Loyal,neutral|Neutral,ambivalent|Ambivalent,competitive|Competitive,resentful|Resentful,fearful|Fearful,hostile|Hostile,grieving|Grieving"),
    trust: choices("none|None,fragile|Fragile,conditional|Conditional,moderate|Moderate,strong|Strong,absolute|Absolute,misplaced|Misplaced"),
    powerBalance: choices("balanced|Balanced,slightly_from|Slightly From-Dominant,slightly_to|Slightly To-Dominant,strongly_from|Strongly From-Dominant,strongly_to|Strongly To-Dominant,context|Context-Dependent"),
    publicVisibility: choices("public|Public,circle|Known to Circle,private|Private,secret|Secret,misrepresented|Misrepresented"),
    dependency: choices("emotional|Emotional,financial|Financial,social|Social,professional|Professional,legal|Legal,physical|Physical,informational|Informational,none|None"),
    primaryTension: choices("duty|Duty vs Desire,trust|Trust,class|Class,money|Money,inheritance|Inheritance,reputation|Reputation,authority|Authority,secrecy|Secrecy,grief|Grief,jealousy|Jealousy,ideology|Ideology,protection|Protection,distance|Distance,miscommunication|Miscommunication"),
    storyFunction: choices("support|Support,pressure|Pressure,foil|Foil,revelation|Revelation,conflict|Conflict,reconciliation|Reconciliation,catalyst|Catalyst,stakes|Stakes,comic|Comic Relief,witness|Witness"),
  },
  material: {
    objectClass: choices("organic|Organic,synthetic|Synthetic,mineral|Mineral,composite|Composite,magical|Magical/Alchemical"),
    rarity: choices("common|Common,uncommon|Uncommon,rare|Rare,legendary|Legendary,unique|Unique"),
    material: choices("brittle|Brittle,ductile|Ductile,flammable|Flammable,luminous|Luminous,toxic|Toxic,durable|Durable"),
  },
};

// Character controls include static option lists in the editor; occupation and
// other data-driven controls intentionally have no static fallback.
fallback.character = {
  pronouns: choices("she_her|She/Her,he_him|He/Him,they_them|They/Them,unresolved|Unresolved"),
  lifeStage: choices("infant|Infant,child|Child,adolescent|Adolescent,young_adult|Young Adult,early_adult|Early Adult,established|Established Adult,middle_age|Middle Age,later_life|Later Life,elder|Elder"),
  socialPosition: choices("destitute|Destitute,laboring|Laboring Poor,working|Working Class,skilled|Skilled Trade,lower_middle|Lower Middle Class,middle|Middle Class,upper_middle|Upper Middle Class,gentry|Gentry,aristocracy|Aristocracy,royalty|Royalty,outside|Outside Conventional Class"),
  familyPosition: choices("only_child|Only Child,eldest|Eldest,middle|Middle,youngest|Youngest,heir|Heir,spare|Spare,ward|Ward,adopted|Adopted,stepchild|Stepchild"),
  publicReputation: choices("respected|Respected,trusted|Trusted,admired|Admired,conventional|Conventional,eccentric|Eccentric,formidable|Formidable,questioned|Questioned,scandalous|Scandalous,unknown|Unknown"),
  maritalState: choices("unmarried|Unmarried,courting|Courting,engaged|Engaged,married|Married,separated|Separated,widowed|Widowed,remarried|Remarried,not_applicable|Not Applicable,withheld|Withheld"),
  education: choices("informal|Informal,apprenticeship|Apprenticeship,governess|Governess or Tutor,grammar_school|Grammar School,public_school|Public School,university|University,professional|Professional Training,self_educated|Self-Educated,unknown|Unknown"),
  financialSecurity: choices("precarious|Precarious,modest|Modest,comfortable|Comfortable,prosperous|Prosperous,wealthy|Wealthy,dependent|Dependent,declining|Declining,unknown|Unknown"),
  apparentLifeStage: choices("infant|Infant,child|Child,adolescent|Adolescent,young_adult|Young Adult,early_adult|Early Adult,established|Established Adult,middle_age|Middle Age,later_life|Later Life,elder|Elder"),
  height: choices("very_short|Very Short,short|Short,average|Average,tall|Tall,very_tall|Very Tall"),
  build: choices("slight|Slight,lean|Lean,wiry|Wiry,average|Average,broad|Broad,sturdy|Sturdy,athletic|Athletic,soft|Soft,heavyset|Heavyset,frail|Frail"),
  faceShape: choices("oval|Oval,round|Round,square|Square,rectangular|Rectangular,heart|Heart,diamond|Diamond,long|Long,angular|Angular"),
  complexionDepth: choices("very_fair|Very Fair,fair|Fair,light|Light,medium|Medium,tan|Tan,deep|Deep,very_deep|Very Deep"),
  skinUndertone: choices("cool|Cool,neutral|Neutral,warm|Warm,olive|Olive,unknown|Unknown"),
  eyeColor: choices("gray|Gray,blue|Blue,green|Green,hazel|Hazel,amber|Amber,brown|Brown,dark_brown|Dark Brown"),
  eyeCharacter: choices("deep_set|Deep-Set,wide_set|Wide-Set,close_set|Close-Set,hooded|Hooded,heavy_lidded|Heavy-Lidded,alert|Alert,soft|Soft,intense|Intense,watchful|Watchful"),
  hairColor: choices("black|Black,dark_brown|Dark Brown,brown|Brown,light_brown|Light Brown,auburn|Auburn,red|Red,dark_blond|Dark Blond,blond|Blond,gray|Gray,white|White"),
  hairTexture: choices("straight|Straight,wavy|Wavy,curly|Curly,coiled|Coiled,fine|Fine,coarse|Coarse"),
  hairLength: choices("cropped|Cropped,short|Short,ear|Ear-Length,chin|Chin-Length,shoulder|Shoulder-Length,long|Long"),
  hairArrangement: choices("neatly_parted|Neatly Parted,loosely_parted|Loosely Parted,swept_back|Swept Back,pinned_up|Pinned Up,braided|Braided,coiled|Coiled,covered|Covered,disordered|Disordered,receding|Receding,thinning|Thinning"),
  facialHair: choices("none|None,clean_shaven|Clean-Shaven,stubble|Stubble,mustache|Mustache,sideburns|Sideburns,short_beard|Short Beard,full_beard|Full Beard"),
  distinguishingFeatures: choices("freckles|Freckles,scar|Scar,birthmark|Birthmark,lines_eyes|Lines at Eyes,strong_brow|Strong Brow,prominent_nose|Prominent Nose,dimple|Dimple,weathering|Weathering,callused|Callused Hands,ink_stained|Ink-Stained Fingers,spectacles|Spectacles"),
  posture: choices("upright|Upright,formal|Formal,relaxed|Relaxed,guarded|Guarded,stooped|Stooped,restless|Restless,grounded|Grounded,tense|Tense,graceful|Graceful,work_worn|Work-Worn"),
  movement: choices("deliberate|Deliberate,brisk|Brisk,economical|Economical,hesitant|Hesitant,restless|Restless,graceful|Graceful,heavy|Heavy,quiet|Quiet,precise|Precise,expansive|Expansive"),
  wardrobeFormality: choices("workwear|Workwear,informal|Informal Domestic,everyday|Everyday Respectable,professional|Professional,visiting|Visiting,evening|Evening,ceremonial|Ceremonial,mourning|Mourning"),
  garmentCondition: choices("patched|Patched,worn|Worn,serviceable|Serviceable,well_kept|Well-Kept,fine|Fine,immaculate|Immaculate,faded|Faded,newly_made|Newly Made"),
  palette: choices("black|Black,charcoal|Charcoal,slate|Slate,navy|Navy,brown|Brown,tan|Tan,cream|Cream,white|White,olive|Olive,moss|Moss,forest|Forest,burgundy|Burgundy,rust|Rust,plum|Plum,muted_blue|Muted Blue,dusty_rose|Dusty Rose"),
  textilePreference: choices("wool|Wool,tweed|Tweed,linen|Linen,cotton|Cotton,silk|Silk,velvet|Velvet,leather|Leather,lace|Lace,muslin|Muslin,calico|Calico,oilcloth|Oilcloth"),
  pattern: choices("solid|Solid,stripe|Subtle Stripe,check|Check,plaid|Plaid,floral|Floral,brocade|Brocade,geometric|Geometric,none|None"),
  accessories: choices("spectacles|Spectacles,watch_chain|Watch Chain,brooch|Brooch,gloves|Gloves,hat|Hat,shawl|Shawl,cravat|Cravat,tie|Tie,walking_stick|Walking Stick,satchel|Satchel,apron|Apron,tools|Tools,jewelry|Jewelry"),
  grooming: choices("immaculate|Immaculate,neat|Neat,practical|Practical,weathered|Weathered,disheveled|Disheveled,neglected|Neglected"),
  narrativeRole: choices("protagonist|Protagonist,co_protagonist|Co-Protagonist,viewpoint|Viewpoint Character,mentor|Mentor,ally|Ally,confidant|Confidant,romantic|Romantic Partner,family_counterpoint|Family Counterpoint,rival|Rival,antagonist|Antagonist,foil|Foil,patron|Patron,gatekeeper|Gatekeeper,witness|Witness,catalyst|Catalyst,custodian|Custodian,community|Community Voice"),
  arcType: choices("positive|Positive Change,flat|Flat or Steadfast,disillusionment|Disillusionment,corruption|Corruption,redemption|Redemption,healing|Healing,coming_of_age|Coming of Age,fall_recovery|Fall and Recovery,tragic|Tragic Fall,mystery|Mystery or Revelation,legacy|Legacy"),
  startingCondition: choices("secure|Secure,isolated|Isolated,dutiful|Dutiful,restless|Restless,grieving|Grieving,ambitious|Ambitious,disillusioned|Disillusioned,protected|Protected,burdened|Burdened,curious|Curious,distrustful|Distrustful,hopeful|Hopeful"),
  coreDesire: choices("belonging|Belonging,security|Security,recognition|Recognition,freedom|Freedom,love|Love,truth|Truth,restoration|Restoration,justice|Justice,control|Control,legacy|Legacy,reconciliation|Reconciliation,purpose|Purpose,protection|Protection"),
  coreNeed: choices("trust|Trust,humility|Humility,courage|Courourage,self_knowledge|Self-Knowledge,connection|Connection,agency|Agency,forgiveness|Forgiveness,acceptance|Acceptance,responsibility|Responsibility,hope|Hope,boundaries|Boundaries"),
  coreFear: choices("abandonment|Abandonment,failure|Failure,exposure|Exposure,powerlessness|Powerlessness,disorder|Disorder,intimacy|Intimacy,loss|Loss,disgrace|Disgrace,dependence|Dependence,repetition|Repetition of the Past"),
  misconception: choices("duty|Duty Requires Self-Denial,control|Control Prevents Loss,worth|Worth Must Be Earned,vulnerability|Vulnerability Is Weakness,tradition|Tradition Must Not Change,love|Love Requires Rescue,knowledge|Knowledge Equals Wisdom"),
  resistedChange: choices("asking|Asking for Help,sharing|Sharing Authority,accepting|Accepting Love,relinquishing|Relinquishing Control,facing|Facing the Past,speaking|Speaking Truth,breaking|Breaking Convention,assuming|Assuming Responsibility,forgiving|Forgiving"),
  endingCondition: choices("secure|Secure,isolated|Isolated,dutiful|Dutiful,restless|Restless,grieving|Grieving,ambitious|Ambitious,disillusioned|Disillusioned,protected|Protected,burdened|Burdened,curious|Curious,distrustful|Distrustful,hopeful|Hopeful"),
  speechRegister: choices("formal|Formal,educated|Educated Conversational,plainspoken|Plainspoken,regional|Regional,professional|Professional,domestic|Domestic,ceremonial|Ceremonial,mixed|Mixed"),
  sentenceRhythm: choices("concise|Concise,measured|Measured,elaborate|Elaborate,hesitant|Hesitant,rapid|Rapid,precise|Precise,circular|Circular,storytelling|Storytelling,fragmented|Fragmented"),
  directness: choices("evasive|Evasive,indirect|Indirect,diplomatic|Diplomatic,direct|Direct,blunt|Blunt"),
  emotionalOpenness: choices("closed|Closed,guarded|Guarded,selective|Selective,open|Open,effusive|Effusive"),
  humor: choices("none|None,dry|Dry,wry|Wry,gentle|Gentle,playful|Playful,sardonic|Sardonic,self_deprecating|Self-Deprecating,mischievous|Mischievous,gallows|Gallows Humor"),
  conflictStyle: choices("avoids|Avoids,deflects|Deflects,appeases|Appeases,negotiates|Negotiates,challenges|Challenges,commands|Commands,withdraws|Withdraws,uses_evidence|Uses Evidence,uses_humor|Uses Humor"),
  affectionStyle: choices("practical|Practical Help,time|Time,gifts|Gifts,protection|Protection,touch|Touch,praise|Praise,teasing|Teasing,shared_work|Shared Work,quiet|Quiet Presence"),
  vocabularyTendencies: choices("technical|Technical,botanical|Botanical,architectural|Architectural,legal|Legal,religious|Religious,literary|Literary,domestic|Domestic,commercial|Commercial,agricultural|Agricultural,regional|Regional"),
};

const metadataJsonValue: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string().max(20_000), z.number().finite(), z.boolean(), z.null(),
  z.array(metadataJsonValue).max(500),
  z.record(z.string().min(1).max(200), metadataJsonValue),
]));
const jsonObject = z.record(z.string().min(1).max(200), metadataJsonValue).superRefine((value, ctx) => {
  let nodes = 0;
  const visit = (item: unknown, depth: number, path: (string | number)[]) => {
    nodes += 1;
    if (depth > 8) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "JSON nesting cannot exceed 8 levels" });
    if (nodes > 5_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "JSON value is too large" });
      return;
    }
    if (Array.isArray(item)) item.forEach((child, index) => visit(child, depth + 1, [...path, index]));
    else if (item && typeof item === "object") {
      Object.entries(item).forEach(([key, child]) => visit(child, depth + 1, [...path, key]));
    }
  };
  visit(value, 0, []);
});
const changeValueSchema = (field: Field) => z.union([
  field.multiple
    ? z.array(z.string().min(1).max(2_000)).max(field.maxItems ?? 100)
    : z.string().max(2_000),
  z.null(),
]);
const structuredEditFields = Object.assign({}, ...Object.values(fieldVocab)) as Record<string, Field>;
const metadataChangesSchema = (fields: Record<string, Field>) => z.object(
  Object.fromEntries(Object.entries(fields).filter(([, field]) => field.editable !== false)
    .map(([key, field]) => [key, changeValueSchema(field).optional()])),
).strict().refine(value => Object.keys(value).length > 0, "At least one metadata field must be changed");
const changeSchema = z.object({
  global_metadata: metadataChangesSchema(globalFields).optional(),
  structured_profile: metadataChangesSchema(structuredEditFields).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "At least one metadata path must be changed");
const argsSchema = z.object({
  record_id: z.string().trim().min(1).max(200),
  expected_version: z.number().int().positive(),
  changes: changeSchema,
}).strict();

async function vocabData(worldId: string) {
  const vocabularies = await db.select().from(wsVocabulariesTable).where(or(
    isNull(wsVocabulariesTable.worldId), eq(wsVocabulariesTable.worldId, worldId),
  ));
  const allOptions = vocabularies.length ? await db.select().from(wsVocabularyOptionsTable).where(and(
    inArray(wsVocabularyOptionsTable.vocabularyId, vocabularies.map(v => v.id)),
    or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, worldId)),
  )).orderBy(asc(wsVocabularyOptionsTable.displayOrder)) : [];
  return { vocabularies, allOptions };
}

function fieldChoices(
  field: Field,
  available: Awaited<ReturnType<typeof vocabData>>,
  fallbackChoices: Choice[] = [],
) {
  if (!field.vocab) return { choices: [], fallback_choices: [] };
  const matchingVocabs = available.vocabularies.filter(item => item.key === field.vocab);
  const vocabById = new Map(matchingVocabs.map(vocabulary => [vocabulary.id, vocabulary]));
  const current = available.allOptions.flatMap(item => {
    const vocabulary = vocabById.get(item.vocabularyId);
    return vocabulary ? [{
      key: item.key, label: item.label, description: item.description, active: item.active,
      source: item.worldId === null ? "global" : "world",
      vocabulary_id: vocabulary.id,
      vocabulary_active: vocabulary.active,
      allowed: item.active && vocabulary.active,
    }] : [];
  });
  return {
    choices: current,
    fallback_choices: current.length ? [] : fallbackChoices.map(choice => ({ ...choice, active: false, allowed: false, source: "ui_fallback" })),
  };
}

export async function getCanonMetadataFieldOptions(worldId: string, canonType: string) {
  const canonTypes = Object.keys(fieldVocab);
  if (!Object.hasOwn(fieldVocab, canonType)) {
    throw new CanonToolError(`Unsupported Canon type "${canonType}"; supported types: ${canonTypes.join(", ")}`, 422, "UNSUPPORTED_CANON_TYPE");
  }
  const vocabDataResult = await vocabData(worldId);
  const structuredFields = Object.fromEntries(Object.entries(fieldVocab[canonType]!).map(([name, field]) => [
    name,
    {
      path: `structuredProfile.${name}`,
      type: field.multiple ? "string[]" : field.type ?? "string",
      multi_select: field.multiple ?? false,
      ...(field.maxItems ? { max_items: field.maxItems } : {}),
      editable: field.editable !== false,
      vocabulary_key: field.vocab ?? null,
      ...fieldChoices(field, vocabDataResult, fallback[canonType]?.[name]),
    },
  ]));
  const global = Object.fromEntries(Object.entries(globalFields).map(([name, field]) => [
    name,
    {
      path: `globalMetadata.${name}`,
      type: field.multiple ? "string[]" : "string",
      multi_select: field.multiple ?? false,
      editable: true,
      vocabulary_key: field.vocab,
      ...fieldChoices(field, vocabDataResult, globalFallback[name]),
    },
  ]));
  const relatedKeys = new Set([
    ...Object.values(globalFields).map(item => item.vocab),
    ...Object.values(fieldVocab[canonType]!).map(item => item.vocab),
  ].filter((key): key is string => Boolean(key)));
  const vocabularies = vocabDataResult.vocabularies.filter(vocab => relatedKeys.has(vocab.key)).map(vocab => ({
    key: vocab.key, label: vocab.label, description: vocab.description, scope: vocab.scope,
    world_id: vocab.worldId, active: vocab.active, version: vocab.version,
    options: vocabDataResult.allOptions.filter(option => option.vocabularyId === vocab.id).map(option => ({
      key: option.key, label: option.label, description: option.description, active: option.active,
      world_id: option.worldId, version: option.version, display_order: option.displayOrder,
      allowed: vocab.active && option.active,
    })),
  }));
  return {
    canon_type: canonType,
    paths: {
      global_metadata: { storage_path: "ws_canon_records.global_metadata / globalMetadata", fields: global },
      structured_profile: { storage_path: "ws_canon_records.structured_profile / structuredProfile", fields: structuredFields },
      direct_columns: [
        { field: "status", column: "ws_canon_records.status", note: "workflow state; not metadata-editable" },
        { field: "canon_stability", column: "ws_canon_records.canon_stability", note: "distinct from globalMetadata.stability" },
        { field: "narrative_visibility", column: "ws_canon_records.narrative_visibility", note: "distinct from globalMetadata.visibility" },
        { field: "temporal_scope", column: "ws_canon_records.temporal_scope", note: "distinct from globalMetadata.temporalScope" },
        { field: "emotional_valence", column: "ws_canon_records.emotional_valence", note: "distinct from structuredProfile.emotionalValence" },
        { field: "from_entity_id", column: "ws_canon_records.from_entity_id", note: "relationship endpoint column; not a structuredProfile field" },
        { field: "to_entity_id", column: "ws_canon_records.to_entity_id", note: "relationship endpoint column; not a structuredProfile field" },
      ],
    },
    vocabularies,
  };
}

function validateFieldChanges(
  objectPath: "globalMetadata" | "structuredProfile",
  current: unknown,
  rawChanges: Record<string, unknown>,
  fields: Record<string, Field>,
  available: Awaited<ReturnType<typeof vocabData>>,
) {
  const parsedCurrent = jsonObject.safeParse(current ?? {});
  if (!parsedCurrent.success) throw new CanonToolError(`Stored ${objectPath} is invalid`, 409, "INVALID_STORED_METADATA");
  const next = { ...parsedCurrent.data };
  for (const [name, value] of Object.entries(rawChanges)) {
    const field = fields[name];
    if (!field) throw new CanonToolError(`Unsupported ${objectPath} field "${name}" for this Canon type`, 400, "UNSUPPORTED_METADATA_FIELD");
    if (field.editable === false) {
      throw new CanonToolError(`${objectPath}.${name} is a structured repeater and is not supported by field-level metadata updates`, 400, "UNSUPPORTED_METADATA_FIELD");
    }
    if (value === null) {
      delete next[name];
      continue;
    }
    if (field.multiple) {
      if (!Array.isArray(value) || value.length > (field.maxItems ?? 100) || value.some(item => typeof item !== "string" || !item.trim())) {
        throw new CanonToolError(`${objectPath}.${name} must be an array of non-empty choices`, 400, "INVALID_METADATA_VALUE");
      }
    } else if (field.type === "array") {
      if (!Array.isArray(value) || value.length > 100) throw new CanonToolError(`${objectPath}.${name} must be an array`, 400, "INVALID_METADATA_VALUE");
    } else if (typeof value !== "string" || value.length > 2_000) {
      throw new CanonToolError(`${objectPath}.${name} must be a string or null`, 400, "INVALID_METADATA_VALUE");
    }
    if (field.vocab) {
      const vocabularies = available.vocabularies.filter(item => item.key === field.vocab && item.active);
      const options = available.allOptions.filter(item =>
        vocabularies.some(vocab => vocab.id === item.vocabularyId) && item.active,
      );
      const allowed = new Set(options.map(item => item.key));
      const entries = Array.isArray(value) ? value : [value];
      if (!vocabularies.length || entries.some(item => typeof item !== "string" || !allowed.has(item))) {
        throw new CanonToolError(`Invalid ${objectPath}.${name} choice; choose an active world/global vocabulary option`, 400, "INVALID_PICKLIST_VALUE");
      }
    }
    next[name] = value;
  }
  return next;
}

async function requireSuperAdmin(userId: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

export async function updateCanonMetadata(userId: string, args: unknown) {
  await requireSuperAdmin(userId);
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  const { record_id: recordId, expected_version: expectedVersion, changes } = parsed.data;
  return db.transaction(async tx => {
    const [record] = await tx.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId)).for("update").limit(1);
    if (!record) throw new CanonToolError("Canon record not found", 404, "RECORD_NOT_FOUND");
    const [world] = await tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, record.worldId)).limit(1);
    if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
    if (record.version !== expectedVersion) {
      throw new CanonToolError(`Version conflict: expected ${expectedVersion}, current version is ${record.version}`, 409, "VERSION_CONFLICT");
    }
    const structured = fieldVocab[record.canonType ?? ""] ?? null;
    if (!structured) throw new CanonToolError(`Unsupported Canon type "${record.canonType}"`, 422, "UNSUPPORTED_CANON_TYPE");
    const vocabulary = await vocabData(record.worldId);
    const nextGlobal = changes.global_metadata === undefined ? record.globalMetadata ?? {}
      : validateFieldChanges("globalMetadata", record.globalMetadata, changes.global_metadata as Record<string, unknown>, globalFields, vocabulary);
    const nextStructured = changes.structured_profile === undefined ? record.structuredProfile ?? {}
      : validateFieldChanges("structuredProfile", record.structuredProfile, changes.structured_profile as Record<string, unknown>, structured, vocabulary);
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    if (changes.global_metadata !== undefined && JSON.stringify(record.globalMetadata ?? {}) !== JSON.stringify(nextGlobal)) {
      diff.globalMetadata = { before: record.globalMetadata ?? {}, after: nextGlobal };
    }
    if (changes.structured_profile !== undefined && JSON.stringify(record.structuredProfile ?? {}) !== JSON.stringify(nextStructured)) {
      diff.structuredProfile = { before: record.structuredProfile ?? {}, after: nextStructured };
    }
    if (!Object.keys(diff).length) return { record, version: record.version, revision: record.version, diff };
    const [updated] = await tx.update(wsCanonRecordsTable).set({
      ...(changes.global_metadata !== undefined ? { globalMetadata: nextGlobal } : {}),
      ...(changes.structured_profile !== undefined ? { structuredProfile: nextStructured } : {}),
      version: record.version + 1, updatedAt: new Date(),
    }).where(and(eq(wsCanonRecordsTable.id, recordId), eq(wsCanonRecordsTable.version, record.version))).returning();
    if (!updated) throw new CanonToolError("Canon record changed concurrently; retry with the latest version", 409, "VERSION_CONFLICT");
    await tx.insert(mcpCanonHistoryTable).values({
      id: randomUUID(), recordId, actorUserId: userId, changeType: "canon_metadata_mcp",
      before: { globalMetadata: record.globalMetadata ?? {}, structuredProfile: record.structuredProfile ?? {} },
      after: { globalMetadata: updated.globalMetadata ?? {}, structuredProfile: updated.structuredProfile ?? {} }, diff,
    });
    await tx.insert(auditLogTable).values({
      actorUserId: userId, actorRole: "super_admin", scope: "platform",
      action: "worldsmith.editorial.canon.metadata.update", targetType: "worldsmith_canon_record",
      targetId: recordId, metadata: { actor_user_id: userId, before_after: diff },
    });
    return { record: updated, revision: updated.version, diff };
  });
}

export const CANON_METADATA_TOOL = {
  name: "update_canon_metadata",
  description: "Update explicit globalMetadata and type-supported structuredProfile fields with active world/global vocabulary choices and expected-version compare-and-swap. Null safely clears a field; unrelated metadata keys are preserved.",
  inputSchema: {
    type: "object",
    properties: {
      record_id: { type: "string", minLength: 1, maxLength: 200 },
      expected_version: { type: "integer", minimum: 1 },
      changes: {
        type: "object", minProperties: 1, additionalProperties: false,
        properties: {
          global_metadata: {
            type: "object", minProperties: 1, additionalProperties: false,
            properties: Object.fromEntries(Object.entries(globalFields).map(([key, field]) => [
              key, { anyOf: [field.multiple ? { type: "array", maxItems: field.maxItems ?? 100, items: { type: "string", minLength: 1, maxLength: 2_000 } }
                : { type: "string", maxLength: 2_000 }, { type: "null" }] },
            ])),
          },
          structured_profile: {
            type: "object", minProperties: 1, additionalProperties: false,
            properties: Object.fromEntries(Object.entries(structuredEditFields)
              .filter(([, field]) => field.editable !== false)
              .map(([key, field]) => [
                key, { anyOf: [field.multiple ? { type: "array", maxItems: field.maxItems ?? 100, items: { type: "string", minLength: 1, maxLength: 2_000 } }
                  : { type: "string", maxLength: 2_000 }, { type: "null" }] },
              ])),
          },
        },
      },
    },
    required: ["record_id", "expected_version", "changes"], additionalProperties: false,
  },
};