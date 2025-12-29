import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withAuth, successResponse } from "@/lib/request";
import type { RequestContext } from "@/lib/request";

interface MetricsResponse {
  webhooks: {
    pendingDeliveries: number;
    failedLast24h: number;
  };
  events: {
    last24hByType: Record<string, number>;
    totalLast24h: number;
  };
  timestamp: string;
}

async function handleGetMetrics(
  request: NextRequest,
  context: RequestContext
) {
  const { tenantId, requestId } = context;
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const pendingDeliveriesResult = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int as count
    FROM webhook_deliveries
    WHERE tenant_id = ${tenantId}
      AND status = 'pending'
  `);

  const failedDeliveriesResult = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int as count
    FROM webhook_deliveries
    WHERE tenant_id = ${tenantId}
      AND status = 'failed'
      AND updated_at >= ${last24h}
  `);

  const eventsByTypeResult = await db.execute<{ type: string; count: number }>(sql`
    SELECT type, COUNT(*)::int as count
    FROM events
    WHERE tenant_id = ${tenantId}
      AND created_at >= ${last24h}
    GROUP BY type
    ORDER BY count DESC
  `);

  const eventsByType: Record<string, number> = {};
  let totalEvents = 0;
  for (const row of eventsByTypeResult.rows) {
    eventsByType[row.type] = row.count;
    totalEvents += row.count;
  }

  return successResponse<MetricsResponse>(
    {
      webhooks: {
        pendingDeliveries: pendingDeliveriesResult.rows[0]?.count ?? 0,
        failedLast24h: failedDeliveriesResult.rows[0]?.count ?? 0,
      },
      events: {
        last24hByType: eventsByType,
        totalLast24h: totalEvents,
      },
      timestamp: now.toISOString(),
    },
    requestId,
    200
  );
}

export const GET = withAuth("admin:read", handleGetMetrics);
