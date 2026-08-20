import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const GITHUB_API = "https://api.github.com";
const BASE_BRANCH = "main";

export type ReleaseNoteInput = {
  id: number;
  version: string;
  versionType: string;
  title: string;
  notes: Array<{ note: string }>;
};

export type GitCommitSummary = {
  sha: string;
  subject: string;
};

export type GitHealth = {
  safeToRequestReview: boolean;
  branch: string | null;
  head: string | null;
  origin: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: string[];
  conflicts: string[];
  isDetached: boolean;
  isRebasing: boolean;
  remoteSyncVerified: boolean;
  githubConfigured: boolean;
  blockers: string[];
  recentCommits: GitCommitSummary[];
};

export type PullRequestDetails = {
  number: number;
  url: string;
  merged: boolean;
  mergeSha: string | null;
  state: string;
  headRef: string;
  headSha: string;
  baseRef: string;
};

export type ReviewPreparation = {
  branch: string;
  commitSha: string;
  pullRequest: PullRequestDetails;
};

export class ReleaseGitError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 409,
    readonly code?: "CLOSED_REVIEW",
  ) {
    super(message);
    this.name = "ReleaseGitError";
  }
}

type RunGitOptions = {
  env?: NodeJS.ProcessEnv;
};

type RunGit = (args: string[], cwd?: string, options?: RunGitOptions) => Promise<string>;
type FetchLike = typeof fetch;

function repositoryRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (dirname(current) !== current) {
    if (existsSync(join(current, ".git"))) return current;
    current = dirname(current);
  }
  return resolve(start);
}

function redactOrigin(remote: string): string {
  return remote.replace(/:\/\/[^@]+@/, "://***@").trim();
}

export function parseGitHubRepository(remote: string): { owner: string; repo: string } | null {
  const normalised = remote.trim().replace(/\.git$/, "");
  const httpsMatch = normalised.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const sshMatch = normalised.match(/^git@github\.com:([^/]+)\/([^/]+)$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return null;
}

export function makeReviewBranch(version: string, releaseId: number, attempt: number): string {
  return `release/v${version}-r${releaseId}-a${attempt}`;
}

export function renderChangelog(existing: string, release: ReleaseNoteInput, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const title = release.title.replace(/[\r\n]+/g, " ").trim();
  const type = release.versionType.replace(/[\r\n]+/g, " ").trim();
  const bullets = release.notes
    .map(({ note }) => note.replace(/[\r\n]+/g, " ").trim())
    .filter(Boolean)
    .map(note => `- ${note}`)
    .join("\n");
  const entry = [
    `## [${release.version}] - ${day}`,
    "",
    `### ${type.charAt(0).toUpperCase()}${type.slice(1)} · ${title}`,
    "",
    bullets || "- Release notes pending.",
    "",
  ].join("\n");

  const content = existing.trim();
  if (!content) {
    return `# Changelog\n\nAll notable changes to Daybook are documented in this file.\n\n${entry}`;
  }

  const firstHeadingEnd = content.indexOf("\n");
  if (content.startsWith("# ") && firstHeadingEnd >= 0) {
    return `${content.slice(0, firstHeadingEnd + 1)}\n${entry}\n${content.slice(firstHeadingEnd + 1).trimStart()}\n`;
  }

  return `${entry}\n${content}\n`;
}

export function evaluateGitHealth(input: Omit<GitHealth, "safeToRequestReview" | "blockers">): GitHealth {
  const blockers: string[] = [];
  if (input.isRebasing) blockers.push("Git is currently rebasing. Finish or abort the rebase before requesting review.");
  if (input.isDetached) blockers.push("Git is detached from a branch. Switch back to main before requesting review.");
  if (!input.branch) blockers.push("Git could not determine the current branch.");
  if (input.branch && input.branch !== BASE_BRANCH) blockers.push(`Current branch is ${input.branch}; releases must start from ${BASE_BRANCH}.`);
  if (input.dirtyFiles.length > 0) blockers.push("The workspace has uncommitted changes. Commit or stash them before requesting review.");
  if (input.conflicts.length > 0) blockers.push("Git has unresolved conflicts. Resolve them before requesting review.");
  if (!input.origin) blockers.push("The GitHub origin remote is unavailable.");
  if (!input.remoteSyncVerified) blockers.push("GitHub branch divergence could not be verified. Check the origin remote connection before requesting review.");
  if (input.behind > 0) blockers.push(`GitHub ${BASE_BRANCH} has ${input.behind} commit${input.behind === 1 ? "" : "s"} not in this workspace. Reconcile it manually before requesting review.`);
  if (!input.githubConfigured) blockers.push("GitHub review access is not configured for this workspace.");

  return { ...input, blockers, safeToRequestReview: blockers.length === 0 };
}

function parseRecentCommits(raw: string): GitCommitSummary[] {
  return raw
    .split("\x1e")
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [sha, subject] = entry.split("\x1f");
      return { sha: sha?.slice(0, 12) ?? "", subject: subject ?? "" };
    })
    .filter(commit => Boolean(commit.sha));
}

function sanitiseFailure(error: unknown): string {
  if (error instanceof ReleaseGitError) return error.message;
  if (error instanceof Error) return error.message.replace(/https?:\/\/[^@\s]+@/g, "https://***@").slice(0, 240);
  return "The GitHub review request could not be completed.";
}

export class ReleaseGitService {
  private readonly root: string;
  private readonly run: RunGit;
  private readonly fetchImpl: FetchLike;

  constructor(options?: { root?: string; runGit?: RunGit; fetchImpl?: FetchLike }) {
    this.root = options?.root ?? repositoryRoot();
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.run = options?.runGit ?? (async (args, cwd = this.root, runOptions) => {
      try {
        const { stdout } = await execFileAsync("git", args, {
          cwd,
          env: { ...process.env, ...runOptions?.env },
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
        return stdout.trim();
      } catch {
        throw new ReleaseGitError("A required Git command could not be completed.", 503);
      }
    });
  }

  private async tryGit(args: string[], cwd?: string): Promise<string | null> {
    try {
      return await this.run(args, cwd);
    } catch {
      return null;
    }
  }

  async getHealth(): Promise<GitHealth> {
    const [branchRaw, headRaw, originRaw, dirtyRaw, conflictsRaw, rebaseRaw, divergenceRaw] = await Promise.all([
      this.tryGit(["symbolic-ref", "--short", "HEAD"]),
      this.tryGit(["rev-parse", "HEAD"]),
      this.tryGit(["remote", "get-url", "origin"]),
      this.tryGit(["status", "--porcelain=v1"]),
      this.tryGit(["diff", "--name-only", "--diff-filter=U"]),
      this.tryGit(["rev-parse", "-q", "--verify", "REBASE_HEAD"]),
      this.tryGit(["rev-list", "--left-right", "--count", `${BASE_BRANCH === "main" ? "origin/main" : BASE_BRANCH}...HEAD`]),
    ]);

    const branch = branchRaw?.trim() || null;
    const origin = originRaw ? redactOrigin(originRaw) : null;
    const repo = originRaw ? parseGitHubRepository(originRaw) : null;
    const divergenceParts = divergenceRaw?.trim().match(/^(\d+)\s+(\d+)$/);
    const behind = divergenceParts?.[1] ?? "0";
    const ahead = divergenceParts?.[2] ?? "0";
    const recentRaw = await this.tryGit([
      "log",
      "-8",
      "--pretty=format:%H%x1f%s%x1e",
      "HEAD",
    ]);

    return evaluateGitHealth({
      branch,
      head: headRaw?.trim() || null,
      origin,
      ahead: Number(ahead) || 0,
      behind: Number(behind) || 0,
      dirtyFiles: dirtyRaw?.split("\n").filter(Boolean) ?? [],
      conflicts: conflictsRaw?.split("\n").filter(Boolean) ?? [],
      isDetached: !branch,
      isRebasing: Boolean(rebaseRaw),
      remoteSyncVerified: Boolean(divergenceParts),
      githubConfigured: Boolean(repo && process.env.GITHUB_TOKEN),
      recentCommits: parseRecentCommits(recentRaw ?? ""),
    });
  }

  private async githubRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new ReleaseGitError("GitHub review access is not configured for this workspace.", 503);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetchImpl(`${GITHUB_API}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
      if (!response.ok) {
        throw new ReleaseGitError(
          response.status === 401 || response.status === 403
            ? "GitHub rejected the review credentials. Update the workspace GitHub connection before retrying."
            : `GitHub could not complete the review request (HTTP ${response.status}).`,
          502,
        );
      }
      return response.json() as Promise<T>;
    } catch (error) {
      if (error instanceof ReleaseGitError) throw error;
      throw new ReleaseGitError("GitHub did not respond to the review request. Please retry.", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureReviewPullRequest(
    repo: { owner: string; repo: string },
    branch: string,
    release: ReleaseNoteInput,
  ): Promise<PullRequestDetails> {
    const existing = await this.findReviewPullRequest(repo, branch);
    if (existing) return existing;
    const pull = await this.githubRequest<{
      number: number;
      html_url: string;
      merged: boolean;
      merge_commit_sha: string | null;
      state: string;
      head: { ref: string; sha: string };
      base: { ref: string };
    }>(
      `/repos/${repo.owner}/${repo.repo}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: `Release v${release.version}: ${release.title}`,
          head: branch,
          base: BASE_BRANCH,
          body: [
            `## Daybook v${release.version}`,
            "",
            "This review branch contains the accumulated local commits plus the approved changelog entry.",
            "",
            "### Release notes",
            ...release.notes.map(({ note }) => `- ${note.replace(/[\r\n]+/g, " ").trim()}`),
          ].join("\n"),
        }),
      },
    );
    return this.toPullRequestDetails(pull);
  }

  private async findReviewPullRequest(
    repo: { owner: string; repo: string },
    branch: string,
  ): Promise<PullRequestDetails | null> {
    const head = `${repo.owner}:${branch}`;
    const query = new URLSearchParams({ state: "all", head, base: BASE_BRANCH });
    const existing = await this.githubRequest<Array<{
      number: number;
      html_url: string;
      merged: boolean;
      merge_commit_sha: string | null;
      state: string;
      head: { ref: string; sha: string };
      base: { ref: string };
    }>>(`/repos/${repo.owner}/${repo.repo}/pulls?${query}`);
    const pull = existing[0];
    return pull ? this.toPullRequestDetails(pull) : null;
  }

  private toPullRequestDetails(pull: {
    number: number;
    html_url: string;
    merged: boolean;
    merge_commit_sha: string | null;
    state: string;
    head: { ref: string; sha: string };
    base: { ref: string };
  }): PullRequestDetails {
    return {
      number: pull.number,
      url: pull.html_url,
      merged: pull.merged,
      mergeSha: pull.merge_commit_sha,
      state: pull.state,
      headRef: pull.head.ref,
      headSha: pull.head.sha,
      baseRef: pull.base.ref,
    };
  }

  async prepareReview(release: ReleaseNoteInput, attempt: number): Promise<ReviewPreparation> {
    await this.run(["fetch", "--quiet", "origin"]);
    const health = await this.getHealth();
    if (!health.safeToRequestReview || !health.head || !health.origin) {
      throw new ReleaseGitError(health.blockers[0] ?? "Git is not ready for a review request.");
    }

    const originRaw = await this.tryGit(["remote", "get-url", "origin"]);
    const repo = originRaw ? parseGitHubRepository(originRaw) : null;
    if (!repo) throw new ReleaseGitError("The origin remote is not a supported GitHub repository.", 422);

    const branch = makeReviewBranch(release.version, release.id, attempt);
    const existingPullRequest = await this.findReviewPullRequest(repo, branch);
    if (existingPullRequest) {
      if (!existingPullRequest.merged && existingPullRequest.state !== "open") {
        throw new ReleaseGitError(
          "The prior GitHub review was closed without merging. The release can be returned to draft and reviewed again on a new branch.",
          409,
          "CLOSED_REVIEW",
        );
      }
      return { branch, commitSha: existingPullRequest.headSha, pullRequest: existingPullRequest };
    }

    const remoteBranch = await this.tryGit(["ls-remote", "--heads", "origin", `refs/heads/${branch}`]);
    const remoteCommitSha = remoteBranch?.trim().split(/\s+/)[0];
    if (remoteCommitSha) {
      const pullRequest = await this.ensureReviewPullRequest(repo, branch, release);
      return { branch, commitSha: remoteCommitSha, pullRequest };
    }

    const worktree = await mkdtemp(join(tmpdir(), "daybook-release-"));
    try {
      await this.run(["worktree", "add", "--detach", worktree, health.head]);
      await this.run(["-C", worktree, "switch", "-C", branch]);

      const changelogPath = join(worktree, "CHANGELOG.md");
      const existing = await readFile(changelogPath, "utf8").catch(() => "");
      await writeFile(changelogPath, renderChangelog(existing, release), "utf8");
      await this.run(["-C", worktree, "add", "--", "CHANGELOG.md"]);
      await this.run(["-C", worktree, "commit", "-m", `chore(release): v${release.version}`]);
      const commitSha = await this.run(["-C", worktree, "rev-parse", "HEAD"]);
      const pushAuthDir = await mkdtemp(join(tmpdir(), "daybook-release-askpass-"));
      try {
        const askPassPath = join(pushAuthDir, "askpass.sh");
        await writeFile(
          askPassPath,
          [
            "#!/bin/sh",
            'case "$1" in',
            '  *Username*) printf "%s\\n" "x-access-token" ;;',
            '  *) printf "%s\\n" "${GITHUB_TOKEN:?GitHub credentials are not configured}" ;;',
            "esac",
            "",
          ].join("\n"),
          { encoding: "utf8", mode: 0o700 },
        );
        await this.run(
          ["-C", worktree, "push", "origin", `${branch}:${branch}`],
          undefined,
          {
            env: {
              GIT_ASKPASS: askPassPath,
              GIT_TERMINAL_PROMPT: "0",
              GIT_CONFIG_COUNT: "1",
              GIT_CONFIG_KEY_0: "credential.helper",
              GIT_CONFIG_VALUE_0: "",
            },
          },
        );
      } finally {
        await rm(pushAuthDir, { recursive: true, force: true }).catch(() => undefined);
      }
      const pullRequest = await this.ensureReviewPullRequest(repo, branch, release);
      return { branch, commitSha, pullRequest };
    } catch (error) {
      throw new ReleaseGitError(sanitiseFailure(error), error instanceof ReleaseGitError ? error.statusCode : 502);
    } finally {
      await this.run(["worktree", "remove", "--force", worktree]).catch(() => undefined);
      await rm(worktree, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async getPullRequest(reviewBranch: string, pullRequestNumber: number): Promise<PullRequestDetails> {
    const origin = await this.tryGit(["remote", "get-url", "origin"]);
    const repo = origin ? parseGitHubRepository(origin) : null;
    if (!repo) throw new ReleaseGitError("The origin remote is not a supported GitHub repository.", 422);

    const pull = await this.githubRequest<{
      number: number;
      html_url: string;
      merged: boolean;
      merge_commit_sha: string | null;
      state: string;
      head: { ref: string; sha: string };
      base: { ref: string };
    }>(
      `/repos/${repo.owner}/${repo.repo}/pulls/${pullRequestNumber}`,
    );
    return this.toPullRequestDetails(pull);
  }
}