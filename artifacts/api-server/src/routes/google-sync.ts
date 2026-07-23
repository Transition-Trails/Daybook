/**
 * Google Sync routes — per spec/API-CONTRACT.md
 * GET /calendar/events, POST /calendar/push, GET+POST /tasks,
 * POST /docs, GET /drive/status, POST /drive/backup, POST /drive/art
 *
 * Real OAuth token exchange is stubbed — TODO when GOOGLE_CLIENT_ID is set.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, assetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { uploadPlannerConfig } from "../lib/drive-upload";
import type { User } from "@workspace/db";

const router: IRouter = Router();

function hasGoogleToken(user: User): boolean {
  return !!user.googleAccessToken;
}

// GET /calendar/events?start&end
router.get("/calendar/events", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!hasGoogleToken(user)) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: call Google Calendar API with user.googleAccessToken
  res.json({ events: [], message: "TODO: real Google Calendar fetch" });
});

// POST /calendar/push
router.post("/calendar/push", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!hasGoogleToken(user)) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: push planner blocks to Google Calendar
  const now = new Date();
  const conn1 = { ...(user.connections as Record<string, boolean>), googleCalendar: true };
  await db.update(usersTable).set({ connections: conn1 as typeof usersTable.$inferInsert["connections"] }).where(eq(usersTable.id, user.id));
  res.json({ success: true, syncedAt: now.toISOString(), itemCount: 0, message: "TODO: real Calendar push" });
});

// GET /tasks
router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!hasGoogleToken(user)) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: fetch Google Tasks
  res.json({ tasks: [], message: "TODO: real Google Tasks fetch" });
});

// POST /tasks
router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!hasGoogleToken(user)) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: sync tasks two-way
  res.json({ success: true, message: "TODO: real Tasks sync" });
});

// POST /docs
router.post("/docs", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!hasGoogleToken(user)) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: create Google Doc in Drive/Daybook folder
  res.json({ success: true, docId: null, message: "TODO: real Docs push" });
});

// GET /drive/status — shape matches SyncStatus type in the generated client
router.get("/drive/status", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const conn = (user.connections ?? {}) as Record<string, boolean | string | null>;
  res.json({
    connected: hasGoogleToken(user),
    // Last-synced timestamps — populated when sync actions complete
    calendarLastSynced: (conn.calendarLastSynced as string | null) ?? null,
    tasksLastSynced: (conn.tasksLastSynced as string | null) ?? null,
    docsLastSynced: (conn.docsLastSynced as string | null) ?? null,
    driveLastSynced: (conn.driveLastSynced as string | null) ?? null,
    driveFolder: (conn.driveFolderId as string | null) ?? null,
  });
});

// POST /drive/backup
// Body: { plannerId: string, config: unknown }
router.post("/drive/backup", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!hasGoogleToken(user)) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }

  const body = req.body as { plannerId?: string; config?: unknown };
  if (!body.plannerId) {
    res.status(400).json({ error: "plannerId is required" });
    return;
  }

  try {
    const configFileId = await uploadPlannerConfig(
      user.googleAccessToken,
      body.plannerId,
      body.config ?? {},
    );

    // Mark googleDrive connection as active
    const conn2 = { ...(user.connections as Record<string, boolean>), googleDrive: true };
    await db
      .update(usersTable)
      .set({ connections: conn2 as typeof usersTable.$inferInsert["connections"] })
      .where(eq(usersTable.id, user.id));

    res.json({ success: true, configFileId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /drive/art — upload or Canva import → Asset
router.post("/drive/art", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const body = req.body as {
    driveFileId?: string;
    canvaFileId?: string;
    kind?: "png" | "pdf";
    transparent?: boolean;
    tags?: string[];
  };

  if (!body.driveFileId && !body.canvaFileId) {
    res.status(400).json({ error: "driveFileId or canvaFileId required" });
    return;
  }

  // TODO: for canvaFileId, call Canva API to get the file then upload to Drive
  const driveFileId = body.driveFileId ?? `canva-import-${Date.now()}`;
  const source = body.canvaFileId ? "canva" : "upload";

  const [asset] = await db.insert(assetsTable).values({
    driveFileId,
    kind: body.kind ?? "png",
    transparent: body.transparent ?? true,
    tags: body.tags ?? [],
    source,
  }).returning();

  res.status(201).json(asset);
});

export default router;
