import { Router, type IRouter } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { storeMembersTable, storesTable, userInvitationsTable, usersTable } from "@workspace/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { User } from "@workspace/db";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getActiveImpersonation } from "../middleware/requireRole";
import {
  AcceptUserInvitationBody,
  AcceptUserInvitationResponse,
  PreviewUserInvitationQueryParams,
  PreviewUserInvitationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const INVITATION_ROLE_VALUES = ["super_admin", "store_owner", "store_staff", "support"] as const;
type InvitationRole = (typeof INVITATION_ROLE_VALUES)[number];

function invitationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function findInvitationUser(email: string) {
  const [user] = await db.select().from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user;
}

router.get("/auth/invitations/preview", async (req, res): Promise<void> => {
  const parsed = PreviewUserInvitationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [invitation] = await db.select().from(userInvitationsTable)
    .where(and(
      eq(userInvitationsTable.tokenHash, invitationTokenHash(parsed.data.token)),
      isNull(userInvitationsTable.acceptedAt),
      gt(userInvitationsTable.expiresAt, new Date()),
    )).limit(1);
  if (!invitation) {
    res.status(404).json({ error: "Invitation is invalid, expired, or already used" });
    return;
  }
  const user = await findInvitationUser(invitation.email);
  const hasCredentials = Boolean(user?.passwordHash || user?.googleId);
  let storeName: string | null = null;
  if (invitation.storeId) {
    const [store] = await db.select({ name: storesTable.name })
      .from(storesTable).where(eq(storesTable.id, invitation.storeId)).limit(1);
    storeName = store?.name ?? null;
  }
  res.json(PreviewUserInvitationResponse.parse({
    email: invitation.email,
    role: invitation.role,
    storeName,
    expiresAt: invitation.expiresAt,
    accountExists: Boolean(user),
    requiresSignIn: hasCredentials,
  }));
});

router.post("/auth/invitations/accept", async (req, res): Promise<void> => {
  const parsed = AcceptUserInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { token, name, password } = parsed.data;
  const tokenHash = invitationTokenHash(token);
  const signedIn = req.isAuthenticated() ? req.user as User : null;
  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx.select().from(userInvitationsTable)
      .where(eq(userInvitationsTable.tokenHash, tokenHash))
      .for("update")
      .limit(1);
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      return { error: "invalid" as const };
    }
    if (!INVITATION_ROLE_VALUES.includes(invitation.role as InvitationRole)) {
      return { error: "invalid" as const };
    }
    if (signedIn && signedIn.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return { error: "identity" as const };
    }

    const [existing] = await tx.select().from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${invitation.email.toLowerCase()}`)
      .limit(1);
    if (signedIn && (!existing || signedIn.id !== existing.id)) {
      return { error: "identity" as const };
    }
    const hasCredentials = Boolean(existing?.passwordHash || existing?.googleId);
    if (hasCredentials && (!signedIn || signedIn.email.toLowerCase() !== invitation.email.toLowerCase())) {
      return { error: "signin" as const };
    }

    let user = existing;
    if (!hasCredentials) {
      if (!name?.trim() || !password || password.length < 8) {
        return { error: "registration" as const };
      }
      const passwordHash = await bcrypt.hash(password, 12);
      if (existing) {
        const [updated] = await tx.update(usersTable).set({
          name: name.trim(),
          passwordHash,
          updatedAt: new Date(),
        }).where(eq(usersTable.id, existing.id)).returning();
        user = updated;
      } else {
        const [created] = await tx.insert(usersTable).values({
          email: invitation.email.toLowerCase(),
          name: name.trim(),
          provider: "password",
          passwordHash,
          platformRole: null,
        }).returning();
        user = created;
      }
    }
    if (!user) return { error: "invalid" as const };

    if (invitation.role === "super_admin") {
      const [updated] = await tx.update(usersTable).set({
        platformRole: "super_admin",
        updatedAt: new Date(),
      }).where(eq(usersTable.id, user.id)).returning();
      user = updated;
    } else {
      if (!invitation.storeId) return { error: "invalid" as const };
      await tx.insert(storeMembersTable).values({
        storeId: invitation.storeId,
        userId: user.id,
        role: invitation.role,
      }).onConflictDoUpdate({
        target: [storeMembersTable.storeId, storeMembersTable.userId],
        set: { role: invitation.role },
      });
    }

    await tx.update(userInvitationsTable)
      .set({ acceptedAt: new Date() })
      .where(and(
        eq(userInvitationsTable.id, invitation.id),
        isNull(userInvitationsTable.acceptedAt),
      ));
    return { user };
  });

  if ("error" in result) {
    if (result.error === "identity") {
      res.status(403).json({ error: "Sign in with the email address this invitation was sent to" });
    } else if (result.error === "signin") {
      res.status(401).json({ error: "Sign in with the invited account before accepting this invitation" });
    } else if (result.error === "registration") {
      res.status(400).json({ error: "name and a password of at least 8 characters are required to register" });
    } else {
      res.status(400).json({ error: "Invitation is invalid, expired, or already used" });
    }
    return;
  }

  req.login(result.user, (loginError) => {
    if (loginError) {
      res.status(500).json({ error: "Invitation was accepted, but the session could not be established" });
      return;
    }
    req.session.save((saveError) => {
      if (saveError) {
        res.status(500).json({ error: "Invitation was accepted, but the session could not be saved" });
        return;
      }
      res.json(AcceptUserInvitationResponse.parse({ success: true }));
    });
  });
});

// ── Google OAuth ─────────────────────────────────────────────────────────────

router.get("/auth/google", (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(501).json({ error: "Google OAuth not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" });
    return;
  }
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/tasks",
    ],
    accessType: "offline",
    prompt: "consent",
  })(req, res, next);
});

router.get(
  "/auth/callback",
  (req, res, next) => {
    passport.authenticate("google", {
      failureRedirect: `${process.env.APP_URL ?? ""}/login?error=oauth_failed`,
    })(req, res, next);
  },
  (req, res) => {
    req.session.save(() => {
      // If opened as a popup, notify the opener and close; otherwise do a full redirect
      res.send(`<!DOCTYPE html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'daybook:auth_success' }, '*');
          window.close();
        } else {
          window.location.href = '/';
        }
      </script></body></html>`);
    });
  },
);

// ── Notion OAuth (stub) ──────────────────────────────────────────────────────

router.get("/auth/notion", (_req, res) => {
  res.status(501).json({ error: "Notion OAuth not yet implemented" });
});

// ── /me  (spec path) + /auth/me (alias for generated API client) ─────────────
// Returns User without sensitive token fields.

async function getMeHandler(req: Parameters<IRouter["get"]>[1] extends (req: infer R, ...a: unknown[]) => unknown ? R : never, res: import("express").Response): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as User;
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json({
    ...safe,
    impersonation: getActiveImpersonation(req, user.id) ?? null,
  });
}

router.get("/me", getMeHandler);
router.get("/auth/me", getMeHandler); // backward-compat alias — generated client calls /auth/me

// ── Logout ───────────────────────────────────────────────────────────────────

router.post("/auth/logout", (req, res): void => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// ── Store-member password login (for admin console) ──────────────────────────

router.post("/auth/staff/login", async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (!user.passwordHash) {
    res.status(401).json({ error: "No password set for this account" });
    return;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const memberships = await db
    .select()
    .from(storeMembersTable)
    .where(eq(storeMembersTable.userId, user.id));
  if (user.platformRole !== "super_admin" && memberships.length === 0) {
    const [pendingInvitation] = await db
      .select({ id: userInvitationsTable.id })
      .from(userInvitationsTable)
      .where(and(
        sql`lower(${userInvitationsTable.email}) = ${user.email.toLowerCase()}`,
        isNull(userInvitationsTable.acceptedAt),
        gt(userInvitationsTable.expiresAt, new Date()),
      ))
      .limit(1);
    if (!pendingInvitation) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
  }

  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed" }); return; }
    req.session.save((saveErr) => {
      if (saveErr) {
        res.status(500).json({ error: "Login session could not be saved" });
        return;
      }
      const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
      res.json({ ...safe, memberships });
    });
  });
});

// ── Test-only login ───────────────────────────────────────────────────────────
// Allows Playwright to log in as seeded test personas without Google OAuth.
//
// The full CI persona set is available only in NODE_ENV=test. Hosted browser
// checks run against the normal development workflow, where this route needs a
// high-entropy token derived from the server's session secret. The raw session
// secret is never sent over HTTP, and development access is limited to the
// deterministic CI super-admin. Production never enables this route.

const CI_SUPER_ADMIN_ID = "ci_super_admin";
const CI_SUPER_ADMIN_EMAIL = "super@ci.test";
const TEST_LOGIN_HMAC_CONTEXT = "daybook-development-browser-test-login:v1";

function testLoginMode(): "test" | "development" | null {
  if (process.env["NODE_ENV"] === "test") return "test";
  if (process.env["NODE_ENV"] === "development") return "development";
  return null;
}

function hasDevelopmentTestLoginToken(token: string | undefined): boolean {
  const sessionSecret = process.env["SESSION_SECRET"];
  if (!sessionSecret || !token) return false;

  const expected = createHmac("sha256", sessionSecret)
    .update(TEST_LOGIN_HMAC_CONTEXT)
    .digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(token);

  return expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer);
}

router.post("/auth/test-login", async (req, res): Promise<void> => {
  const mode = testLoginMode();
  if (!mode) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }
  // Development login is intentionally not a general impersonation switch:
  // it requires a server-secret-derived token and only accepts the seeded CI
  // super-admin identity.
  if (
    mode === "development" &&
    (email !== CI_SUPER_ADMIN_EMAIL ||
      !hasDevelopmentTestLoginToken(req.get("x-daybook-test-login-token")))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: `No user found with email ${email}` });
    return;
  }
  if (
    mode === "development" &&
    (user.id !== CI_SUPER_ADMIN_ID || user.platformRole !== "super_admin")
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed" }); return; }
    req.session.save((saveErr) => {
      if (saveErr) {
        req.log.error({ err: saveErr }, "test login session save failed");
        res.status(500).json({ error: "Login failed" });
        return;
      }
      const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
      res.json(safe);
    });
  });
});
export default router;
