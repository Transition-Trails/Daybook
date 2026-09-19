import { db } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { plannerProjectAssetsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export const PROJECT_ASSET_WIDGET_PREFIX = "project-asset:";
const storage = new ObjectStorageService();

export function projectAssetIdFromWidgetId(widgetId: string): string | null {
  return widgetId.startsWith(PROJECT_ASSET_WIDGET_PREFIX)
    ? widgetId.slice(PROJECT_ASSET_WIDGET_PREFIX.length) || null
    : null;
}

function dataUri(contentType: string, bytes: Uint8Array): string {
  return `data:${contentType || "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`;
}

export function buildManagedAssetSvg(contentType: string, bytes: Uint8Array): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none"><image href="${dataUri(contentType, bytes)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none"/></svg>`;
}

/** Resolves managed copies only at render time; no base64 is persisted. */
export async function resolvePlannerProjectAssetRenderSpecs(
  widgetIds: string[],
  plannerId: string,
  storeId: string,
): Promise<Array<{ id: string; name: string; svgData: string }>> {
  const assetIds = widgetIds.map(projectAssetIdFromWidgetId).filter((id): id is string => Boolean(id));
  if (assetIds.length === 0) return [];
  const rows = await db.select().from(plannerProjectAssetsTable).where(and(
    eq(plannerProjectAssetsTable.plannerConfigId, plannerId),
    eq(plannerProjectAssetsTable.storeId, storeId),
    inArray(plannerProjectAssetsTable.id, assetIds),
  ));
  if (rows.length !== assetIds.length) {
    throw new Error("Planner composition contains an unavailable project asset");
  }
  return Promise.all(rows.map(async (row) => {
    const file = await storage.getObjectEntityFile(row.managedObjectPath);
    const [bytes] = await file.download();
    const type = row.contentType || "application/octet-stream";
    const svgData = buildManagedAssetSvg(type, bytes);
    return { id: `${PROJECT_ASSET_WIDGET_PREFIX}${row.id}`, name: row.displayName, svgData };
  }));
}