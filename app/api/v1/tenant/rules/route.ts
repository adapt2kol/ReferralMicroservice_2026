import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { rewardRules, events } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

export async function GET(request: NextRequest) {
  return withAuth(request, ["admin:read", "admin:write", "read"], async (ctx: RequestContext) => {
    const rules = await db.query.rewardRules.findMany({
      where: eq(rewardRules.tenantId, ctx.tenantId),
      orderBy: (rules, { asc }) => [asc(rules.ruleKey)],
    });

    return {
      ok: true as const,
      data: {
        rules: rules.map((rule) => ({
          id: rule.id,
          ruleKey: rule.ruleKey,
          enabled: rule.enabled,
          conditionJson: rule.conditionJson,
          rewardReferrerJson: rule.rewardReferrerJson,
          rewardReferredJson: rule.rewardReferredJson,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        })),
      },
      status: 200,
    };
  });
}
