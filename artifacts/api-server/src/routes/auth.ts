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
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/tasks",
      "https://www.googleapis.com/auth/documents",
    ],
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
    res.redirect(process.env.APP_URL ?? "/");
  },
);

// ── Notion OAuth (stub) ──────────────────────────────────────────────────────

router.get("/auth/notion", (_req, res) => {
  // TODO: implement Notion OAuth when ready
  res.status(501).json({ error: "Notion OAuth not yet implemented" });
});

// ── /me ─────────────────────────────────────────────────────────────────────
// Returns User + connections + plan (per spec/API-CONTRACT.md)

router.get("/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as User;
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

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

export default router;
