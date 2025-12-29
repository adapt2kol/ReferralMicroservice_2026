import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenants, events, webhookDeliveries } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

export async function POST(request: NextRequest) {
  return withAuth(request, ["admin:write"], async (ctx: RequestContext) => {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
      columns: {
        id: true,
        slug: true,
        webhookUrl: true,
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

    if (!tenant.webhookUrl) {
      return {
        ok: false as const,
        error: {
          code: "WEBHOOK_NOT_CONFIGURED",
          message: "Webhook URL is not configured for this tenant",
        },
        status: 400,
      };
    }

    const testPayload = {
      type: "webhook.test",
      tenantSlug: tenant.slug,
      timestamp: new Date().toISOString(),
      message: "This is a test webhook from ReferralOS",
    };

    const [event] = await db
      .insert(events)
      .values({
        tenantId: ctx.tenantId,
        type: "webhook.test",
        payloadJson: testPayload,
      })
      .returning();

    const [delivery] = await db
      .insert(webhookDeliveries)
      .values({
        tenantId: ctx.tenantId,
        eventId: event.id,
        url: tenant.webhookUrl,
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: new Date(),
      })
      .returning();

    return {
      ok: true as const,
      data: {
        eventId: event.id,
        deliveryId: delivery.id,
        message: "Test webhook queued for delivery",
      },
      status: 201,
    };
  });
}
