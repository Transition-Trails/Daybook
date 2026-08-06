/**
 * Platform release-tracking routes (super_admin only).
 *
 * GET    /platform/releases            — list all releases with notes
 * POST   /platform/releases            — create a draft release
 * PUT    /platform/releases/:id        — update draft (title/version/type/notes)
 * DELETE /platform/releases/:id        — delete draft (published releases are protected)
 * POST   /platform/releases/:id/publish — publish: stamp date, git push, mark published
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { releasesTable, releaseNotesTable } from "@workspace/db";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";

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

// ── GET /platform/releases ───────────────────────────────────────────────────

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
    if (existing.isPublished) {
      res.status(409).json({ error: "Published releases are immutable" });
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

    await db
      .update(releasesTable)
      .set({
        ...(body.version     ? { version:     body.version.trim() }     : {}),
        ...(body.versionType ? { versionType: body.versionType }         : {}),
        ...(body.title       ? { title:       body.title.trim() }        : {}),
        updatedAt: new Date(),
      })
      .where(eq(releasesTable.id, id));

    // Replace notes if provided
    if (Array.isArray(body.notes)) {
      await db
        .delete(releaseNotesTable)
        .where(eq(releaseNotesTable.releaseId, id));

      const noteTexts = body.notes.filter(n => n?.trim());
      if (noteTexts.length) {
        await db.insert(releaseNotesTable).values(
          noteTexts.map((note, i) => ({
            releaseId: id,
            sortOrder: i,
            note:      note.trim(),
          })),
        );
      }
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
    if (existing.isPublished) {
      res.status(409).json({ error: "Published releases cannot be deleted" });
      return;
    }

    await db.delete(releasesTable).where(eq(releasesTable.id, id));
    res.json({ ok: true });
  },
);

// ── POST /platform/releases/:id/publish ──────────────────────────────────────

router.post(
  "/platform/releases/:id/publish",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);

    const [existing] = await db
      .select()
      .from(releasesTable)
      .where(eq(releasesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Release not found" }); return; }
    if (existing.isPublished) {
      res.status(409).json({ error: "Release is already published" });
      return;
    }

    // Git push via Replit git-remote callback
    let githubSha: string | null = null;
    try {
      // gitPush is available as a CodeExecution callback; at runtime in Express we
      // call it via the child_process git CLI (same as the skill does under the hood).
      const { execSync } = await import("child_process");
      const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
      execSync("git push origin HEAD", { encoding: "utf8", stdio: "pipe" });
      githubSha = sha;
    } catch (pushErr) {
      // Non-fatal — record the error in sha so it's visible, but still publish.
      githubSha = `push-failed: ${(pushErr as Error).message.slice(0, 120)}`;
    }

    const [updated] = await db
      .update(releasesTable)
      .set({
        isPublished: true,
        releaseDate: new Date(),
        githubSha,
        updatedAt:  new Date(),
      })
      .where(eq(releasesTable.id, id))
      .returning();

    const result = await getReleaseWithNotes(updated.id);
    res.json(result);
  },
);

export default router;
