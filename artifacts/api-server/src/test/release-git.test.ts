import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateGitHealth,
  makeReviewBranch,
  parseGitHubRepository,
  ReleaseGitService,
  renderChangelog,
} from "../lib/release-git";

const baseHealth = {
  branch: "main",
  head: "a".repeat(40),
  origin: "https://github.com/Transition-Trails/Daybook.git",
  ahead: 3,
  behind: 0,
  dirtyFiles: [],
  conflicts: [],
  isDetached: false,
  isRebasing: false,
  remoteSyncVerified: true,
  githubConfigured: true,
  recentCommits: [{ sha: "abc123", subject: "Add release review flow" }],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("release Git safety", () => {
  it("allows committed local work to be included in a review branch", () => {
    const health = evaluateGitHealth(baseHealth);
    expect(health.safeToRequestReview).toBe(true);
    expect(health.blockers).toEqual([]);
    expect(health.ahead).toBe(3);
  });

  it("blocks a review when GitHub has commits missing locally", () => {
    const health = evaluateGitHealth({ ...baseHealth, ahead: 0, behind: 13 });
    expect(health.safeToRequestReview).toBe(false);
    expect(health.blockers.join(" ")).toContain("13 commits not in this workspace");
  });

  it("blocks dirty, detached, rebasing, and conflicted workspaces", () => {
    const health = evaluateGitHealth({
      ...baseHealth,
      branch: null,
      isDetached: true,
      isRebasing: true,
      dirtyFiles: [" M artifacts/admin/src/pages/super/Releases.tsx"],
      conflicts: ["artifacts/api-server/src/routes/releases.ts"],
    });
    expect(health.safeToRequestReview).toBe(false);
    expect(health.blockers).toHaveLength(5);
  });

  it("fails closed when remote divergence cannot be verified", () => {
    const health = evaluateGitHealth({ ...baseHealth, remoteSyncVerified: false });
    expect(health.safeToRequestReview).toBe(false);
    expect(health.blockers.join(" ")).toContain("divergence could not be verified");
  });

  it("reports local-ahead and remote-behind counts in the correct direction", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const runGit = vi.fn(async (args: string[]) => {
      const command = args.join(" ");
      if (command === "symbolic-ref --short HEAD") return "main";
      if (command === "rev-parse HEAD") return "f".repeat(40);
      if (command === "remote get-url origin") return "git@github.com:Transition-Trails/Daybook.git";
      if (command === "status --porcelain=v1") return "";
      if (command === "diff --name-only --diff-filter=U") return "";
      if (command === "rev-parse -q --verify REBASE_HEAD") throw new Error("not rebasing");
      if (command === "rev-list --left-right --count origin/main...HEAD") return "0 7";
      if (command.includes("log -8")) return `abcdef0123456789\x1fAdd guarded release flow\x1e`;
      throw new Error(`Unexpected git command: ${command}`);
    });
    const health = await new ReleaseGitService({ root: "/tmp", runGit }).getHealth();

    expect(health.safeToRequestReview).toBe(true);
    expect(health.ahead).toBe(7);
    expect(health.behind).toBe(0);
  });

  it("does not create a worktree when health is unsafe", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const runGit = vi.fn(async (args: string[]) => {
      const command = args.join(" ");
      if (command === "fetch --quiet origin") return "";
      if (command === "symbolic-ref --short HEAD") return "main";
      if (command === "rev-parse HEAD") return "f".repeat(40);
      if (command === "remote get-url origin") return "https://github.com/Transition-Trails/Daybook.git";
      if (command === "status --porcelain=v1") return "";
      if (command === "diff --name-only --diff-filter=U") return "";
      if (command === "rev-parse -q --verify REBASE_HEAD") throw new Error("not rebasing");
      if (command === "rev-list --left-right --count origin/main...HEAD") return "1 0";
      if (command.includes("log -8")) return "";
      throw new Error(`Unexpected git command: ${command}`);
    });
    const service = new ReleaseGitService({ root: "/tmp", runGit });

    await expect(service.prepareReview({
      id: 5,
      version: "1.2.3",
      versionType: "minor",
      title: "Release review",
      notes: [{ note: "Safe release work" }],
    }, 1)).rejects.toThrow("GitHub main has 1 commit");
    expect(runGit.mock.calls.some(([args]) => args[0] === "worktree")).toBe(false);
  });

  it("identifies a closed, unmerged review so the route can reset to a new draft attempt", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    const runGit = vi.fn(async (args: string[]) => {
      const command = args.join(" ");
      if (command === "fetch --quiet origin") return "";
      if (command === "symbolic-ref --short HEAD") return "main";
      if (command === "rev-parse HEAD") return "f".repeat(40);
      if (command === "remote get-url origin") return "https://github.com/Transition-Trails/Daybook.git";
      if (command === "status --porcelain=v1") return "";
      if (command === "diff --name-only --diff-filter=U") return "";
      if (command === "rev-parse -q --verify REBASE_HEAD") throw new Error("not rebasing");
      if (command === "rev-list --left-right --count origin/main...HEAD") return "0 0";
      if (command.includes("log -8")) return "";
      throw new Error(`Unexpected git command: ${command}`);
    });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      number: 42,
      html_url: "https://github.com/Transition-Trails/Daybook/pull/42",
      merged: false,
      merge_commit_sha: null,
      state: "closed",
      head: { ref: "release/v1.2.3-r5-a1", sha: "a".repeat(40) },
      base: { ref: "main" },
    }]), { status: 200 }));
    const service = new ReleaseGitService({ root: "/tmp", runGit, fetchImpl: fetchImpl as typeof fetch });

    await expect(service.prepareReview({
      id: 5,
      version: "1.2.3",
      versionType: "minor",
      title: "Release review",
      notes: [{ note: "Safe release work" }],
    }, 1)).rejects.toMatchObject({ code: "CLOSED_REVIEW" });
    expect(runGit.mock.calls.some(([args]) => args[0] === "worktree")).toBe(false);
  });
});

describe("release changelog helpers", () => {
  it("parses supported GitHub remote formats without exposing credentials", () => {
    expect(parseGitHubRepository("https://github.com/Transition-Trails/Daybook.git")).toEqual({
      owner: "Transition-Trails",
      repo: "Daybook",
    });
    expect(parseGitHubRepository("git@github.com:Transition-Trails/Daybook.git")).toEqual({
      owner: "Transition-Trails",
      repo: "Daybook",
    });
    expect(parseGitHubRepository("https://example.test/not-github")).toBeNull();
  });

  it("creates a deterministic review branch and changelog entry", () => {
    expect(makeReviewBranch("1.2.3", 9, 2)).toBe("release/v1.2.3-r9-a2");
    const changelog = renderChangelog(
      "# Changelog\n\nExisting entry.",
      {
        id: 9,
        version: "1.2.3",
        versionType: "minor",
        title: "Review\nsafe title",
        notes: [{ note: "First note\nwith one line" }],
      },
      new Date("2026-08-20T12:00:00Z"),
    );
    expect(changelog).toContain("## [1.2.3] - 2026-08-20");
    expect(changelog).toContain("### Minor · Review safe title");
    expect(changelog).toContain("- First note with one line");
  });
});