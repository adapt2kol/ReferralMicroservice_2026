import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, referrals, rewardsLedger, events } from "@/db/schema";
import { withAuth, successResponse, errorResponse, parseJsonBody } from "@/lib/request";
import { calculateRewards } from "@/lib/rewards/engine";
import {
  getUserByExternalId,
  getUserByReferralCode,
  getReferralByReferredExternalUserId,
  getTenant,
} from "@/lib/db-helpers";
import { enqueueWebhookForExistingEvent } from "@/lib/webhooks/enqueue";
import {
  checkRateLimit,
  incrementRateLimitKey,
  RATE_LIMITS,
  getRateLimitHeaders,
} from "@/lib/rate-limit";
import type { RequestContext } from "@/lib/request";

const MAX_EXTERNAL_USER_ID_LENGTH = 255;
const MAX_REFERRAL_CODE_LENGTH = 50;

const claimReferralSchema = z.object({
  referralCode: z.string().min(1, "referralCode is required"),
  referredUserId: z.string().min(1, "referredUserId is required"),
});

type ClaimReferralInput = z.infer<typeof claimReferralSchema>;

interface ClaimReferralResponse {
  referral: {
    id: string;
    referrerUserId: string;
    referredExternalUserId: string;
    refCodeUsed: string;
    status: string;
    createdAt: string;
  };
  rewards: {
    referrerReward: {
      amount: number;
      currency: string;
    } | null;
    referredReward: {
      amount: number;
      currency: string;
    } | null;
  };
  alreadyProcessed: boolean;
}

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

async function handleClaimReferral(
  request: NextRequest,
  context: RequestContext
) {
  const { tenantId, requestId } = context;
  const clientIp = getClientIp(request);

  const ipRateLimit = await checkRateLimit({
    tenantId,
    key: `claim:ip:${clientIp}`,
    limit: RATE_LIMITS.CLAIM_PER_IP,
  });

  if (!ipRateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      `Too many requests. Please retry after ${ipRateLimit.retryAfterSeconds} seconds.`,
      requestId,
      429,
      {
        limit: RATE_LIMITS.CLAIM_PER_IP,
        window: "1 minute",
        retryAfterSeconds: ipRateLimit.retryAfterSeconds,
      }
    );
  }

  const bodyResult = await parseJsonBody<ClaimReferralInput>(request, requestId);
  if (!bodyResult.success) {
    return bodyResult.response;
  }

  const parseResult = claimReferralSchema.safeParse(bodyResult.data);
  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0];
    return errorResponse(
      "INVALID_REQUEST",
      firstError?.message || "Invalid request body",
      requestId,
      400,
      { validation_errors: parseResult.error.errors }
    );
  }

  const input = parseResult.data;

  if (input.referredUserId.length > MAX_EXTERNAL_USER_ID_LENGTH) {
    return errorResponse(
      "INVALID_REQUEST",
      `referredUserId exceeds maximum length of ${MAX_EXTERNAL_USER_ID_LENGTH}`,
      requestId,
      400
    );
  }

  if (input.referralCode.length > MAX_REFERRAL_CODE_LENGTH) {
    return errorResponse(
      "INVALID_REQUEST",
      `referralCode exceeds maximum length of ${MAX_REFERRAL_CODE_LENGTH}`,
      requestId,
      400
    );
  }

  const userRateLimit = await checkRateLimit({
    tenantId,
    key: `claim:user:${input.referredUserId}`,
    limit: RATE_LIMITS.CLAIM_PER_USER,
  });

  if (!userRateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      `Too many requests for this user. Please retry after ${userRateLimit.retryAfterSeconds} seconds.`,
      requestId,
      429,
      {
        limit: RATE_LIMITS.CLAIM_PER_USER,
        window: "1 minute",
        retryAfterSeconds: userRateLimit.retryAfterSeconds,
      }
    );
  }

  const existingReferral = await getReferralByReferredExternalUserId(
    tenantId,
    input.referredUserId
  );

  if (existingReferral) {
    const referrerUser = await db.query.users.findFirst({
      where: eq(users.id, existingReferral.referrerUserId),
    });

    return successResponse<ClaimReferralResponse>(
      {
        referral: {
          id: existingReferral.id,
          referrerUserId: referrerUser?.externalUserId || existingReferral.referrerUserId,
          referredExternalUserId: existingReferral.referredExternalUserId,
          refCodeUsed: existingReferral.refCodeUsed,
          status: existingReferral.status,
          createdAt: existingReferral.createdAt.toISOString(),
        },
        rewards: {
          referrerReward: null,
          referredReward: null,
        },
        alreadyProcessed: true,
      },
      requestId,
      200
    );
  }

  const referrer = await getUserByReferralCode(tenantId, input.referralCode);

  if (!referrer) {
    incrementRateLimitKey(tenantId, `invalid_ref:ip:${clientIp}`).catch(() => {});
    
    const invalidRefLimit = await checkRateLimit({
      tenantId,
      key: `invalid_ref:ip:${clientIp}`,
      limit: RATE_LIMITS.INVALID_REF_PER_IP,
    });
    
    if (!invalidRefLimit.allowed) {
      return errorResponse(
        "RATE_LIMITED",
        "Too many invalid referral code attempts. Please retry later.",
        requestId,
        429,
        { retryAfterSeconds: invalidRefLimit.retryAfterSeconds }
      );
    }
    
    return errorResponse(
      "REFERRAL_CODE_NOT_FOUND",
      "The referral code does not exist or has expired",
      requestId,
      404
    );
  }

  if (referrer.externalUserId === input.referredUserId) {
    return errorResponse(
      "SELF_REFERRAL",
      "Users cannot refer themselves",
      requestId,
      400
    );
  }

  const tenant = await getTenant(tenantId);

  const referralSettings = tenant?.referralSettingsJson as Record<string, unknown> | undefined;
  const maxReferralsPerReferrer = referralSettings?.max_referrals_per_referrer as number | undefined;

  if (maxReferralsPerReferrer && maxReferralsPerReferrer > 0) {
    const referrerReferralCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(
        and(
          eq(referrals.tenantId, tenantId),
          eq(referrals.referrerUserId, referrer.id)
        )
      );

    const currentCount = referrerReferralCount[0]?.count ?? 0;
    if (currentCount >= maxReferralsPerReferrer) {
      return errorResponse(
        "REFERRAL_CAP_REACHED",
        "This referrer has reached their maximum number of referrals",
        requestId,
        400,
        { limit: maxReferralsPerReferrer, current: currentCount }
      );
    }
  }

  let referredUser = await getUserByExternalId(tenantId, input.referredUserId);

  const result = await db.transaction(async (tx) => {
    const doubleCheck = await tx.query.referrals.findFirst({
      where: and(
        eq(referrals.tenantId, tenantId),
        eq(referrals.referredExternalUserId, input.referredUserId)
      ),
    });

    if (doubleCheck) {
      return { alreadyProcessed: true, referral: doubleCheck };
    }

    if (!referredUser) {
      const [newUser] = await tx
        .insert(users)
        .values({
          tenantId,
          externalUserId: input.referredUserId,
          email: null,
          plan: "free",
          referralCode: `ref_pending_${input.referredUserId.slice(0, 8)}`,
        })
        .onConflictDoNothing()
        .returning();

      if (newUser) {
        referredUser = newUser;
      } else {
        const existingUser = await tx.query.users.findFirst({
          where: and(
            eq(users.tenantId, tenantId),
            eq(users.externalUserId, input.referredUserId)
          ),
        });
        if (existingUser) {
          referredUser = existingUser;
        }
      }
    }

    if (!referredUser) {
      throw new Error("Failed to create or find referred user");
    }

    const [newReferral] = await tx
      .insert(referrals)
      .values({
        tenantId,
        referrerUserId: referrer.id,
        referredExternalUserId: input.referredUserId,
        referredUserId: referredUser.id,
        refCodeUsed: input.referralCode,
        status: "completed",
        completedAt: new Date(),
      })
      .returning();

    const rewardCalc = calculateRewards({
      referralId: newReferral.id,
      referrerUserId: referrer.id,
      referrerExternalUserId: referrer.externalUserId,
      referrerTier: referrer.plan,
      referredUserId: referredUser.id,
      referredExternalUserId: input.referredUserId,
      tenantRewardSettings: tenant?.referralSettingsJson,
    });

    if (rewardCalc.referrerReward) {
      await tx
        .insert(rewardsLedger)
        .values({
          tenantId,
          userId: rewardCalc.referrerReward.userId,
          source: rewardCalc.referrerReward.source,
          eventId: rewardCalc.referrerReward.eventId,
          rewardJson: rewardCalc.referrerReward.rewardJson,
        })
        .onConflictDoNothing();
    }

    if (rewardCalc.referredReward) {
      await tx
        .insert(rewardsLedger)
        .values({
          tenantId,
          userId: rewardCalc.referredReward.userId,
          source: rewardCalc.referredReward.source,
          eventId: rewardCalc.referredReward.eventId,
          rewardJson: rewardCalc.referredReward.rewardJson,
        })
        .onConflictDoNothing();
    }

    const [claimEvent] = await tx.insert(events).values({
      tenantId,
      type: "referral.claimed",
      payloadJson: {
        referralId: newReferral.id,
        referrerUserId: referrer.externalUserId,
        referredUserId: input.referredUserId,
        referralCode: input.referralCode,
        rewards: {
          referrer: rewardCalc.referrerReward?.rewardJson || null,
          referred: rewardCalc.referredReward?.rewardJson || null,
        },
      },
    }).returning();

    return {
      alreadyProcessed: false,
      referral: newReferral,
      rewards: rewardCalc,
      eventId: claimEvent.id,
    };
  }, {
    isolationLevel: "serializable",
  });

  if (result.alreadyProcessed && "referral" in result) {
    const referrerUser = await db.query.users.findFirst({
      where: eq(users.id, result.referral.referrerUserId),
    });

    return successResponse<ClaimReferralResponse>(
      {
        referral: {
          id: result.referral.id,
          referrerUserId: referrerUser?.externalUserId || result.referral.referrerUserId,
          referredExternalUserId: result.referral.referredExternalUserId,
          refCodeUsed: result.referral.refCodeUsed,
          status: result.referral.status,
          createdAt: result.referral.createdAt.toISOString(),
        },
        rewards: {
          referrerReward: null,
          referredReward: null,
        },
        alreadyProcessed: true,
      },
      requestId,
      200
    );
  }

  if (result.eventId) {
    enqueueWebhookForExistingEvent(tenantId, result.eventId).catch(() => {
    });
  }

  return successResponse<ClaimReferralResponse>(
    {
      referral: {
        id: result.referral.id,
        referrerUserId: referrer.externalUserId,
        referredExternalUserId: result.referral.referredExternalUserId,
        refCodeUsed: result.referral.refCodeUsed,
        status: result.referral.status,
        createdAt: result.referral.createdAt.toISOString(),
      },
      rewards: {
        referrerReward: result.rewards?.referrerReward
          ? {
              amount: result.rewards.referrerReward.rewardJson.amount,
              currency: result.rewards.referrerReward.rewardJson.currency,
            }
          : null,
        referredReward: result.rewards?.referredReward
          ? {
              amount: result.rewards.referredReward.rewardJson.amount,
              currency: result.rewards.referredReward.rewardJson.currency,
            }
          : null,
      },
      alreadyProcessed: false,
    },
    requestId,
    201
  );
}

export const POST = withAuth("write", handleClaimReferral);
