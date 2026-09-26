import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, mcpOAuthTokensTable, usersTable } from "@workspace/db";
import { isSuperAdmin } from "./roles";

export const MCP_SCOPES = [
  "worldsmith:canon:read",
  "worldsmith:canon:write",
  "worldsmith:editorial:read",
  "worldsmith:editorial:write",
  "worldsmith:editorial:references:write",
  "worldsmith:editorial:story-details:write",
  "worldsmith:canon:editorial:write",
  "worldsmith:editorial:scenes:read",
  "worldsmith:editorial:scenes:write",
  "worldsmith:production:read",
  "worldsmith:production:write",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * OAuth origin must come from trusted deployment configuration, never Host or
 * forwarded headers. Production requires MCP_PUBLIC_ORIGIN and HTTPS. In
 * development the runtime-provided Replit domain is preferred, then APP_URL,
 * then localhost for local tests.
 */
export function getMcpIssuer(): string {
  const configured = process.env.MCP_PUBLIC_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("MCP_PUBLIC_ORIGIN is required in production");
  }
  const devDomain = process.env.NODE_ENV === "production" ? undefined : process.env.REPLIT_DEV_DOMAIN;
  const developmentFallback = devDomain
    ? `https://${devDomain.replace(/^https?:\/\//i, "")}`
    : process.env.APP_URL || `http://localhost:${process.env.PORT || "5000"}`;
  const value = configured || developmentFallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MCP_PUBLIC_ORIGIN must be an absolute origin URL");
  }
  if (
    url.username || url.password || url.search || url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    !["https:", ...(process.env.NODE_ENV === "production" ? [] : ["http:"])].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error("MCP_PUBLIC_ORIGIN must be a trusted HTTPS origin without a path");
  }
  return url.origin;
}

export function getMcpResource(): string {
  return `${getMcpIssuer()}/mcp`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createOpaqueSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidS256Challenge(challenge: unknown): challenge is string {
  return typeof challenge === "string" && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

export function verifyPkce(verifier: string, expectedChallenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      !isValidS256Challenge(expectedChallenge)) return false;
  const actual = createHash("sha256").update(verifier).digest("base64url");
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedChallenge));
}

export function parseMcpScopes(value: unknown): McpScope[] | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const scopes = [...new Set(value.split(/\s+/).filter(Boolean))];
  if (!scopes.length || scopes.some((scope) => !MCP_SCOPES.includes(scope as McpScope))) return null;
  return scopes as McpScope[];
}

/** Each write permission depends only on its matching, explicitly requested read scope. */
export function hasWriteWithoutRead(scopes: readonly string[]): boolean {
  return (
    (scopes.includes("worldsmith:canon:write") && !scopes.includes("worldsmith:canon:read")) ||
    (scopes.includes("worldsmith:editorial:write") && !scopes.includes("worldsmith:editorial:read")) ||
    (scopes.includes("worldsmith:editorial:references:write") && (!scopes.includes("worldsmith:editorial:read") || !scopes.includes("worldsmith:editorial:write"))) ||
    (scopes.includes("worldsmith:editorial:story-details:write") && !scopes.includes("worldsmith:editorial:read")) ||
    (scopes.includes("worldsmith:canon:editorial:write") && !scopes.includes("worldsmith:canon:read")) ||
    (scopes.includes("worldsmith:editorial:scenes:write") && !scopes.includes("worldsmith:editorial:scenes:read")) ||
    (scopes.includes("worldsmith:production:write") && !scopes.includes("worldsmith:production:read"))
  );
}

export interface McpBearerClaims {
  userId: string;
  clientId: string;
  audience: string;
  scopes: McpScope[];
}

/** Invalid MCP bearer credentials map to an HTTP 401 response. */
export class McpOAuthTokenError extends Error {
  readonly status = 401;
  readonly code = "invalid_token";

  constructor(message = "MCP access token is invalid, expired, or revoked") {
    super(message);
    this.name = "McpOAuthTokenError";
  }
}

/**
 * Verifies an MCP opaque bearer token and re-reads the current account role.
 * Accepts either the full Authorization header value or an Express request.
 * Returns null for malformed, expired, revoked, wrong-audience, missing-user,
 * or downgraded/non-super-admin credentials. Optionally requires a scope.
 */
export async function verifyMcpBearer(
  requestOrToken: Request | string,
  requiredScope?: McpScope,
): Promise<McpBearerClaims | null> {
  const input = typeof requestOrToken === "string"
    ? requestOrToken
    : requestOrToken.get("authorization") ?? "";
  const token = input.startsWith("Bearer ")
    ? input.slice("Bearer ".length).trim()
    : input.trim();
  if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) return null;
  let resource: string;
  try {
    resource = getMcpResource();
  } catch {
    return null;
  }
  const [grant] = await db.select().from(mcpOAuthTokensTable).where(and(
    eq(mcpOAuthTokensTable.tokenHash, sha256(token)),
    eq(mcpOAuthTokensTable.kind, "access"),
    isNull(mcpOAuthTokensTable.revokedAt),
    gt(mcpOAuthTokensTable.expiresAt, new Date()),
    eq(mcpOAuthTokensTable.resource, resource),
  )).limit(1);
  if (!grant || !Array.isArray(grant.scopes) ||
      grant.scopes.some((scope) => !MCP_SCOPES.includes(scope as McpScope)) ||
      hasWriteWithoutRead(grant.scopes)) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, grant.userId)).limit(1);
  if (!user || !isSuperAdmin(user)) return null;
  const scopes = grant.scopes as McpScope[];
  if (requiredScope && !scopes.includes(requiredScope)) return null;
  return { userId: user.id, clientId: grant.clientId, audience: grant.resource, scopes };
}

/**
 * Transport-facing access-token verifier. Pass the raw opaque token (without
 * "Bearer "); invalid credentials throw McpOAuthTokenError with status 401 and
 * code "invalid_token". Audience and the user's current super-admin privilege
 * are rechecked on every call.
 */
export async function verifyMcpAccessToken(
  rawToken: string,
): Promise<{ userId: string; clientId: string; scopes: string[] }> {
  const claims = await verifyMcpBearer(rawToken);
  if (!claims) throw new McpOAuthTokenError();
  return { userId: claims.userId, clientId: claims.clientId, scopes: claims.scopes };
}

export interface IssuedMcpTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export async function issueMcpTokenPair(args: {
  userId: string;
  clientId: string;
  resource: string;
  scopes: McpScope[];
  familyId?: string;
}, writer: Pick<typeof db, "insert"> = db): Promise<IssuedMcpTokens> {
  if (hasWriteWithoutRead(args.scopes)) {
    throw new Error("Write access requires its corresponding read scope to be explicitly requested");
  }
  const accessToken = createOpaqueSecret();
  const refreshToken = createOpaqueSecret();
  const familyId = args.familyId ?? createOpaqueSecret();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  await writer.insert(mcpOAuthTokensTable).values([
    {
      tokenHash: sha256(accessToken),
      kind: "access",
      familyId,
      clientId: args.clientId,
      userId: args.userId,
      resource: args.resource,
      scopes: args.scopes,
      expiresAt: accessExpiresAt,
    },
    {
      tokenHash: sha256(refreshToken),
      kind: "refresh",
      familyId,
      clientId: args.clientId,
      userId: args.userId,
      resource: args.resource,
      scopes: args.scopes,
      expiresAt: refreshExpiresAt,
    },
  ]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: args.scopes.join(" "),
  };
}