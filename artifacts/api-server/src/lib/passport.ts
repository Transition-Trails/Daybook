import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import {
  usersTable,
  syncStatusTable,
  aiSettingsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Serialize / deserialize
passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: number }).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id));
    done(null, user ?? null);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth strategy — only registered if credentials are present
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (googleClientId && googleClientSecret) {
  const callbackUrl =
    process.env.GOOGLE_CALLBACK_URL ??
    `${process.env.APP_URL ?? "http://localhost:5000"}/api/auth/google/callback`;

  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL: callbackUrl,
        scope: [
          "profile",
          "email",
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/tasks",
          "https://www.googleapis.com/auth/documents",
        ],
      },
      async (_accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails?.[0]?.value ?? `${profile.id}@google.oauth`;
          const name = profile.displayName ?? email;
          const avatarUrl = profile.photos?.[0]?.value ?? null;

          // Upsert user
          const [existing] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.googleId, profile.id));

          let user = existing;
          if (!user) {
            const [created] = await db
              .insert(usersTable)
              .values({
                googleId: profile.id,
                email,
                name,
                avatarUrl,
                googleAccessToken: _accessToken,
                googleRefreshToken: refreshToken ?? null,
              })
              .returning();
            user = created;

            // Create default sync status + AI settings for new user
            await db
              .insert(syncStatusTable)
              .values({ userId: user.id, connected: true });
            await db
              .insert(aiSettingsTable)
              .values({ userId: user.id, enabled: true, provider: "claude" });
          } else {
            await db
              .update(usersTable)
              .set({
                googleAccessToken: _accessToken,
                googleRefreshToken: refreshToken ?? undefined,
                avatarUrl,
              })
              .where(eq(usersTable.id, user.id));

            // Update sync connection status
            await db
              .update(syncStatusTable)
              .set({ connected: true })
              .where(eq(syncStatusTable.userId, user.id));
          }

          done(null, user);
        } catch (err) {
          logger.error({ err }, "Google OAuth error");
          done(err as Error, undefined);
        }
      },
    ),
  );

  logger.info("Google OAuth strategy registered");
} else {
  logger.warn(
    "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled",
  );
}

export default passport;
