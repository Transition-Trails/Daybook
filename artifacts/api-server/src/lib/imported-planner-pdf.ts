import { asc, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import {
  db,
  plannerPdfImportsTable,
  plannerPdfImportPagesTable,
} from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

type ImportedPageSelection = {
  sourcePageNumber: number;
};

export async function composeImportedPlannerPdf(
  sourceBytes: Uint8Array,
  pages: ImportedPageSelection[],
): Promise<{ buffer: Uint8Array; pageCount: number; totalLinkAnnotations: number }> {
  if (pages.length === 0) throw new Error("Imported planner has no visible pages");
  const source = await PDFDocument.load(sourceBytes, { updateMetadata: false });
  const sourcePageCount = source.getPageCount();
  const indexes = pages.map(({ sourcePageNumber }) => {
    if (!Number.isInteger(sourcePageNumber) || sourcePageNumber < 1 || sourcePageNumber > sourcePageCount) {
      throw new Error(`Imported planner references invalid source page ${sourcePageNumber}`);
    }
    return sourcePageNumber - 1;
  });
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, indexes);
  for (const page of copied) output.addPage(page);
  return {
    buffer: await output.save(),
    pageCount: copied.length,
    totalLinkAnnotations: 0,
  };
}

export async function buildImportedPlannerPdf(
  importId: string,
): Promise<{ buffer: Uint8Array; pageCount: number; totalLinkAnnotations: number }> {
  const [item] = await db
    .select()
    .from(plannerPdfImportsTable)
    .where(eq(plannerPdfImportsTable.id, importId));
  if (!item) throw new Error("Imported planner project was not found");

  const pages = await db
    .select({
      sourcePageNumber: plannerPdfImportPagesTable.sourcePageNumber,
      hidden: plannerPdfImportPagesTable.hidden,
    })
    .from(plannerPdfImportPagesTable)
    .where(eq(plannerPdfImportPagesTable.importId, importId))
    .orderBy(asc(plannerPdfImportPagesTable.orderIndex), asc(plannerPdfImportPagesTable.createdAt));
  const visiblePages = pages.filter(page => !page.hidden);

  const storage = new ObjectStorageService();
  const sourceFile = await storage.getObjectEntityFile(item.sourceObjectPath);
  const [sourceBytes] = await sourceFile.download();
  return composeImportedPlannerPdf(sourceBytes, visiblePages);
}