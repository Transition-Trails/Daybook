import { Router, type IRouter } from "express";
import passport from "passport";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";

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
  res.json(safe);
}

router.get("/me", getMeHandler);
router.get("/auth/me", getMeHandler); // backward-compat alias — generated client calls /auth/me

// ── Logout ───────────────────────────────────────────────────────────────────

router.post("/auth/logout", (req, res): void => {
  req.logout(() => {
    res.json({ success: true });
  });
});

// ── Staff / owner password login (for admin console) ─────────────────────────

router.post("/auth/staff/login", async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || (user.role !== "staff" && user.role !== "owner")) {
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

  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed" }); return; }
    const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
    res.json(safe);
  });
});

// ── Test-only login (NODE_ENV=test) ──────────────────────────────────────────
// Allows Playwright to log in as any seeded test persona without Google OAuth.
// NEVER active in production — guarded by NODE_ENV check at the route level.

router.post("/auth/test-login", async (req, res): Promise<void> => {
  if (process.env["NODE_ENV"] !== "test") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "email required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: `No user found with email ${email}` });
    return;
  }
  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed" }); return; }
    const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
    res.json(safe);
  });
});

export default router;
