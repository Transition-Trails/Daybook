/**
 * Platform release-tracking routes (super_admin only).
 *
 * GET    /platform/releases            — list all releases with notes
 * POST   /platform/releases            — create a draft release
 * PUT    /platform/releases/:id        — update draft (title/version/type/notes)
 * DELETE /platform/releases/:id        — delete draft (published releases are protected)
 * GET    /platform/releases/git-health  — report whether Git is safe for review
 * POST   /platform/releases/:id/request-review — create guarded review branch + GitHub PR
 * POST   /platform/releases/:id/confirm-merge  — mark a merged PR as published
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { releasesTable, releaseNotesTable } from "@workspace/db";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { ReleaseGitError, ReleaseGitService, type ReleaseNoteInput } from "../lib/release-git";
import { logger } from "../lib/logger";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch a release + its notes eagerly joined. */
async function getReleaseWithNotes(id: number) {
  const [release] = await db
    .select()
    .from(releasesTable)
    .where(eq(releasesTable.id, id));

  if (!release) return null;

  const notes = await db
    .select()
    .from(releaseNotesTable)
    .where(eq(releaseNotesTable.releaseId, id))
    .orderBy(asc(releaseNotesTable.sortOrder));

  return { ...release, notes };
}

/** Validate a semver string of the form x.y.z (all non-negative integers). */
function isValidSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v.trim());
}

function releaseForGitHub(
  release: { id: number; version: string; versionType: string; title: string },
  notes: Array<{ note: string }>,
): ReleaseNoteInput {
  return {
    id: release.id,
    version: release.version,
    versionType: release.versionType,
    title: release.title,
    notes,
  };
}

function releaseErrorMessage(error: unknown): string {
  if (error instanceof ReleaseGitError) return error.message;
  return "Could not prepare the GitHub review. Please retry after checking the Git health panel.";
}

// ── GET /platform/releases ───────────────────────────────────────────────────

router.get(
  "/platform/releases/git-health",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const health = await new ReleaseGitService().getHealth();
      res.json(health);
    } catch (error) {
      logger.warn({ err: error }, "release Git health check failed");
      res.status(503).json({ error: "Git health could not be read right now." });
    }
  },
);

router.get(
  "/platform/releases",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const releases = await db
      .select()
      .from(releasesTable)
      .orderBy(desc(releasesTable.releaseDate), desc(releasesTable.createdAt));

    // Eager-join notes for all releases
    const ids = releases.map(r => r.id);
    const allNotes = ids.length
      ? await db
          .select()
          .from(releaseNotesTable)
          .where(
            ids.length === 1
              ? eq(releaseNotesTable.releaseId, ids[0])
              : inArray(releaseNotesTable.releaseId, ids)
          )
          .orderBy(asc(releaseNotesTable.sortOrder))
      : [];

    const result = releases.map(r => ({
      ...r,
      notes: allNotes.filter(n => n.releaseId === r.id),
    }));

    res.json(result);
  },
);

// ── POST /platform/releases ──────────────────────────────────────────────────

router.post(
  "/platform/releases",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      version?: string;
      versionType?: string;
      title?: string;
      notes?: string[];
    };

    if (!body.version?.trim()) {
      res.status(400).json({ error: "version is required" });
      return;
    }
    if (!isValidSemver(body.version)) {
      res.status(400).json({ error: "version must be a valid semver string (x.y.z)" });
      return;
    }
    if (!body.title?.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const validTypes = ["major", "minor", "bugfix"];
    if (!body.versionType || !validTypes.includes(body.versionType)) {
      res.status(400).json({ error: `versionType must be one of: ${validTypes.join(", ")}` });
      return;
    }

    // Check version uniqueness
    const [existing] = await db
      .select({ id: releasesTable.id })
      .from(releasesTable)
      .where(eq(releasesTable.version, body.version.trim()));
    if (existing) {
      res.status(409).json({ error: `Version ${body.version} already exists` });
      return;
    }

    const [release] = await db
      .insert(releasesTable)
      .values({
        version:     body.version.trim(),
        versionType: body.versionType,
        title:       body.title.trim(),
        isPublished: false,
      })
      .returning();

    // Insert notes
    const noteTexts = (body.notes ?? []).filter(n => n?.trim());
    if (noteTexts.length) {
      await db.insert(releaseNotesTable).values(
        noteTexts.map((note, i) => ({
          releaseId: release.id,
          sortOrder: i,
          note:      note.trim(),
        })),
      );
    }

    const result = await getReleaseWithNotes(release.id);
    res.status(201).json(result);
  },
);

// ── PUT /platform/releases/:id ───────────────────────────────────────────────

router.put(
  "/platform/releases/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    if (existing.isPublished || existing.reviewStatus !== "draft") {
      res.status(409).json({ error: "Release content is immutable once GitHub review preparation starts." });
      return;
    }

    const body = req.body as {
      version?: string;
      versionType?: string;
      title?: string;
      notes?: string[];
    };

    // Version uniqueness check (only if version changed)
    if (body.version && body.version.trim() !== existing.version) {
      if (!isValidSemver(body.version)) {
        res.status(400).json({ error: "version must be a valid semver string (x.y.z)" });
        return;
      }
      const [dup] = await db
        .select({ id: releasesTable.id })
        .from(releasesTable)
        .where(eq(releasesTable.version, body.version.trim()));
      if (dup) {
        res.status(409).json({ error: `Version ${body.version} already exists` });
        return;
      }
    }

    const validTypes = ["major", "minor", "bugfix"];
    if (body.versionType && !validTypes.includes(body.versionType)) {
      res.status(400).json({ error: `versionType must be one of: ${validTypes.join(", ")}` });
      return;
    }

    const didUpdate = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(releasesTable)
        .set({
          ...(body.version     ? { version:     body.version.trim() }     : {}),
          ...(body.versionType ? { versionType: body.versionType }         : {}),
          ...(body.title       ? { title:       body.title.trim() }        : {}),
          updatedAt: new Date(),
        })
        .where(and(
          eq(releasesTable.id, id),
          eq(releasesTable.reviewStatus, "draft"),
        ))
        .returning({ id: releasesTable.id });
      if (!updated) return false;

      if (Array.isArray(body.notes)) {
        await tx
          .delete(releaseNotesTable)
          .where(eq(releaseNotesTable.releaseId, id));

        const noteTexts = body.notes.filter(n => n?.trim());
        if (noteTexts.length) {
          await tx.insert(releaseNotesTable).values(
            noteTexts.map((note, i) => ({
              releaseId: id,
              sortOrder: i,
              note:      note.trim(),
            })),
          );
        }
      }
      return true;
    });
    if (!didUpdate) {
      res.status(409).json({ error: "Release content is immutable once GitHub review preparation starts." });
      return;
    }

    const result = await getReleaseWithNotes(id);
    res.json(result);
  },
);

// ── DELETE /platform/releases/:id ────────────────────────────────────────────

router.delete(
  "/platform/releases/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    if (existing.isPublished || existing.reviewStatus !== "draft") {
      res.status(409).json({ error: "A release cannot be deleted once GitHub review preparation starts." });
      return;
    }

    const [deleted] = await db
      .delete(releasesTable)
      .where(and(
        eq(releasesTable.id, id),
        eq(releasesTable.reviewStatus, "draft"),
      ))
      .returning({ id: releasesTable.id });
    if (!deleted) {
      res.status(409).json({ error: "A release cannot be deleted once GitHub review preparation starts." });
      return;
    }
    res.json({ ok: true });
  },
);

// ── POST /platform/releases/:id/request-review ───────────────────────────────

router.post(
  "/platform/releases/:id/request-review",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (req.body?.approved !== true) {
      res.status(400).json({ error: "Explicit approval is required before a GitHub review can be created." });
      return;
    }

    const [existing] = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    if (existing.isPublished) {
      res.status(409).json({ error: "This release is already published." });
      return;
    }
    if (existing.reviewStatus === "review_requested") {
      const result = await getReleaseWithNotes(id);
      res.json(result);
      return;
    }
    if (existing.reviewStatus === "preparing") {
      res.status(409).json({ error: "A GitHub review is already being prepared for this release." });
      return;
    }

    const gitService = new ReleaseGitService();
    const health = await gitService.getHealth();
    if (!health.safeToRequestReview) {
      res.status(409).json({
        error: health.blockers[0] ?? "Git is not ready for a review request.",
        blockers: health.blockers,
      });
      return;
    }
    const attempt = existing.reviewStatus === "failed" && existing.reviewBranch
      ? existing.reviewAttempt
      : existing.reviewAttempt + 1;
    const reviewBranch = existing.reviewBranch ?? `release/v${existing.version}-r${existing.id}-a${attempt}`;
    const [transitioned] = await db
      .update(releasesTable)
      .set({
        reviewStatus: "preparing",
        reviewAttempt: attempt,
        reviewBranch,
        reviewError: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(releasesTable.id, id),
        inArray(releasesTable.reviewStatus, ["draft", "failed"]),
      ))
      .returning();
    if (!transitioned) {
      res.status(409).json({ error: "This release changed while review was being prepared. Refresh and retry." });
      return;
    }
    const notes = await db
      .select()
      .from(releaseNotesTable)
      .where(eq(releaseNotesTable.releaseId, id))
      .orderBy(asc(releaseNotesTable.sortOrder));

    try {
      const prepared = await gitService.prepareReview(
        releaseForGitHub(transitioned, notes),
        attempt,
      );
      const [saved] = await db
        .update(releasesTable)
        .set({
          reviewStatus: "review_requested",
          reviewBranch: prepared.branch,
          pullRequestUrl: prepared.pullRequest.url,
          pullRequestNumber: prepared.pullRequest.number,
          reviewCommitSha: prepared.commitSha,
          reviewRequestedAt: new Date(),
          reviewError: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(releasesTable.id, id),
          eq(releasesTable.reviewStatus, "preparing"),
          eq(releasesTable.reviewAttempt, attempt),
        ))
        .returning();
      if (!saved) {
        throw new ReleaseGitError("The GitHub review was created, but this release changed before it could be recorded. Refresh before retrying.", 409);
      }
      const result = await getReleaseWithNotes(id);
      res.json(result);
    } catch (error) {
      const message = releaseErrorMessage(error);
      const closedReview = error instanceof ReleaseGitError && error.code === "CLOSED_REVIEW";
      logger.warn({ releaseId: id, message }, "release GitHub review preparation failed");
      await db
        .update(releasesTable)
        .set({
          reviewStatus: closedReview ? "draft" : "failed",
          ...(closedReview ? {
            reviewBranch: null,
            pullRequestUrl: null,
            pullRequestNumber: null,
            reviewCommitSha: null,
            reviewRequestedAt: null,
          } : {}),
          reviewError: message,
          updatedAt: new Date(),
        })
        .where(and(
          eq(releasesTable.id, id),
          eq(releasesTable.reviewStatus, "preparing"),
          eq(releasesTable.reviewAttempt, attempt),
        ));
      res.status(error instanceof ReleaseGitError ? error.statusCode : 502).json({ error: message });
    }
  },
);

// ── POST /platform/releases/:id/confirm-merge ────────────────────────────────

router.post(
  "/platform/releases/:id/confirm-merge",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    if (existing.isPublished) {
      const result = await getReleaseWithNotes(id);
      res.json(result);
      return;
    }
    if (
      existing.reviewStatus !== "review_requested"
      || !existing.reviewBranch
      || !existing.pullRequestNumber
    ) {
      res.status(409).json({ error: "Request GitHub review before confirming a merge." });
      return;
    }

    try {
      const pullRequest = await new ReleaseGitService().getPullRequest(
        existing.reviewBranch,
        existing.pullRequestNumber,
      );
      if (!pullRequest.merged) {
        res.status(409).json({
          error: "The GitHub pull request has not been merged yet.",
          pullRequestUrl: pullRequest.url,
        });
        return;
      }
      if (
        pullRequest.headRef !== existing.reviewBranch
        || pullRequest.baseRef !== "main"
        || (existing.reviewCommitSha && pullRequest.headSha !== existing.reviewCommitSha)
      ) {
        res.status(409).json({
          error: "The merged pull request no longer matches this release’s approved review branch and commit.",
          pullRequestUrl: pullRequest.url,
        });
        return;
      }

      await db
      .update(releasesTable)
      .set({
        isPublished: true,
        releaseDate: new Date(),
        githubSha: pullRequest.mergeSha,
        reviewStatus: "merged",
        mergedAt: new Date(),
        reviewError: null,
        updatedAt: new Date(),
      })
      .where(eq(releasesTable.id, id))
      const result = await getReleaseWithNotes(id);
      res.json(result);
    } catch (error) {
      const message = releaseErrorMessage(error);
      logger.warn({ releaseId: id, message }, "release GitHub merge confirmation failed");
      res.status(error instanceof ReleaseGitError ? error.statusCode : 502).json({ error: message });
    }
  },
);

// Kept as a clear, non-mutating migration path for older clients.
router.post(
  "/platform/releases/:id/publish",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      error: "Direct publishing is disabled. Request GitHub review, merge the pull request, then confirm the merge.",
    });
  },
);

export default router;
