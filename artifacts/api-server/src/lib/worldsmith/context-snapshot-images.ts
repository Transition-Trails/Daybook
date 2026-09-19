import { createHash } from "node:crypto";
import sharp from "sharp";
import { ObjectStorageService } from "../objectStorage";
import { kebab } from "./context-snapshot";

export type CanonImageRole = "primary" | "reference" | "scene" | "alternate" | "detail";

export interface CanonImageGallerySource {
  url: string;
  name?: string;
  description?: string;
  role?: CanonImageRole;
}

export interface CanonImageExportRecord {
  id: string;
  worldId: string;
  name: string;
  canonType?: string | null;
  status: string;
  imageGallery?: CanonImageGallerySource[] | null;
  portraitUrl?: string | null;
  updatedAt: Date;
}

export interface CanonImageMapping {
  role: CanonImageRole;
  relativePath: string;
  repositoryPath: string;
  mimeType: string;
  width?: number;
  height?: number;
  sha256: string;
  sourceAssetId: string;
  sourceUpdatedAt: string;
}

export interface ContextSnapshotFile {
  path: string;
  content: string | Buffer;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

function normalizedObjectPath(value: string): string {
  const normalized = value.trim().replace(/^\/api\/storage/, "");
  if (!/^\/objects\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(normalized)) {
    throw new Error("Canon images must use a stable internal object ID.");
  }
  return normalized;
}

export function assignCanonImageRoles(images: CanonImageGallerySource[]): Array<CanonImageGallerySource & { role: CanonImageRole }> {
  if (!images.length) return [];
  const explicitRoles = images.some(image => image.role !== undefined);
  if (!explicitRoles) {
    return images.map((image, index) => ({ ...image, role: index === 0 ? "primary" : "reference" }));
  }
  const primaryCount = images.filter(image => image.role === "primary").length;
  if (primaryCount === 0) throw new Error("Multiple Canon images require one image designated as primary.");
  if (primaryCount > 1) throw new Error("A Canon record cannot have more than one primary image.");
  return images.map(image => ({ ...image, role: image.role ?? "reference" }));
}

function sourceImages(record: CanonImageExportRecord): CanonImageGallerySource[] {
  if (record.imageGallery?.length) return record.imageGallery;
  return record.portraitUrl ? [{ url: record.portraitUrl }] : [];
}

function imageFileName(canonType: string | null | undefined, role: CanonImageRole, roleIndex: number, extension: string): string {
  if (role === "primary") return `${canonType === "character" ? "portrait" : "image"}-primary.${extension}`;
  return `image-${role}-${String(roleIndex).padStart(2, "0")}.${extension}`;
}

export function canonImageAssetDirectory(record: Pick<CanonImageExportRecord, "id" | "name" | "canonType">): string {
  const category = `${kebab(record.canonType || "record")}s`;
  return `${category}/${kebab(record.id)}-${kebab(record.name)}`;
}

export async function buildCanonImageExport(
  records: CanonImageExportRecord[],
  storage = new ObjectStorageService(),
): Promise<{
  files: ContextSnapshotFile[];
  mappingsByRecordId: Map<string, CanonImageMapping[]>;
  manifestPath: string;
  assetRoot: string;
}> {
  const orderedRecords = [...records].sort((a, b) =>
    `${a.canonType || ""}:${a.name}:${a.id}`.localeCompare(`${b.canonType || ""}:${b.name}:${b.id}`),
  );
  const worldId = orderedRecords[0]?.worldId;
  if (!worldId) throw new Error("A world is required to export Canon images.");
  if (orderedRecords.some(record => record.worldId !== worldId)) {
    throw new Error("Canon image exports cannot combine multiple worlds.");
  }

  const canonRoot = `worlds/${kebab(worldId)}/context/canon`;
  const assetRoot = `${canonRoot}/assets`;
  const files: ContextSnapshotFile[] = [];
  const mappingsByRecordId = new Map<string, CanonImageMapping[]>();
  const manifestRecords: Array<Record<string, unknown>> = [];
  let totalBytes = 0;

  for (const record of orderedRecords) {
    const resolved = assignCanonImageRoles(sourceImages(record));
    const roleCounts = new Map<CanonImageRole, number>();
    const mappings: CanonImageMapping[] = [];
    for (const image of [...resolved].sort((a, b) => a.role === "primary" ? -1 : b.role === "primary" ? 1 : 0)) {
      let objectPath: string;
      try {
        objectPath = normalizedObjectPath(image.url);
      } catch {
        throw new Error(`Canon image for ${record.id} does not have a valid internal asset ID.`);
      }
      const safeAssetId = objectPath.split("/").at(-1) || "unknown";
      let file;
      try {
        file = await storage.getObjectEntityFile(objectPath);
      } catch (error) {
        throw new Error(`Could not retrieve Canon image for ${record.id} (asset ${safeAssetId}): ${error instanceof Error ? error.message : "object storage failed"}`);
      }
      const [[bytes], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new Error(`Canon image ${objectPath} for ${record.id} exceeds the 25 MB Git export limit.`);
      }
      totalBytes += bytes.length;
      if (totalBytes > MAX_EXPORT_BYTES) {
        throw new Error(`Canon image export for ${worldId} exceeds the 100 MB batch limit.`);
      }
      const imageMetadata = await sharp(bytes).metadata();
      const detectedMime = imageMetadata.format === "jpeg" ? "image/jpeg"
        : imageMetadata.format === "png" ? "image/png"
          : imageMetadata.format === "webp" ? "image/webp"
            : "";
      const mimeType = detectedMime;
      const extension = MIME_EXTENSIONS[mimeType];
      if (!extension) throw new Error(`Canon image ${objectPath} for ${record.id} must be PNG, JPEG, or WebP.`);
      const nextRoleIndex = (roleCounts.get(image.role) ?? 0) + 1;
      roleCounts.set(image.role, nextRoleIndex);
      const relativePath = `assets/${canonImageAssetDirectory(record)}/${imageFileName(record.canonType, image.role, nextRoleIndex, extension)}`;
      const repositoryPath = `${canonRoot}/${relativePath}`;
      const sourceUpdatedAt = metadata.updated
        ? new Date(String(metadata.updated)).toISOString()
        : record.updatedAt.toISOString();
      const mapping: CanonImageMapping = {
        role: image.role,
        relativePath,
        repositoryPath,
        mimeType,
        ...(imageMetadata.width ? { width: imageMetadata.width } : {}),
        ...(imageMetadata.height ? { height: imageMetadata.height } : {}),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sourceAssetId: objectPath,
        sourceUpdatedAt,
      };
      mappings.push(mapping);
      files.push({ path: repositoryPath, content: bytes });
    }
    mappingsByRecordId.set(record.id, mappings);
    manifestRecords.push({
      canonical_id: record.id,
      record_name: record.name,
      record_slug: kebab(record.name),
      canon_type: record.canonType ?? null,
      status: record.status,
      images: mappings.map(mapping => ({
        role: mapping.role,
        relative_path: mapping.relativePath,
        mime_type: mapping.mimeType,
        ...(mapping.width ? { width: mapping.width } : {}),
        ...(mapping.height ? { height: mapping.height } : {}),
        sha256: mapping.sha256,
        source_asset_id: mapping.sourceAssetId,
        source_updated_at: mapping.sourceUpdatedAt,
      })),
    });
  }

  const generatedAt = orderedRecords.reduce(
    (latest, record) => record.updatedAt > latest ? record.updatedAt : latest,
    orderedRecords[0]!.updatedAt,
  ).toISOString();
  const manifestPath = `${canonRoot}/image-manifest.json`;
  files.push({
    path: manifestPath,
    content: `${JSON.stringify({
      schema_version: "1.0",
      world_id: worldId,
      generated_at: generatedAt,
      records: manifestRecords,
    }, null, 2)}\n`,
  });
  return { files, mappingsByRecordId, manifestPath, assetRoot };
}