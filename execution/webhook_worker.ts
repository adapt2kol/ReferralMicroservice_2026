import "dotenv/config";
import { eq, and, lte, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { webhookDeliveries, events } from "../db/schema";
import { getWebhookHeaders } from "../lib/webhooks/sign";

const POLL_INTERVAL_MS = parseInt(
  process.env.WEBHOOK_WORKER_POLL_MS || "2000",
  10
);
const WEBHOOK_RETRY_LIMIT = parseInt(
  process.env.WEBHOOK_RETRY_LIMIT || "6",
  10
);
const WEBHOOK_TIMEOUT_MS = parseInt(
  process.env.WEBHOOK_TIMEOUT_MS || "30000",
  10
);
const SINGLE_RUN = process.env.SINGLE_RUN === "true" || process.env.SINGLE_RUN === "1";
const BATCH_SIZE = parseInt(process.env.WEBHOOK_WORKER_BATCH_SIZE || "10", 10);
const CONCURRENCY = parseInt(process.env.WEBHOOK_WORKER_CONCURRENCY || "5", 10);

let isShuttingDown = false;

const RETRY_DELAYS_MS = [
  0,
  10_000,
  60_000,
  300_000,
  1_800_000,
  7_200_000,
];

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    level,
    worker: "webhook",
    message,
    ...data,
  };
  console.log(JSON.stringify(logData));
}

function getNextAttemptDelay(attemptCount: number): number {
  if (attemptCount >= RETRY_DELAYS_MS.length) {
    return RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  }
  return RETRY_DELAYS_MS[attemptCount];
}

interface DeliveryRecord {
  id: string;
  tenantId: string;
  eventId: string;
  url: string;
  status: string;
  attemptCount: number;
}

async function fetchDueDeliveries(): Promise<DeliveryRecord[]> {
  const now = new Date();

  const deliveries = await db
    .select({
      id: webhookDeliveries.id,
      tenantId: webhookDeliveries.tenantId,
      eventId: webhookDeliveries.eventId,
      url: webhookDeliveries.url,
      status: webhookDeliveries.status,
      attemptCount: webhookDeliveries.attemptCount,
    })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextAttemptAt, now)
      )
    )
    .limit(BATCH_SIZE)
    .for("update", { skipLocked: true });

  return deliveries;
}

async function processDelivery(delivery: DeliveryRecord): Promise<void> {
  const { id: deliveryId, tenantId, eventId, url, attemptCount } = delivery;

  log("info", "Processing webhook delivery", {
    deliveryId,
    eventId,
    attemptCount,
  });

  const event = await db.query.events.findFirst({
    where: and(eq(events.tenantId, tenantId), eq(events.id, eventId)),
  });

  if (!event) {
    log("error", "Event not found for delivery", { deliveryId, eventId });
    await db
      .update(webhookDeliveries)
      .set({
        status: "failed",
        lastError: "Event not found",
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
  }

  const payload = JSON.stringify({
    id: event.id,
    type: event.type,
    tenantId: event.tenantId,
    timestamp: event.createdAt.toISOString(),
    data: event.payloadJson,
  });

  const headers = getWebhookHeaders(payload);
  let statusCode: number | null = null;
  let errorMessage: string | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    statusCode = response.status;
    success = response.ok;

    if (!success) {
      const responseText = await response.text().catch(() => "");
      errorMessage = `HTTP ${statusCode}: ${responseText.slice(0, 200)}`;
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = `Timeout after ${WEBHOOK_TIMEOUT_MS}ms`;
      } else {
        errorMessage = error.message.slice(0, 200);
      }
    } else {
      errorMessage = "Unknown error";
    }
  }

  const newAttemptCount = attemptCount + 1;
  const now = new Date();

  if (success) {
    log("info", "Webhook delivery succeeded", {
      deliveryId,
      eventId,
      statusCode,
      attemptCount: newAttemptCount,
    });

    await db
      .update(webhookDeliveries)
      .set({
        status: "success",
        attemptCount: newAttemptCount,
        lastAttemptAt: now,
        lastError: null,
        nextAttemptAt: null,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    await db.insert(events).values({
      tenantId,
      type: "webhook.sent",
      payloadJson: {
        deliveryId,
        eventId,
        statusCode,
        attemptCount: newAttemptCount,
        url,
      },
    });
  } else {
    const exhausted = newAttemptCount >= WEBHOOK_RETRY_LIMIT;
    const newStatus = exhausted ? "failed" : "pending";
    const nextAttemptAt = exhausted
      ? null
      : new Date(now.getTime() + getNextAttemptDelay(newAttemptCount));

    log("warn", "Webhook delivery failed", {
      deliveryId,
      eventId,
      statusCode,
      attemptCount: newAttemptCount,
      exhausted,
      error: errorMessage,
    });

    await db
      .update(webhookDeliveries)
      .set({
        status: newStatus,
        attemptCount: newAttemptCount,
        lastAttemptAt: now,
        lastError: errorMessage,
        nextAttemptAt,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

    await db.insert(events).values({
      tenantId,
      type: exhausted ? "webhook.exhausted" : "webhook.failed",
      payloadJson: {
        deliveryId,
        eventId,
        statusCode,
        attemptCount: newAttemptCount,
        error: errorMessage,
        url,
      },
    });
  }
}

async function processWithConcurrency(
  deliveries: DeliveryRecord[],
  concurrency: number
): Promise<void> {
  const chunks: DeliveryRecord[][] = [];
  for (let i = 0; i < deliveries.length; i += concurrency) {
    chunks.push(deliveries.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    if (isShuttingDown) {
      log("info", "Shutdown requested, stopping processing");
      break;
    }

    await Promise.all(
      chunk.map(async (delivery) => {
        try {
          await processDelivery(delivery);
        } catch (error) {
          log("error", "Failed to process delivery", {
            deliveryId: delivery.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })
    );
  }
}

function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    log("info", "Received shutdown signal", { signal });
    isShuttingDown = true;
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

async function runWorkerLoop(): Promise<void> {
  setupGracefulShutdown();

  log("info", "Webhook worker started", {
    pollInterval: POLL_INTERVAL_MS,
    retryLimit: WEBHOOK_RETRY_LIMIT,
    timeout: WEBHOOK_TIMEOUT_MS,
    singleRun: SINGLE_RUN,
    batchSize: BATCH_SIZE,
    concurrency: CONCURRENCY,
  });

  while (!isShuttingDown) {
    try {
      const deliveries = await fetchDueDeliveries();

      if (deliveries.length > 0) {
        log("info", "Found due deliveries", { count: deliveries.length });
        await processWithConcurrency(deliveries, CONCURRENCY);
      }

      if (SINGLE_RUN) {
        log("info", "Single run mode, exiting");
        break;
      }

      if (!isShuttingDown) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      log("error", "Worker loop error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      if (SINGLE_RUN) {
        break;
      }

      if (!isShuttingDown) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }

  log("info", "Worker loop exiting gracefully");
}

runWorkerLoop()
  .then(() => {
    log("info", "Webhook worker stopped");
    process.exit(0);
  })
  .catch((error) => {
    log("error", "Webhook worker crashed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    process.exit(1);
  });
