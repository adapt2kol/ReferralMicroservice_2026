import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db";
import { rewardRules, events } from "@/db/schema";
import { withAuth, RequestContext } from "@/lib/request";

const RuleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  conditionJson: z.record(z.unknown()).optional(),
  rewardReferrerJson: z.record(z.unknown()).optional(),
  rewardReferredJson: z.record(z.unknown()).optional(),
});

interface RouteParams {
  params: Promise<{ ruleId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { ruleId } = await params;

  return withAuth(request, ["admin:write"], async (ctx: RequestContext) => {
    const body = await request.json();
    const validation = RuleUpdateSchema.safeParse(body);

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

    const existingRule = await db.query.rewardRules.findFirst({
      where: and(
        eq(rewardRules.id, ruleId),
        eq(rewardRules.tenantId, ctx.tenantId)
      ),
    });

    if (!existingRule) {
      return {
        ok: false as const,
        error: {
          code: "RULE_NOT_FOUND",
          message: "Reward rule not found",
        },
        status: 404,
      };
    }

    const { enabled, conditionJson, rewardReferrerJson, rewardReferredJson } = validation.data;

    const [updatedRule] = await db
      .update(rewardRules)
      .set({
        ...(enabled !== undefined && { enabled }),
        ...(conditionJson !== undefined && { conditionJson }),
        ...(rewardReferrerJson !== undefined && { rewardReferrerJson }),
        ...(rewardReferredJson !== undefined && { rewardReferredJson }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(rewardRules.id, ruleId), eq(rewardRules.tenantId, ctx.tenantId))
      )
      .returning();

    await db.insert(events).values({
      tenantId: ctx.tenantId,
      type: "tenant.rules.updated",
      payloadJson: {
        ruleId,
        ruleKey: existingRule.ruleKey,
        updatedFields: Object.keys(validation.data),
        updatedAt: new Date().toISOString(),
      },
    });

    return {
      ok: true as const,
      data: {
        rule: {
          id: updatedRule.id,
          ruleKey: updatedRule.ruleKey,
          enabled: updatedRule.enabled,
          conditionJson: updatedRule.conditionJson,
          rewardReferrerJson: updatedRule.rewardReferrerJson,
          rewardReferredJson: updatedRule.rewardReferredJson,
          createdAt: updatedRule.createdAt.toISOString(),
          updatedAt: updatedRule.updatedAt.toISOString(),
        },
      },
      status: 200,
    };
  });
}
