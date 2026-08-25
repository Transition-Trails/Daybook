/**
 * Google Sync routes — per spec/API-CONTRACT.md
 * GET  /calendar/events
 * POST /calendar/push        — idempotent: creates or patches Google Calendar events
 * GET  /tasks                — pull from Google Tasks + sync local mirror
 * POST /tasks                — create a new task in Google Tasks
 * PATCH /tasks/:googleTaskId — update / complete a task
 * DELETE /tasks/:googleTaskId
 * POST /docs                 — create a Google Doc from note content
 * GET  /status              — Google connection state (legacy: /drive/status)
 * POST /drive/backup
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  storeMembersTable,
  calendarPushMappingsTable,
  googleTaskSyncTable,
  googleDocLinksTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth-middleware";
import { uploadPlannerConfig, getOrCreateDaybookFolder, uploadFileToDrive } from "../lib/drive-upload";
import { getValidGoogleToken, GoogleAuthError, GoogleTokenTemporaryError } from "../lib/google-auth";
import { stampGoogleSync } from "../lib/google-connection-state";
import { writeAudit } from "../lib/audit";
import { resolveGoogleAuditActor } from "../lib/google-audit-actor";
import type { User } from "@workspace/db";

const router: IRouter = Router();

// ── Google API base URLs ──────────────────────────────────────────────────────

const GCAL_BASE   = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GTASKS_BASE = "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FILES  = "https://www.googleapis.com/drive/v3/files";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface GCalEventItem {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface GTaskItem {
  id: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
  completed?: string;
}

type GoogleAuditEntry = Omit<Parameters<typeof writeAudit>[1], "actorUserId" | "actorRole" | "scope">;

/**
 * Google sync is personal to the authenticated user, but audit history must
 * identify the store context when the user is a store member. Prefer the
 * explicit selected-store header; otherwise use a deterministic membership.
 */
async function writeGoogleAudit(
  req: import("express").Request,
  user: User,
  entry: GoogleAuditEntry,
): Promise<void> {
  const requestedStoreId = typeof req.headers["x-store-id"] === "string"
    ? req.headers["x-store-id"]
    : undefined;
  const memberships = await db
    .select({ storeId: storeMembersTable.storeId, role: storeMembersTable.role })
    .from(storeMembersTable)
    .where(eq(storeMembersTable.userId, user.id))
    .orderBy(storeMembersTable.storeId);
  const actor = resolveGoogleAuditActor({
    platformRole: user.platformRole,
    selectedStoreId: requestedStoreId,
    memberships,
  });

  await writeAudit(db, {
    ...entry,
    actorUserId: user.id,
    ...actor,
  });
}

function parseAllDayDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? timestamp
    : null;
}

/** Resolve a valid Google access token or write a 401 reconnect response. */
async function resolveToken(user: User, res: import("express").Response): Promise<string | null> {
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
    if (err instanceof GoogleTokenTemporaryError) {
      res.status(503).json({
        error: "google_temporarily_unavailable",
        message: "Google is temporarily unavailable. Your connection is still active; please retry shortly.",
      });
      return null;
    }
    throw err;
  }
}

/**
 * Check whether a failed Google API response is an insufficient-scope / permission-denied error.
 * Google returns HTTP 403 with reason "insufficientPermissions" or status "PERMISSION_DENIED"
 * when the access token is valid but is missing a scope (e.g. tasks scope added after auth).
 * We treat this identically to a token failure: return reconnect_required so the banner fires
 * and the user re-consents with the new scope.
 *
 * Returns true if the caller should stop processing (response already written).
 */
function replyIfScopeError(
  res: import("express").Response,
  status: number,
  errText: string,
): boolean {
  if (status !== 403) return false;

  // Google 403 for scope issues contains "insufficientPermissions" or "PERMISSION_DENIED"
  const isScope =
    errText.includes("insufficientPermissions") ||
    errText.includes("PERMISSION_DENIED") ||
    errText.includes("insufficient authentication scopes") ||
    errText.includes("Request had insufficient");

  if (!isScope) return false;

  res.status(401).json({
    error:        "reconnect_required",
    reason:       "disconnected",
    message:      "Insufficient Google permissions — please reconnect to grant the required scopes.",
    reconnectUrl: "/api/auth/google",
  });
  return true;
}

// ── GET /calendar/events ──────────────────────────────────────────────────────

router.get("/calendar/events", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const { start, end } = req.query as { start?: string; end?: string };
  const params = new URLSearchParams({ singleEvents: "true", orderBy: "startTime" });
  if (start) params.set("timeMin", start);
  if (end)   params.set("timeMax", end);

  const gcRes = await fetch(`${GCAL_BASE}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!gcRes.ok) {
    const errText = await gcRes.text().catch(() => "");
    if (replyIfScopeError(res, gcRes.status, errText)) return;
    res.status(gcRes.status).json({ error: `Google Calendar error: ${errText}` });
    return;
  }

  const data = (await gcRes.json()) as { items?: GCalEventItem[] };
  const events = (data.items ?? []).map((item) => {
    const allDay = Boolean(item.start?.date && !item.start?.dateTime);
    return {
      id:       item.id,
      title:    item.summary ?? "(No title)",
      start:    item.start?.dateTime ?? item.start?.date ?? "",
      end:      item.end?.dateTime   ?? item.end?.date   ?? "",
      allDay,
      location: item.location ?? null,
    };
  });

  await stampGoogleSync(user.id, "calendarLastSynced");

  res.json({ events });
});

// ── POST /calendar/push ───────────────────────────────────────────────────────
// Body: { plannerConfigId: string, blocks: [{ title, startDate, endDate, description? }] }
// Idempotent: if a block was already pushed (same plannerConfigId + title+startDate key),
// patches the existing Google Calendar event instead of creating a duplicate.

router.post("/calendar/push", requireAuth, async (req, res): Promise<void> => {
  type Block = { title: string; startDate: string; endDate: string; description?: string };
  const body = req.body as { plannerConfigId?: string; blocks?: Block[] };

  if (!body.plannerConfigId) {
    res.status(400).json({ error: "plannerConfigId is required" });
    return;
  }
  if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
    res.status(400).json({ error: "blocks[] must be a non-empty array" });
    return;
  }
  if (body.blocks.some((block) => {
    const start = parseAllDayDate(block.startDate ?? "");
    const end = parseAllDayDate(block.endDate ?? "");
    return !block.title?.trim() || start === null || end === null || end <= start;
  })) {
    res.status(400).json({
      error: "Each calendar block needs a title and an end-exclusive date range (YYYY-MM-DD, endDate after startDate)",
    });
    return;
  }

  // Planner blocks contain dates but no time or timezone fields. They are
  // intentionally sent as Google all-day events; do not invent a timezone.
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const results: { localBlockKey: string; googleEventId: string; action: "created" | "updated" }[] = [];
  const plannerConfigId = String(body.plannerConfigId);

  for (const block of body.blocks) {
    const localBlockKey = `${block.title}|${block.startDate}`;

    // Check for existing mapping
    const [existing] = await db
      .select()
      .from(calendarPushMappingsTable)
      .where(
        and(
          eq(calendarPushMappingsTable.userId, user.id),
          eq(calendarPushMappingsTable.plannerConfigId, plannerConfigId),
          eq(calendarPushMappingsTable.localBlockKey, localBlockKey),
        ),
      );

    const eventBody = {
      summary:     block.title,
      description: block.description ?? "",
      start: { date: block.startDate },
      end:   { date: block.endDate   },
    };

    if (existing) {
      // Patch existing event
      const patchRes = await fetch(`${GCAL_BASE}/${existing.googleEventId}`, {
        method:  "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });
      if (!patchRes.ok) {
        const errText = await patchRes.text().catch(() => "");
        // If event was deleted on Google's side, fall through and recreate below
        if (patchRes.status !== 410 && patchRes.status !== 404) {
          if (replyIfScopeError(res, patchRes.status, errText)) return;
          res.status(patchRes.status).json({ error: `Calendar PATCH failed: ${errText}` });
          return;
        }
        // Event gone on Google — delete stale mapping and fall through to create
        await db.delete(calendarPushMappingsTable).where(eq(calendarPushMappingsTable.id, existing.id));
      } else {
        await db
          .update(calendarPushMappingsTable)
          .set({ pushedAt: new Date(), eventTitle: block.title, startDate: block.startDate, endDate: block.endDate })
          .where(eq(calendarPushMappingsTable.id, existing.id));
        results.push({ localBlockKey, googleEventId: existing.googleEventId, action: "updated" });
        continue;
      }
    }

    // Create new event
    const createRes = await fetch(`${GCAL_BASE}?fields=id`, {
      method:  "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventBody),
    });
    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      if (replyIfScopeError(res, createRes.status, errText)) return;
      res.status(createRes.status).json({ error: `Calendar INSERT failed: ${errText}` });
      return;
    }

    const created = (await createRes.json()) as { id: string };
    await db.insert(calendarPushMappingsTable).values({
      userId:          user.id,
      plannerConfigId,
      localBlockKey,
      googleEventId:   created.id,
      googleCalendarId: "primary",
      eventTitle:      block.title,
      startDate:       block.startDate,
      endDate:         block.endDate,
    });
    results.push({ localBlockKey, googleEventId: created.id, action: "created" });
  }

  const now = new Date();
  await stampGoogleSync(user.id, "calendarLastSynced");

  await writeGoogleAudit(req, user, {
    action:      "calendar.push",
    metadata:    { plannerConfigId, itemCount: results.length },
  });

  res.json({ success: true, syncedAt: now.toISOString(), itemCount: results.length, results });
});

// ── GET /tasks ────────────────────────────────────────────────────────────────
// Pulls tasks from Google Tasks API, syncs local mirror, returns merged list.

router.get("/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const showCompleted = (req.query.showCompleted as string) !== "false";
  const params = new URLSearchParams({
    showCompleted: String(showCompleted),
    maxResults:    "100",
    showHidden:    "true",
  });

  const gtRes = await fetch(`${GTASKS_BASE}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!gtRes.ok) {
    const errText = await gtRes.text().catch(() => "");
    if (replyIfScopeError(res, gtRes.status, errText)) return;
    res.status(gtRes.status).json({ error: `Google Tasks error: ${errText}` });
    return;
  }

  const data = (await gtRes.json()) as { items?: GTaskItem[] };
  const items = (data.items ?? []).filter((t) => t.id);

  // Upsert local mirror for each fetched task
  for (const item of items) {
    const completed = item.status === "completed";
    await db
      .insert(googleTaskSyncTable)
      .values({
        userId:          user.id,
        googleTaskId:    item.id,
        googleTaskListId: "@default",
        title:           item.title ?? "(No title)",
        notes:           item.notes ?? null,
        completed,
        dueDate:         item.due ? item.due.slice(0, 10) : null,
        syncedAt:        new Date(),
      })
      .onConflictDoUpdate({
        target: [googleTaskSyncTable.userId, googleTaskSyncTable.googleTaskId],
        set: {
          title:     item.title ?? "(No title)",
          notes:     item.notes ?? null,
          completed,
          dueDate:   item.due ? item.due.slice(0, 10) : null,
          syncedAt:  new Date(),
        },
      });
  }

  await stampGoogleSync(user.id, "tasksLastSynced");

  const tasks = items.map((item) => ({
    googleTaskId: item.id,
    title:        item.title ?? "(No title)",
    notes:        item.notes ?? null,
    completed:    item.status === "completed",
    dueDate:      item.due ? item.due.slice(0, 10) : null,
  }));

  res.json({ tasks, syncedAt: new Date().toISOString() });
});

// ── POST /tasks ───────────────────────────────────────────────────────────────
// Create a new task in Google Tasks (and mirror locally).
// Body: { title, notes?, dueDate? (YYYY-MM-DD) }

router.post("/tasks", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const body = req.body as { title?: string; notes?: string; dueDate?: string };
  if (!body.title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const taskPayload: Record<string, unknown> = {
    title:  body.title.trim(),
    status: "needsAction",
  };
  if (body.notes)   taskPayload.notes = body.notes;
  if (body.dueDate) taskPayload.due   = `${body.dueDate}T00:00:00.000Z`;

  const createRes = await fetch(GTASKS_BASE, {
    method:  "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(taskPayload),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    if (replyIfScopeError(res, createRes.status, errText)) return;
    res.status(createRes.status).json({ error: `Google Tasks create failed: ${errText}` });
    return;
  }

  const created = (await createRes.json()) as GTaskItem;

  await db.insert(googleTaskSyncTable).values({
    userId:          user.id,
    googleTaskId:    created.id,
    googleTaskListId: "@default",
    title:           created.title ?? body.title.trim(),
    notes:           created.notes ?? body.notes ?? null,
    completed:       false,
    dueDate:         body.dueDate ?? null,
    syncedAt:        new Date(),
  }).onConflictDoUpdate({
    target: [googleTaskSyncTable.userId, googleTaskSyncTable.googleTaskId],
    set: { title: created.title ?? body.title.trim(), syncedAt: new Date() },
  });

  await stampGoogleSync(user.id, "tasksLastSynced");

  await writeGoogleAudit(req, user, {
    action:      "tasks.create",
    targetId:    created.id,
    metadata:    { title: body.title },
  });

  res.status(201).json({
    googleTaskId: created.id,
    title:        created.title ?? body.title.trim(),
    notes:        created.notes ?? null,
    completed:    false,
    dueDate:      body.dueDate ?? null,
  });
});

// ── PATCH /tasks/:googleTaskId ────────────────────────────────────────────────
// Update or complete a task. Body: { title?, notes?, dueDate?, completed? }

router.patch("/tasks/:googleTaskId", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const googleTaskId = String(req.params.googleTaskId);
  const body = req.body as { title?: string; notes?: string; dueDate?: string; completed?: boolean };

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined)   patch.title  = body.title;
  if (body.notes !== undefined)   patch.notes  = body.notes;
  if (body.dueDate !== undefined) patch.due    = `${body.dueDate}T00:00:00.000Z`;
  if (body.completed !== undefined) {
    patch.status    = body.completed ? "completed" : "needsAction";
    if (body.completed) patch.completed = new Date().toISOString();
  }

  const patchRes = await fetch(`${GTASKS_BASE}/${encodeURIComponent(googleTaskId)}`, {
    method:  "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text().catch(() => "");
    if (replyIfScopeError(res, patchRes.status, errText)) return;
    res.status(patchRes.status).json({ error: `Google Tasks update failed: ${errText}` });
    return;
  }

  const updated = (await patchRes.json()) as GTaskItem;

  // Update local mirror
  const localSet: Partial<typeof googleTaskSyncTable.$inferInsert> = { syncedAt: new Date() };
  if (body.title !== undefined)     localSet.title     = body.title;
  if (body.notes !== undefined)     localSet.notes     = body.notes;
  if (body.dueDate !== undefined)   localSet.dueDate   = body.dueDate;
  if (body.completed !== undefined) localSet.completed = body.completed;

  await db
    .update(googleTaskSyncTable)
    .set(localSet)
    .where(
      and(
        eq(googleTaskSyncTable.userId, user.id),
        eq(googleTaskSyncTable.googleTaskId, googleTaskId),
      ),
    );

  await writeGoogleAudit(req, user, {
    action:      body.completed ? "tasks.complete" : "tasks.update",
    targetId:    googleTaskId,
    metadata:    patch,
  });

  res.json({
    googleTaskId: updated.id,
    title:        updated.title ?? "",
    notes:        updated.notes ?? null,
    completed:    updated.status === "completed",
    dueDate:      updated.due ? updated.due.slice(0, 10) : null,
  });
});

// ── DELETE /tasks/:googleTaskId ───────────────────────────────────────────────

router.delete("/tasks/:googleTaskId", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const googleTaskId = String(req.params.googleTaskId);

  const deleteRes = await fetch(`${GTASKS_BASE}/${encodeURIComponent(googleTaskId)}`, {
    method:  "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!deleteRes.ok && deleteRes.status !== 404) {
    const errText = await deleteRes.text().catch(() => "");
    if (replyIfScopeError(res, deleteRes.status, errText)) return;
    res.status(deleteRes.status).json({ error: `Google Tasks delete failed: ${errText}` });
    return;
  }

  await db
    .delete(googleTaskSyncTable)
    .where(
      and(
        eq(googleTaskSyncTable.userId, user.id),
        eq(googleTaskSyncTable.googleTaskId, googleTaskId),
      ),
    );

  await writeGoogleAudit(req, user, {
    action:      "tasks.delete",
    targetId:    googleTaskId,
  });

  res.json({ success: true });
});

// ── POST /docs ────────────────────────────────────────────────────────────────
// Create a Google Doc from note content. Idempotent via noteKey.
// Body: { title, content, noteKey? }

router.post("/docs", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const accessToken = await resolveToken(user, res);
  if (!accessToken) return;

  const body = req.body as { title?: string; content?: string; noteKey?: string };

  if (!body.title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  if (!body.content?.trim()) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const noteKey = body.noteKey ?? `${body.title.trim()}|${Date.now()}`;

  // Check for existing doc mapping (idempotency on noteKey)
  const [existing] = await db
    .select()
    .from(googleDocLinksTable)
    .where(
      and(
        eq(googleDocLinksTable.userId, user.id),
        eq(googleDocLinksTable.noteKey, noteKey),
      ),
    );

  if (existing) {
    res.json({ success: true, docId: existing.docId, docUrl: existing.docUrl, existing: true });
    return;
  }

  // Get or create the Daybook Drive folder
  let folderId: string;
  try {
    folderId = await getOrCreateDaybookFolder(user.id, accessToken);
  } catch (err) {
    res.status(500).json({ error: `Drive folder error: ${String(err)}` });
    return;
  }

  // Create a Google Doc via Drive multipart upload.
  // Using text/plain content with application/vnd.google-apps.document MIME causes
  // Drive to import the content as a Google Doc — no Docs API scope required.
  const boundary = "daybook_doc_boundary";
  const metadata = JSON.stringify({
    name:     body.title.trim(),
    mimeType: "application/vnd.google-apps.document",
    parents:  [folderId],
  });
  const textContent = Buffer.from(body.content.trim(), "utf-8");
  const bodyParts = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`),
    textContent,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadParams = new URLSearchParams({ uploadType: "multipart", fields: "id,webViewLink" });
  const uploadRes = await fetch(`${DRIVE_UPLOAD}?${uploadParams}`, {
    method:  "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: bodyParts,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    if (replyIfScopeError(res, uploadRes.status, errText)) return;
    res.status(uploadRes.status).json({ error: `Google Docs create failed: ${errText}` });
    return;
  }

  const docData = (await uploadRes.json()) as { id?: string; webViewLink?: string };
  if (!docData.id || !docData.webViewLink) {
    res.status(500).json({ error: "Docs API returned no id or webViewLink" });
    return;
  }

  // Store mapping
  await db.insert(googleDocLinksTable).values({
    userId:  user.id,
    noteKey,
    title:   body.title.trim(),
    docId:   docData.id,
    docUrl:  docData.webViewLink,
  });

  await stampGoogleSync(user.id, "docsLastSynced");

  await writeGoogleAudit(req, user, {
    action:      "docs.create",
    targetId:    docData.id,
    metadata:    { title: body.title, noteKey },
  });

  res.status(201).json({ success: true, docId: docData.id, docUrl: docData.webViewLink, existing: false });
});

// ── GET /docs ─────────────────────────────────────────────────────────────────
// Return the user's created Google Doc links.

router.get("/docs", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const docs = await db
    .select()
    .from(googleDocLinksTable)
    .where(eq(googleDocLinksTable.userId, user.id));
  res.json({ docs });
});

// ── GET /calendar/pushes ──────────────────────────────────────────────────────
// Return recent calendar push mappings for a planner.

router.get("/calendar/pushes", requireAuth, async (req, res): Promise<void> => {
  const user = req.user as User;
  const { plannerConfigId } = req.query as { plannerConfigId?: string };
  const where = plannerConfigId
    ? and(eq(calendarPushMappingsTable.userId, user.id), eq(calendarPushMappingsTable.plannerConfigId, plannerConfigId))
    : eq(calendarPushMappingsTable.userId, user.id);
  const pushes = await db.select().from(calendarPushMappingsTable).where(where);
  res.json({ pushes });
});

// ── GET /status (legacy alias: /drive/status) ──────────────────────────────────

async function getGoogleSyncStatus(req: import("express").Request, res: import("express").Response): Promise<void> {
  const requestUser = req.user as User;
  let retrying = false;
  try {
    await getValidGoogleToken(requestUser.id);
  } catch (err) {
    if (err instanceof GoogleTokenTemporaryError) {
      retrying = true;
    } else if (!(err instanceof GoogleAuthError)) {
      throw err;
    }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, requestUser.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const conn = (user.connections ?? {}) as Record<string, boolean | string | null>;
  const connected = Boolean(user.googleAccessToken || user.googleRefreshToken) && !user.googleDisconnectedAt;
  // A temporary refresh outage is not a failed status lookup. Return the
  // current connection state as 200 so generated clients retain the payload
  // and can pause actions without incorrectly sending the user to reconnect.
  res.json({
    connected,
    retrying,
    disconnectedAt: user.googleDisconnectedAt?.toISOString() ?? null,
    disconnectReason: user.googleDisconnectReason ?? null,
    reconnectUrl: connected ? null : "/api/auth/google",
    calendarLastSynced: (conn.calendarLastSynced as string | null) ?? null,
    tasksLastSynced:    (conn.tasksLastSynced    as string | null) ?? null,
    docsLastSynced:     (conn.docsLastSynced     as string | null) ?? null,
    driveLastSynced:    (conn.driveLastSynced    as string | null) ?? null,
    driveFolder:        user.googleDriveFolderId ?? null,
  });
}

router.get("/status", requireAuth, getGoogleSyncStatus);
// Existing callers can transition to the canonical /sync/status endpoint
// without a breaking change.
router.get("/drive/status", requireAuth, getGoogleSyncStatus);

// ── POST /drive/backup ────────────────────────────────────────────────────────

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
    const configFileId = await uploadPlannerConfig(user.id, accessToken, body.plannerId, body.config ?? {});
    await stampGoogleSync(user.id, "driveLastSynced");
    res.json({ success: true, configFileId });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
