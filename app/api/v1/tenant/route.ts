import { NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenants, users, referrals } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

export async function GET(request: NextRequest) {
  return withAuth(request, ["admin:read", "admin:write", "read"], async (ctx: RequestContext) => {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
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
          name: tenant.name,
          status: tenant.status,
          webhookUrl: tenant.webhookUrl,
          brandingJson: tenant.brandingJson,
          referralSettingsJson: tenant.referralSettingsJson,
          createdAt: tenant.createdAt.toISOString(),
          updatedAt: tenant.updatedAt.toISOString(),
        },
      },
      status: 200,
    };
  });
}
