/**
 * Image processing for the sticker pipeline:
 *   removeBackground  — flood-fill corner-sampled background removal → transparent PNG
 *   applyBorderAndSize — add border stroke + resize to mm target
 *   generateCutlineSvg — Moore-neighborhood contour tracing → Cricut/Silhouette SVG path
 *
 * Real implementations using `sharp` only (no external API required).
 *
 * Flag: Background removal uses a colour-tolerance flood-fill from image corners.
 * This works well for solid/gradient backgrounds (typical sticker source art).
 * For complex photographic backgrounds, AI-based removal (e.g. remove.bg API) would
 * produce cleaner masks — swap removeBackground() to call that API when an API key is
 * available.
 */
import sharp, { type OutputInfo } from "sharp";
import { hexToRgba } from "./color";

/** A conservative cap for raw RGBA processing and flood-fill bookkeeping. */
export const MAX_DECODED_IMAGE_PIXELS = 24_000_000;

/**
 * Thrown when the source image has a user-fixable problem (corrupt bytes,
 * wrong MIME, no detectable background).  Routes should translate this → 400.
 */
export class UserImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserImageError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64ToBuffer(dataUrl: string): Buffer {
  const b64 = dataUrl.replace(/^data:image\/[a-z+]+;base64,/, "");
  return Buffer.from(b64, "base64");
}

function bufferToDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function colourDist(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number,
): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function assertDecodedPixelBudget(width: number | undefined, height: number | undefined): void {
  if (!width || !height || width < 1 || height < 1) {
    throw new UserImageError("Image could not be decoded — its dimensions are invalid.");
  }
  const pixels = width * height;
  if (pixels > MAX_DECODED_IMAGE_PIXELS) {
    throw new UserImageError(
      `Image dimensions are too large — maximum is ${MAX_DECODED_IMAGE_PIXELS.toLocaleString()} decoded pixels.`,
    );
  }
}

// ── Background removal ────────────────────────────────────────────────────────

/**
 * Removes the background of an image using a BFS flood-fill seeded from the
 * image edges. Pixels within `tolerance` Euclidean distance (0-441 max) of the
 * sampled background colour are made transparent.
 *
 * Returns a base64 PNG data-URL with an alpha channel.
 */
export async function removeBackground(
  imageBase64: string,
  tolerance = 35,
): Promise<string> {
  const input = b64ToBuffer(imageBase64);

  let width: number | undefined;
  let height: number | undefined;
  try {
    ({ width, height } = await sharp(input).metadata());
  } catch {
    throw new UserImageError(
      "Image could not be decoded — ensure you are sending a valid PNG, JPEG, or WebP.",
    );
  }
  assertDecodedPixelBudget(width, height);

  let data: Buffer;
  let info: OutputInfo;
  try {
    ({ data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new UserImageError(
      "Image could not be decoded — ensure you are sending a valid PNG, JPEG, or WebP.",
    );
  }

  const { width: decodedWidth, height: decodedHeight } = info;
  const px = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const total = decodedWidth * decodedHeight;

  // Sample background colour from the four corners (average)
  const cornerPixels = [
    0,
    decodedWidth - 1,
    (decodedHeight - 1) * decodedWidth,
    (decodedHeight - 1) * decodedWidth + decodedWidth - 1,
  ];
  let rSum = 0, gSum = 0, bSum = 0;
  for (const p of cornerPixels) {
    rSum += px[p * 4];
    gSum += px[p * 4 + 1];
    bSum += px[p * 4 + 2];
  }
  const bgR = Math.round(rSum / 4);
  const bgG = Math.round(gSum / 4);
  const bgB = Math.round(bSum / 4);

  const visited = new Uint8Array(total);
  const queue: number[] = [];

  // Seed: all edge pixels that are close to the sampled background colour
  const seedEdge = (p: number) => {
    if (visited[p]) return;
    if (colourDist(px[p * 4], px[p * 4 + 1], px[p * 4 + 2], bgR, bgG, bgB) < tolerance) {
      visited[p] = 1;
      queue.push(p);
    }
  };

  for (let x = 0; x < decodedWidth; x++) {
    seedEdge(x);
    seedEdge((decodedHeight - 1) * decodedWidth + x);
  }
  for (let y = 1; y < decodedHeight - 1; y++) {
    seedEdge(y * decodedWidth);
    seedEdge(y * decodedWidth + decodedWidth - 1);
  }

  // Guard: if no edge pixels matched the sampled background colour, there is
  // no detectable uniform background — fail fast with an actionable message.
  if (queue.length === 0) {
    throw new UserImageError(
      "Background could not be removed — the image does not appear to have a " +
        "uniform background colour. Use an image with a solid background " +
        "(white, cream, or a single consistent colour) around the subject.",
    );
  }

  // BFS
  let head = 0;
  while (head < queue.length) {
    const p = queue[head++];
    px[p * 4 + 3] = 0; // make transparent

    const x = p % decodedWidth;
    const y = Math.floor(p / decodedWidth);

    const neighbours = [
      y > 0 ? p - decodedWidth : -1,
      y < decodedHeight - 1 ? p + decodedWidth : -1,
      x > 0 ? p - 1 : -1,
      x < decodedWidth - 1 ? p + 1 : -1,
    ];

    for (const n of neighbours) {
      if (n < 0 || n >= total || visited[n]) continue;
      if (colourDist(px[n * 4], px[n * 4 + 1], px[n * 4 + 2], bgR, bgG, bgB) < tolerance) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }

  const out = await sharp(Buffer.from(px.buffer, px.byteOffset, px.byteLength), {
    raw: { width: decodedWidth, height: decodedHeight, channels: 4 },
  })
    .png()
    .toBuffer();

  return bufferToDataUrl(out);
}

// ── Border + size pipeline ────────────────────────────────────────────────────

/** Render at print-friendly resolution; SVG CSS dimensions preserve the requested physical size. */
export const STICKER_OUTPUT_DPI = 300;
const LEGACY_BORDER_DPI = 96;
const MM_PER_INCH = 25.4;

function mmToOutputPixels(mm: number): number {
  return Math.max(0, Math.round((mm / MM_PER_INCH) * STICKER_OUTPUT_DPI));
}

/**
 * Stored `border_width` predates physical sizing and is measured in 96-DPI
 * pixels. New rows use `border_width_mm`; retaining this conversion keeps an
 * older sticker's outline physically stable if it is ever reprocessed.
 */
export function resolveBorderWidthMm(
  borderWidthMm: number | null | undefined,
  legacyBorderWidthPx: number | null | undefined,
): number {
  if (borderWidthMm != null && borderWidthMm >= 0) return borderWidthMm;
  return Math.max(0, legacyBorderWidthPx ?? 2) * (MM_PER_INCH / LEGACY_BORDER_DPI);
}

/**
 * Square dilation through two sliding-window maximum passes. It is deliberately
 * implemented over raw alpha bytes rather than sharp.extractChannel("alpha"):
 * some sharp builds silently return zeroes for that channel.
 */
function dilateAlpha(alpha: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return Uint8Array.from(alpha);

  const expandedWidth = width + radius * 2;
  const expandedHeight = height + radius * 2;
  const padded = new Uint8Array(expandedWidth * expandedHeight);
  for (let y = 0; y < height; y++) {
    padded.set(alpha.subarray(y * width, (y + 1) * width), (y + radius) * expandedWidth + radius);
  }

  const horizontal = new Uint8Array(padded.length);
  const window = radius * 2 + 1;
  for (let y = 0; y < expandedHeight; y++) {
    const deque: number[] = [];
    const row = y * expandedWidth;
    for (let x = 0; x < expandedWidth; x++) {
      while (deque.length && deque[0] < x - window + 1) deque.shift();
      while (deque.length && padded[row + deque[deque.length - 1]] <= padded[row + x]) deque.pop();
      deque.push(x);
      horizontal[row + x] = padded[row + deque[0]];
    }
  }

  const out = new Uint8Array(padded.length);
  for (let x = 0; x < expandedWidth; x++) {
    const deque: number[] = [];
    for (let y = 0; y < expandedHeight; y++) {
      while (deque.length && deque[0] < y - window + 1) deque.shift();
      while (
        deque.length &&
        horizontal[deque[deque.length - 1] * expandedWidth + x] <= horizontal[y * expandedWidth + x]
      ) deque.pop();
      deque.push(y);
      out[y * expandedWidth + x] = horizontal[deque[0] * expandedWidth + x];
    }
  }

  return out;
}

/**
 * Applies an optional border and resizes the processed cutout.
 *
 * borderStyle: "none" | "thin" | "white"
 *   "thin"  → adds a 1-2 px black hairline around the cutout
 *   "white" → adds a white matte border (useful for stickers meant to be cut out)
 */
export async function applyBorderAndSize(
  processedBase64: string,
  borderStyle: string,
  borderWidth: number | null | undefined,
  borderColor: string | null | undefined,
  sizeInMm: number | null | undefined,
  borderWidthMm?: number | null,
): Promise<string> {
  const input = b64ToBuffer(processedBase64);
  const source = sharp(input).ensureAlpha();
  const meta = await source.metadata();
  const sourceWidth = meta.width ?? 512;
  const sourceHeight = meta.height ?? 512;
  const isBordered = borderStyle !== "none";
  const resolvedBorderMm = isBordered
    ? resolveBorderWidthMm(borderWidthMm, borderWidth)
    : 0;
  const borderPx = isBordered ? Math.max(1, mmToOutputPixels(resolvedBorderMm)) : 0;

  let targetWidth = sourceWidth;
  let targetHeight = sourceHeight;
  if (sizeInMm && sizeInMm > 0) {
    const targetLongEdge = mmToOutputPixels(sizeInMm);
    const interiorLongEdge = targetLongEdge - borderPx * 2;
    if (interiorLongEdge < 1) {
      throw new UserImageError("borderWidthMm is too large for the requested sticker size");
    }
    if (sourceWidth >= sourceHeight) {
      targetWidth = interiorLongEdge;
      targetHeight = Math.max(1, Math.round((sourceHeight / sourceWidth) * interiorLongEdge));
    } else {
      targetHeight = interiorLongEdge;
      targetWidth = Math.max(1, Math.round((sourceWidth / sourceHeight) * interiorLongEdge));
    }
  }

  // Materialize before resize. Keeping a lazy ensureAlpha → resize pipeline loses
  // alpha in some sharp versions, resulting in a fully-opaque output.
  const intermediate = await source.png().toBuffer();
  const resized = await sharp(intermediate)
    .ensureAlpha()
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .png()
    .toBuffer();

  if (!isBordered) return bufferToDataUrl(resized);

  const { data, info } = await sharp(resized)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];

  const dilatedAlpha = dilateAlpha(alpha, info.width, info.height, borderPx);
  const bc = borderColor ?? (borderStyle === "white" ? "#ffffff" : "#000000");
  let borderRgb: { r: number; g: number; b: number };
  try {
    borderRgb = hexToRgba(bc);
  } catch {
    throw new UserImageError("borderColor must be a valid #RGB or #RRGGBB colour");
  }

  const matte = Buffer.alloc((info.width + borderPx * 2) * (info.height + borderPx * 2) * 4, 0);
  for (let i = 0; i < dilatedAlpha.length; i++) {
    const a = dilatedAlpha[i];
    if (!a) continue;
    const idx = i * 4;
    matte[idx] = borderRgb.r;
    matte[idx + 1] = borderRgb.g;
    matte[idx + 2] = borderRgb.b;
    matte[idx + 3] = a;
  }

  // The matte is derived from the silhouette rather than a filled rectangle, so
  // transparent corners remain transparent for the cut-line tracer.
  const out = await sharp(matte, {
    raw: { width: info.width + borderPx * 2, height: info.height + borderPx * 2, channels: 4 },
  })
    .composite([{ input: resized, top: borderPx, left: borderPx }])
    .png()
    .toBuffer();
  return bufferToDataUrl(out);
}

// ── Cricut / Silhouette SVG cut-path ─────────────────────────────────────────

const CUTLINE_ALPHA_THRESHOLD = 128;
const CUTLINE_MIN_COMPONENT_AREA_MM2 = 0.1;
const CUTLINE_SIMPLIFY_MM = 0.12;

type Point = [number, number];
type DirectedEdge = { from: Point; to: Point };

function pointKey([x, y]: Point): string {
  return `${x},${y}`;
}

function signedArea(points: Point[]): number {
  return points.reduce(
    (sum, [x, y], index) => {
      const [nextX, nextY] = points[(index + 1) % points.length];
      return sum + x * nextY - nextX * y;
    },
    0,
  ) / 2;
}

function simplifyClosedContour(points: Point[], epsilon: number): Point[] {
  if (points.length < 4) return points;
  const split = Math.floor(points.length / 2);
  const first = rdp(points.slice(0, split + 1), epsilon);
  const second = rdp([...points.slice(split), points[0]], epsilon);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/**
 * Treat diagonally touching pixels as part of one visible component while
 * keeping the boundary extraction on pixel faces. Components smaller than a
 * physical cutting threshold are discarded before their edges are emitted.
 */
function filterTinyComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  outputDpi: number,
): Uint8Array {
  const filtered = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const minAreaPixels = Math.max(
    1,
    Math.round(CUTLINE_MIN_COMPONENT_AREA_MM2 * (outputDpi / MM_PER_INCH) ** 2),
  );
  const neighbours = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const component: number[] = [];
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      for (const [dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next] || seen[next]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    if (component.length >= minAreaPixels) {
      for (const pixel of component) filtered[pixel] = 1;
    }
  }
  return filtered;
}

/**
 * Build directed pixel-face boundaries with the filled region on the right.
 * That makes exterior and interior contours naturally wind in opposite
 * directions, and captures every component plus every genuine hole.
 */
function traceMaskBoundaries(mask: Uint8Array, width: number, height: number): Point[][] {
  const filled = (x: number, y: number): boolean =>
    x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;
  const edges: DirectedEdge[] = [];
  const add = (from: Point, to: Point) => edges.push({ from, to });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!filled(x, y)) continue;
      if (!filled(x, y - 1)) add([x, y], [x + 1, y]);
      if (!filled(x + 1, y)) add([x + 1, y], [x + 1, y + 1]);
      if (!filled(x, y + 1)) add([x + 1, y + 1], [x, y + 1]);
      if (!filled(x - 1, y)) add([x, y + 1], [x, y]);
    }
  }

  const edgesFrom = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = pointKey(edge.from);
    edgesFrom.set(key, [...(edgesFrom.get(key) ?? []), index]);
  });
  const used = new Uint8Array(edges.length);
  const direction = (edge: DirectedEdge): number => {
    const dx = edge.to[0] - edge.from[0];
    const dy = edge.to[1] - edge.from[1];
    return dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3;
  };
  const turnRank = (previous: number, candidate: number): number => {
    const turn = (candidate - previous + 4) % 4;
    return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
  };
  const loops: Point[][] = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex++) {
    if (used[startIndex]) continue;
    const first = edges[startIndex];
    const start = first.from;
    const loop: Point[] = [start];
    let currentIndex = startIndex;
    let closed = false;
    for (let steps = 0; steps <= edges.length; steps++) {
      const current = edges[currentIndex];
      used[currentIndex] = 1;
      const at = current.to;
      if (pointKey(at) === pointKey(start)) {
        closed = true;
        break;
      }
      loop.push(at);
      const options = (edgesFrom.get(pointKey(at)) ?? []).filter((index) => !used[index]);
      if (!options.length) break;
      const previousDirection = direction(current);
      currentIndex = options.sort(
        (a, b) => turnRank(previousDirection, direction(edges[a])) - turnRank(previousDirection, direction(edges[b])),
      )[0];
    }
    if (closed && loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function formatSvgNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * Generates a Cricut/Silhouette-compatible SVG file with one closed subpath per
 * outer component and interior hole. Contours are simplified after sizing, so
 * their physical detail does not depend on the uploaded image resolution.
 */
export async function generateCutlineSvg(
  processedBase64: string,
  outputDpi = LEGACY_BORDER_DPI,
): Promise<string> {
  const input = b64ToBuffer(processedBase64);

  // Decode the image as raw RGBA (4 channels) to guarantee the alpha channel
  // is accessible.  Relying on extractChannel("alpha") is fragile across sharp
  // versions — it can silently return zeros on some builds.
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Extract alpha into a flat, 1-channel array (index = y*width + x).
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = rgba[i * 4 + 3]; // A is the 4th byte of each RGBA pixel
  }

  const mask = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    mask[i] = alpha[i] > CUTLINE_ALPHA_THRESHOLD ? 1 : 0;
  }
  const filteredMask = filterTinyComponents(mask, width, height, outputDpi);
  const loops = traceMaskBoundaries(filteredMask, width, height);

  if (!loops.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  const epsilon = (CUTLINE_SIMPLIFY_MM / MM_PER_INCH) * outputDpi;
  const d = loops
    .map((loop) => {
      const simplified = simplifyClosedContour(loop, epsilon);
      if (simplified.length < 3 || Math.abs(signedArea(simplified)) < 0.5) return "";
      return [
        ...simplified.map(([x, y], index) =>
          `${index === 0 ? "M" : "L"} ${formatSvgNumber(x)} ${formatSvgNumber(y)}`,
        ),
        "Z",
      ].join(" ");
    })
    .filter(Boolean)
    .join(" ");

  if (!d) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;

  // CSS pixels retain exact physical size at 96 DPI while the high-resolution
  // viewBox preserves detail for tiny stickers (for example, 6 mm). Unsized
  // legacy artwork remains a 96-DPI image, so it deliberately keeps its
  // original CSS pixel dimensions instead of being reinterpreted at 300 DPI.
  const cssWidth = (width / outputDpi) * LEGACY_BORDER_DPI;
  const cssHeight = (height / outputDpi) * LEGACY_BORDER_DPI;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="0 0 ${width} ${height}"`,
    `  width="${formatSvgNumber(cssWidth)}px" height="${formatSvgNumber(cssHeight)}px">`,
    `  <path d="${d}" fill="none" fill-rule="evenodd" stroke="#000000" stroke-width="1"/>`,
    `</svg>`,
  ].join("\n");
}

// ── Edge feather ─────────────────────────────────────────────────────────────

/**
 * Applies a gaussian alpha-channel blur on the silhouette edge.
 * Only softens existing edge pixels — does not expand the image bounds.
 * Used for photo stickers to blend the cutout into the page.
 */
export async function edgeFeather(
  processedBase64: string,
  px: number,
): Promise<string> {
  if (!px || px <= 0) return processedBase64;
  const input = b64ToBuffer(processedBase64);

  // Decode as RGBA
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Extract alpha as single-channel grayscale buffer
  const alphaBuf = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    alphaBuf[i] = rgba[i * 4 + 3];
  }

  // Blur the alpha mask to get feathered edges
  const blurredAlpha = await sharp(alphaBuf, { raw: { width, height, channels: 1 } })
    .blur(Math.max(0.3, px / 2))
    .raw()
    .toBuffer();

  // Multiply original alpha by blurred alpha (normalised 0–1)
  // This keeps interior pixels opaque and fades the edges
  const out = Buffer.from(rgba);
  for (let i = 0; i < width * height; i++) {
    const origA = rgba[i * 4 + 3];
    if (origA > 0) {
      out[i * 4 + 3] = Math.round((origA / 255) * blurredAlpha[i]);
    }
  }

  const result = await sharp(out, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  return bufferToDataUrl(result);
}

// ── Drop shadow ───────────────────────────────────────────────────────────────

function shadowSettings(style: string, liftPx: number) {
  const blurRadius =
    style === "flat" ? 2 : style === "soft" ? 8 : style === "lifted" ? 12 : 3;
  const offX =
    style === "flat" ? 1 : style === "soft" ? liftPx : style === "lifted" ? Math.round(liftPx * 1.5) : 2;
  const offY = offX; // uniform for now
  const shadowOpacity =
    style === "flat" ? 0.3 : style === "soft" ? 0.4 : style === "lifted" ? 0.5 : 0.8;
  return { blurRadius, offX, offY, shadowOpacity };
}

/**
 * Bakes an alpha-based drop shadow into the PNG.
 *
 * The canvas is expanded by the blur radius + offset so the shadow is never
 * clipped. The cut-line must be generated from the PRE-shadow image (before
 * calling this function) so the trace follows the subject silhouette, not the
 * shadow halo.
 *
 * style:
 *   flat       — 1 px offset, tight 2 px blur, 30% opacity
 *   soft       — liftPx offset, 8 px blur, 40% opacity
 *   lifted     — 1.5×liftPx offset, 12 px blur, 50% opacity
 *   cut-paper  — 2 px offset, 3 px blur, 80% opacity (dense paper-cut look)
 */
export async function addDropShadow(
  processedBase64: string,
  style: string,
  liftPx = 4,
): Promise<string> {
  const { blurRadius, offX, offY, shadowOpacity } = shadowSettings(style, liftPx);

  const input = b64ToBuffer(processedBase64);
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rgba = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

  // Expanded canvas dimensions
  const pad = shadowExpansionPad(style, liftPx);
  const newW = width + pad * 2;
  const newH = height + pad * 2;

  // Build shadow layer: black mask shifted by offset
  const shadowBuf = Buffer.alloc(newW * newH * 4, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcA = rgba[(y * width + x) * 4 + 3];
      if (srcA === 0) continue;
      const dstX = x + pad + offX;
      const dstY = y + pad + offY;
      if (dstX < 0 || dstX >= newW || dstY < 0 || dstY >= newH) continue;
      const idx = (dstY * newW + dstX) * 4;
      shadowBuf[idx + 3] = Math.round(srcA * shadowOpacity);
    }
  }

  // Blur the shadow
  const shadowPng = await sharp(shadowBuf, { raw: { width: newW, height: newH, channels: 4 } })
    .blur(blurRadius)
    .png()
    .toBuffer();

  // Place the original on the expanded transparent canvas
  const origPng = await sharp(input).ensureAlpha().png().toBuffer();
  const expandedPng = await sharp({
    create: { width: newW, height: newH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer()
    .then((blank) =>
      sharp(blank)
        .composite([{ input: origPng, top: pad, left: pad }])
        .png()
        .toBuffer(),
    );

  // Composite: shadow behind original
  const result = await sharp(shadowPng)
    .composite([{ input: expandedPng, blend: "over" }])
    .png()
    .toBuffer();

  return bufferToDataUrl(result);
}

// ── Shadow-expansion helpers (used by sticker export pipeline) ───────────────

/**
 * Returns the uniform canvas expansion (px per side) that addDropShadow will
 * apply for a given style and liftPx.  Kept byte-for-byte in sync with the
 * formula inside addDropShadow so callers can predict the final PNG size.
 */
export function shadowExpansionPad(style: string, liftPx = 4): number {
  const { blurRadius, offX, offY } = shadowSettings(style, liftPx);
  return blurRadius * 2 + Math.max(Math.abs(offX), Math.abs(offY)) + 4;
}

/**
 * Re-wraps a cutline SVG (traced from the PRE-shadow image) so its viewBox
 * and path coordinates align with the POST-shadow exported PNG.
 *
 * addDropShadow expands the canvas by `pad` pixels on every side and places
 * the original artwork at (pad, pad) in the new canvas.  Without this
 * correction the SVG viewBox is smaller than the exported PNG, causing Cricut
 * Design Space to misalign the cut contour relative to the artwork — the
 * machine cuts offset and the entire sheet is wasted.
 *
 * Fix: widen the viewBox to (origW + 2·pad) × (origH + 2·pad) and wrap the
 * path in a `translate(pad, pad)` group so the contour stays on the subject.
 */
export function adjustCutlineSvgForShadow(
  svg: string,
  shadowStyle: string,
  liftPx = 4,
): string {
  const pad = shadowExpansionPad(shadowStyle, liftPx);
  if (pad <= 0) return svg;

  // Extract original viewBox dimensions
  const vbMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!vbMatch) return svg; // unparseable — return unchanged

  const origW = parseFloat(vbMatch[1]);
  const origH = parseFloat(vbMatch[2]);
  const newW  = origW + pad * 2;
  const newH  = origH + pad * 2;
  const widthMatch = svg.match(/width="(\d+(?:\.\d+)?)px"/);
  const heightMatch = svg.match(/height="(\d+(?:\.\d+)?)px"/);
  const cssScaleX = widthMatch ? parseFloat(widthMatch[1]) / origW : 1;
  const cssScaleY = heightMatch ? parseFloat(heightMatch[1]) / origH : 1;

  return svg
    // Expand the viewBox
    .replace(
      /viewBox="0 0 \d+(?:\.\d+)? \d+(?:\.\d+)?"/,
      `viewBox="0 0 ${newW} ${newH}"`,
    )
    // Expand the px size attributes
    .replace(/width="\d+(?:\.\d+)?px"/, `width="${formatSvgNumber(newW * cssScaleX)}px"`)
    .replace(/height="\d+(?:\.\d+)?px"/, `height="${formatSvgNumber(newH * cssScaleY)}px"`)
    // Translate the path so the cut contour sits over the artwork
    .replace(/<path /, `<g transform="translate(${pad},${pad})"><path `)
    .replace(/<\/svg>/, `</g>\n</svg>`);
}

// ── Ramer-Douglas-Peucker polyline simplification ────────────────────────────

function rdp(
  points: [number, number][],
  epsilon: number,
): [number, number][] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], start, end);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left  = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [start, end];
}

function perpDist(
  [px, py]: [number, number],
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  return Math.abs(dx * (ay - py) - dy * (ax - px)) / len;
}
