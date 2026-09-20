import { createHash } from "node:crypto";
import path from "node:path";

export interface CanonSnapshotRecord {
  id: string;
  worldId: string;
  worldName: string;
  name: string;
  status: string;
  canonType?: string | null;
  narrativeDetails?: string | null;
  historicalContext?: string | null;
  visualNotes?: string | null;
  emotionalRegister?: string | null;
  sensoryClauses?: string | null;
  narrativeVisibility?: string | null;
  temporalScope?: string | null;
  canonStability?: string | null;
  emotionalValence?: string | null;
  notes?: string | null;
  promptSummary?: string | null;
  identitySummary?: string | null;
  updatedAt: Date;
  relationships: Array<{ relationType?: string | null; recordId: string; name: string; canonType?: string | null }>;
  linkedSpecs: Array<{ id: string; name: string }>;
  linkedPromptModules: Array<{ id: string; name: string }>;
  images?: Array<{ role: string; repositoryPath: string }>;
  /** Versioned Field Architecture payloads are rendered without losing unknown keys. */
  structuredFields?: Record<string, unknown>;
}

const entityMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function markdownText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39);/g, match => {
      const entry = Object.entries(entityMap).find(([, encoded]) => encoded === match);
      return entry?.[0] ?? match;
    })
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function kebab(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "record";
}

function section(title: string, value: string | null | undefined): string[] {
  const content = markdownText(value);
  return content ? [`## ${title}`, "", content, ""] : [];
}

function relationshipSection(record: CanonSnapshotRecord): string[] {
  if (!record.relationships.length) return [];
  const rows = [...record.relationships]
    .sort((a, b) => `${a.relationType}:${a.name}:${a.recordId}`.localeCompare(`${b.relationType}:${b.name}:${b.recordId}`))
    .map(item => `- **${markdownText(item.relationType || "Related")}**: ${markdownText(item.name)} (\`${item.recordId}\`)`);
  return ["## Related Canon Records", "", ...rows, ""];
}

function linkedSection(title: string, records: Array<{ id: string; name: string }>): string[] {
  if (!records.length) return [];
  return [
    `## ${title}`,
    "",
    ...[...records].sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`))
      .map(item => `- ${markdownText(item.name)} (\`${item.id}\`)`),
    "",
  ];
}

function imageSection(record: CanonSnapshotRecord): string[] {
  if (!record.images?.length) return [];
  const markdownPath = canonSnapshotPath(record);
  const markdownDir = path.posix.dirname(markdownPath);
  const rows = [...record.images]
    .sort((a, b) => a.role === "primary" ? -1 : b.role === "primary" ? 1 : a.repositoryPath.localeCompare(b.repositoryPath))
    .map(image => {
      const relativePath = path.posix.relative(markdownDir, image.repositoryPath);
      const label = image.role === "primary" ? "Primary" : image.role.replace(/^./, value => value.toUpperCase());
      return `- **${label}:** [${path.posix.basename(image.repositoryPath)}](${relativePath})`;
    });
  const primary = record.images.find(image => image.role === "primary");
  if (primary) {
    const relativePath = path.posix.relative(markdownDir, primary.repositoryPath);
    rows.push("", `![Primary canon portrait of ${markdownText(record.name)}](${relativePath})`);
  }
  return ["## Record Images", "", ...rows, ""];
}

export function canonSnapshotPath(record: Pick<CanonSnapshotRecord, "worldId" | "canonType" | "id" | "name">): string {
  const category = `${kebab(record.canonType || "record")}s`;
  return `worlds/${kebab(record.worldId)}/context/canon/${category}/${kebab(record.id)}-${kebab(record.name)}.md`;
}

export function canonArchiveSnapshotPath(record: Pick<CanonSnapshotRecord, "worldId" | "canonType" | "id" | "name">): string {
  const category = `${kebab(record.canonType || "record")}s`;
  return `worlds/${kebab(record.worldId)}/context/archive/canon/${category}/${kebab(record.id)}-${kebab(record.name)}.md`;
}

export function renderCanonSnapshot(record: CanonSnapshotRecord, generatedAt = new Date()): string {
  const lines = [
    `# ${markdownText(record.name)}`,
    "",
    "> Generated from Daybook. Do not edit as source data.",
    "",
    `**Canonical ID:** \`${record.id}\`  `,
    `**Status:** ${markdownText(record.status.replace(/_/g, " "))}  `,
    ...(record.canonStability ? [`**Confidence / stability:** ${markdownText(record.canonStability)}  `] : []),
    ...(record.canonType ? [`**Category:** ${markdownText(record.canonType)}  `] : []),
    `**World:** ${markdownText(record.worldName)} (\`${record.worldId}\`)`,
    "",
    ...section("Narrative Details", record.narrativeDetails),
    ...section("Historical Context", record.historicalContext),
    ...section("Visual Notes", record.visualNotes),
    ...section("Emotional Register", record.emotionalRegister),
    ...section("Sensory Clauses", record.sensoryClauses),
    ...section("Narrative Visibility", record.narrativeVisibility),
    ...section("Temporal Scope", record.temporalScope),
    ...section("Emotional Valence", record.emotionalValence),
    ...section("Canon Notes and Open Questions", record.notes),
    ...section("Approved Prompt Summary", record.promptSummary),
    ...section("Approved Identity Summary", record.identitySummary),
    ...(record.structuredFields && Object.keys(record.structuredFields).length
      ? ["## Structured Canon Fields", "", "```json", JSON.stringify(record.structuredFields, null, 2), "```", ""]
      : []),
    ...imageSection(record),
    ...relationshipSection(record),
    ...linkedSection("Related Production Specs", record.linkedSpecs),
    ...linkedSection("Related Prompt Modules", record.linkedPromptModules),
    "---",
    "Generated from Daybook",
    `Record ID: ${record.id}`,
    `Last Updated: ${record.updatedAt.toISOString()}`,
    `Snapshot Generated: ${generatedAt.toISOString()}`,
    "",
  ];
  return lines.join("\n");
}

export function snapshotHash(markdown: string): string {
  return createHash("sha256").update(markdown, "utf8").digest("hex");
}

/** Render local editorial data without inventing prose or dropping populated fields. */
export function renderEditorialSnapshot(
  kind: string,
  record: Record<string, unknown>,
  relationships: Array<{ label: string; id: string; name: string }> = [],
  generatedAt = new Date(),
): string {
  const title = String(record.name ?? record.productionItem ?? record.code ?? record.id ?? "Untitled");
  const lines = [`# ${markdownText(title)}`, "", "> Generated from Daybook. Do not edit as source data.", ""];
  const excluded = new Set(["id", "name", "createdAt", "updatedAt", "createdBy", "notionPageId", "syncedAt"]);
  const format = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "";
    if (Array.isArray(value) && value.length === 0) return "";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return markdownText(String(value));
  };
  lines.push(`**Type:** ${markdownText(kind)}`, `**ID:** \`${String(record.id ?? "")}\``);
  for (const key of Object.keys(record).sort()) {
    if (excluded.has(key) || key === "worldId") continue;
    const value = format(record[key]);
    if (!value) continue;
    const label = key.replace(/[A-Z]/g, letter => ` ${letter}`).replace(/^./, letter => letter.toUpperCase());
    lines.push("", `## ${label}`, "", value);
  }
  if (relationships.length) {
    lines.push("", "## Relationships", "");
    for (const relationship of [...relationships].sort((a, b) =>
      `${a.label}:${a.name}:${a.id}`.localeCompare(`${b.label}:${b.name}:${b.id}`))) {
      lines.push(`- **${markdownText(relationship.label)}:** ${markdownText(relationship.name)} (\`${relationship.id}\`)`);
    }
  }
  lines.push("", "---", "Generated from Daybook", `Record ID: ${String(record.id ?? "")}`,
    `Last Updated: ${record.updatedAt instanceof Date ? record.updatedAt.toISOString() : String(record.updatedAt ?? "")}`,
    `Snapshot Generated: ${generatedAt.toISOString()}`, "");
  return lines.join("\n");
}

export function shouldAutoSyncContextSnapshot(policy: {
  autoSync: boolean;
  autoSyncUnaccepted?: boolean;
}, recordStatus?: string | null): boolean {
  if (!policy.autoSync) return false;
  if (!recordStatus || recordStatus === "accepted") return true;
  return policy.autoSyncUnaccepted === true;
}

export function contextSnapshotIsOutdated(
  recordUpdatedAt: Date,
  snapshot?: { status: string; recordUpdatedAt: Date | null; lastSnapshotAt: Date | null } | null,
): boolean {
  return !snapshot?.lastSnapshotAt
    || snapshot.status === "sync_failed"
    || !snapshot.recordUpdatedAt
    || recordUpdatedAt > snapshot.recordUpdatedAt;
}
let contextSnapshotPublishQueue: Promise<void> = Promise.resolve();

function enqueueContextSnapshotPublish<T>(work: () => Promise<T>): Promise<T> {
  const result = contextSnapshotPublishQueue.then(work, work);
  contextSnapshotPublishQueue = result.then(() => undefined, () => undefined);
  return result;
}

export class ContextSnapshotGitHubPublisher {
  private branchReady: Promise<void> | null = null;

  constructor(
    private readonly options: {
      fetchImpl?: typeof fetch;
      token?: string;
      repository?: string;
      branch?: string;
    } = {},
  ) {}

  private async ensureBranch(
    fetchImpl: typeof fetch,
    repository: string,
    branch: string,
    headers: Record<string, string>,
  ): Promise<void> {
    if (branch === "main") return;
    if (this.branchReady) return this.branchReady;
    this.branchReady = (async () => {
      const encodedBranch = encodeURIComponent(branch);
      const branchRefUrl = `https://api.github.com/repos/${repository}/git/ref/heads/${encodedBranch}`;
      const existing = await fetchImpl(branchRefUrl, { headers });
      if (existing.ok) return;
      if (existing.status !== 404) {
        throw new Error(`GitHub could not verify the Context Snapshot branch (HTTP ${existing.status}).`);
      }

      const baseRefUrl = `https://api.github.com/repos/${repository}/git/ref/heads/main`;
      const base = await fetchImpl(baseRefUrl, { headers });
      if (!base.ok) throw new Error(`GitHub could not read main while creating the Context Snapshot branch (HTTP ${base.status}).`);
      const baseSha = String((await base.json() as { object?: { sha?: string } }).object?.sha || "");
      if (!baseSha) throw new Error("GitHub did not return the main branch commit.");

      const created = await fetchImpl(`https://api.github.com/repos/${repository}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });
      if (created.ok) return;
      if (created.status === 422) {
        const raced = await fetchImpl(branchRefUrl, { headers });
        if (raced.ok) return;
      }
      throw new Error(`GitHub could not create the Context Snapshot branch (HTTP ${created.status}).`);
    })();
    return this.branchReady;
  }

  async publish(
    path: string,
    content: string,
    message: string,
    previousPath?: string | null,
  ): Promise<{ path: string; commitSha: string }> {
    return enqueueContextSnapshotPublish(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await this.publishNow(path, content, message, previousPath);
        } catch (error) {
          const retryableConflict = error instanceof Error && error.message.includes("HTTP 409");
          if (!retryableConflict || attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, attempt * 250));
        }
      }
      throw new Error("Context Snapshot publish retry exhausted.");
    });
  }

  async publishFiles(
    files: Array<{ path: string; content: string | Buffer }>,
    message: string,
    deletePaths: string[] = [],
    deletePrefixes: string[] = [],
    deleteDirectoryScopes: Array<{ root: string; directoryPrefix: string }> = [],
  ): Promise<{ commitSha: string; changed: boolean }> {
    return enqueueContextSnapshotPublish(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await this.publishFilesNow(files, message, deletePaths, deletePrefixes, deleteDirectoryScopes);
        } catch (error) {
          const retryableConflict = error instanceof Error
            && (error.message.includes("HTTP 409") || error.message.includes("HTTP 422"));
          if (!retryableConflict || attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, attempt * 250));
        }
      }
      throw new Error("Context Snapshot batch publish retry exhausted.");
    });
  }

  private async publishFilesNow(
    files: Array<{ path: string; content: string | Buffer }>,
    message: string,
    deletePaths: string[],
    deletePrefixes: string[],
    deleteDirectoryScopes: Array<{ root: string; directoryPrefix: string }>,
  ): Promise<{ commitSha: string; changed: boolean }> {
    const token = this.options.token ?? process.env.GITHUB_TOKEN;
    const repository = this.options.repository
      ?? process.env.WORLDSMITH_CONTEXT_REPOSITORY
      ?? "Transition-Trails/Daybook";
    const branch = this.options.branch
      ?? process.env.WORLDSMITH_CONTEXT_BRANCH
      ?? "context-snapshots";
    if (!token) throw new Error("GitHub access is not configured.");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("The Context Snapshot repository is invalid.");
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
    await this.ensureBranch(fetchImpl, repository, branch, headers);
    const apiRoot = `https://api.github.com/repos/${repository}`;
    const refResponse = await fetchImpl(`${apiRoot}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
    if (!refResponse.ok) throw new Error(`GitHub could not read the Context Snapshot branch (HTTP ${refResponse.status}).`);
    const headSha = String((await refResponse.json() as { object?: { sha?: string } }).object?.sha || "");
    if (!headSha) throw new Error("GitHub did not return the Context Snapshot branch head.");
    const commitResponse = await fetchImpl(`${apiRoot}/git/commits/${headSha}`, { headers });
    if (!commitResponse.ok) throw new Error(`GitHub could not read the Context Snapshot commit (HTTP ${commitResponse.status}).`);
    const baseTreeSha = String((await commitResponse.json() as { tree?: { sha?: string } }).tree?.sha || "");
    if (!baseTreeSha) throw new Error("GitHub did not return the Context Snapshot tree.");
    const treeResponse = await fetchImpl(`${apiRoot}/git/trees/${baseTreeSha}?recursive=1`, { headers });
    if (!treeResponse.ok) throw new Error(`GitHub could not read the Context Snapshot tree (HTTP ${treeResponse.status}).`);
    const existingTree = (await treeResponse.json() as { tree?: Array<{ path?: string; sha?: string; type?: string }> }).tree ?? [];
    const existingByPath = new Map(existingTree.filter(entry => entry.type === "blob" && entry.path).map(entry => [entry.path!, entry.sha ?? ""]));

    const desired = new Map(files.map(file => [file.path, Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8")]));
    const gitBlobSha = (bytes: Buffer) => createHash("sha1")
      .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
      .digest("hex");
    const changedFiles = [...desired].filter(([filePath, bytes]) => existingByPath.get(filePath) !== gitBlobSha(bytes));
    const prefixDeletes = [...existingByPath.keys()].filter(filePath =>
      deletePrefixes.some(prefix => filePath.startsWith(prefix)),
    );
    const scopedDirectoryDeletes = [...existingByPath.keys()].filter(filePath =>
      deleteDirectoryScopes.some(({ root, directoryPrefix }) => {
        if (!filePath.startsWith(root)) return false;
        return filePath.slice(root.length).split("/").some(segment => segment.startsWith(directoryPrefix));
      }),
    );
    const actualDeletes = [...new Set([...deletePaths, ...prefixDeletes, ...scopedDirectoryDeletes])]
      .filter(filePath => existingByPath.has(filePath) && !desired.has(filePath));
    if (!changedFiles.length && !actualDeletes.length) return { commitSha: headSha, changed: false };

    const entries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string | null }> = [];
    for (const [filePath, bytes] of changedFiles) {
      const blobResponse = await fetchImpl(`${apiRoot}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: bytes.toString("base64"), encoding: "base64" }),
      });
      if (!blobResponse.ok) throw new Error(`GitHub could not upload ${filePath} (HTTP ${blobResponse.status}).`);
      const blobSha = String((await blobResponse.json() as { sha?: string }).sha || "");
      if (!blobSha) throw new Error(`GitHub did not return a blob for ${filePath}.`);
      entries.push({ path: filePath, mode: "100644", type: "blob", sha: blobSha });
    }
    for (const filePath of actualDeletes) entries.push({ path: filePath, mode: "100644", type: "blob", sha: null });
    const newTreeResponse = await fetchImpl(`${apiRoot}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
    });
    if (!newTreeResponse.ok) throw new Error(`GitHub could not prepare the Context Snapshot tree (HTTP ${newTreeResponse.status}).`);
    const newTreeSha = String((await newTreeResponse.json() as { sha?: string }).sha || "");
    const newCommitResponse = await fetchImpl(`${apiRoot}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message, tree: newTreeSha, parents: [headSha] }),
    });
    if (!newCommitResponse.ok) throw new Error(`GitHub could not create the Context Snapshot commit (HTTP ${newCommitResponse.status}).`);
    const commitSha = String((await newCommitResponse.json() as { sha?: string }).sha || "");
    if (!commitSha) throw new Error("GitHub did not return the Context Snapshot commit.");
    const updateRefResponse = await fetchImpl(`${apiRoot}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: commitSha, force: false }),
    });
    if (!updateRefResponse.ok) throw new Error(`GitHub could not advance the Context Snapshot branch (HTTP ${updateRefResponse.status}).`);
    return { commitSha, changed: true };
  }

  private async publishNow(
    path: string,
    content: string,
    message: string,
    previousPath?: string | null,
  ): Promise<{ path: string; commitSha: string }> {
    const token = this.options.token ?? process.env.GITHUB_TOKEN;
    const repository = this.options.repository
      ?? process.env.WORLDSMITH_CONTEXT_REPOSITORY
      ?? "Transition-Trails/Daybook";
    const branch = this.options.branch
      ?? process.env.WORLDSMITH_CONTEXT_BRANCH
      ?? "context-snapshots";
    if (!token) throw new Error("GitHub access is not configured.");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("The Context Snapshot repository is invalid.");
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = `https://api.github.com/repos/${repository}/contents/${path}`;
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
    await this.ensureBranch(fetchImpl, repository, branch, headers);
    const existing = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    let sha: string | undefined;
    if (existing.ok) sha = String((await existing.json() as { sha?: string }).sha || "") || undefined;
    else if (existing.status !== 404) throw new Error(`GitHub could not read the current snapshot (HTTP ${existing.status}).`);

    const response = await fetchImpl(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!response.ok) throw new Error(`GitHub could not update the snapshot (HTTP ${response.status}).`);
    const result = await response.json() as { content?: { path?: string }; commit?: { sha?: string } };
    if (!result.commit?.sha) throw new Error("GitHub did not return a commit for the snapshot.");
    const publishedPath = result.content?.path ?? path;
    if (previousPath && previousPath !== publishedPath) {
      const previousUrl = `https://api.github.com/repos/${repository}/contents/${previousPath}`;
      const previous = await fetchImpl(`${previousUrl}?ref=${encodeURIComponent(branch)}`, { headers });
      if (previous.ok) {
        const previousSha = String((await previous.json() as { sha?: string }).sha || "");
        if (!previousSha) throw new Error("GitHub did not return the previous snapshot blob for cleanup.");
        const removed = await fetchImpl(previousUrl, {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            message: `context: remove superseded snapshot ${previousPath}`,
            sha: previousSha,
            branch,
          }),
        });
        if (!removed.ok) throw new Error(`GitHub updated the snapshot but could not remove its previous path (HTTP ${removed.status}).`);
      } else if (previous.status !== 404) {
        throw new Error(`GitHub updated the snapshot but could not read its previous path (HTTP ${previous.status}).`);
      }
    }
    return { path: publishedPath, commitSha: result.commit.sha };
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]!, index);
    }
  }));

  return results;
}

export function editorialSnapshotPath(kind: string, record: { id: string; name?: string | null; worldId?: string | null }): string {
  const folder = `${kebab(kind)}s`;
  const base = `${kebab(record.id)}-${kebab(record.name || record.id)}.md`;
  return record.worldId
    ? `worlds/${kebab(record.worldId)}/context/${folder}/${base}`
    : `global/context/${folder}/${base}`;
}
