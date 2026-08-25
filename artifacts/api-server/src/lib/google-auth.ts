/**
 * Google OAuth token refresh helper.
 *
 * All code that needs a Google access token must call getValidGoogleToken()
 * instead of reading googleAccessToken from the user record directly. This
 * function checks expiry, silently refreshes when needed, persists the new
 * token, and throws a typed GoogleAuthError when the connection is broken
 * so callers can surface a clear "reconnect Google" state.
 */
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { markGoogleConnectionDisconnected } from "./google-connection-state";

/** 5-minute buffer — refresh before the token actually expires. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const REFRESH_ATTEMPTS = 3;
const REFRESH_BACKOFF_MS = [50, 100] as const;

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

/** The provider is temporarily unavailable; callers must not show reconnect UI. */
export class GoogleTokenTemporaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleTokenTemporaryError";
  }
}

function parseGoogleError(body: string): { code?: string; message: string } {
  try {
    const parsed = JSON.parse(body) as { error?: string | { status?: string; message?: string }; error_description?: string };
    const nested = typeof parsed.error === "object" ? parsed.error : undefined;
    return {
      code: typeof parsed.error === "string" ? parsed.error : nested?.status,
      message: parsed.error_description ?? nested?.message ?? body,
    };
  } catch {
    return { message: body };
  }
}

function shouldRetryRefresh(status: number | null): boolean {
  return status === null || status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns a valid Google access token for the given userId.
 *
 * - If the stored token is still fresh (not within the 5-min buffer), returns it immediately.
 * - If it is expired or near-expiry, uses the refresh token to obtain a new one,
 *   persists the new token + expiry, and returns the new token.
 * - Only an explicit `invalid_grant` marks the connection as disconnected.
 *   Provider outages and rate limits retry without changing connection state.
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
    if (user.googleDisconnectedAt) {
      throw new GoogleAuthError(
        "disconnected",
        user.googleDisconnectReason
          ? `Google connection was disconnected: ${user.googleDisconnectReason}`
          : "Google connection was disconnected — reconnect to continue",
      );
    }
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

  let lastTemporaryError = "Google token refresh temporarily unavailable";
  for (let attempt = 0; attempt < REFRESH_ATTEMPTS; attempt++) {
    let tokenRes: Response | null = null;
    try {
      tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    } catch (fetchErr) {
      lastTemporaryError = `Google token refresh network error: ${String(fetchErr)}`;
    }

    if (tokenRes?.ok) {
      const data = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
      const expiresIn = data.expires_in;
      if (!data.access_token || typeof expiresIn !== "number" || !Number.isFinite(expiresIn)) {
        throw new Error("Google token refresh returned an incomplete token response");
      }
      const newExpiry = new Date(Date.now() + expiresIn * 1000);

      const refreshed = await db
        .update(usersTable)
        .set({
          googleAccessToken: data.access_token,
          googleTokenExpiry: newExpiry,
          googleDisconnectedAt: null,
          googleDisconnectReason: null,
        })
        .where(and(
          eq(usersTable.id, userId),
          eq(usersTable.googleTokenVersion, user.googleTokenVersion),
        ))
        .returning({ id: usersTable.id });

      if (refreshed.length > 0) return data.access_token;
      // Fresh OAuth consent or another terminal lifecycle change won after this
      // refresh started. Never restore credentials from a stale token snapshot.
      return getValidGoogleToken(userId);
    }

    if (tokenRes) {
      const errText = await tokenRes.text().catch(() => "");
      const googleError = parseGoogleError(errText);
      if (googleError.code === "invalid_grant") {
        const disconnected = await markGoogleConnectionDisconnected(
          userId,
          googleError.message || "Google rejected the refresh grant",
          user.googleTokenVersion,
        );
        if (!disconnected) {
          // A newer consent/disconnect advanced the version while this request
          // was in flight. Resolve the current state instead of overwriting it.
          return getValidGoogleToken(userId);
        }
        throw new GoogleAuthError(
          "disconnected",
          "Google access was revoked or expired — reconnect Google to continue",
        );
      }
      if (!shouldRetryRefresh(tokenRes.status)) {
        throw new Error(`Google token refresh failed (${tokenRes.status}): ${googleError.message}`);
      }
      lastTemporaryError = `Google token refresh temporarily unavailable (${tokenRes.status}): ${googleError.message}`;
    }

    if (attempt < REFRESH_ATTEMPTS - 1) {
      await sleep(REFRESH_BACKOFF_MS[attempt] ?? REFRESH_BACKOFF_MS[REFRESH_BACKOFF_MS.length - 1]);
    }
  }

  throw new GoogleTokenTemporaryError(lastTemporaryError);
}
