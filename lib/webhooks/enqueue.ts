import { db } from "@/lib/db";
import { events, webhookDeliveries, tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface EnqueueWebhookOptions {
  tenantId: string;
  eventId: string;
  webhookUrl: string;
}

export interface EnqueueResult {
  deliveryId: string;
  eventId: string;
}

export async function enqueueWebhookDelivery(
  options: EnqueueWebhookOptions
): Promise<EnqueueResult> {
  const { tenantId, eventId, webhookUrl } = options;

  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      tenantId,
      eventId,
      url: webhookUrl,
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: new Date(),
    })
    .returning();

  return {
    deliveryId: delivery.id,
    eventId,
  };
}

export async function getTenantWebhookUrl(
  tenantId: string
): Promise<string | null> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      webhookUrl: true,
    },
  });

  return tenant?.webhookUrl ?? null;
}

export interface CreateEventAndEnqueueOptions {
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface CreateEventResult {
  eventId: string;
  deliveryId: string | null;
  webhookEnqueued: boolean;
}

export async function createEventAndEnqueueWebhook(
  options: CreateEventAndEnqueueOptions
): Promise<CreateEventResult> {
  const { tenantId, eventType, payload } = options;

  const [event] = await db
    .insert(events)
    .values({
      tenantId,
      type: eventType,
      payloadJson: payload,
    })
    .returning();

  const webhookUrl = await getTenantWebhookUrl(tenantId);

  if (!webhookUrl) {
    return {
      eventId: event.id,
      deliveryId: null,
      webhookEnqueued: false,
    };
  }

  const result = await enqueueWebhookDelivery({
    tenantId,
    eventId: event.id,
    webhookUrl,
  });

  return {
    eventId: event.id,
    deliveryId: result.deliveryId,
    webhookEnqueued: true,
  };
}

export async function enqueueWebhookForExistingEvent(
  tenantId: string,
  eventId: string
): Promise<EnqueueResult | null> {
  const webhookUrl = await getTenantWebhookUrl(tenantId);

  if (!webhookUrl) {
    return null;
  }

  return enqueueWebhookDelivery({
    tenantId,
    eventId,
    webhookUrl,
  });
}
