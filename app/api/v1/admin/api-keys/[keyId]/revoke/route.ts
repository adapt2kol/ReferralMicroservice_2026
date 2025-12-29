import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { apiKeys, events } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

interface RouteParams {
  params: Promise<{ keyId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { keyId } = await params;

  return withAuth(request, ["admin:write"], async (ctx: RequestContext) => {
    const existingKey = await db.query.apiKeys.findFirst({
      where: and(
        eq(apiKeys.id, keyId),
        eq(apiKeys.tenantId, ctx.tenantId)
      ),
    });

    if (!existingKey) {
      return {
        ok: false as const,
        error: {
          code: "API_KEY_NOT_FOUND",
          message: "API key not found",
        },
        status: 404,
      };
    }

    if (existingKey.revokedAt) {
      return {
        ok: false as const,
        error: {
          code: "API_KEY_ALREADY_REVOKED",
          message: "This API key has already been revoked",
        },
        status: 400,
      };
    }

    if (existingKey.id === ctx.apiKeyId) {
      return {
        ok: false as const,
        error: {
          code: "CANNOT_REVOKE_CURRENT_KEY",
          message: "You cannot revoke the API key you are currently using",
        },
        status: 400,
      };
    }

    const activeAdminKeys = await db.query.apiKeys.findMany({
      where: and(
        eq(apiKeys.tenantId, ctx.tenantId),
        isNull(apiKeys.revokedAt)
      ),
    });

    const adminKeys = activeAdminKeys.filter(
      (key) =>
        key.scopes?.includes("admin:write") || key.scopes?.includes("admin:read")
    );

    if (adminKeys.length <= 1 && adminKeys[0]?.id === keyId) {
      return {
        ok: false as const,
        error: {
          code: "CANNOT_REVOKE_LAST_ADMIN_KEY",
          message: "Cannot revoke the last admin API key",
        },
        status: 400,
      };
    }

    await db
      .update(apiKeys)
      .set({
        revokedAt: new Date(),
      })
      .where(
        and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, ctx.tenantId))
      );

    await db.insert(events).values({
      tenantId: ctx.tenantId,
      type: "api_key.revoked",
      payloadJson: {
        keyId,
        label: existingKey.label,
        revokedAt: new Date().toISOString(),
      },
    });

    return {
      ok: true as const,
      data: {
        success: true,
      },
      status: 200,
    };
  });
}
