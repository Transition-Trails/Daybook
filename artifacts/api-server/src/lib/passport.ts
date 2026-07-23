import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "@workspace/db";
import { usersTable, type UserConnections } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
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
        scope: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails?.[0]?.value ?? `${profile.id}@google.oauth`;
          const name = profile.displayName ?? email;
          const avatarUrl = profile.photos?.[0]?.value ?? null;

          const [existing] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.googleId, profile.id));

          if (existing) {
            await db
              .update(usersTable)
              .set({
                googleAccessToken: accessToken,
                googleRefreshToken: refreshToken ?? undefined,
                avatarUrl,
                connections: {
                  notion: (existing.connections as { notion?: boolean }).notion ?? false,
                  googleDrive: true,
                  googleCalendar: true,
                  googleTasks: true,
                  googleDocs: true,
                } as UserConnections,
              })
              .where(eq(usersTable.id, existing.id));
            const [updated] = await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.id, existing.id));
            done(null, updated);
          } else {
            const [created] = await db
              .insert(usersTable)
              .values({
                provider: "google",
                googleId: profile.id,
                email,
                name,
                avatarUrl,
                googleAccessToken: accessToken,
                googleRefreshToken: refreshToken ?? null,
                connections: {
                  googleDrive: true,
                  googleCalendar: true,
                  googleTasks: true,
                  googleDocs: true,
                  notion: false,
                },
              })
              .returning();
            done(null, created);
          }
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
