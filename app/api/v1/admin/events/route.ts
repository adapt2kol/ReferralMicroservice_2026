import { NextRequest } from "next/server";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { events } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

export async function GET(request: NextRequest) {
  return withAuth(request, ["admin:read", "admin:write"], async (ctx: RequestContext) => {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = Math.min(Math.max(parseInt(limitParam || "50", 10), 1), 100);
    const offset = Math.max(parseInt(offsetParam || "0", 10), 0);

    const conditions = [eq(events.tenantId, ctx.tenantId)];

    if (type) {
      conditions.push(eq(events.type, type));
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(events)
      .where(and(...conditions));

    const eventsList = await db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      ok: true as const,
      data: {
        events: eventsList.map((event) => ({
          id: event.id,
          type: event.type,
          payloadJson: event.payloadJson,
          createdAt: event.createdAt.toISOString(),
        })),
        total: countResult?.count || 0,
        limit,
        offset,
      },
      status: 200,
    };
  });
}
