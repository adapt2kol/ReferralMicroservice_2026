import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db";
import { tenants, events, webhookDeliveries } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

const ReplaySchema = z.object({
  eventId: z.string().uuid("Event ID must be a valid UUID"),
});

export async function POST(request: NextRequest) {
  return withAuth(request, ["webhooks:replay", "admin:write"], async (ctx: RequestContext) => {
    const body = await request.json();
    const validation = ReplaySchema.safeParse(body);

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

    const { eventId } = validation.data;

    const event = await db.query.events.findFirst({
      where: and(eq(events.tenantId, ctx.tenantId), eq(events.id, eventId)),
    });

    if (!event) {
      return {
        ok: false as const,
        error: {
          code: "EVENT_NOT_FOUND",
          message: "Event not found or does not belong to this tenant",
        },
        status: 404,
      };
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
      columns: {
        webhookUrl: true,
      },
    });

    if (!tenant?.webhookUrl) {
      return {
        ok: false as const,
        error: {
          code: "WEBHOOK_NOT_CONFIGURED",
          message: "Webhook URL is not configured for this tenant",
        },
        status: 400,
      };
    }

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
        eventType: event.type,
        message: "Event queued for redelivery",
      },
      status: 201,
    };
  });
}
