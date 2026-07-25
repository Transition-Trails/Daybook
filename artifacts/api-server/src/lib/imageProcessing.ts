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
import sharp from "sharp";

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

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const h = hex.replace("#", "").padEnd(6, "0");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    alpha: 1,
  };
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

  let data: Buffer;
  let info: sharp.OutputInfo;
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

  const { width, height } = info;
  const px = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const total = width * height;

  // Sample background colour from the four corners (average)
  const cornerPixels = [0, width - 1, (height - 1) * width, (height - 1) * width + width - 1];
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

  for (let x = 0; x < width; x++) {
    seedEdge(x);
    seedEdge((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    seedEdge(y * width);
    seedEdge(y * width + width - 1);
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

    const x = p % width;
    const y = Math.floor(p / width);

    const neighbours = [
      y > 0 ? p - width : -1,
      y < height - 1 ? p + width : -1,
      x > 0 ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
    ];

    for (const n of neighbours) {
      if (n < 0 || n >= total || visited[n]) continue;
      if (colourDist(px[n * 4], px[n * 4 + 1], px[n * 4 + 2], bgR, bgG, bgB) < tolerance) {
        visited[n] = 1;
        queue.push(n);
      }
    }
  }

  const out = await sharp(Buffer.from(px.buffer), {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return bufferToDataUrl(out);
}

// ── Border + size pipeline ────────────────────────────────────────────────────

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
): Promise<string> {
  const input = b64ToBuffer(processedBase64);
  let img = sharp(input).ensureAlpha();

  if (borderStyle !== "none") {
    const bw = Math.max(1, Math.round(borderWidth ?? 2));
    const bc = borderColor ?? (borderStyle === "white" ? "#ffffff" : "#000000");

    const meta = await img.metadata();
    const w = meta.width ?? 512;
    const h = meta.height ?? 512;
    const newW = w + bw * 2;
    const newH = h + bw * 2;

    const bgBuf = await sharp({
      create: {
        width: newW,
        height: newH,
        channels: 4,
        background: { ...hexToRgba(bc), alpha: 255 },
      },
    })
      .png()
      .toBuffer();

    const inputBuf = await img.toBuffer();
    const composed = await sharp(bgBuf)
      .composite([{ input: inputBuf, top: bw, left: bw }])
      .png()
      .toBuffer();

    img = sharp(composed);
  }

  if (sizeInMm && sizeInMm > 0) {
    // 96 DPI (screen-friendly); Cricut/Silhouette use the SVG viewBox for actual cut size
    const pxSize = Math.max(32, Math.round((sizeInMm / 25.4) * 96));
    // Materialize to PNG before resize so sharp starts with a concrete RGBA buffer.
    // Keeping the lazy pipeline across ensureAlpha → resize loses the alpha channel
    // in some sharp versions, resulting in a fully-opaque output.
    const intermediate = await img.png().toBuffer();
    img = sharp(intermediate)
      .ensureAlpha()
      .resize(pxSize, pxSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
  }

  const out = await img.png().toBuffer();
  return bufferToDataUrl(out);
}

// ── Cricut / Silhouette SVG cut-path ─────────────────────────────────────────

/**
 * Generates a Cricut/Silhouette-compatible SVG file with a single closed cut-path.
 *
 * Algorithm:
 *   1. Extract alpha channel as a binary mask (threshold 128).
 *   2. Find the outer boundary pixel using Moore neighbourhood tracing
 *      (Jacob's stopping criterion).
 *   3. Simplify the contour with Ramer-Douglas-Peucker (ε = 1.5 px).
 *   4. Emit an SVG <path> whose viewBox matches the image in pixels at 96 DPI.
 *      Cricut Design Space interprets the SVG viewBox dimensions; 96 px = 1 inch.
 *
 * Returns an SVG string.
 */
export async function generateCutlineSvg(processedBase64: string): Promise<string> {
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

  const filled = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return alpha[y * width + x] > 128;
  };

  // Find first filled pixel (top-to-bottom scan)
  let startX = -1, startY = -1;
  scan: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (filled(x, y)) { startX = x; startY = y; break scan; }
    }
  }

  if (startX === -1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  // Moore neighbourhood — clockwise from NW
  const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
  const dy = [-1, -1, -1, 0, 1, 1, 1, 0];

  const contour: [number, number][] = [[startX, startY]];
  let cx = startX, cy = startY;
  // dir = direction of the imaginary step that brought us to startX,startY —
  // we treat it as if we stepped East (dir=3) from a hypothetical West neighbor.
  // This makes lookFrom = (3+6)%8 = 1 (North), so the first neighbor checked is
  // North, then clockwise: N, NE, E, SE, S, SW, W, NW.
  // That correctly traces the top boundary of a blob whose topmost pixel was found
  // by a top-to-bottom, left-to-right scan.
  let dir = 3;
  const maxSteps = width * height * 2;

  for (let step = 0; step < maxSteps; step++) {
    const lookFrom = (dir + 6) % 8;
    let moved = false;

    for (let i = 0; i < 8; i++) {
      const d = (lookFrom + i) % 8;
      const nx = cx + dx[d];
      const ny = cy + dy[d];
      if (filled(nx, ny)) {
        dir = d;
        cx = nx;
        cy = ny;
        moved = true;
        break;
      }
    }

    if (!moved) break;
    if (cx === startX && cy === startY && contour.length > 2) break;
    contour.push([cx, cy]);
  }

  const simplified = rdp(contour, 1.5);

  if (simplified.length < 3) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  const pathParts = simplified.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`);
  pathParts.push("Z");
  const d = pathParts.join(" ");

  // viewBox in pixels; Cricut reads this as physical size at 96 DPI
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="0 0 ${width} ${height}"`,
    `  width="${width}px" height="${height}px">`,
    `  <path d="${d}" fill="none" stroke="#000000" stroke-width="1"/>`,
    `</svg>`,
  ].join("\n");
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
