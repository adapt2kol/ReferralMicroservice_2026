import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { apiKeys, events } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";
import { generateApiKey, hashApiKey } from "@/lib/crypto";

const VALID_SCOPES = ["read", "write", "admin:read", "admin:write"];

const CreateApiKeySchema = z.object({
  label: z.string().min(1).max(255),
  scopes: z.array(z.enum(["read", "write", "admin:read", "admin:write"])).min(1),
});

function getSigningSecret(): string {
  const secret = process.env.REFERRALOS_SIGNING_SECRET;
  if (!secret) {
    throw new Error("REFERRALOS_SIGNING_SECRET environment variable is not set");
  }
  return secret;
}

export async function GET(request: NextRequest) {
  return withAuth(request, ["admin:read", "admin:write"], async (ctx: RequestContext) => {
    const keys = await db.query.apiKeys.findMany({
      where: eq(apiKeys.tenantId, ctx.tenantId),
      orderBy: (keys, { desc }) => [desc(keys.createdAt)],
    });

    return {
      ok: true as const,
      data: {
        apiKeys: keys.map((key) => ({
          id: key.id,
          label: key.label,
          scopes: key.scopes,
          createdAt: key.createdAt.toISOString(),
          revokedAt: key.revokedAt?.toISOString() || null,
        })),
      },
      status: 200,
    };
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, ["admin:write"], async (ctx: RequestContext) => {
    const body = await request.json();
    const validation = CreateApiKeySchema.safeParse(body);

    if (!validation.success) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_REQUEST",
          message: validation.error.errors[0]?.message || "Invalid request body",
        },
        status: 400,
      };
    }

    const { label, scopes } = validation.data;

    const rawKey = generateApiKey();
    const signingSecret = getSigningSecret();
    const keyHash = hashApiKey(rawKey, signingSecret);

    const [newKey] = await db
      .insert(apiKeys)
      .values({
        tenantId: ctx.tenantId,
        keyHash,
        label,
        scopes,
      })
      .returning();

    await db.insert(events).values({
      tenantId: ctx.tenantId,
      type: "api_key.created",
      payloadJson: {
        keyId: newKey.id,
        label,
        scopes,
        createdAt: new Date().toISOString(),
      },
    });

    return {
      ok: true as const,
      data: {
        id: newKey.id,
        key: rawKey,
        label: newKey.label,
        scopes: newKey.scopes,
        createdAt: newKey.createdAt.toISOString(),
      },
      status: 201,
    };
  });
}
