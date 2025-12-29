import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiKeys } from "@/db/schema";
import { hashApiKey } from "@/lib/crypto";

export interface AuthContext {
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
}

export interface AuthResult {
  success: true;
  context: AuthContext;
}

export interface AuthError {
  success: false;
  code: string;
  message: string;
  status: number;
}

export type AuthOutcome = AuthResult | AuthError;

function getSigningSecret(): string {
  const secret = process.env.REFERRALOS_SIGNING_SECRET;
  if (!secret) {
    throw new Error("REFERRALOS_SIGNING_SECRET environment variable is not set");
  }
  return secret;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }
  return parts[1];
}

export function maskApiKey(key: string): string {
  if (key.length <= 12) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export async function authenticateApiKey(rawKey: string): Promise<AuthOutcome> {
  if (!rawKey || rawKey.trim() === "") {
    return {
      success: false,
      code: "MISSING_API_KEY",
      message: "API key is required",
      status: 401,
    };
  }

  const signingSecret = getSigningSecret();
  const keyHash = hashApiKey(rawKey, signingSecret);

  const apiKeyRecord = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)),
  });

  if (!apiKeyRecord) {
    return {
      success: false,
      code: "INVALID_API_KEY",
      message: "The provided API key is invalid or has been revoked",
      status: 401,
    };
  }

  return {
    success: true,
    context: {
      tenantId: apiKeyRecord.tenantId,
      apiKeyId: apiKeyRecord.id,
      scopes: apiKeyRecord.scopes || [],
    },
  };
}

export function hasScope(context: AuthContext, requiredScope: string): boolean {
  if (context.scopes.includes("admin")) {
    return true;
  }
  if (context.scopes.includes("write") && (requiredScope === "read" || requiredScope === "write")) {
    return true;
  }
  return context.scopes.includes(requiredScope);
}

export function hasAnyScope(context: AuthContext, requiredScopes: string[]): boolean {
  return requiredScopes.some((scope) => hasScope(context, scope));
}

export function hasAllScopes(context: AuthContext, requiredScopes: string[]): boolean {
  return requiredScopes.every((scope) => hasScope(context, scope));
}
