import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { storesTable, userInvitationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { randomBytes, createHash } from "node:crypto";
import {
  CreateUserInvitationBody,
  CreateUserInvitationResponse,
  ListUserInvitationsResponse,
} from "@workspace/api-zod";
import { sendEmail } from "../lib/email/send";
import { userInvitationEmail } from "../lib/email/templates/invitation";

const router: IRouter = Router();

const INVITATION_DAYS = 7;
const INVITATION_ROLES = ["super_admin", "store_owner", "store_staff", "support"] as const;
type InvitationRole = (typeof INVITATION_ROLES)[number];

function trustedInviteUrl(token: string): string {
  let base: URL;
  if (process.env.APP_URL) {
    try {
      base = new URL(process.env.APP_URL);
    } catch {
      throw new Error("APP_URL must be a valid HTTPS URL to send invitations");
    }
    if (base.protocol !== "https:" || base.username || base.password) {
      throw new Error("APP_URL must be a valid HTTPS URL to send invitations");
    }
  } else {
    const domain = process.env.REPLIT_DOMAINS?.split(",").map((part) => part.trim()).find(Boolean);
    if (!domain || /[/@?#]/.test(domain)) {
      throw new Error("APP_URL or REPLIT_DOMAINS must be configured to send invitations");
    }
    base = new URL(`https://${domain}`);
  }
  const invite = new URL("/invite", base);
  invite.searchParams.set("token", token);
  return invite.toString();
}

function invitationEmailConfigurationError(): string | null {
  if (!process.env.RESEND_API_KEY) return "Invitation email provider is not configured: RESEND_API_KEY is missing";
  const domain = process.env.EMAIL_FROM_DOMAIN?.trim().toLowerCase();
  if (!domain || domain === "notifications.example.com" || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    return "Invitation email sender is not configured: set EMAIL_FROM_DOMAIN to a verified platform sender domain";
  }
  return null;
}

router.get("/users/invitations", requireSuperAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: userInvitationsTable.id,
      email: userInvitationsTable.email,
      role: userInvitationsTable.role,
      storeId: userInvitationsTable.storeId,
      expiresAt: userInvitationsTable.expiresAt,
      acceptedAt: userInvitationsTable.acceptedAt,
      createdAt: userInvitationsTable.createdAt,
    })
    .from(userInvitationsTable)
    .orderBy(userInvitationsTable.createdAt);
  res.json(ListUserInvitationsResponse.parse({ invitations: rows }));
});

router.post("/users/invitations", requireSuperAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email: inputEmail, role, storeId } = parsed.data;
  if (!INVITATION_ROLES.includes(role as InvitationRole)) {
    res.status(400).json({ error: "Unsupported invitation role" });
    return;
  }
  const invitationRole = role as InvitationRole;
  if ((invitationRole === "super_admin" && storeId !== undefined) ||
      (invitationRole !== "super_admin" && !storeId)) {
    res.status(400).json({ error: "super_admin invitations must not include storeId; store roles require storeId" });
    return;
  }
  if (storeId) {
    const [store] = await db.select({ id: storesTable.id, name: storesTable.name })
      .from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) {
      res.status(400).json({ error: "Selected store does not exist" });
      return;
    }
  }
  const emailError = invitationEmailConfigurationError();
  if (emailError) {
    res.status(503).json({ error: emailError });
    return;
  }

  const email = inputEmail.trim().toLowerCase();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  let inviteUrl: string;
  try {
    inviteUrl = trustedInviteUrl(token);
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "Invitation URL configuration is invalid" });
    return;
  }
  const [invitation] = await db.insert(userInvitationsTable).values({
    email,
    role: invitationRole,
    storeId: storeId ?? null,
    tokenHash,
    expiresAt,
    createdBy: (req.user as { id: string }).id,
  }).returning({
    id: userInvitationsTable.id,
    email: userInvitationsTable.email,
    role: userInvitationsTable.role,
    storeId: userInvitationsTable.storeId,
    expiresAt: userInvitationsTable.expiresAt,
  });
  if (!invitation) {
    res.status(500).json({ error: "Invitation could not be created" });
    return;
  }

  try {
    const storeName = storeId
      ? (await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1))[0]?.name
      : undefined;
    const roleLabel = invitationRole === "super_admin"
      ? "platform super admin"
      : invitationRole.replace("_", " ");
    const message = userInvitationEmail({ inviteUrl, roleLabel, storeName });
    await sendEmail({
      idempotencyKey: `user-invitation:${invitation.id}`,
      storeId: null,
      to: email,
      template: "user_invitation",
      requireProvider: true,
      ...message,
    });
  } catch {
    await db.delete(userInvitationsTable).where(eq(userInvitationsTable.id, invitation.id));
    res.status(503).json({ error: "Invitation email could not be sent; verify the Resend provider and platform sender configuration" });
    return;
  }

  res.status(201).json(CreateUserInvitationResponse.parse(invitation));
});

/** Global user records are platform administration data, not store data. */
router.get("/users", requireSuperAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  const safe = users.map(({ passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...u }) => u);
  res.json(safe);
});

router.get("/users/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

router.patch("/users/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null) updates.avatarUrl = body.avatarUrl;
  if (typeof body.plan === "string" || body.plan === null) updates.plan = body.plan;
  if (typeof body.aiEnabled === "boolean") updates.aiEnabled = body.aiEnabled;
  if (typeof body.aiProvider === "string") updates.aiProvider = body.aiProvider;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No permitted user fields supplied" });
    return;
  }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const { passwordHash, googleAccessToken, googleRefreshToken, notionToken, ...safe } = user;
  res.json(safe);
});

export default router;
