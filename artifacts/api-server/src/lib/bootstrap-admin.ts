import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const MIN_ADMIN_PASSWORD_LENGTH = 12;

function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || "Daybook Admin";
}

/**
 * Creates or updates the password-based platform admin configured through
 * Replit Secrets. The plaintext password is never persisted or logged.
 *
 * Both secrets must be present to enable this bootstrap. This allows existing
 * deployments and CI environments to keep using their seeded accounts.
 */
export async function bootstrapAdminAccount(): Promise<void> {
  const rawEmail = process.env["ADMIN_EMAIL"]?.trim();
  const password = process.env["ADMIN_PASSWORD"];

  if (!rawEmail && !password) {
    return;
  }

  if (!rawEmail || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must both be configured to bootstrap the admin account.",
    );
  }

  const email = rawEmail.toLowerCase();
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters long.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const name = displayNameFromEmail(email);

  await db
    .insert(usersTable)
    .values({
      provider: "password",
      email,
      name,
      passwordHash,
      platformRole: "super_admin",
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: {
        provider: "password",
        name,
        passwordHash,
        platformRole: "super_admin",
        updatedAt: new Date(),
      },
    });

  logger.info({ email }, "Password-based platform admin account is ready");
}