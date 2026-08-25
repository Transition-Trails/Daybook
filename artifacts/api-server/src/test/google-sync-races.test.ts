/**
 * Integration coverage for the Google lifecycle races that are difficult to
 * prove with mocked Drizzle chains alone. These tests use the real development
 * PostgreSQL database and only mock calls leaving the process for Google.
 */

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type NextFunction, type Request, type Response } from "express";
import { auditLogTable, db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import {
  recordGoogleConsent,
  stampGoogleSync,
} from "../lib/google-connection-state.js";
import { getValidGoogleToken } from "../lib/google-auth.js";
import { uploadPlannerConfig } from "../lib/drive-upload.js";
import googleSyncRouter from "../routes/google-sync.js";

const GOOGLE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

const fixtureIds: string[] = [];

function fixtureId(label: string): string {
  const id = `google-race-${label}-${crypto.randomUUID()}`;
  fixtureIds.push(id);
  return id;
}

async function insertGoogleUser(
  label: string,
  overrides: Partial<typeof usersTable.$inferInsert> = {},
): Promise<string> {
  const id = fixtureId(label);
  await db.insert(usersTable).values({
    id,
    email: `${id}@example.test`,
    name: `Google Race ${label}`,
    googleAccessToken: "old-access-token",
    googleRefreshToken: "old-refresh-token",
    googleTokenExpiry: new Date(Date.now() - 60_000),
    googleTokenVersion: 0,
    connections: {
      googleDrive: true,
      googleCalendar: true,
      googleTasks: true,
      googleDocs: true,
      notion: false,
      unrelatedKey: "preserve-me",
    } as typeof usersTable.$inferInsert.connections,
    ...overrides,
  });
  return id;
}

async function readFixture(id: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  expect(user).toBeDefined();
  return user!;
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (fixtureIds.length > 0) {
    for (const id of fixtureIds) {
      await db.delete(auditLogTable).where(eq(auditLogTable.actorUserId, id));
    }
    await db.delete(usersTable).where(
      eq(usersTable.id, fixtureIds[0]),
    );
    for (const id of fixtureIds.slice(1)) {
      await db.delete(usersTable).where(eq(usersTable.id, id));
    }
  }
});

describe("Google OAuth lifecycle races", () => {
  it("does not restore or erase credentials when consent races successful and invalid_grant refreshes", async () => {
    const userId = await insertGoogleUser("lifecycle");
    let releaseRefreshRequests!: () => void;
    let refreshRequestsStarted!: () => void;
    const refreshRequestsReady = new Promise<void>((resolve) => {
      refreshRequestsStarted = resolve;
    });
    const refreshRequestsReleased = new Promise<void>((resolve) => {
      releaseRefreshRequests = resolve;
    });
    let refreshRequestCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const requestNumber = ++refreshRequestCount;
      if (requestNumber === 2) refreshRequestsStarted();
      await refreshRequestsReleased;
      if (requestNumber === 1) {
        return new Response(JSON.stringify({
          access_token: "stale-success-token",
          expires_in: 3600,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        error: "invalid_grant",
        error_description: "stale grant rejected",
      }), { status: 400 });
    });

    const successfulRefresh = getValidGoogleToken(userId);
    const invalidGrantRefresh = getValidGoogleToken(userId);
    await refreshRequestsReady;

    await recordGoogleConsent(
      userId,
      "fresh-consent-access-token",
      "fresh-consent-refresh-token",
      new Date(Date.now() + 3_600_000),
      "fresh-avatar",
    );
    releaseRefreshRequests();

    await expect(Promise.all([successfulRefresh, invalidGrantRefresh])).resolves.toEqual([
      "fresh-consent-access-token",
      "fresh-consent-access-token",
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const user = await readFixture(userId);
    expect(user.googleAccessToken).toBe("fresh-consent-access-token");
    expect(user.googleRefreshToken).toBe("fresh-consent-refresh-token");
    expect(user.googleTokenVersion).toBe(1);
    expect(user.googleDisconnectedAt).toBeNull();
    expect(user.googleDisconnectReason).toBeNull();
    expect(user.connections).toMatchObject({
      googleDrive: true,
      googleCalendar: true,
      googleTasks: true,
      googleDocs: true,
      unrelatedKey: "preserve-me",
    });
  });

  it("restores Drive backup and Calendar push after re-consent without losing non-Google metadata", async () => {
    const userId = await insertGoogleUser("reconnect", {
      googleDriveFolderId: "existing-daybook-folder",
      googleTokenExpiry: new Date(Date.now() + 3_600_000),
      connections: {
        googleDrive: true,
        googleCalendar: true,
        googleTasks: true,
        googleDocs: true,
        notion: true,
        unrelatedKey: "keep-me",
      } as typeof usersTable.$inferInsert.connections,
    });

    const initiallyConnected = await readFixture(userId);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: { status: "UNAUTHENTICATED", message: "Invalid Credentials" },
    }), { status: 401 }));

    const disconnectedResponse = await request(makeAuthenticatedSyncApp(initiallyConnected))
      .post("/api/sync/calendar/push")
      .send({
        plannerConfigId: "reconnect-check",
        blocks: [{ title: "Reconnect check", startDate: "2026-08-25", endDate: "2026-08-26" }],
      });
    expect(disconnectedResponse.status).toBe(401);
    expect(disconnectedResponse.body).toMatchObject({
      error: "reconnect_required",
      reason: "disconnected",
      reconnectUrl: "/api/auth/google",
    });

    const disconnected = await readFixture(userId);
    expect(disconnected.googleAccessToken).toBeNull();
    expect(disconnected.googleRefreshToken).toBeNull();
    expect(disconnected.connections).toMatchObject({
      googleDrive: false,
      googleCalendar: false,
      googleTasks: false,
      googleDocs: false,
      notion: true,
      unrelatedKey: "keep-me",
    });

    await recordGoogleConsent(
      userId,
      "reconnected-access-token",
      "reconnected-refresh-token",
      new Date(Date.now() + 3_600_000),
      "reconnected-avatar",
    );

    const reconnected = await readFixture(userId);
    expect(reconnected).toMatchObject({
      googleAccessToken: "reconnected-access-token",
      googleRefreshToken: "reconnected-refresh-token",
      googleDisconnectedAt: null,
      googleDisconnectReason: null,
    });
    expect(reconnected.connections).toMatchObject({
      googleDrive: true,
      googleCalendar: true,
      googleTasks: true,
      googleDocs: true,
      notion: true,
      unrelatedKey: "keep-me",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      expect(init?.headers).toEqual(expect.objectContaining({
        Authorization: "Bearer reconnected-access-token",
      }));

      if (url.includes("/calendar/v3/calendars/primary/events")) {
        return new Response(JSON.stringify({ id: "reconnected-calendar-event" }), { status: 200 });
      }
      if (url.startsWith(GOOGLE_UPLOAD_URL)) {
        return new Response(JSON.stringify({ id: "reconnected-drive-config" }), { status: 200 });
      }
      throw new Error(`Unexpected Google provider request: ${url}`);
    });

    const app = makeAuthenticatedSyncApp(reconnected);
    const calendarResponse = await request(app)
      .post("/api/sync/calendar/push")
      .send({
        plannerConfigId: "reconnect-check",
        blocks: [{ title: "Reconnect check", startDate: "2026-08-25", endDate: "2026-08-26" }],
      });
    expect(calendarResponse.status).toBe(200);
    expect(calendarResponse.body).toMatchObject({
      success: true,
      itemCount: 1,
      results: [{ googleEventId: "reconnected-calendar-event", action: "created" }],
    });

    const driveResponse = await request(app)
      .post("/api/sync/drive/backup")
      .send({ plannerId: "reconnect-check", config: { source: "provider-check" } });
    expect(driveResponse.status).toBe(200);
    expect(driveResponse.body).toMatchObject({
      success: true,
      configFileId: "reconnected-drive-config",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const finalUser = await readFixture(userId);
    expect(finalUser.connections).toMatchObject({
      googleDrive: true,
      googleCalendar: true,
      googleTasks: true,
      googleDocs: true,
      notion: true,
      unrelatedKey: "keep-me",
    });
    expect(finalUser.connections?.calendarLastSynced).toEqual(expect.any(String));
    expect(finalUser.connections?.driveLastSynced).toEqual(expect.any(String));
  });

  it("marks an unexpired Drive backup token disconnected when Google rejects it", async () => {
    const userId = await insertGoogleUser("drive-revoked", {
      googleDriveFolderId: "existing-daybook-folder",
      googleTokenExpiry: new Date(Date.now() + 3_600_000),
    });
    const user = await readFixture(userId);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: { status: "UNAUTHENTICATED", message: "Invalid Credentials" },
    }), { status: 401 }));

    const response = await request(makeAuthenticatedSyncApp(user))
      .post("/api/sync/drive/backup")
      .send({ plannerId: "drive-revoke-check", config: { source: "provider-check" } });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "reconnect_required",
      reason: "disconnected",
      reconnectUrl: "/api/auth/google",
    });
    const disconnected = await readFixture(userId);
    expect(disconnected).toMatchObject({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleDisconnectedAt: expect.any(Date),
    });
  });

  it("marks a first-use Docs token disconnected when Drive folder resolution is rejected", async () => {
    const userId = await insertGoogleUser("docs-revoked", {
      googleTokenExpiry: new Date(Date.now() + 3_600_000),
    });
    const user = await readFixture(userId);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      error: { status: "UNAUTHENTICATED", message: "Invalid Credentials" },
    }), { status: 401 }));

    const response = await request(makeAuthenticatedSyncApp(user))
      .post("/api/sync/docs")
      .send({ title: "Reconnect check", content: "Disposable provider-level verification note." });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      error: "reconnect_required",
      reason: "disconnected",
      reconnectUrl: "/api/auth/google",
    });
    const disconnected = await readFixture(userId);
    expect(disconnected).toMatchObject({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleDisconnectedAt: expect.any(Date),
    });
  });

  it("preserves unrelated connection keys when sync stamps arrive concurrently", async () => {
    const userId = await insertGoogleUser("stamps");
    const keys = [
      "calendarLastSynced",
      "tasksLastSynced",
      "docsLastSynced",
      "driveLastSynced",
    ] as const;

    const stamped = await Promise.all(keys.map((key) => stampGoogleSync(userId, key)));
    const user = await readFixture(userId);
    const connections = user.connections as Record<string, unknown>;

    expect(stamped).toHaveLength(keys.length);
    for (const [index, key] of keys.entries()) {
      expect(connections[key]).toBe(stamped[index]);
    }
    expect(connections).toMatchObject({
      googleDrive: true,
      googleCalendar: true,
      googleTasks: true,
      googleDocs: true,
      notion: false,
      unrelatedKey: "preserve-me",
    });
  });

  it("serializes first Drive uploads onto one root Daybook folder and cache ID", async () => {
    const userId = await insertGoogleUser("drive", {
      googleAccessToken: "drive-access-token",
      googleRefreshToken: null,
      googleTokenExpiry: new Date(Date.now() + 3_600_000),
    });
    let searchCount = 0;
    let createCount = 0;
    let uploadCount = 0;
    const uploadBodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith(GOOGLE_UPLOAD_URL)) {
        uploadCount += 1;
        uploadBodies.push(String(init?.body ?? ""));
        return new Response(JSON.stringify({ id: `config-file-${uploadCount}` }), { status: 200 });
      }
      if (init?.method === "POST") {
        createCount += 1;
        return new Response(JSON.stringify({ id: "daybook-folder-one" }), { status: 200 });
      }
      searchCount += 1;
      expect(url).toContain("%27me%27+in+owners");
      expect(url).toContain("%27root%27+in+parents");
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });

    const uploads = await Promise.all([
      uploadPlannerConfig(userId, "drive-access-token", "planner-a", { source: "first" }),
      uploadPlannerConfig(userId, "drive-access-token", "planner-b", { source: "second" }),
    ]);

    // The folder lock serializes root-folder resolution, not the independent
    // upload requests, so either caller may receive the first Google file ID.
    expect(uploads).toHaveLength(2);
    expect(new Set(uploads)).toEqual(new Set(["config-file-1", "config-file-2"]));
    expect(searchCount).toBe(1);
    expect(createCount).toBe(1);
    expect(uploadCount).toBe(2);
    expect(uploadBodies.every((body) => body.includes("daybook-folder-one"))).toBe(true);
    expect((await readFixture(userId)).googleDriveFolderId).toBe("daybook-folder-one");
  });
});

describe("Calendar all-day range validation", () => {
  const user = { id: "google-calendar-validation-user" } as User;

  function makeCalendarApp() {
    const app = express();
    app.use(express.json());
    app.use((_req: Request, _res: Response, next: NextFunction) => next());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const authenticatedRequest = req as any;
      authenticatedRequest.isAuthenticated = () => true;
      authenticatedRequest.user = user;
      next();
    });
    app.use("/api", googleSyncRouter);
    return app;
  }

  it.each([
    ["impossible", "2026-02-30", "2026-03-02"],
    ["equal", "2026-03-02", "2026-03-02"],
    ["reversed", "2026-03-03", "2026-03-02"],
  ])("rejects %s all-day ranges before calling Google", async (_label, startDate, endDate) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await request(makeCalendarApp())
      .post("/api/calendar/push")
      .send({
        plannerConfigId: "calendar-race-validation",
        blocks: [{ title: "Daybook block", startDate, endDate }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("endDate after startDate");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function makeAuthenticatedSyncApp(user: User) {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => next());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const authenticatedRequest = req as any;
    authenticatedRequest.isAuthenticated = () => true;
    authenticatedRequest.user = user;
    next();
  });
  app.use("/api/sync", googleSyncRouter);
  return app;
}

describe("Google sync status availability", () => {
  function makeSyncStatusApp(userId: string) {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const authenticatedRequest = req as any;
      authenticatedRequest.isAuthenticated = () => true;
      authenticatedRequest.user = { id: userId };
      next();
    });
    app.use("/api/sync", googleSyncRouter);
    return app;
  }

  it("keeps a connected account in a retrying status during a temporary refresh outage", async () => {
    const userId = await insertGoogleUser("status-retry");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("temporarily unavailable", { status: 503 }),
    );

    const response = await request(makeSyncStatusApp(userId)).get("/api/sync/status");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      connected: true,
      retrying: true,
      reconnectUrl: null,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const user = await readFixture(userId);
    expect(user.googleAccessToken).toBe("old-access-token");
    expect(user.googleRefreshToken).toBe("old-refresh-token");
    expect(user.googleDisconnectedAt).toBeNull();
  });
});