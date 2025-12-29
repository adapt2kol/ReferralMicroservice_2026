import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenants, events } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

const BrandingUpdateSchema = z.object({
  brandingJson: z
    .object({
      logoUrl: z.string().url().optional(),
      productName: z.string().min(1).max(255).optional(),
      accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      showPoweredBy: z.boolean().optional(),
    })
    .optional(),
  referralSettingsJson: z
    .object({
      shareBaseUrl: z.string().url().optional(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      howItWorks: z.array(z.string()).optional(),
      shareMessage: z.string().max(500).optional(),
    })
    .optional(),
});

export async function PUT(request: NextRequest) {
  return withAuth(request, ["admin:write"], async (ctx: RequestContext) => {
    const body = await request.json();
    const validation = BrandingUpdateSchema.safeParse(body);

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

    const { brandingJson, referralSettingsJson } = validation.data;

    const existingTenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
    });

    if (!existingTenant) {
      return {
        ok: false as const,
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        },
        status: 404,
      };
    }

    const updatedBranding = brandingJson
      ? { ...(existingTenant.brandingJson || {}), ...brandingJson }
      : existingTenant.brandingJson;

    const updatedReferralSettings = referralSettingsJson
      ? { ...(existingTenant.referralSettingsJson || {}), ...referralSettingsJson }
      : existingTenant.referralSettingsJson;

    const [updatedTenant] = await db
      .update(tenants)
      .set({
        brandingJson: updatedBranding,
        referralSettingsJson: updatedReferralSettings,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, ctx.tenantId))
      .returning();

    await db.insert(events).values({
      tenantId: ctx.tenantId,
      type: "tenant.branding.updated",
      payloadJson: {
        updatedFields: {
          brandingJson: brandingJson ? Object.keys(brandingJson) : [],
          referralSettingsJson: referralSettingsJson ? Object.keys(referralSettingsJson) : [],
        },
        updatedAt: new Date().toISOString(),
      },
    });

    return {
      ok: true as const,
      data: {
        tenant: {
          id: updatedTenant.id,
          slug: updatedTenant.slug,
          name: updatedTenant.name,
          status: updatedTenant.status,
          webhookUrl: updatedTenant.webhookUrl,
          brandingJson: updatedTenant.brandingJson,
          referralSettingsJson: updatedTenant.referralSettingsJson,
          createdAt: updatedTenant.createdAt.toISOString(),
          updatedAt: updatedTenant.updatedAt.toISOString(),
        },
      },
      status: 200,
    };
  });
}
