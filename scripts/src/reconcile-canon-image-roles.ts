/**
 * Audits and optionally reconciles legacy Canon image primary roles.
 *
 * Dry run (default):
 *   pnpm --filter @workspace/scripts run reconcile-canon-image-roles
 * Apply:
 *   pnpm --filter @workspace/scripts run reconcile-canon-image-roles -- --apply
 */
import { reconcileCanonImageRoles } from "@workspace/db/canon-image-reconciliation";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const { rows: records } = await client.query<{
    id: string;
    world_id: string;
    name: string;
    portrait_url: string | null;
    image_urls: string[] | null;
    image_gallery: Array<{ url: string; name?: string; description?: string; role?: string }> | null;
  }>(`
    SELECT id, world_id, name, portrait_url, image_urls, image_gallery
    FROM ws_canon_records
    ORDER BY world_id, name, id
    FOR UPDATE
  `);
  const { rows: assets } = await client.query<{
    id: string;
    record_id: string;
    object_path: string | null;
    role: string;
    approval_status: string | null;
    canonical_strength: string | null;
    mime_type: string | null;
  }>(`
    SELECT id, record_id, object_path, role, approval_status, canonical_strength, mime_type
    FROM ws_assets
    ORDER BY record_id, id
    FOR UPDATE
  `);
  const assetsByRecord = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = assetsByRecord.get(asset.record_id) ?? [];
    list.push(asset);
    assetsByRecord.set(asset.record_id, list);
  }

  let changedRecords = 0;
  let changedAssets = 0;
  for (const record of records) {
    const recordAssets = assetsByRecord.get(record.id) ?? [];
    const result = reconcileCanonImageRoles({
      id: record.id,
      worldId: record.world_id,
      name: record.name,
      portraitUrl: record.portrait_url,
      imageUrls: record.image_urls,
      imageGallery: record.image_gallery,
    }, recordAssets.map(asset => ({
      id: asset.id,
      objectPath: asset.object_path,
      role: asset.role,
      approvalStatus: asset.approval_status,
      canonicalStrength: asset.canonical_strength,
      mimeType: asset.mime_type,
    })));
    if (!result.recordChanged && result.changedAssetIds.length === 0) continue;

    changedRecords += 1;
    changedAssets += result.changedAssetIds.length;
    console.log(JSON.stringify({
      recordId: record.id,
      worldId: record.world_id,
      name: record.name,
      primaryUrl: result.primaryUrl,
      recordChanged: result.recordChanged,
      changedAssetIds: result.changedAssetIds,
    }));

    if (result.recordChanged) {
      await client.query(`
        UPDATE ws_canon_records
        SET portrait_url = $2, image_urls = $3::jsonb, image_gallery = $4::jsonb, updated_at = NOW()
        WHERE id = $1
      `, [record.id, result.portraitUrl, JSON.stringify(result.imageUrls), JSON.stringify(result.imageGallery)]);
    }
    for (const asset of result.assetRoles) {
      if (!result.changedAssetIds.includes(asset.id)) continue;
      await client.query("UPDATE ws_assets SET role = $2, updated_at = NOW() WHERE id = $1", [asset.id, asset.role]);
    }
  }

  if (apply) {
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    scannedRecords: records.length,
    changedRecords,
    changedAssets,
  }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}