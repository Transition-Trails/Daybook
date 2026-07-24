/**
 * Google OAuth token refresh helper.
 *
 * All code that needs a Google access token must call getValidGoogleToken()
 * instead of reading googleAccessToken from the user record directly. This
 * function checks expiry, silently refreshes when needed, persists the new
 * token, and throws a typed GoogleAuthError when the connection is broken
 * so callers can surface a clear "reconnect Google" state.
 */
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { UserConnections } from "@workspace/db";

/** 5-minute buffer — refresh before the token actually expires. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export type GoogleAuthReason = "not_connected" | "disconnected";

export class GoogleAuthError extends Error {
  constructor(
    public readonly reason: GoogleAuthReason,
    message: string,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/**
 * Returns a valid Google access token for the given userId.
 *
 * - If the stored token is still fresh (not within the 5-min buffer), returns it immediately.
 * - If it is expired or near-expiry, uses the refresh token to obtain a new one,
 *   persists the new token + expiry, and returns the new token.
 * - If refresh fails (revoked, invalid), marks the user's Google connection as
 *   disconnected and throws GoogleAuthError("disconnected").
 * - If the user has no Google connection at all, throws GoogleAuthError("not_connected").
 */
export async function getValidGoogleToken(userId: string): Promise<string> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    throw new GoogleAuthError("not_connected", "User not found");
  }

  if (!user.googleAccessToken && !user.googleRefreshToken) {
    throw new GoogleAuthError("not_connected", "Google account not connected");
  }

  // Check whether the stored access token is still valid.
  const expiry = user.googleTokenExpiry;
  const tokenStillValid =
    user.googleAccessToken &&
    expiry != null &&
    expiry.getTime() - Date.now() > EXPIRY_BUFFER_MS;

  if (tokenStillValid) {
    return user.googleAccessToken!;
  }

  // Need to refresh. Bail early if we have no refresh token.
  if (!user.googleRefreshToken) {
    throw new GoogleAuthError(
      "not_connected",
      "No refresh token available — user must reconnect Google",
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError("not_connected", "Google OAuth not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: user.googleRefreshToken,
    grant_type: "refresh_token",
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (fetchErr) {
    throw new Error(`Google token refresh network error: ${String(fetchErr)}`);
  }

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    // Refresh failed — mark the user's Google connection as disconnected.
    await markGoogleDisconnected(userId, user.connections as UserConnections);
    throw new GoogleAuthError(
      "disconnected",
      `Google token refresh failed (${tokenRes.status}): ${errText}`,
    );
  }

  const data = (await tokenRes.json()) as { access_token: string; expires_in: number };
  const newExpiry = new Date(Date.now() + data.expires_in * 1000);

  await db
    .update(usersTable)
    .set({
      googleAccessToken: data.access_token,
      googleTokenExpiry: newExpiry,
    })
    .where(eq(usersTable.id, userId));

  return data.access_token;
}

async function markGoogleDisconnected(
  userId: string,
  existing: UserConnections,
): Promise<void> {
  await db
    .update(usersTable)
    .set({
      googleAccessToken: null,
      connections: {
        ...existing,
        googleDrive:     false,
        googleCalendar:  false,
        googleTasks:     false,
        googleDocs:      false,
      },
    })
    .where(eq(usersTable.id, userId));
}
