import { db, usersTable, type UserConnections } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

type GoogleConnectionFlag = "googleDrive" | "googleCalendar" | "googleTasks" | "googleDocs";
export type GoogleSyncStamp = "calendarLastSynced" | "tasksLastSynced" | "docsLastSynced" | "driveLastSynced";

function patchConnectionValue(key: string, value: unknown) {
  return sql<UserConnections>`jsonb_set(
    coalesce(${usersTable.connections}, '{}'::jsonb),
    ARRAY[${key}]::text[],
    ${JSON.stringify(value)}::jsonb,
    true
  )`;
}

/**
 * Writes exactly one JSONB key in the database. Never merge a request's
 * session-time connection snapshot back into the user row.
 */
export async function setGoogleConnectionValue(
  userId: string,
  key: GoogleConnectionFlag | GoogleSyncStamp,
  value: boolean | string,
): Promise<void> {
  await db
    .update(usersTable)
    .set({ connections: patchConnectionValue(key, value) })
    .where(eq(usersTable.id, userId));
}

/**
 * Store a fresh OAuth consent result as one atomic lifecycle transition.
 * Incrementing the version in the database fences refreshes that read the
 * previous credentials while preserving unrelated connection metadata.
 */
export async function recordGoogleConsent(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiry: Date,
  avatarUrl: string | null,
): Promise<void> {
  await db
    .update(usersTable)
    .set({
      googleAccessToken: accessToken,
      // Google may omit a refresh token on a subsequent consent. In that
      // case, leave the existing long-lived grant in place.
      googleRefreshToken: refreshToken ?? undefined,
      googleTokenExpiry: tokenExpiry,
      googleDisconnectedAt: null,
      googleDisconnectReason: null,
      googleTokenVersion: sql`${usersTable.googleTokenVersion} + 1`,
      avatarUrl,
      connections: sql<UserConnections>`jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(${usersTable.connections}, '{}'::jsonb), '{googleDrive}', 'true'::jsonb, true),
            '{googleCalendar}', 'true'::jsonb, true
          ),
          '{googleTasks}', 'true'::jsonb, true
        ),
        '{googleDocs}', 'true'::jsonb, true
      )`,
    })
    .where(eq(usersTable.id, userId));
}

export async function stampGoogleSync(userId: string, key: GoogleSyncStamp): Promise<string> {
  const stampedAt = new Date().toISOString();
  await setGoogleConnectionValue(userId, key, stampedAt);
  return stampedAt;
}

/**
 * A revoked grant is terminal until OAuth consent supplies a fresh refresh
 * token. This update clears both credentials and each Google feature flag in
 * one database statement so a stale in-flight sync cannot revive the account.
 */
export async function markGoogleConnectionDisconnected(
  userId: string,
  reason: string,
  expectedTokenVersion: number,
  expectedAccessToken?: string,
): Promise<boolean> {
  const falseGoogleFlags = sql<UserConnections>`jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(${usersTable.connections}, '{}'::jsonb), '{googleDrive}', 'false'::jsonb, true),
          '{googleCalendar}', 'false'::jsonb, true
        ),
        '{googleTasks}', 'false'::jsonb, true
      ),
      '{googleDocs}', 'false'::jsonb, true
    ),
    '{googleDrive}', 'false'::jsonb, true
  )`;

  const updated = await db
    .update(usersTable)
    .set({
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
      // Fence every other refresh that read the same pre-disconnect state.
      googleTokenVersion: sql`${usersTable.googleTokenVersion} + 1`,
      googleDisconnectedAt: new Date(),
      googleDisconnectReason: reason,
      connections: falseGoogleFlags,
    })
    .where(expectedAccessToken === undefined
      ? and(
          eq(usersTable.id, userId),
          eq(usersTable.googleTokenVersion, expectedTokenVersion),
        )
      : and(
          eq(usersTable.id, userId),
          eq(usersTable.googleTokenVersion, expectedTokenVersion),
          // A concurrent refresh can replace an access token without advancing
          // the lifecycle version. Never let a late API 401 clear that newer
          // credential.
          eq(usersTable.googleAccessToken, expectedAccessToken),
        ))
    .returning({ id: usersTable.id });
  return updated.length > 0;
}
