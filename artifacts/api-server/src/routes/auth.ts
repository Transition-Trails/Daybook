import { Router, type IRouter } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { storeMembersTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getActiveImpersonation } from "../middleware/requireRole";

const router: IRouter = Router();

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
    res.status(401).json({ error: "Invalid credentials" });
    return;
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
        res.status(500).json({ error: "Login session could not be saved" });
        return;
      }
      const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
      res.json(safe);
    });
  });
});

export default router;
