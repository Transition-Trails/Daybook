import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { PDFiumLibrary, type PDFiumPageRenderOptions } from "@hyzyla/pdfium";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  plannerPdfImportsTable,
  plannerPdfImportPagesTable,
  platformPlannerTemplatesTable,
  PLANNER_PDF_IMPORT_BEHAVIORS,
  PLANNER_PDF_IMPORT_SECTION_TYPES,
} from "@workspace/db";
import { requireSuperAdmin } from "../middleware/requireRole";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const SECTION_TYPES = new Set<string>(PLANNER_PDF_IMPORT_SECTION_TYPES);
const BEHAVIORS = new Set<string>(PLANNER_PDF_IMPORT_BEHAVIORS);
const thumbnailCache = new Map<string, Buffer>();
const sourceReadInflight = new Map<string, Promise<Buffer>>();
let pdfiumLibraryPromise: ReturnType<typeof PDFiumLibrary.init> | undefined;

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readSource(objectPath: string): Promise<Buffer> {
  if (!objectPath.startsWith("/objects/")) throw new Error("Invalid private object path");
  const file = await storage.getObjectEntityFile(objectPath);
  const [bytes] = await file.download();
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF exceeds maximum size of 50 MiB");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Uploaded file is not a PDF");
  return bytes;
}

function readSourceShared(objectPath: string): Promise<Buffer> {
  const existing = sourceReadInflight.get(objectPath);
  if (existing) return existing;
  const pending = readSource(objectPath).finally(() => {
    sourceReadInflight.delete(objectPath);
  });
  sourceReadInflight.set(objectPath, pending);
  return pending;
}

function getPdfiumLibrary() {
  pdfiumLibraryPromise ??= PDFiumLibrary.init().catch(error => {
    pdfiumLibraryPromise = undefined;
    throw error;
  });
  return pdfiumLibraryPromise;
}

async function encodePdfiumBitmap(options: PDFiumPageRenderOptions): Promise<Uint8Array> {
  const rgba = Buffer.from(options.data);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const blue = rgba[offset];
    rgba[offset] = rgba[offset + 2];
    rgba[offset + 2] = blue;
  }
  return sharp(rgba, {
    raw: { width: options.width, height: options.height, channels: 4 },
  }).png().toBuffer();
}

async function detail(id: string) {
  const [item] = await db.select().from(plannerPdfImportsTable).where(eq(plannerPdfImportsTable.id, id));
  if (!item) return null;
  const pages = await db.select().from(plannerPdfImportPagesTable)
    .where(eq(plannerPdfImportPagesTable.importId, id))
    .orderBy(asc(plannerPdfImportPagesTable.orderIndex), asc(plannerPdfImportPagesTable.createdAt));
  return { ...item, pages };
}

async function singlePagePdf(sourceObjectPath: string, sourcePageNumber: number): Promise<Uint8Array> {
  const source = await PDFDocument.load(await readSource(sourceObjectPath), { updateMetadata: false });
  const output = await PDFDocument.create();
  const [copied] = await output.copyPages(source, [sourcePageNumber - 1]);
  output.addPage(copied);
  return output.save();
}

async function renderPageThumbnail(sourceObjectPath: string, sourcePageNumber: number): Promise<Buffer> {
  const library = await getPdfiumLibrary();
  const document = await library.loadDocument(await readSourceShared(sourceObjectPath));
  try {
    const pageIndex = sourcePageNumber - 1;
    if (pageIndex < 0 || pageIndex >= document.getPageCount()) {
      throw new Error(`PDF page ${sourcePageNumber} does not exist`);
    }
    const rendered = await document.getPage(pageIndex).render({
      width: 360,
      render: encodePdfiumBitmap,
    });
    return Buffer.from(rendered.data);
  } finally {
    document.destroy();
  }
}

router.post("/platform/planner-imports/upload-url", requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
  if (!name || !Number.isFinite(size) || (size as number) <= 0 || (size as number) > MAX_PDF_BYTES) {
    fail(res, 400, "PDF must be between 1 byte and 50 MiB");
    return;
  }
  if (contentType !== "application/pdf") {
    fail(res, 400, "Only application/pdf uploads are accepted");
    return;
  }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    res.json({ uploadURL, objectPath: storage.normalizeObjectEntityPath(uploadURL), maxBytes: MAX_PDF_BYTES });
  } catch (error) {
    req.log.error({ err: error }, "Failed to create planner PDF upload URL");
    fail(res, 500, "Failed to create upload URL");
  }
});

router.post("/platform/planner-imports/analyze", requireSuperAdmin, async (req: Request, res: Response) => {
  const { objectPath, fileName, fileSize } = req.body as { objectPath?: string; fileName?: string; fileSize?: number };
  if (!objectPath || !fileName || !Number.isFinite(fileSize) || (fileSize as number) <= 0 || (fileSize as number) > MAX_PDF_BYTES) {
    fail(res, 400, "objectPath, fileName, and a valid fileSize are required");
    return;
  }
  try {
    const bytes = await readSource(objectPath);
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    if (pdf.getPageCount() < 1) throw new Error("PDF contains no pages");
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    const item = await db.transaction(async (tx) => {
      const [created] = await tx.insert(plannerPdfImportsTable).values({
        sourceObjectPath: objectPath,
        originalFileName: fileName,
        fileSize: bytes.byteLength,
        checksumSha256,
        pageCount: pdf.getPageCount(),
        status: "review",
        createdByUserId: req.actor!.userId,
      }).returning();
      const pages = pdf.getPages();
      await tx.insert(plannerPdfImportPagesTable).values(pages.map((page, index) => {
        const size = page.getSize();
        return {
          importId: created.id,
          sourcePageNumber: index + 1,
          widthPoints: Math.round(size.width),
          heightPoints: Math.round(size.height),
          orderIndex: index,
          sectionType: "other",
          behavior: "unique",
          overlay: { elements: [] },
        };
      }));
      return created;
    });
    res.status(201).json(await detail(item.id));
  } catch (error) {
    req.log.error({ err: error }, "Planner PDF analysis failed");
    const message = error instanceof Error ? error.message : "Unable to analyze PDF";
    fail(res, message.includes("not found") ? 404 : 400, message);
  }
});

router.get("/platform/planner-imports/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  const item = await detail(routeParam(req, "id"));
  if (!item) { fail(res, 404, "Planner PDF import not found"); return; }
  res.json(item);
});

router.patch("/platform/planner-imports/:id/pages", requireSuperAdmin, async (req: Request, res: Response) => {
  const updates = (req.body as { pages?: Array<Record<string, unknown>> }).pages;
  if (!Array.isArray(updates)) { fail(res, 400, "pages must be an array"); return; }
  const item = await detail(routeParam(req, "id"));
  if (!item) { fail(res, 404, "Planner PDF import not found"); return; }
  const ids = updates.map(p => p.id).filter((id): id is string => typeof id === "string");
  if (ids.length !== updates.length || ids.length === 0) { fail(res, 400, "Each page update requires an id"); return; }
  if (new Set(ids).size !== ids.length) { fail(res, 400, "Each page may only be updated once per request"); return; }
  const owned = await db.select({ id: plannerPdfImportPagesTable.id }).from(plannerPdfImportPagesTable)
    .where(and(eq(plannerPdfImportPagesTable.importId, item.id), inArray(plannerPdfImportPagesTable.id, ids)));
  if (owned.length !== ids.length) { fail(res, 400, "One or more pages do not belong to this import"); return; }
  for (const page of updates) {
    if (page.sectionType !== undefined && (typeof page.sectionType !== "string" || !SECTION_TYPES.has(page.sectionType))) {
      fail(res, 400, "Invalid sectionType"); return;
    }
    if (page.behavior !== undefined && (typeof page.behavior !== "string" || !BEHAVIORS.has(page.behavior))) {
      fail(res, 400, "Invalid behavior"); return;
    }
    if (page.orderIndex !== undefined && (!Number.isInteger(page.orderIndex) || (page.orderIndex as number) < 0)) {
      fail(res, 400, "orderIndex must be a non-negative integer"); return;
    }
    if (page.hidden !== undefined && typeof page.hidden !== "boolean") {
      fail(res, 400, "hidden must be a boolean"); return;
    }
    for (const field of ["templateKey", "label"] as const) {
      if (page[field] !== undefined && page[field] !== null && typeof page[field] !== "string") {
        fail(res, 400, `${field} must be a string or null`); return;
      }
      if (typeof page[field] === "string" && page[field].length > 160) {
        fail(res, 400, `${field} must be 160 characters or fewer`); return;
      }
    }
  }
  await db.transaction(async (tx) => {
    for (const page of updates) {
      const patch: Record<string, unknown> = {};
      for (const field of ["sectionType", "behavior", "templateKey", "label", "orderIndex", "hidden"]) {
        if (page[field] !== undefined) patch[field] = page[field];
      }
      if (Object.keys(patch).length) {
        await tx.update(plannerPdfImportPagesTable).set(patch).where(
          and(eq(plannerPdfImportPagesTable.id, page.id as string), eq(plannerPdfImportPagesTable.importId, item.id)),
        );
      }
    }
    await tx.update(plannerPdfImportsTable).set({ updatedAt: new Date() }).where(eq(plannerPdfImportsTable.id, item.id));
  });
  res.json(await detail(item.id));
});

router.post("/platform/planner-imports/:id/pages/:pageId/duplicate", requireSuperAdmin, async (req: Request, res: Response) => {
  const item = await detail(routeParam(req, "id"));
  if (!item) { fail(res, 404, "Planner PDF import not found"); return; }
  const source = item.pages.find(page => page.id === routeParam(req, "pageId"));
  if (!source) { fail(res, 404, "Planner PDF page not found"); return; }
  const following = item.pages
    .filter(page => page.orderIndex > source.orderIndex)
    .sort((a, b) => b.orderIndex - a.orderIndex);
  for (const page of following) {
    await db.update(plannerPdfImportPagesTable).set({ orderIndex: page.orderIndex + 1 })
      .where(and(eq(plannerPdfImportPagesTable.id, page.id), eq(plannerPdfImportPagesTable.importId, item.id)));
  }
  await db.insert(plannerPdfImportPagesTable).values({
    importId: item.id, sourcePageNumber: source.sourcePageNumber,
    widthPoints: source.widthPoints, heightPoints: source.heightPoints,
    sectionType: source.sectionType, behavior: source.behavior,
    templateKey: source.templateKey, label: source.label ? `${source.label} copy` : null,
    orderIndex: source.orderIndex + 1, hidden: false, overlay: source.overlay,
  });
  res.json(await detail(item.id));
});

router.get("/platform/planner-imports/:id/pages/:pageId/preview", requireSuperAdmin, async (req: Request, res: Response) => {
  const item = await detail(routeParam(req, "id"));
  const page = item?.pages.find(candidate => candidate.id === routeParam(req, "pageId"));
  if (!item || !page) { fail(res, 404, "Planner PDF page not found"); return; }
  try {
    res.type("application/pdf").send(Buffer.from(await singlePagePdf(item.sourceObjectPath, page.sourcePageNumber)));
  } catch (error) {
    req.log.error({ err: error }, "Planner PDF page preview failed");
    fail(res, 500, "Unable to preview page");
  }
});

router.get("/platform/planner-imports/:id/pages/:pageId/thumbnail", requireSuperAdmin, async (req: Request, res: Response) => {
  const item = await detail(routeParam(req, "id"));
  const page = item?.pages.find(candidate => candidate.id === routeParam(req, "pageId"));
  if (!item || !page) { fail(res, 404, "Planner PDF page not found"); return; }
  const cacheKey = `${item.id}:${page.id}`;
  try {
    let png = thumbnailCache.get(cacheKey);
    if (!png) {
      png = await renderPageThumbnail(item.sourceObjectPath, page.sourcePageNumber);
      if (thumbnailCache.size >= 200) {
        const oldest = thumbnailCache.keys().next().value;
        if (oldest) thumbnailCache.delete(oldest);
      }
      thumbnailCache.set(cacheKey, png);
    }
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.type("image/png").send(png);
  } catch (error) {
    req.log.error({ err: error }, "Planner PDF page thumbnail failed");
    fail(res, 500, "Unable to render page thumbnail");
  }
});

router.post("/platform/planner-imports/:id/create-planner", requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, editionId } = req.body as { name?: string; editionId?: string };
  if (!name?.trim()) { fail(res, 400, "name is required"); return; }
  const item = await detail(routeParam(req, "id"));
  if (!item) { fail(res, 404, "Planner PDF import not found"); return; }
  const first = item.pages.find(page => !page.hidden);
  if (!first) { fail(res, 400, "Import must contain at least one visible page"); return; }
  const template = await db.transaction(async (tx) => {
    const [created] = await tx.insert(platformPlannerTemplatesTable).values({
      name: name.trim(), editionId: editionId ?? null, status: "draft", productType: "planner",
      setup: {
        weekStart: "mon", orientation: first.widthPoints > first.heightPoints ? "landscape" : "vertical",
        startMonth: 0, startYear: new Date().getFullYear() + 1, monthCount: 12, datingMode: "dated",
      },
      style: { importedPlannerProjectId: item.id, sections: Array.from(new Set(item.pages.filter(p => !p.hidden).map(p => p.sectionType))) },
      output: { calMode: "none", eventMins: 60, aiInPdf: false },
      drive: { pdfFileId: null, configFileId: null },
    }).returning();
    await tx.update(plannerPdfImportsTable).set({ status: "created", plannerTemplateId: created.id, updatedAt: new Date() })
      .where(eq(plannerPdfImportsTable.id, item.id));
    return created;
  });
  res.status(201).json(template);
});

export default router;