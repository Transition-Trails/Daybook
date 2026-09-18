import { describe, expect, it } from "vitest";
import { compilePrompt } from "../lib/worldsmith/prompt-compiler.js";
import {
  applyProviderPromptRevision,
  MAX_PROVIDER_PROMPT_LENGTH,
  validateProviderPrompt,
  validateProviderPromptRevision,
} from "../lib/worldsmith/generation-prompt-resolver.js";
import type { InheritanceChain, ParsedPayload } from "../lib/worldsmith/types.js";

function curatorChain(): InheritanceChain {
  return {
    productionSpec: {
      sourceId: "curators-desk-hero",
      productionItem: "Curator's Desk Hero Paper",
      specId: "SH-CD-HP-01",
      componentType: "Hero Paper",
      world: "Stationery House",
      currentVersion: "1",
      designIntent: "Create a believable curator's worktable with a quiet archival mood.",
      narrativePurpose: "Establish the botanical archive setting.",
      requiredContent: "Open specimen ledger, fern study, brushes, ink, brass magnifier, and archival papers.",
      reviewCriteria: "Keep 30% usable visual space; no modern objects; no pseudo-text.",
      writingSpacePercent: 30,
      orientation: "Square",
      payloadVersion: "PP-2.0",
      promptPayload: "{}",
      promptModuleIds: [],
      canonDependency: "Supports Canon",
      canonRecordIds: ["stationery-house"],
      status: "Approved",
      compiledPromptStatus: "Not Compiled",
    },
    styleGuide: {
      sourceId: "victorian-archive-style",
      name: "Victorian Botanical Archive",
      content: [
        "Mandatory illustrated Victorian botanical and archival treatment.",
        "Use watercolor and gouache washes, fine ink linework, subtle graphite construction, restrained engraved detail, visible aged rag-paper texture, softened edges, and muted natural pigments.",
        "Prohibited: photography, photorealistic rendering, hyperreal 3D, DSLR still life, photographic depth of field, glossy digital rendering, and cinematic rendering.",
      ].join("\n"),
    },
    componentSpec: {
      sourceId: "hero-paper",
      name: "Hero Paper",
      componentType: "Hero Paper",
      content: "Maintain a clear writable zone. Avoid excessive clutter and theatrical lighting.",
    },
    promptModules: [{
      sourceId: "archive-materials",
      name: "Archive Materials",
      section: "style",
      content: "Visible wood grain, brass, glass, and paper remain tactile and plausible. No synthetic materials; no photography.",
      dependencies: [],
    }],
    canonRecords: [{
      sourceId: "stationery-house",
      name: "Stationery House",
      status: "Accepted",
      visualNotes: "The House supports a working archive atmosphere; do not add unsupported named relics.",
    }],
    worldBible: {
      visualPalette: "Muted moss, umber, parchment, and oxidized brass.",
      atmosphericNotes: "Soft greenhouse daylight and a restrained scholarly calm.",
      materialWorld: "Aged wood, glass, brass, rag paper, botanical specimens.",
      worldRules: ["No modern objects.", "No unsupported canon artifacts."],
    },
    resolvedSourceIds: {},
    warnings: [],
  };
}

const payload: ParsedPayload = {
  shared_prompt: "A curator's desk viewed from above in a Victorian greenhouse archive.",
  front_prompt: "Open ledger centered low with the upper-right area left quiet and usable.",
  negative_prompt: "no pseudo-text, no modern objects, no photography",
};

describe("WorldSmith generation prompt governance", () => {
  it("promotes the Curator's Desk illustration lock and preserves governed content", () => {
    const result = compilePrompt(curatorChain(), payload);

    expect(result.generationValidationErrors).toEqual([]);
    expect(result.generationPrompt).toMatch(/^\[MANDATORY RENDERING STYLE\]/);
    expect(result.generationPrompt).toMatch(/governing Style Guide rendering medium is mandatory/i);
    expect(result.generationPrompt).toMatch(/illustrated Victorian botanical and archival treatment/i);
    expect(result.generationPrompt).toMatch(/watercolor and gouache washes/i);
    expect(result.generationPrompt).toMatch(/fine ink linework/i);
    expect(result.generationPrompt).toMatch(/graphite construction/i);
    expect(result.generationPrompt).toMatch(/aged rag-paper texture/i);
    expect(result.generationPrompt).toContain("Preserve 30% usable visual space.");
    expect(result.generationPrompt).toContain("Open ledger centered low");
    expect(result.generationPrompt).not.toMatch(/(?:include|place|show) (?:an? )?named relic/i);
  });

  it("prioritizes photography negatives and collapses inherited duplicates", () => {
    const chain = curatorChain();
    chain.componentSpec!.content += " No text, logos, watermarks.";
    const negative = compilePrompt(chain, {
      ...payload,
      negative_prompt: `${payload.negative_prompt}, logos`,
    }).negativePrompt!;

    expect(negative.startsWith("photograph, photography, photorealistic")).toBe(true);
    expect(negative).toContain("DSLR still life");
    expect(negative).toContain("photographic depth of field");
    expect(negative).toContain("glossy digital rendering");
    expect(negative).toContain("modern objects");
    expect(negative).toContain("synthetic materials");
    expect((negative.match(/\bno photography\b/gi) ?? [])).toHaveLength(0);
    expect(new Set(negative.split(", ").map((part) => part.toLowerCase())).size)
      .toBe(negative.split(", ").length);
    expect(negative.match(/\blogos\b/gi)).toHaveLength(1);
  });

  it("removes lower-priority photographic directions from every positive source", () => {
    const chain = curatorChain();
    chain.productionSpec.designIntent = "Create a photorealistic photograph of the working archive.";
    chain.componentSpec!.content = "Use a DSLR still-life treatment. Maintain the writable zone.";
    chain.promptModules.push(
      { sourceId: "world-photo", name: "World photo", section: "world", content: "Use photographic lighting. Keep the greenhouse setting.", dependencies: [] },
      { sourceId: "general-photo", name: "General photo", section: "general", content: "Create a 3D render. Preserve the fern specimen.", dependencies: [] },
    );
    chain.canonRecords[0] = {
      ...chain.canonRecords[0]!,
      narrativeDetails: "Use a photorealistic documentary reference. Preserve the working archive narrative.",
      historicalContext: "Use photographic lighting. Keep the Victorian period.",
      visualNotes: "Render as a DSLR photograph. Do not add unsupported named relics.",
      emotionalRegister: "Cinematic rendering. Maintain a quiet scholarly mood.",
      sensoryClauses: "Glossy digital rendering. Suggest cool greenhouse air.",
      notes: "Use a 3D render. Preserve the established House canon.",
    };
    const result = compilePrompt(chain, {
      ...payload,
      shared_prompt: "A photorealistic photograph. Preserve the overhead curator's desk.",
      canon_rule: "Use photographic depth of field. Do not introduce modern objects.",
    });
    const governedBody = result.providerPrompt
      .split("[ASSET AND SCENE]")[1]!
      .split("[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]")[0]!;

    expect(governedBody).not.toMatch(/photorealistic photograph|DSLR still-life treatment|photographic lighting|create a 3D render/i);
    expect(governedBody).toContain("Preserve the overhead curator's desk.");
    expect(governedBody).toContain("Keep the greenhouse setting.");
    expect(governedBody).toContain("Preserve the fern specimen.");
    expect(governedBody).toContain("Preserve the working archive narrative.");
    expect(governedBody).toContain("Keep the Victorian period.");
    expect(governedBody).toContain("Maintain a quiet scholarly mood.");
    expect(governedBody).toContain("Suggest cool greenhouse air.");
    expect(governedBody).toContain("Preserve the established House canon.");
    expect(governedBody).toContain("Do not introduce modern objects.");
  });

  it("fails closed when a photography-prohibiting guide loses either safeguard", () => {
    const chain = curatorChain();
    const policy = compilePrompt(chain, payload).generationPolicy;
    expect(validateProviderPrompt(policy, "[ASSET AND SCENE]\nDesk", "photography, photorealistic"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_MANDATORY_RENDERING_LOCK" })]));
    expect(validateProviderPrompt(policy, "[MANDATORY RENDERING STYLE]\nThe governing Style Guide rendering medium is mandatory.", "no text"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_PHOTOGRAPHY_NEGATIVES" })]));
  });

  it("does not impose a photography lock when the governing guide allows it", () => {
    const chain = curatorChain();
    chain.styleGuide = {
      sourceId: "documentary-style",
      name: "Documentary Product Style",
      content: "Use precise documentary photography with soft daylight.",
    };
    const result = compilePrompt(chain, payload);
    expect(result.generationPrompt).not.toContain("[MANDATORY RENDERING STYLE]");
    expect(result.generationValidationErrors).toEqual([]);
  });

  it("derives a mandatory non-photographic lock from woodcut and collage guides", () => {
    const chain = curatorChain();
    chain.styleGuide = {
      sourceId: "woodcut-collage",
      name: "Woodcut Collage",
      content: "Mandatory woodcut print treatment. Required paper-collage medium with torn fibers and hand-inked relief marks.",
    };
    const result = compilePrompt(chain, {
      ...payload,
      shared_prompt: "Create a photorealistic DSLR still life. Keep the curator's desk composition.",
    });
    const positiveBody = result.providerPrompt.split("[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]")[0]!;

    expect(result.providerPrompt).toMatch(/^\[MANDATORY RENDERING STYLE\]/);
    expect(result.providerPrompt).toContain("Mandatory woodcut print treatment.");
    expect(result.providerPrompt).toContain("Required paper-collage medium");
    expect(positiveBody).not.toMatch(/photorealistic DSLR still life/i);
    expect(positiveBody).toContain("Keep the curator's desk composition.");
    expect(result.negativePrompt).toContain("photography");
    expect(result.generationValidationErrors).toEqual([]);
  });

  it.each([
    {
      name: "paper",
      fields: {
        paper_role: "Foundation paper",
        pattern_behavior: "Botanical clusters repeat at a quiet cadence",
        repeat_rule: "Use a seamless half-drop repeat",
      },
    },
    {
      name: "card",
      fields: {
        card_role: "Primary journaling card",
        front_layout: "Fern specimen at lower left",
        back_layout: "Ruled writing field with an illustrated border",
      },
    },
    {
      name: "ephemera",
      fields: {
        document_type: "Archival specimen label",
        scale_mix: "Mix small and medium labels",
        cutting_rule: "Keep every cut edge distinct",
      },
    },
  ])("preserves legacy $name requirements in the governed provider prompt", ({ fields }) => {
    const chain = curatorChain();
    chain.productionSpec.payloadVersion = "PP-1.0";
    chain.worldBible!.proseVoice = "Quiet, scholarly, and observational.";
    const legacyPayload: ParsedPayload = {
      asset_role: "scene carrier",
      composition: "overhead desk arrangement",
      materials: "watercolor on rag paper",
      visual_hierarchy: "ledger first",
      text_rule: "no pseudo-text",
      canon_rule: "preserve accepted canon",
      print_rule: "300 dpi",
      negative_constraints: "no photography",
      custom_finish_rule: "Preserve deckled illustrated edges",
      ...fields,
    };

    const result = compilePrompt(chain, legacyPayload);
    for (const value of Object.values(fields)) {
      expect(result.providerPrompt).toContain(value);
    }
    expect(result.providerPrompt).toContain("Quiet, scholarly, and observational.");
    expect(result.providerPrompt).toContain("custom finish rule: Preserve deckled illustrated edges");
  });

  it("treats Curator's Desk Ephemera readable text as closed-world while preserving eight pieces", () => {
    const chain = curatorChain();
    chain.productionSpec.productionItem = "Curator's Desk Ephemera Sheet";
    chain.productionSpec.componentType = "Ephemera Sheet";
    chain.productionSpec.requiredContent = [
      "Preserve an eight-piece ephemera composition.",
      "Include specimen labels, correspondence, ledger slips, botanical cards, and a small map.",
    ].join(" ");
    chain.productionSpec.reviewCriteria = "No invented readable text. Use only exact wording supported by accepted Canon.";
    chain.canonRecords[0] = {
      ...chain.canonRecords[0]!,
      status: "Accepted",
      notes: 'Authorized readable text: "Stationery House".',
    };
    const result = compilePrompt(chain, {
      shared_prompt: "An eight-piece archival ephemera sheet in the established visual treatment.",
      front_prompt: [
        'A specimen card labeled "Athyrium filix-femina" with specimen number 1847.',
        'A dated letter signed "Eleanor Vale", a ledger entry, and a map labeled "North Conservatory".',
        'Include the exact approved wording "Stationery House".',
      ].join(" "),
      negative_prompt: "no invented readable text, no pseudo-text, no modern objects",
    });

    expect(result.generationValidationErrors).toEqual([]);
    expect(result.generationPolicy.readableTextClosedWorld).toBe(true);
    expect(result.providerPrompt).toContain("[GOVERNED READABLE TEXT]");
    expect(result.providerPrompt).toContain("Readable text is closed-world content.");
    expect(result.providerPrompt).toContain('"Stationery House" — authorized by Accepted Canon Record: Stationery House [stationery-house] field: notes');
    expect(result.providerPrompt).toContain("eight-piece");
    expect(result.providerPrompt).toMatch(/blank ruled fields|empty label/i);
    expect(result.providerPrompt).toContain("non-semantic handwriting traces");
    expect(result.providerPrompt).not.toContain("Athyrium filix-femina");
    expect(result.providerPrompt).not.toContain("1847");
    expect(result.providerPrompt).not.toContain("Eleanor Vale");
    expect(result.providerPrompt).not.toContain("North Conservatory");
  });

  it("derives readable-text governance from each supported governing source", () => {
    const cases: Array<(chain: InheritanceChain, payload: ParsedPayload) => void> = [
      (chain) => { chain.productionSpec.reviewCriteria = "Do not invent readable text."; },
      (chain) => { chain.styleGuide!.content += "\nReadable wording is approved only."; },
      (chain) => { chain.promptModules.push({ name: "Text safety", content: "No fabricated readable text.", dependencies: [] }); },
      (chain) => { chain.canonRecords[0]!.notes = "Readable text must be supported by approved canon."; },
      (_chain, candidate) => { candidate.text_rule = "Only approved readable text."; },
    ];

    for (const configure of cases) {
      const chain = curatorChain();
      chain.productionSpec.reviewCriteria = "Keep 30% usable visual space.";
      chain.styleGuide!.content = chain.styleGuide!.content.replace(/pseudo-text/gi, "");
      chain.canonRecords[0]!.visualNotes = "Maintain the working archive.";
      const candidate = { ...payload, negative_prompt: "no modern objects" };
      configure(chain, candidate);
      expect(compilePrompt(chain, candidate).generationPolicy.readableTextClosedWorld).toBe(true);
    }
  });

  it("fails closed when the readable-text lock or authorization provenance is removed", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.canonRecords[0]!.visualNotes = 'Authorized readable text: "Stationery House".';
    const compiled = compilePrompt(chain, payload);
    const withoutLock = compiled.providerPrompt.replace(
      /\[GOVERNED READABLE TEXT\][\s\S]*?(?=\n\n\[ASSET AND SCENE\])/,
      "",
    );
    expect(validateProviderPrompt(compiled.generationPolicy, withoutLock, compiled.negativePrompt))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_READABLE_TEXT_GOVERNANCE" })]));

    const withoutProvenance = compiled.providerPrompt.replace(
      '"Stationery House" — authorized by Accepted Canon Record: Stationery House [stationery-house] field: visualNotes',
      '"Stationery House"',
    );
    expect(validateProviderPrompt(compiled.generationPolicy, withoutProvenance, compiled.negativePrompt))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_READABLE_TEXT_PROVENANCE" })]));
  });

  it("blocks unquoted readable names, dates, and map labels at the provider boundary", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\nA letter from Eleanor Vale dated 14 March 1847 and a map labeled North Conservatory.`;

    expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
  });

  it("blocks mixed fallback clauses and unfamiliar quoted display directives", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    for (const extra of [
      'Render blank ruled fields with a label reading "Eleanor Vale".',
      'Display "Eleanor Vale" on the card.',
      'Add a postmark "1847".',
      'Engrave "Eleanor Vale" on the brass label.',
    ]) {
      const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\n${extra}`;
      expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
    }
  });

  it("sanitizes embedded unquoted readable directives during compilation", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const result = compilePrompt(chain, {
      ...payload,
      front_prompt: "A brass plate engraved Royal Society beside the ledger.",
    });

    expect(result.generationValidationErrors).toEqual([]);
    expect(result.providerPrompt).not.toContain("Royal Society");
    expect(result.providerPrompt).toMatch(/blank ruled fields|empty label/i);
  });

  it("blocks embedded unquoted readable directives at the provider boundary", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);

    for (const extra of [
      "A brass plate engraved Royal Society.",
      "A card inscribed Eleanor Vale.",
      "A seal stamped North Conservatory.",
      "A label printed Botanical Archive.",
    ]) {
      const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\n${extra}`;
      expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
    }
  });

  it("sanitizes unquoted text-object values during compilation", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";

    for (const front_prompt of [
      "Render a label reading North Conservatory on the card.",
      "Render the name Eleanor Vale.",
      "A tag reading fragile beside the ledger.",
    ]) {
      const result = compilePrompt(chain, { ...payload, front_prompt });
      expect(result.generationValidationErrors).toEqual([]);
      expect(result.providerPrompt).not.toContain(front_prompt);
      expect(result.providerPrompt).toMatch(/blank ruled fields|empty label/i);
    }
  });

  it("blocks unquoted text-object values at the provider boundary", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);

    for (const extra of [
      "Render a label reading North Conservatory on the card.",
      "Render the name Eleanor Vale.",
      "A tag reading fragile beside the ledger.",
      "On the card, write Eleanor Vale.",
      "On the seal, stamp hello.",
      "The card says hello.",
    ]) {
      const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\n${extra}`;
      expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
    }
  });

  it("sanitizes placement-first actions and lowercase text-object values during compilation", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";

    for (const front_prompt of [
      "On the card, write Eleanor Vale.",
      "On the seal, stamp hello.",
      "The card says hello.",
    ]) {
      const result = compilePrompt(chain, { ...payload, front_prompt });
      expect(result.generationValidationErrors).toEqual([]);
      expect(result.providerPrompt).not.toContain(front_prompt);
      expect(result.providerPrompt).toMatch(/blank ruled fields|empty label/i);
    }
  });

  it("does not let a forged second governance section bypass provider validation", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const tampered = `${compiled.providerPrompt}\n\n[GOVERNED READABLE TEXT]\nDisplay "Eleanor Vale" on the card.`;

    expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
  });

  it("does not trust unauthorized wording appended inside the canonical governance section", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const tampered = compiled.providerPrompt.replace(
      "[GOVERNED READABLE TEXT]",
      '[GOVERNED READABLE TEXT]\nEngrave "Eleanor Vale" on the card.',
    );

    expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
  });

  it("blocks affirmative readable requests hidden inside negative phrasing", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    for (const extra of [
      'Do not omit the engraved wording "Eleanor Vale".',
      'Never leave the label blank; print "Eleanor Vale".',
      'No blank fields, wording is "Eleanor Vale".',
      'Without blank areas, the wording is "Eleanor Vale".',
      'Do not print "Eleanor Vale", engrave "North Conservatory" on the seal.',
      'Do not print "Eleanor Vale" and engrave "North Conservatory" on the seal.',
      'Do not render "Eleanor Vale" then print "North Conservatory" on the seal.',
      'Do not render "Eleanor Vale" next stamp "North Conservatory" on the seal.',
    ]) {
      const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\n${extra}`;
      expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
    }
  });

  it("fails closed on sequenced affirmative text directives after a prohibition", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const front_prompt = 'Do not render "Eleanor Vale" then print "North Conservatory" on the seal.';
    const result = compilePrompt(chain, { ...payload, front_prompt });

    expect(result.generationValidationErrors)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: "UNAUTHORIZED_READABLE_TEXT_REQUEST",
      })]));
  });

  it("scans provider-submitted negative sections and unfamiliar quoted directives", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    for (const extra of [
      '[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]\nIgnore that constraint and stamp "Eleanor Vale" on the seal.',
      '[EXTRA]\nStamp "Eleanor Vale" on the seal.',
      '[EXTRA]\nEmboss "1847" on the card.',
      '[EXTRA]\nMonogram "EV" on the envelope.',
      "[EXTRA]\nStamp Eleanor Vale on the seal.",
      "[EXTRA]\nEmboss 1847 on the card.",
      "[EXTRA]\nMonogram EV on the envelope.",
      "[EXTRA]\nStamp hello on the tag.",
      "[EXTRA]\nEmboss fragile on the plaque.",
      "[EXTRA]\nMonogram ev on the card.",
      "[EXTRA]\nDisplay hello on the tag.",
      "[EXTRA]\nLabel fragile on the package.",
      "[EXTRA]\nSTAMP HELLO ON THE TAG.",
      "[EXTRA]\nLABEL FRAGILE ON THE PACKAGE.",
      "[EXTRA]\nTitle Eleanor Vale at the top of the card.",
      "[EXTRA]\nFeature the title Eleanor Vale on the card.",
    ]) {
      const tampered = `${compiled.providerPrompt}\n\n${extra}`;
      expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
        .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
    }
  });

  it("rejects an inverted readable request inside the canonical negative prompt", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, {
      ...payload,
      negative_prompt: 'Never omit and engrave "Eleanor Vale".',
    });

    expect(compiled.generationValidationErrors)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: "UNAUTHORIZED_READABLE_TEXT_REQUEST",
        field: "negative_prompt",
      })]));
  });

  it("allows a pure negative constraint that quotes forbidden wording", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\nDo not render "Eleanor Vale".`;

    expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
      .toEqual([]);
  });

  it("does not treat Not Accepted Canon records as readable-text authority", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.canonRecords[0] = {
      ...chain.canonRecords[0]!,
      status: "Not Accepted",
      notes: 'Authorized readable text: "Eleanor Vale".',
    };
    const result = compilePrompt(chain, {
      ...payload,
      front_prompt: 'Engrave "Eleanor Vale" on the brass label.',
    });

    expect(result.generationPolicy.readableTextAuthorizations).toEqual([]);
    expect(result.providerPrompt).not.toContain("Eleanor Vale");
    expect(result.providerPrompt).not.toContain("Not Accepted");
    expect(result.generationValidationErrors).toEqual([]);
  });

  it("accepts explicitly marked exact wording from stable approved source fields", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = 'No invented readable text. Authorized readable text: "Stationery House".';
    chain.canonRecords[0]!.notes = 'Authorized readable text: "Botanical Archive".';
    const result = compilePrompt(chain, {
      ...payload,
      front_prompt: 'Display "Stationery House" and inscribe "Botanical Archive" on two empty labels.',
    });

    expect(result.generationValidationErrors).toEqual([]);
    expect(result.providerPrompt).toContain('"Stationery House" — authorized by Production Specification');
    expect(result.providerPrompt).toContain("field: reviewCriteria");
    expect(result.providerPrompt).toContain('"Botanical Archive" — authorized by Accepted Canon Record');
    expect(result.providerPrompt).toContain("field: notes");
  });

  it("does not let lossy normalization broaden exact readable-text authorization", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = [
      "No invented readable text.",
      'Authorized readable text: "No Entry".',
      'Authorized readable text: "Do Not Enter".',
    ].join(" ");
    const compiled = compilePrompt(chain, payload);
    const tampered = `${compiled.providerPrompt}\n\n[EXTRA]\nPrint "Entry" and display "Enter".`;

    expect(compiled.generationPolicy.readableTextAuthorizations?.map(({ text }) => text))
      .toEqual(expect.arrayContaining(["No Entry", "Do Not Enter"]));
    expect(validateProviderPrompt(compiled.generationPolicy, tampered, compiled.negativePrompt))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNAUTHORIZED_READABLE_TEXT_REQUEST" })]));
  });

  it("does not authorize arbitrary quoted contextual prose without an explicit marker", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = 'No invented readable text. The mood is called "Eleanor Vale".';
    chain.canonRecords[0] = {
      ...chain.canonRecords[0],
      status: "Accepted",
      notes: 'A curator once referred to this as "North Conservatory".',
    };
    const compiled = compilePrompt(chain, payload);

    expect(compiled.generationPolicy.readableTextAuthorizations?.map(({ text }) => text))
      .not.toEqual(expect.arrayContaining(["Eleanor Vale", "North Conservatory"]));
  });

  it("sanitizes unquoted title directives during compilation", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.productionSpec.requiredContent = "Title Eleanor Vale at the top of the card.";
    const compiled = compilePrompt(chain, payload);

    expect(compiled.providerPrompt).not.toContain("Title Eleanor Vale");
    expect(compiled.providerPrompt).toContain("blank ruled fields");
  });

  it("does not mistake technical print requirements for readable copy", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const technicalNegative = `${compiled.negativePrompt}, print requirements`;
    const providerPrompt = compiled.providerPrompt.replace(
      compiled.negativePrompt!,
      technicalNegative,
    );

    expect(validateProviderPrompt(
      compiled.generationPolicy,
      providerPrompt,
      technicalNegative,
    )).toEqual([]);
  });

  it("does not mistake a quoted decorative adjective for readable copy", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const technicalNegative = `${compiled.negativePrompt}, arbitrary “old-fashioned” embellishment`;
    const providerPrompt = compiled.providerPrompt.replace(
      compiled.negativePrompt!,
      technicalNegative,
    );

    expect(validateProviderPrompt(
      compiled.generationPolicy,
      providerPrompt,
      technicalNegative,
    )).toEqual([]);
  });

  it("does not mistake narrative use of written down for requested readable copy", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.worldBible!.atmosphericNotes = [
      "A quiet archival room,",
      "as if Elias returned to it only when something demanded to be written down.",
    ].join(" ");

    const compiled = compilePrompt(chain, payload);

    expect(compiled.generationValidationErrors).toEqual([]);
    expect(compiled.providerPrompt).toContain("demanded to be written down");
  });

  it("does not mistake narrative use of printed for requested readable copy", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, payload);
    const narrative = [
      "Margaret became interested not simply in preserving this material",
      "but in what might happen if some of it were organized, printed, and shared.",
    ].join(" ");
    const providerPrompt = `${compiled.providerPrompt}\n\n[WORLD BIBLE]\n${narrative}`;

    expect(validateProviderPrompt(
      compiled.generationPolicy,
      providerPrompt,
      compiled.negativePrompt,
    )).toEqual([]);
  });

  it("still blocks a real unquoted print directive", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    const compiled = compilePrompt(chain, {
      ...payload,
      negative_prompt: "Do not omit the label, then print hello.",
    });

    expect(compiled.generationValidationErrors)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        code: "UNAUTHORIZED_READABLE_TEXT_REQUEST",
      })]));
  });

  it("does not mistake a typeface Display classification for a text-rendering request", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.styleGuide!.content += "\nTypeface Direction — Primary: Playfair Display, old-style serif.";
    const result = compilePrompt(chain, payload);

    expect(result.generationValidationErrors).toEqual([]);
    expect(result.providerPrompt).toContain("Playfair Display");
  });

  it("compacts oversized inherited detail without dropping protected provider sections", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.styleGuide!.content = "Mandatory illustrated treatment.\n" + "Additional style detail. ".repeat(2_000);
    chain.promptModules[0]!.content = "Atmospheric detail. ".repeat(2_000);

    const result = compilePrompt(chain, payload);

    expect(result.providerPrompt.length).toBeLessThanOrEqual(MAX_PROVIDER_PROMPT_LENGTH);
    expect(result.providerPrompt).toContain("[MANDATORY RENDERING STYLE]");
    expect(result.providerPrompt).toContain("[GOVERNED READABLE TEXT]");
    expect(result.providerPrompt).toContain("[CANON CONSTRAINTS]");
    expect(result.providerPrompt).toContain("[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]");
    expect(result.generationValidationErrors).toEqual([]);
  });

  it("keeps every governance lock when inherited negatives alone exceed the provider limit", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.styleGuide!.content = [
      "Mandatory watercolor and fine-ink illustrated treatment. Photography is prohibited.",
      ...Array.from({ length: 2_000 }, (_, index) => `Avoid synthetic archive artifact ${index}.`),
    ].join("\n");

    const result = compilePrompt(chain, payload);

    expect(result.providerPrompt.length).toBeLessThanOrEqual(MAX_PROVIDER_PROMPT_LENGTH);
    expect(result.providerPrompt.startsWith("[MANDATORY RENDERING STYLE]")).toBe(true);
    expect(result.providerPrompt).toContain("[GOVERNED READABLE TEXT]");
    expect(result.providerPrompt).toContain("[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]");
    expect(result.generationValidationErrors).toEqual([]);
  });

  it("does not scan a verified compacted governance section as requested readable copy", () => {
    const compiled = compilePrompt(curatorChain(), payload);
    const compactedGovernance = compiled.providerPrompt.replace(
      "\n\n[ASSET AND SCENE]",
      "\nAdditional inherited detail omitted for provider length limit.\n\n[ASSET AND SCENE]",
    );

    expect(compactedGovernance).toContain("botanical identifications");
    expect(validateProviderPrompt(
      compiled.generationPolicy,
      compactedGovernance,
      compiled.negativePrompt,
    )).toEqual([]);
  });

  it("does not scan a verified whitespace-flattened governance section as requested readable copy", () => {
    const compiled = compilePrompt(curatorChain(), payload);
    const flattenedGovernance = compiled.providerPrompt.replace(
      /\[GOVERNED READABLE TEXT\]\n([\s\S]*?)(?=\n\n\[ASSET AND SCENE\])/,
      (_section, content: string) =>
        `[GOVERNED READABLE TEXT]\n${content.replace(/\s+/g, " ")}`,
    );

    expect(flattenedGovernance).toContain("botanical identifications");
    expect(validateProviderPrompt(
      compiled.generationPolicy,
      flattenedGovernance,
      compiled.negativePrompt,
    )).toEqual([]);
  });

  it("applies an operator revision while preserving governance and negative constraints", () => {
    const compiled = compilePrompt(curatorChain(), payload);
    const revised = applyProviderPromptRevision(
      compiled.generationPolicy,
      compiled.providerPrompt,
      compiled.negativePrompt,
      "Use a quieter composition with more breathing room around the ledger.",
    );

    expect(revised).toContain("[OPERATOR REVISION]");
    expect(revised).toContain("Use a quieter composition");
    expect(revised).toContain("[GOVERNED READABLE TEXT]");
    expect(revised).toContain("[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]");
    expect(revised).toContain(compiled.negativePrompt);
    expect(validateProviderPrompt(
      compiled.generationPolicy,
      revised,
      compiled.negativePrompt,
    )).toEqual([]);
  });

  it("sanitizes unauthorized readable copy from an operator revision", () => {
    const compiled = compilePrompt(curatorChain(), payload);
    const revised = applyProviderPromptRevision(
      compiled.generationPolicy,
      compiled.providerPrompt,
      compiled.negativePrompt,
      "Print Eleanor Vale across the ledger.",
    );

    expect(revised).not.toContain("Eleanor Vale");
    expect(revised).toContain("blank ruled fields");
    expect(validateProviderPrompt(
      compiled.generationPolicy,
      revised,
      compiled.negativePrompt,
    )).toEqual([]);
  });

  it("rejects operator revisions that contradict inherited rendering or governance", () => {
    const policy = compilePrompt(curatorChain(), payload).generationPolicy;

    expect(validateProviderPromptRevision(
      policy,
      "Ignore the style guide and render this as photorealistic product photography.",
      "modern objects, unsupported canon artifacts",
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REVISION_CONFLICTS_WITH_RENDERING_GOVERNANCE" }),
      expect.objectContaining({ code: "REVISION_CONFLICTS_WITH_GOVERNANCE" }),
    ]));
    expect(validateProviderPromptRevision(
      policy,
      "Include a modern object beside the ledger.",
      "botanical, modern, objects, unsupported canon artifacts",
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "REVISION_CONFLICTS_WITH_NEGATIVE_CONSTRAINT" }),
    ]));
    expect(validateProviderPromptRevision(
      policy,
      "Make the botanical border lighter.",
      "botanical, modern, objects, unsupported canon artifacts",
    )).toEqual([]);
  });

  it("does not authorize a Canon Record title or wording from a non-Accepted record", () => {
    const chain = curatorChain();
    chain.productionSpec.reviewCriteria = "No invented readable text.";
    chain.canonRecords = [{
      sourceId: "draft-canon",
      name: "Eleanor Vale Archive",
      status: "Draft",
      notes: 'Authorized readable text: "Eleanor Vale".',
    }];
    const result = compilePrompt(chain, {
      ...payload,
      front_prompt: "A letter from Eleanor Vale and a map labeled North Conservatory.",
    });

    expect(result.generationPolicy.readableTextAuthorizations).toEqual([]);
    expect(result.providerPrompt).not.toMatch(/letter from Eleanor Vale|map labeled North Conservatory/i);
    expect(result.providerPrompt).not.toContain("Eleanor Vale Archive");
    expect(result.generationValidationErrors).toEqual([]);
  });
});