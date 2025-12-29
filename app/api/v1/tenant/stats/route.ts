import { NextRequest } from "next/server";
import { eq, sql, and } from "drizzle-orm";

import { db } from "@/lib/db";
import { users, referrals } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

export async function GET(request: NextRequest) {
  return withAuth(request, ["admin:read", "admin:write", "read"], async (ctx: RequestContext) => {
    const [userStats] = await db
      .select({
        totalUsers: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(eq(users.tenantId, ctx.tenantId));

    const referralStats = await db
      .select({
        status: referrals.status,
        count: sql<number>`count(*)::int`,
      })
      .from(referrals)
      .where(eq(referrals.tenantId, ctx.tenantId))
      .groupBy(referrals.status);

    let totalReferrals = 0;
    let completedReferrals = 0;
    let pendingReferrals = 0;

    for (const stat of referralStats) {
      const count = Number(stat.count);
      totalReferrals += count;
      if (stat.status === "completed") {
        completedReferrals = count;
      } else if (stat.status === "pending") {
        pendingReferrals = count;
      }
    }

    return {
      ok: true as const,
      data: {
        stats: {
          totalUsers: userStats?.totalUsers || 0,
          totalReferrals,
          completedReferrals,
          pendingReferrals,
        },
      },
      status: 200,
    };
  });
}
