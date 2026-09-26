import { createHash } from "node:crypto";
import sharp from "sharp";
import { ObjectStorageService } from "../objectStorage";
import { kebab } from "./context-snapshot";

export type CanonImageRole = "primary" | "reference" | "scene" | "alternate" | "detail";

const CANON_IMAGE_ROLE_ALIASES: Record<string, CanonImageRole> = {
  primary: "primary",
  primary_portrait: "primary",
  primary_image: "primary",
  reference: "reference",
  full_body: "reference",
  life_stage_reference: "reference",
  wardrobe_reference: "reference",
  expression_reference: "reference",
  location_exterior: "reference",
  location_interior: "reference",
  object_reference: "reference",
  mood_reference: "reference",
  historical_reference: "reference",
  generated_concept: "reference",
  scene: "scene",
  alternate: "alternate",
  alternate_portrait: "alternate",
  detail: "detail",
};

export function normaliseCanonImageRole(value: unknown): CanonImageRole | undefined {
  if (typeof value !== "string") return undefined;
  return CANON_IMAGE_ROLE_ALIASES[value.trim().toLowerCase().replace(/[\s-]+/g, "_")];
}

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
  /** Explicit assets are preferred over legacy gallery entries when supplied. */
  assets?: Array<{
    id: string;
    variantId?: string | null;
    objectPath?: string | null;
    role?: CanonImageRole | string;
    title?: string | null;
    altText?: string | null;
    approvalStatus?: string | null;
    canonicalStrength?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    byteSize?: number | null;
    checksum?: string | null;
    source?: string | null;
    rightsStatus?: string | null;
    generationModel?: string | null;
    generationPrompt?: string | null;
    positiveGuidance?: string | null;
    negativeGuidance?: string | null;
    updatedAt?: Date | string | null;
  }>;
  updatedAt: Date;
}

export class CanonImageDesignationError extends Error {
  readonly code = "CANON_IMAGE_DESIGNATION_REQUIRED";
  constructor(readonly recordId: string, message: string) {
    super(message);
  }
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
  sourceObjectPath?: string;
  byteSize?: number;
  stableAssetId?: string;
  variantId?: string | null;
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

export function enforceCanonImageOrder(
  images: CanonImageGallerySource[],
): Array<CanonImageGallerySource & { role: CanonImageRole }> {
  return images.map((image, index) => ({
    ...image,
    role: index === 0
      ? "primary"
      : image.role === "primary"
        ? "reference"
        : image.role ?? "reference",
  }));
}

function sourceImages(record: CanonImageExportRecord): CanonImageGallerySource[] {
  if (record.imageGallery?.length) {
    try {
      assignCanonImageRoles(record.imageGallery);
    } catch (error) {
      throw new CanonImageDesignationError(record.id, error instanceof Error ? error.message : "Invalid Canon image roles.");
    }
  }
  if ((record.imageGallery?.length || record.portraitUrl) && !record.assets?.length) {
    throw new CanonImageDesignationError(record.id,
      "The designated primary Canon image has no approved asset metadata. Save and review its asset approval status before updating the snapshot.");
  }
  if (record.assets?.length) {
    const galleryPrimaryUrl = record.imageGallery?.find(image => normaliseCanonImageRole(image.role) === "primary")?.url;
    const galleryHasExplicitRoles = record.imageGallery?.some(image => image.role !== undefined);
    const eligibleAssets = record.assets
      .filter(asset => ["approved", "accepted", "canon", "editor_approved", "editor-approved"].includes(String(asset.approvalStatus ?? "").toLowerCase())
        && !["rejected", "superseded"].includes(String(asset.approvalStatus ?? "").toLowerCase())
        && ["canonical", "reference", "defining", "locked"].includes(String(asset.canonicalStrength ?? "canonical").toLowerCase())
        && !!asset.objectPath);
    const designatedPrimaryPath = galleryPrimaryUrl
      ?? record.assets.find(asset => normaliseCanonImageRole(asset.role) === "primary")?.objectPath;
    if (designatedPrimaryPath && !eligibleAssets.some(asset => asset.objectPath === designatedPrimaryPath)) {
      throw new CanonImageDesignationError(record.id,
        "The designated primary Canon image is not approved for export. Review its approval status and canonical strength, or designate an approved image as primary.");
    }
    const designated = eligibleAssets.filter(asset => normaliseCanonImageRole(asset.role) === "primary");
    const galleryPrimary = eligibleAssets.find(asset => asset.objectPath === galleryPrimaryUrl)?.objectPath;
    const portraitPrimary = !galleryHasExplicitRoles
      ? eligibleAssets.find(asset => asset.objectPath === record.portraitUrl)?.objectPath
      : undefined;
    const primaryUrl = galleryPrimary ?? portraitPrimary ?? (designated.length === 1 ? designated[0].objectPath : undefined);
    if (eligibleAssets.length && !primaryUrl && (eligibleAssets.length > 1 || galleryHasExplicitRoles)) {
      throw new CanonImageDesignationError(record.id, "Multiple Canon images require one image designated as primary.");
    }
    if (designated.length > 1 && !galleryPrimary && !portraitPrimary) {
      throw new CanonImageDesignationError(record.id, "A Canon record cannot have more than one primary image.");
    }
    return eligibleAssets
      .sort((a, b) => {
        if (a.objectPath === primaryUrl) return -1;
        if (b.objectPath === primaryUrl) return 1;
        return `${a.role ?? "reference"}:${a.id}`.localeCompare(`${b.role ?? "reference"}:${b.id}`);
      })
      .map(asset => ({
        url: asset.objectPath!,
        name: asset.title ?? asset.id,
        description: asset.altText ?? "",
        role: (() => {
          const role = String(asset.role ?? "").toLowerCase().replace(/[_-]+/g, " ");
          if (asset.objectPath === primaryUrl || (eligibleAssets.length === 1 && !primaryUrl)) return "primary" as CanonImageRole;
          if (role === "primary" || role.includes("primary portrait")) return "reference" as CanonImageRole;
          if (role.includes("scene")) return "scene" as CanonImageRole;
          if (role.includes("alternate")) return "alternate" as CanonImageRole;
          if (role.includes("detail")) return "detail" as CanonImageRole;
          return "reference" as CanonImageRole;
        })(),
      }));
  }
  return [];
}

export function validateCanonImageDesignations(records: CanonImageExportRecord[]): void {
  for (const record of records) assignCanonImageRoles(sourceImages(record));
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
  validateCanonImageDesignations(orderedRecords);

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
      const linkedAsset = record.assets?.find(asset => asset.objectPath === objectPath);
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
       const directory = linkedAsset?.id
         ? `assets/${kebab(linkedAsset.id)}`
         : `assets/${canonImageAssetDirectory(record)}`;
       const fileName = linkedAsset?.id
         ? `${kebab(linkedAsset.id)}.${extension}`
         : imageFileName(record.canonType, image.role, nextRoleIndex, extension);
       const relativePath = `${directory}/${fileName}`;
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
         sourceAssetId: linkedAsset?.id ?? objectPath,
         ...(linkedAsset?.objectPath ? { sourceObjectPath: linkedAsset.objectPath } : {}),
         ...(record.assets?.find(asset => asset.objectPath === objectPath)?.id
           ? { stableAssetId: record.assets.find(asset => asset.objectPath === objectPath)!.id } : {}),
         ...(linkedAsset?.variantId ? { variantId: linkedAsset.variantId } : {}),
         byteSize: linkedAsset?.byteSize ?? bytes.length,
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
     images: mappings.map(mapping => {
       const asset = record.assets?.find(candidate =>
         candidate.id === mapping.sourceAssetId || candidate.objectPath === mapping.sourceObjectPath);
       return ({
        role: mapping.role,
        relative_path: mapping.relativePath,
        mime_type: mapping.mimeType,
        ...(mapping.width ? { width: mapping.width } : {}),
        ...(mapping.height ? { height: mapping.height } : {}),
        sha256: mapping.sha256,
        source_asset_id: mapping.sourceAssetId,
         ...(mapping.stableAssetId ? { asset_id: mapping.stableAssetId } : {}),
         ...(mapping.variantId ? { variant_id: mapping.variantId } : {}),
        source_updated_at: mapping.sourceUpdatedAt,
         ...(asset?.title ? { title: asset.title } : {}),
         ...(asset?.altText ? { alt_text: asset.altText } : {}),
         ...(asset?.source ? { source: asset.source } : {}),
         ...(asset?.rightsStatus ? { rights_status: asset.rightsStatus } : {}),
         ...(asset?.generationModel ? { generation_model: asset.generationModel } : {}),
         ...(asset?.approvalStatus ? { approval_status: asset.approvalStatus } : {}),
         ...(asset?.canonicalStrength ? { canonical_strength: asset.canonicalStrength } : {}),
         byte_size: mapping.byteSize,
         ...(asset?.generationPrompt ? { generation_prompt: asset.generationPrompt } : {}),
         ...(asset?.positiveGuidance ? { positive_guidance: asset.positiveGuidance } : {}),
         ...(asset?.negativeGuidance ? { negative_guidance: asset.negativeGuidance } : {}),
         ...(asset?.updatedAt ? { updated_at: new Date(asset.updatedAt).toISOString() } : {}),
       });
     }),
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