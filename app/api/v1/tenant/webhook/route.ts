import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenants } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

function isLocalhostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function validateWebhookUrl(url: string | null): { valid: boolean; error?: string } {
  if (url === null) {
    return { valid: true };
  }

  try {
    const parsed = new URL(url);
    
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Webhook URL must use HTTPS" };
    }

    const isProduction = process.env.NODE_ENV === "production";
    const allowLocalWebhooks = process.env.ALLOW_LOCAL_WEBHOOKS === "true";

    if (isProduction && isLocalhostUrl(url) && !allowLocalWebhooks) {
      return { valid: false, error: "Localhost URLs are not allowed in production" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

const WebhookConfigSchema = z.object({
  webhookUrl: z
    .string()
    .url("Webhook URL must be a valid URL")
    .nullable(),
});

export async function PUT(request: NextRequest) {
  return withAuth(request, ["admin:write"], async (ctx: RequestContext) => {
    const body = await request.json();
    const validation = WebhookConfigSchema.safeParse(body);

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

    const { webhookUrl } = validation.data;

    const urlValidation = validateWebhookUrl(webhookUrl);
    if (!urlValidation.valid) {
      return {
        ok: false as const,
        error: {
          code: "INVALID_WEBHOOK_URL",
          message: urlValidation.error || "Invalid webhook URL",
        },
        status: 400,
      };
    }

    const [updatedTenant] = await db
      .update(tenants)
      .set({
        webhookUrl,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, ctx.tenantId))
      .returning({
        id: tenants.id,
        slug: tenants.slug,
        webhookUrl: tenants.webhookUrl,
        updatedAt: tenants.updatedAt,
      });

    if (!updatedTenant) {
      return {
        ok: false as const,
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        },
        status: 404,
      };
    }

    return {
      ok: true as const,
      data: {
        tenant: {
          id: updatedTenant.id,
          slug: updatedTenant.slug,
          webhookUrl: updatedTenant.webhookUrl,
          updatedAt: updatedTenant.updatedAt?.toISOString(),
        },
      },
      status: 200,
    };
  });
}

export async function GET(request: NextRequest) {
  return withAuth(request, ["admin:write", "read"], async (ctx: RequestContext) => {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
      columns: {
        id: true,
        slug: true,
        webhookUrl: true,
        updatedAt: true,
      },
    });

    if (!tenant) {
      return {
        ok: false as const,
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        },
        status: 404,
      };
    }

    return {
      ok: true as const,
      data: {
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          webhookUrl: tenant.webhookUrl,
          updatedAt: tenant.updatedAt?.toISOString(),
        },
      },
      status: 200,
    };
  });
}
