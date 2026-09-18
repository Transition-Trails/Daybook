import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 52;
const INK = rgb(0.106, 0.165, 0.29);
const CLAY = rgb(0.784, 0.459, 0.376);
const MUTED = rgb(0.4, 0.44, 0.5);
const PAPER = rgb(0.98, 0.965, 0.94);

export interface ProductionSpecPdfItem {
  productionItem: string;
  specId?: string | null;
  componentType?: string | null;
  status: string;
  readinessScore: number;
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  reviewCriteria: string;
  canonDependency: string;
  orientation?: string | null;
  frontBackStyle?: string | null;
  writingSpacePercent?: number | null;
  reviewImage?: Buffer | null;
  finalArtwork?: Buffer | null;
}

export interface ProductionSpecPdfOptions {
  collectionName: string;
  volumeName?: string | null;
  worldName?: string | null;
  items: ProductionSpecPdfItem[];
}

function pdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfText(text).split(/\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawHeader(page: PDFPage, title: string, subtitle: string, bold: PDFFont, regular: PDFFont) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 92, width: PAGE_WIDTH, height: 92, color: INK });
  page.drawText(pdfText(title), { x: MARGIN, y: PAGE_HEIGHT - 52, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText(pdfText(subtitle), { x: MARGIN, y: PAGE_HEIGHT - 72, size: 9, font: regular, color: rgb(0.82, 0.84, 0.88) });
}

function drawPageNumber(page: PDFPage, pageNumber: number, regular: PDFFont) {
  page.drawText(String(pageNumber), {
    x: PAGE_WIDTH - MARGIN,
    y: 24,
    size: 8,
    font: regular,
    color: MUTED,
  });
}

async function addImagePage(
  doc: PDFDocument,
  title: string,
  subtitle: string,
  imageBuffer: Buffer | null | undefined,
  bold: PDFFont,
  regular: PDFFont,
) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawHeader(page, title, subtitle, bold, regular);
  if (!imageBuffer) {
    page.drawRectangle({
      x: MARGIN,
      y: 190,
      width: PAGE_WIDTH - MARGIN * 2,
      height: 390,
      color: PAPER,
      borderColor: rgb(0.86, 0.83, 0.78),
      borderWidth: 1,
    });
    page.drawText("No image is available for this section.", {
      x: MARGIN + 86,
      y: 380,
      size: 13,
      font: regular,
      color: MUTED,
    });
    return;
  }

  const normalized = await sharp(imageBuffer)
    .rotate()
    .resize({ width: 1800, height: 2200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  const image = await doc.embedJpg(normalized);
  const bounds = { width: PAGE_WIDTH - MARGIN * 2, height: PAGE_HEIGHT - 150 };
  const scale = Math.min(bounds.width / image.width, bounds.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: (PAGE_WIDTH - width) / 2,
    y: 36 + (bounds.height - height) / 2,
    width,
    height,
  });
}

function addSpecificationPages(
  doc: PDFDocument,
  item: ProductionSpecPdfItem,
  itemIndex: number,
  totalItems: number,
  bold: PDFFont,
  regular: PDFFont,
) {
  const fields: Array<[string, string]> = [
    ["Component type", item.componentType || "Not selected"],
    ["Status", item.status],
    ["Readiness", `${item.readinessScore}%`],
    ["Orientation", item.orientation || "Not specified"],
    ["Front / back style", item.frontBackStyle || "Not specified"],
    ["Writing space", item.writingSpacePercent == null ? "Not specified" : `${item.writingSpacePercent}%`],
    ["Canon dependency", item.canonDependency || "None"],
    ["Design intent", item.designIntent || "Not provided"],
    ["Narrative purpose", item.narrativePurpose || "Not provided"],
    ["Required content", item.requiredContent || "Not provided"],
    ["Review criteria", item.reviewCriteria || "Not provided"],
  ];
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let continuation = 0;
  const resetPage = () => {
    drawHeader(
      page,
      item.productionItem,
      `${item.specId || "Unnumbered spec"} | Specification ${itemIndex + 1} of ${totalItems}${continuation ? " | Continued" : ""}`,
      bold,
      regular,
    );
    return PAGE_HEIGHT - 126;
  };
  let y = resetPage();

  for (const [label, value] of fields) {
    const lines = wrapText(value, regular, 10, PAGE_WIDTH - MARGIN * 2);
    const requiredHeight = 24 + Math.max(1, lines.length) * 14;
    if (y - requiredHeight < 46) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      continuation += 1;
      y = resetPage();
    }
    page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 8, font: bold, color: CLAY });
    y -= 16;
    for (const line of lines) {
      page.drawText(line || " ", { x: MARGIN, y, size: 10, font: regular, color: INK });
      y -= 14;
    }
    y -= 12;
  }
}

export async function buildProductionSpecPdf(options: ProductionSpecPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(`${options.collectionName}${options.volumeName ? ` - ${options.volumeName}` : ""} Production Specifications`);
  doc.setAuthor("Daybook Studio");
  doc.setSubject("WorldSmith Production Specifications");

  const cover = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: PAPER });
  cover.drawRectangle({ x: 0, y: PAGE_HEIGHT - 220, width: PAGE_WIDTH, height: 220, color: INK });
  cover.drawText("WORLDSMITH", { x: MARGIN, y: PAGE_HEIGHT - 74, size: 11, font: bold, color: CLAY });
  cover.drawText("Production Specifications", { x: MARGIN, y: PAGE_HEIGHT - 120, size: 27, font: bold, color: rgb(1, 1, 1) });
  cover.drawText(pdfText(options.collectionName), { x: MARGIN, y: PAGE_HEIGHT - 158, size: 17, font: regular, color: rgb(0.9, 0.91, 0.93) });
  if (options.volumeName) {
    cover.drawText(pdfText(options.volumeName), { x: MARGIN, y: PAGE_HEIGHT - 184, size: 13, font: regular, color: rgb(0.78, 0.8, 0.84) });
  }
  const coverLines = [
    options.worldName ? `World: ${options.worldName}` : null,
    `Scope: ${options.volumeName ? "Volume" : "Entire collection"}`,
    `Production specifications: ${options.items.length}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "Includes specification details, latest review images, and current final artwork.",
  ].filter((line): line is string => Boolean(line));
  let coverY = PAGE_HEIGHT - 292;
  for (const line of coverLines) {
    cover.drawText(pdfText(line), { x: MARGIN, y: coverY, size: 12, font: regular, color: INK });
    coverY -= 28;
  }

  for (let index = 0; index < options.items.length; index++) {
    const item = options.items[index]!;
    addSpecificationPages(doc, item, index, options.items.length, bold, regular);
    await addImagePage(doc, `${item.productionItem} - Review Image`, item.specId || "Production Spec review", item.reviewImage, bold, regular);
    await addImagePage(doc, `${item.productionItem} - Final Artwork`, item.specId || "Current production artwork", item.finalArtwork, bold, regular);
  }

  doc.getPages().forEach((page, index) => drawPageNumber(page, index + 1, regular));
  return doc.save();
}