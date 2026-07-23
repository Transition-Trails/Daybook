/**
 * Google Sync routes — per spec/API-CONTRACT.md
 * GET /calendar/events, POST /calendar/push, GET+POST /tasks,
 * POST /docs, GET /drive/status, POST /drive/backup, POST /drive/art
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, assetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { uploadPlannerConfig } from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import type { User } from "@workspace/db";

const router: IRouter = Router();

/** Shape returned by Google Calendar API for a single event item. */
interface GCalEventItem {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Shared handler: resolve a valid token or reply with a reconnect response. */
async function resolveToken(
  user: User,
  res: import("express").Response,
): Promise<string | null> {
  try {
    return await getValidGoogleToken(user.id);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      res.status(401).json({
        error: "reconnect_required",
        reason: err.reason,
        message: err.message,
        reconnectUrl: "/api/auth/google",
      });
      return null;
    }
    throw err;
  }
}

// GET /calendar/events?start=<ISO>&end=<ISO>
router.get("/calendar/events", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const { start, end } = req.query as { start?: string; end?: string };
  const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime" });
  if (start) params.set("timeMin", start);
  if (end) params.set("timeMax", end);

  const gcRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!gcRes.ok) {
    const errText = await gcRes.text().catch(() => "");
    res.status(gcRes.status).json({ error: `Google Calendar error: ${errText}` });
    return;
  }

  const data = (await gcRes.json()) as { items?: GCalEventItem[] };

  const events = (data.items ?? []).map((item) => {
    const allDay = Boolean(item.start?.date && !item.start?.dateTime);
    return {
      id: item.id,
      title: item.summary ?? "(No title)",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      allDay,
      location: item.location ?? null,
    };
  });

  // Stamp last-synced time
  const conn = { ...(user.connections as Record<string, unknown>), calendarLastSynced: new Date().toISOString() };
  await db.update(usersTable).set({ connections: conn as unknown as typeof usersTable.$inferInsert["connections"] }).where(eq(usersTable.id, user.id));

  res.json({ events });
});

// POST /calendar/push
router.post("/calendar/push", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  // TODO: push planner blocks to Google Calendar
  const now = new Date();
  const conn = { ...(user.connections as Record<string, unknown>), googleCalendar: true, calendarLastSynced: now.toISOString() };
  await db.update(usersTable).set({ connections: conn as unknown as typeof usersTable.$inferInsert["connections"] }).where(eq(usersTable.id, user.id));
  res.json({ success: true, syncedAt: now.toISOString(), itemCount: 0, message: "TODO: real Calendar push" });
});

// GET /tasks
router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!user.googleAccessToken) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: fetch Google Tasks
  res.json({ tasks: [], message: "TODO: real Google Tasks fetch" });
});

// POST /tasks
router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!user.googleAccessToken) {
    res.status(400).json({ error: "Google account not connected" });
    return;
  }
  // TODO: sync tasks two-way
  res.json({ success: true, message: "TODO: real Tasks sync" });
});

// POST /docs
router.post("/docs", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  if (!user.googleAccessToken) {
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
  const connected = !!user.googleAccessToken;
  // Check token freshness
  const expiry = user.googleTokenExpiry;
  const tokenExpired = expiry ? expiry.getTime() - Date.now() <= 0 : null;
  res.json({
    connected,
    tokenExpired: connected ? tokenExpired : null,
    reconnectUrl: connected && tokenExpired ? "/api/auth/google" : null,
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
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const body = req.body as { plannerId?: string; config?: unknown };
  if (!body.plannerId) {
    res.status(400).json({ error: "plannerId is required" });
    return;
  }

  try {
    const configFileId = await uploadPlannerConfig(
      accessToken,
      body.plannerId,
      body.config ?? {},
    );

    const now = new Date();
    const conn = {
      ...(user.connections as Record<string, unknown>),
      googleDrive: true,
      driveLastSynced: now.toISOString(),
    };
    await db
      .update(usersTable)
      .set({ connections: conn as unknown as typeof usersTable.$inferInsert["connections"] })
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

  res.json(asset);
});

export default router;
