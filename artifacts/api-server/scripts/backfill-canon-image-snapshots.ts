import { pool } from "@workspace/db";
import {
  canonSnapshotPath,
  ContextSnapshotGitHubPublisher,
  renderCanonSnapshot,
} from "../src/lib/worldsmith/context-snapshot";
import {
  buildCanonImageExport,
  type CanonImageExportRecord,
  type CanonImageMapping,
} from "../src/lib/worldsmith/context-snapshot-images";

type DatabaseRecord = {
  id: string;
  world_id: string;
  name: string;
  status: string;
  canon_type: string | null;
  narrative_details: string | null;
  historical_context: string | null;
  visual_notes: string | null;
  emotional_register: string | null;
  sensory_clauses: string | null;
  narrative_visibility: string | null;
  temporal_scope: string | null;
  canon_stability: string | null;
  emotional_valence: string | null;
  notes: string | null;
  portrait_url: string | null;
  image_gallery: CanonImageExportRecord["imageGallery"];
  updated_at: Date;
};

const worldId = process.argv.find(argument => argument.startsWith("--world="))?.slice("--world=".length) || "wyc";
const token = process.env.GITHUB_TOKEN;
const repository = process.env.WORLDSMITH_CONTEXT_REPOSITORY ?? "Transition-Trails/Daybook";
const branch = process.env.WORLDSMITH_CONTEXT_BRANCH ?? "context-snapshots";
if (!token) throw new Error("GitHub access is not configured.");

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

function imageSection(
  record: DatabaseRecord,
  worldName: string,
  mappings: CanonImageMapping[],
): string {
  const rendered = renderCanonSnapshot({
    id: record.id,
    worldId: record.world_id,
    worldName,
    name: record.name,
    status: record.status,
    canonType: record.canon_type,
    updatedAt: record.updated_at,
    relationships: [],
    linkedSpecs: [],
    linkedPromptModules: [],
    images: mappings.map(mapping => ({ role: mapping.role, repositoryPath: mapping.repositoryPath })),
  }, record.updated_at);
  const start = rendered.indexOf("## Record Images");
  if (start < 0) return "";
  const tail = rendered.slice(start);
  const end = tail.search(/\n(?:## |---\n)/);
  return (end < 0 ? tail : tail.slice(0, end)).trim();
}

function upsertImageSection(markdown: string, section: string): string {
  const withoutExisting = markdown.replace(/\n## Record Images\n[\s\S]*?(?=\n## |\n---\n)/, "");
  const footer = withoutExisting.lastIndexOf("\n---\n");
  if (footer < 0) throw new Error("Generated Canon Markdown is missing its footer.");
  return `${withoutExisting.slice(0, footer).trimEnd()}\n\n${section}\n${withoutExisting.slice(footer)}`;
}

async function readSnapshot(path: string): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not read ${path} from GitHub (HTTP ${response.status}).`);
  const body = await response.json() as { content?: string; encoding?: string };
  if (body.encoding !== "base64" || !body.content) throw new Error(`GitHub returned invalid content for ${path}.`);
  return Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8");
}

const lockClient = await pool.connect();
let lockAcquired = false;
const lockKey = `worldsmith:canon-context-snapshot:${worldId}`;
try {
  await lockClient.query("select pg_advisory_lock(hashtext($1))", [lockKey]);
  lockAcquired = true;
  const worldResult = await pool.query<{ id: string; name: string }>(
    `select id, name from worldsmith_worlds where id = $1 limit 1`,
    [worldId],
  );
  const world = worldResult.rows[0];
  if (!world) throw new Error(`World ${worldId} was not found.`);
  const recordResult = await pool.query<DatabaseRecord>(
    `select id, world_id, name, status, canon_type, narrative_details, historical_context,
       visual_notes, emotional_register, sensory_clauses, narrative_visibility, temporal_scope,
       canon_stability, emotional_valence, notes, portrait_url, image_gallery, updated_at
     from ws_canon_records
     where world_id = $1
     order by canon_type, name, id`,
    [worldId],
  );
  const records = recordResult.rows;
  const exportRecords: CanonImageExportRecord[] = records.map(record => ({
    id: record.id,
    worldId: record.world_id,
    name: record.name,
    status: record.status,
    canonType: record.canon_type,
    portraitUrl: record.portrait_url,
    imageGallery: record.image_gallery,
    updatedAt: record.updated_at,
  }));
  const imageExport = await buildCanonImageExport(exportRecords);
  const markdownFiles: Array<{ path: string; content: string }> = [];
  const missingSnapshots: Array<{ canonicalId: string; name: string; path: string }> = [];
  for (const record of records) {
    const mappings = imageExport.mappingsByRecordId.get(record.id) ?? [];
    if (!mappings.length) continue;
    const path = canonSnapshotPath({
      id: record.id,
      worldId: record.world_id,
      name: record.name,
      canonType: record.canon_type,
    });
    const existing = await readSnapshot(path);
    if (!existing) {
      missingSnapshots.push({ canonicalId: record.id, name: record.name, path });
      continue;
    }
    markdownFiles.push({
      path,
      content: upsertImageSection(existing, imageSection(record, world.name, mappings)),
    });
  }
  const result = await new ContextSnapshotGitHubPublisher({
    token,
    repository,
    branch,
  }).publishFiles(
    [...imageExport.files, ...markdownFiles],
    `context: backfill Canon image snapshots for ${world.name}`,
    [],
    [`${imageExport.assetRoot}/`],
  );
  const imagedRecords = records.filter(record => (imageExport.mappingsByRecordId.get(record.id)?.length ?? 0) > 0);
  console.log(JSON.stringify({
    worldId,
    worldName: world.name,
    commitSha: result.commitSha,
    changed: result.changed,
    records: records.length,
    imagedRecords: imagedRecords.map(record => ({
      canonicalId: record.id,
      name: record.name,
      imageCount: imageExport.mappingsByRecordId.get(record.id)?.length ?? 0,
    })),
    missingSnapshots,
  }, null, 2));
} finally {
  if (lockAcquired) {
    await lockClient.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
  }
  lockClient.release();
  await pool.end();
}