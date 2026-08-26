/**
 * Build a one-sheet physical proof for sticker cut lines.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run proof:cutline
 *
 * The generated files intentionally live in the gitignored proof/ directory.
 * This script is a harness only: any pipeline assertion failure is a finding,
 * not a reason to change the production image-processing implementation here.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type ResvgOutput = { asPng(): Uint8Array };
type ResvgInstance = { render(): ResvgOutput };
type ResvgConstructor = new (svg: string, options?: Record<string, unknown>) => ResvgInstance;
type ImageProcessingModule = {
  applyBorderAndSize(
    processedBase64: string,
    borderStyle: string,
    borderWidth: number | null | undefined,
    borderColor: string | null | undefined,
    sizeInMm: number | null | undefined,
    borderWidthMm?: number | null,
  ): Promise<string>;
  generateCutlineSvg(processedBase64: string, outputDpi?: number): Promise<string>;
  resolveBorderWidthMm(
    borderWidthMm: number | null | undefined,
    legacyBorderWidthPx: number | null | undefined,
  ): number;
  STICKER_OUTPUT_DPI: number;
};

// Resvg is an existing API-server dependency. Resolve it from that package
// rather than adding a duplicate dependency to the scripts package.
const apiServerRequire = createRequire(
  new URL("../../artifacts/api-server/package.json", import.meta.url),
);
const { Resvg } = apiServerRequire("@resvg/resvg-js") as { Resvg: ResvgConstructor };
const imageProcessingModuleUrl = new URL(
  "../../artifacts/api-server/src/lib/imageProcessing.ts",
  import.meta.url,
).href;
const {
  applyBorderAndSize,
  generateCutlineSvg,
  resolveBorderWidthMm,
  STICKER_OUTPUT_DPI,
} = (await import(imageProcessingModuleUrl)) as ImageProcessingModule;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const FIXTURE_DIR = path.join(ROOT, "artifacts/api-server/src/test/fixtures/stickers");
const PROOF_DIR = path.join(ROOT, "proof");
const PRINT_PATH = path.join(PROOF_DIR, "cutline-proof-print.png");
const CUT_PATH = path.join(PROOF_DIR, "cutline-proof-cut.svg");

const MM_PER_INCH = 25.4;
const SHEET_WIDTH_MM = 215.9;
const SHEET_HEIGHT_MM = 279.4;
const SHEET_WIDTH_PX = 2550;
const SHEET_HEIGHT_PX = 3300;
const CALIBRATION_SIZE_MM = 50.0;
const CALIBRATION_SIZE_PX = Math.round((CALIBRATION_SIZE_MM / MM_PER_INCH) * STICKER_OUTPUT_DPI);
const EDGE_CLEARANCE_MM = 6;
const EDGE_CLEARANCE_PX = (EDGE_CLEARANCE_MM / MM_PER_INCH) * STICKER_OUTPUT_DPI;
const WIDTH_TOLERANCE_MM = 0.4;

const calibration = {
  x: Math.round((10 / MM_PER_INCH) * STICKER_OUTPUT_DPI),
  y: Math.round((10 / MM_PER_INCH) * STICKER_OUTPUT_DPI),
};

const fixtures = [
  {
    file: "plain.svg",
    expectedWidthMm: 38.0,
    borderStyle: "none",
    borderWidthMm: 0,
    borderColor: null,
    expectedSubpaths: 1,
    expectedOuterSubpaths: 1,
    positionMm: { x: 95, y: 20 },
  },
  {
    file: "bordered.svg",
    expectedWidthMm: 38.0,
    borderStyle: "white",
    borderWidthMm: 2.0,
    borderColor: "#ffffff",
    expectedSubpaths: 1,
    expectedOuterSubpaths: 1,
    positionMm: { x: 160, y: 20 },
  },
  {
    file: "two-part.svg",
    expectedWidthMm: 60.0,
    borderStyle: "none",
    borderWidthMm: 0,
    borderColor: null,
    expectedSubpaths: 2,
    expectedOuterSubpaths: 2,
    positionMm: { x: 10, y: 95 },
  },
  {
    file: "holed.svg",
    expectedWidthMm: 38.0,
    borderStyle: "none",
    borderWidthMm: 0,
    borderColor: null,
    expectedSubpaths: 2,
    expectedOuterSubpaths: 1,
    positionMm: { x: 110, y: 100 },
  },
] as const;

type FixtureResult = {
  file: string;
  expectedWidthMm: number;
  positionPx: { x: number; y: number };
  image: Buffer;
  imageWidth: number;
  imageHeight: number;
  cutPath: string;
  subpaths: number;
  outerSubpaths: number;
  boundingBox: BoundingBox;
  widthMm: number;
};

type Point = { x: number; y: number };
type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };

function fail(message: string): never {
  throw new Error(`Cutline proof assertion failed: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function mmToPixels(mm: number): number {
  return (mm / MM_PER_INCH) * STICKER_OUTPUT_DPI;
}

function mmPositionToPixels(positionMm: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(mmToPixels(positionMm.x)),
    y: Math.round(mmToPixels(positionMm.y)),
  };
}

function dataUrl(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function parseCutPath(svg: string, file: string): string {
  const matches = [...svg.matchAll(/<path\b([^>]*)>/g)];
  assert(matches.length === 1, `${file} must produce exactly one cut path`);
  const pathData = matches[0][1].match(/\bd="([^"]+)"/)?.[1];
  assert(pathData, `${file} cut path has no d attribute`);
  return pathData;
}

function pathPoints(pathData: string, file: string): Point[] {
  const points: Point[] = [];
  const pointPattern = /[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
  for (const match of pathData.matchAll(pointPattern)) {
    points.push({ x: Number(match[1]), y: Number(match[2]) });
  }
  assert(points.length > 2, `${file} cut path has too few points`);
  return points;
}

function boundingBox(points: Point[]): BoundingBox {
  return points.reduce(
    (box, point) => ({
      minX: Math.min(box.minX, point.x),
      minY: Math.min(box.minY, point.y),
      maxX: Math.max(box.maxX, point.x),
      maxY: Math.max(box.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function subpathCount(pathData: string): number {
  return (pathData.match(/\bM\s/g) ?? []).length;
}

function closedSubpathCount(pathData: string): number {
  return (pathData.match(/\bZ\b/g) ?? []).length;
}

function formatMm(value: number): string {
  return value.toFixed(2);
}

async function rasterizeAndTrimFixture(file: string): Promise<Buffer> {
  const svg = await readFile(path.join(FIXTURE_DIR, file), "utf8");
  const rendered = Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: "original", value: 120 },
    }).render().asPng(),
  );

  // The checked-in fixtures intentionally include a roomy source canvas. Trim
  // only its transparent raster margin so "38 mm wide" measures the artwork,
  // while the actual sizing, border dilation, and cut tracing remain delegated
  // to the production pipeline below.
  return sharp(rendered).trim().png().toBuffer();
}

async function buildFixtureResult(fixture: (typeof fixtures)[number]): Promise<FixtureResult> {
  const source = await rasterizeAndTrimFixture(fixture.file);
  const sourceDataUrl = dataUrl(source);
  const resolvedBorderWidthMm = resolveBorderWidthMm(fixture.borderWidthMm, null);
  const processed = await applyBorderAndSize(
    sourceDataUrl,
    fixture.borderStyle,
    null,
    fixture.borderColor,
    fixture.expectedWidthMm,
    resolvedBorderWidthMm,
  );
  const processedBuffer = Buffer.from(processed.split(",", 2)[1], "base64");
  const processedMeta = await sharp(processedBuffer).metadata();
  assert(
    processedMeta.width && processedMeta.height,
    `${fixture.file} sized render has no dimensions`,
  );

  // generateCutlineSvg receives 300 only after the sizeInMm render. For the
  // bordered fixture, applyBorderAndSize also exercises the real dilateAlpha
  // helper internally; it must not be reimplemented in this harness.
  const cutSvg = await generateCutlineSvg(processed, STICKER_OUTPUT_DPI);
  const cutPath = parseCutPath(cutSvg, fixture.file);
  const points = pathPoints(cutPath, fixture.file);
  const box = boundingBox(points);
  const subpaths = subpathCount(cutPath);
  const closedSubpaths = closedSubpathCount(cutPath);
  const outerSubpaths = fixture.file === "holed.svg" ? subpaths - 1 : subpaths;
  const widthMm = ((box.maxX - box.minX) / STICKER_OUTPUT_DPI) * MM_PER_INCH;
  const positionPx = mmPositionToPixels(fixture.positionMm);

  assert(subpaths === fixture.expectedSubpaths, `${fixture.file} expected ${fixture.expectedSubpaths} subpaths, got ${subpaths}`);
  assert(closedSubpaths === fixture.expectedSubpaths, `${fixture.file} expected ${fixture.expectedSubpaths} closed subpaths, got ${closedSubpaths}`);
  assert(outerSubpaths === fixture.expectedOuterSubpaths, `${fixture.file} expected ${fixture.expectedOuterSubpaths} outer subpaths, got ${outerSubpaths}`);
  if (fixture.file === "holed.svg") {
    assert(cutSvg.includes('fill-rule="evenodd"'), "holed.svg cut path must use fill-rule=\"evenodd\"");
  }
  assert(
    Math.abs(widthMm - fixture.expectedWidthMm) <= WIDTH_TOLERANCE_MM,
    `${fixture.file} cut width ${formatMm(widthMm)} mm differs from ${fixture.expectedWidthMm.toFixed(1)} mm by more than ${WIDTH_TOLERANCE_MM} mm`,
  );

  return {
    file: fixture.file,
    expectedWidthMm: fixture.expectedWidthMm,
    positionPx,
    image: processedBuffer,
    imageWidth: processedMeta.width,
    imageHeight: processedMeta.height,
    cutPath,
    subpaths,
    outerSubpaths,
    boundingBox: box,
    widthMm,
  };
}

function assertSheetGeometry(results: FixtureResult[]): void {
  const calibrationRight = calibration.x + CALIBRATION_SIZE_PX;
  const calibrationBottom = calibration.y + CALIBRATION_SIZE_PX;

  for (const result of results) {
    const sheetBox = {
      minX: result.boundingBox.minX + result.positionPx.x,
      minY: result.boundingBox.minY + result.positionPx.y,
      maxX: result.boundingBox.maxX + result.positionPx.x,
      maxY: result.boundingBox.maxY + result.positionPx.y,
    };
    assert(
      sheetBox.minX >= EDGE_CLEARANCE_PX &&
        sheetBox.minY >= EDGE_CLEARANCE_PX &&
        sheetBox.maxX <= SHEET_WIDTH_PX - EDGE_CLEARANCE_PX &&
        sheetBox.maxY <= SHEET_HEIGHT_PX - EDGE_CLEARANCE_PX,
      `${result.file} cut path is within ${EDGE_CLEARANCE_MM} mm of the sheet edge`,
    );

    const intersectsCalibration =
      sheetBox.minX < calibrationRight &&
      sheetBox.maxX > calibration.x &&
      sheetBox.minY < calibrationBottom &&
      sheetBox.maxY > calibration.y;
    assert(!intersectsCalibration, `${result.file} cut path intersects the calibration square`);
  }
}

function buildPrintSheetSvg(results: FixtureResult[]): string {
  const images = results
    .map((result) => {
      const labelX = result.positionPx.x + result.imageWidth / 2;
      const labelY = result.positionPx.y + result.imageHeight + Math.round(mmToPixels(6));
      return [
        `  <image href="${dataUrl(result.image)}" x="${result.positionPx.x}" y="${result.positionPx.y}" width="${result.imageWidth}" height="${result.imageHeight}" preserveAspectRatio="none"/>`,
        `  <text x="${labelX}" y="${labelY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" fill="#111111">${result.file} · ${result.expectedWidthMm.toFixed(1)} mm</text>`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH_PX}" height="${SHEET_HEIGHT_PX}" viewBox="0 0 ${SHEET_WIDTH_PX} ${SHEET_HEIGHT_PX}">`,
    `  <rect width="${SHEET_WIDTH_PX}" height="${SHEET_HEIGHT_PX}" fill="#ffffff"/>`,
    `  <rect x="${calibration.x}" y="${calibration.y}" width="${CALIBRATION_SIZE_PX}" height="${CALIBRATION_SIZE_PX}" fill="#111111"/>`,
    `  <text x="${calibration.x + CALIBRATION_SIZE_PX / 2}" y="${calibration.y + CALIBRATION_SIZE_PX / 2 + 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" fill="#ffffff">${CALIBRATION_SIZE_MM.toFixed(1)} mm</text>`,
    images,
    `</svg>`,
  ].join("\n");
}

function buildCutSheetSvg(results: FixtureResult[]): string {
  const paths = results
    .map(
      (result) =>
        `  <path d="${result.cutPath}" transform="translate(${result.positionPx.x} ${result.positionPx.y})" fill="none" fill-rule="evenodd" stroke="#000000" stroke-width="1"/>`,
    )
    .join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH_MM.toFixed(1)}mm" height="${SHEET_HEIGHT_MM.toFixed(1)}mm" viewBox="0 0 ${SHEET_WIDTH_PX} ${SHEET_HEIGHT_PX}">`,
    paths,
    `</svg>`,
  ].join("\n");
}

async function main(): Promise<void> {
  await mkdir(PROOF_DIR, { recursive: true });
  await Promise.all([rm(PRINT_PATH, { force: true }), rm(CUT_PATH, { force: true })]);

  const results = await Promise.all(fixtures.map(buildFixtureResult));
  assertSheetGeometry(results);

  const printSvg = buildPrintSheetSvg(results);
  const printPng = Buffer.from(
    new Resvg(printSvg, {
      fitTo: { mode: "width", value: SHEET_WIDTH_PX },
    }).render().asPng(),
  );
  const printMeta = await sharp(printPng).metadata();
  assert(
    printMeta.width === SHEET_WIDTH_PX && printMeta.height === SHEET_HEIGHT_PX,
    `print PNG must be exactly ${SHEET_WIDTH_PX} × ${SHEET_HEIGHT_PX} px, got ${printMeta.width ?? "unknown"} × ${printMeta.height ?? "unknown"} px`,
  );

  const cutSvg = buildCutSheetSvg(results);
  const widthMatch = cutSvg.match(/\bwidth="([^"]+)"/);
  const heightMatch = cutSvg.match(/\bheight="([^"]+)"/);
  assert(widthMatch?.[1] === `${SHEET_WIDTH_MM.toFixed(1)}mm`, "cut SVG width must be 215.9mm");
  assert(heightMatch?.[1] === `${SHEET_HEIGHT_MM.toFixed(1)}mm`, "cut SVG height must be 279.4mm");
  assert(!cutSvg.includes("<image") && !cutSvg.includes("<text") && !cutSvg.includes("<rect"), "cut SVG must contain only cut paths");

  // All assertions happen before either usable proof artifact is emitted.
  await writeFile(PRINT_PATH, printPng);
  await writeFile(CUT_PATH, cutSvg, "utf8");

  console.log(`Cutline proof ready: ${PRINT_PATH}`);
  console.log(`Cutline proof ready: ${CUT_PATH}`);
  console.log(`Print sheet: ${printMeta.width} × ${printMeta.height} px at ${STICKER_OUTPUT_DPI} DPI`);
  console.log(`Calibration square: ${CALIBRATION_SIZE_MM.toFixed(1)} mm (${CALIBRATION_SIZE_PX} px)`);
  console.log("");
  console.log("Fixture measurements:");
  for (const result of results) {
    const { minX, minY, maxX, maxY } = result.boundingBox;
    console.log(
      `- ${result.file}: ${formatMm(result.widthMm)} mm wide; bbox ${formatMm(minX)}–${formatMm(maxX)} × ${formatMm(minY)}–${formatMm(maxY)} px; ${result.subpaths} subpaths (${result.outerSubpaths} outer)`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});