import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { db, storeMembersTable, usersTable, type User } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";
import { recordGoogleConsent } from "./google-connection-state";

function customerCanLinkGoogle(user: User, memberships: Array<{ role: string }>): boolean {
  return user.provider === "password" &&
    Boolean(user.passwordHash) &&
    user.emailVerifiedAt != null &&
    user.googleId == null &&
    user.googleAccessToken == null &&
    user.googleRefreshToken == null &&
    user.platformRole == null &&
    memberships.length > 0 &&
    memberships.every((membership) => membership.role === "customer");
}

/**
 * Resolve a Google identity without implicitly merging account records.
 * Email-based linking is permitted only for a password customer whose email
 * Google explicitly asserts is verified; existing staff and Google identities
 * remain separate even when their email strings happen to match.
 */
export async function authenticateGoogleProfile(
  accessToken: string,
  refreshToken: string | undefined,
  profile: Profile,
): Promise<User> {
  const emailVerified = profile._json.email_verified === true;
  const email = (profile._json.email ?? profile.emails?.[0]?.value ?? `${profile.id}@google.oauth`)
    .trim()
    .toLowerCase();
  const name = profile.displayName ?? email;
  const avatarUrl = profile.photos?.[0]?.value ?? null;
  const tokenExpiry = new Date(Date.now() + 3600 * 1000);

  const [googleIdentity] = await db.select().from(usersTable)
    .where(eq(usersTable.googleId, profile.id)).limit(1);
  if (googleIdentity) {
    await recordGoogleConsent(googleIdentity.id, accessToken, refreshToken ?? null, tokenExpiry, avatarUrl);
    if (emailVerified && !googleIdentity.emailVerifiedAt) {
      await db.update(usersTable)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(usersTable.id, googleIdentity.id));
    }
    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, googleIdentity.id));
    return updated;
  }

  let created: User | undefined;
  let linkUserId: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const [emailIdentity] = await tx.select().from(usersTable)
        .where(sql`lower(${usersTable.email}) = ${email}`)
        .for("update")
        .limit(1);
      if (emailIdentity) {
        // A concurrent callback for this same Google sub may have linked the
        // row after our initial googleId lookup. Reuse only that exact identity.
        if (emailIdentity.googleId === profile.id) {
          linkUserId = emailIdentity.id;
          return;
        }
        if (!emailVerified) {
          throw new Error("Google email is not verified; account linking was denied");
        }
        const memberships = await tx.select({ role: storeMembersTable.role })
          .from(storeMembersTable)
          .where(eq(storeMembersTable.userId, emailIdentity.id));
        if (!customerCanLinkGoogle(emailIdentity, memberships)) {
          throw new Error("Google email conflicts with an account that cannot be linked");
        }
        const [linked] = await tx.update(usersTable)
          .set({ googleId: profile.id })
          .where(and(
            eq(usersTable.id, emailIdentity.id),
            isNull(usersTable.googleId),
            sql`${usersTable.emailVerifiedAt} IS NOT NULL`,
          ))
          .returning();
        if (!linked) throw new Error("Google account link could not be established");
        linkUserId = linked.id;
        return;
      }

      [created] = await tx.insert(usersTable).values({
        provider: "google",
        googleId: profile.id,
        emailVerifiedAt: emailVerified ? new Date() : null,
        email,
        name,
        avatarUrl,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken ?? null,
        googleTokenExpiry: tokenExpiry,
        googleDisconnectedAt: null,
        googleDisconnectReason: null,
        connections: {
          googleDrive: true,
          googleCalendar: true,
          googleTasks: true,
          googleDocs: true,
          notion: false,
        },
      }).returning();
    });
  } catch (err) {
    // A concurrent OAuth callback for the same Google identity may win the
    // unique google_id insert. Reuse only that row, never an email-only match.
    const [racedIdentity] = await db.select().from(usersTable)
      .where(eq(usersTable.googleId, profile.id)).limit(1);
    if (!racedIdentity) throw err;
    linkUserId = racedIdentity.id;
  }

  if (created) return created;
  if (!linkUserId) throw new Error("Google identity could not be resolved");
  await recordGoogleConsent(linkUserId, accessToken, refreshToken ?? null, tokenExpiry, avatarUrl);
  if (emailVerified) {
    await db.update(usersTable)
      .set({ emailVerifiedAt: new Date() })
      .where(and(eq(usersTable.id, linkUserId), isNull(usersTable.emailVerifiedAt)));
  }
  const [linkedOrReused] = await db.select().from(usersTable).where(eq(usersTable.id, linkUserId));
  return linkedOrReused;
}

type SerializedPasswordSession = {
  id: string;
  passwordCredentialVersion: number;
};

export function passwordSessionVersionMatches(
  userVersion: number | undefined,
  sessionVersion: number,
): boolean {
  return (userVersion ?? 0) === sessionVersion;
}

export function shouldInvalidateLegacyPasswordSession(
  user: Pick<User, "provider" | "passwordCredentialVersion" | "platformRole">,
  memberships: Array<{ role: string }>,
): boolean {
  return user.provider === "password" &&
    (user.passwordCredentialVersion ?? 0) > 0 &&
    user.platformRole == null &&
    memberships.length > 0 &&
    memberships.every((member) => member.role === "customer");
}

passport.serializeUser((user: Express.User, done) => {
  const account = user as User;
  if (account.provider === "password") {
    done(null, {
      id: account.id,
      passwordCredentialVersion: account.passwordCredentialVersion ?? 0,
    } satisfies SerializedPasswordSession);
    return;
  }
  done(null, account.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const serialized = id as unknown as string | SerializedPasswordSession;
    const sessionIdentity = typeof serialized === "string"
      ? { id: serialized, version: undefined }
      : {
          id: serialized?.id,
          version: serialized?.passwordCredentialVersion,
        };
    if (!sessionIdentity.id) {
      done(null, null);
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, sessionIdentity.id));
    if (!user) {
      done(null, null);
      return;
    }
    if (
      sessionIdentity.version !== undefined &&
      !passwordSessionVersionMatches(user.passwordCredentialVersion, sessionIdentity.version)
    ) {
      done(null, null);
      return;
    }
    // Older serialized sessions contain only the user ID. Preserve legacy
    // staff sessions, but invalidate pre-reset customer sessions after a reset.
    if (sessionIdentity.version === undefined && user.provider === "password" &&
        (user.passwordCredentialVersion ?? 0) > 0 && user.platformRole == null) {
      const memberships = await db.select({ role: storeMembersTable.role })
        .from(storeMembersTable)
        .where(eq(storeMembersTable.userId, user.id));
      if (shouldInvalidateLegacyPasswordSession(user, memberships)) {
        done(null, null);
        return;
      }
    }
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (googleClientId && googleClientSecret) {
  const host =
    process.env.APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:5000");
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL ?? `${host}/api/auth/callback`;
  logger.info({ callbackUrl }, "Google OAuth callback URL");

  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: callbackUrl,
        scope: ["profile", "email", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.events"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          done(null, await authenticateGoogleProfile(accessToken, refreshToken, profile));
        } catch (err) {
          logger.error({ err }, "Google OAuth error");
          done(err as Error, undefined);
        }
      },
    ),
  );
  logger.info("Google OAuth strategy registered");
} else {
  logger.warn("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled");
}

export default passport;
