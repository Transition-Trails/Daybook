import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { buildProductionSpecPdf, type ProductionSpecPdfItem } from "../lib/worldsmith/production-spec-pdf";

const baseItem: ProductionSpecPdfItem = {
  productionItem: "Curator's Desk Hero Paper",
  specId: "WYC-HRP-002",
  componentType: "Hero Paper",
  status: "compiled",
  readinessScore: 100,
  designIntent: "An archival botanical composition.",
  narrativePurpose: "Establish the collection's visual language.",
  requiredContent: "Botanical specimen, ledger notes, and aged paper.",
  reviewCriteria: "Period appropriate, legible, and print safe.",
  canonDependency: "Supports Canon",
  orientation: "portrait",
  frontBackStyle: "front only",
  writingSpacePercent: 20,
};

describe("Production Spec PDF export", () => {
  it("includes specification, review-image, and final-artwork pages", async () => {
    const image = await sharp({
      create: { width: 80, height: 100, channels: 3, background: "#d9cfbb" },
    }).png().toBuffer();
    const bytes = await buildProductionSpecPdf({
      collectionName: "Victorian Garden Journals",
      volumeName: "Curator's Desk",
      worldName: "Wychcombe",
      items: [{ ...baseItem, reviewImage: image, finalArtwork: image }],
    });
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(5);
    expect(document.getTitle()).toContain("Victorian Garden Journals");
  });

  it("keeps the export downloadable when either image is unavailable", async () => {
    const bytes = await buildProductionSpecPdf({
      collectionName: "Victorian Garden Journals",
      items: [{ ...baseItem, reviewImage: null, finalArtwork: null }],
    });
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(5);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("paginates long specification prose instead of clipping it", async () => {
    const bytes = await buildProductionSpecPdf({
      collectionName: "Victorian Garden Journals",
      items: [{
        ...baseItem,
        designIntent: Array.from({ length: 350 }, () => "layered archival botanical detail").join(" "),
      }],
    });
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBeGreaterThan(5);
  });

  it("adds one summary page for a seven-spec production collection", async () => {
    const reviewImage = await sharp({
      create: { width: 80, height: 100, channels: 3, background: "#d9cfbb" },
    }).png().toBuffer();
    const bytes = await buildProductionSpecPdf({
      collectionName: "Victorian Garden Journals",
      volumeName: "Curator's Desk",
      items: Array.from({ length: 7 }, (_, index) => ({
        ...baseItem,
        specId: `WYC-${String(index + 1).padStart(3, "0")}`,
        productionItem: `Production specification ${index + 1}`,
        compiled: true,
        reviewImage,
        finalArtwork: null,
      })),
    });
    const document = await PDFDocument.load(bytes);

    expect(document.getPageCount()).toBe(23);
  });
});