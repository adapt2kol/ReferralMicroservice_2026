import { NextRequest } from "next/server";
import { z } from "zod";
import { withAuth, successResponse, errorResponse } from "@/lib/request";
import {
  getUserByExternalId,
  countReferralsByReferrer,
  countCompletedReferralsByReferrer,
  sumRewardsByUser,
  getTenant,
} from "@/lib/db-helpers";
import { buildReferralLink, getShareBaseUrl } from "@/lib/referral-code";
import { normalizeRewardRules } from "@/lib/rewards/normalize";
import type { RequestContext } from "@/lib/request";

const statsQuerySchema = z.object({
  externalUserId: z.string().min(1, "externalUserId is required"),
});

interface StatsResponse {
  user: {
    id: string;
    externalUserId: string;
    plan: string;
    referralCode: string;
    referralLink: string;
  };
  stats: {
    totalReferrals: number;
    completedReferrals: number;
    pendingReferrals: number;
    totalRewardsEarned: number;
    currency: string;
  };
}

async function handleGetStats(
  request: NextRequest,
  context: RequestContext
) {
  const { tenantId, requestId } = context;

  const url = new URL(request.url);
  const externalUserId = url.searchParams.get("externalUserId");

  const parseResult = statsQuerySchema.safeParse({ externalUserId });
  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0];
    return errorResponse(
      "INVALID_REQUEST",
      firstError?.message || "externalUserId query parameter is required",
      requestId,
      400
    );
  }

  const user = await getUserByExternalId(tenantId, parseResult.data.externalUserId);

  if (!user) {
    return errorResponse(
      "USER_NOT_FOUND",
      "User not found",
      requestId,
      404
    );
  }

  const [totalReferrals, completedReferrals, totalRewards, tenant] = await Promise.all([
    countReferralsByReferrer(tenantId, user.id),
    countCompletedReferralsByReferrer(tenantId, user.id),
    sumRewardsByUser(tenantId, user.id),
    getTenant(tenantId),
  ]);

  const pendingReferrals = totalReferrals - completedReferrals;
  const rewardRules = normalizeRewardRules(tenant?.referralSettingsJson);
  const baseUrl = getShareBaseUrl(tenant?.referralSettingsJson);
  const referralLink = buildReferralLink(baseUrl, user.referralCode);

  return successResponse<StatsResponse>(
    {
      user: {
        id: user.id,
        externalUserId: user.externalUserId,
        plan: user.plan,
        referralCode: user.referralCode,
        referralLink,
      },
      stats: {
        totalReferrals,
        completedReferrals,
        pendingReferrals,
        totalRewardsEarned: totalRewards,
        currency: rewardRules.currency,
      },
    },
    requestId,
    200
  );
}

export const GET = withAuth("read", handleGetStats);
