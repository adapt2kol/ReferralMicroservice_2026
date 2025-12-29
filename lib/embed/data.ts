import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, referrals, rewardsLedger, tenants } from "@/db/schema";

export interface RewardSummaryItem {
  type: string;
  totalAmount: number;
  currency: string;
  count: number;
}

export interface EmbedUserData {
  found: true;
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  pendingReferrals: number;
  completedReferrals: number;
  rewardsSummary: RewardSummaryItem[];
  totalRewardsValue: number;
  rewardsCurrency: string;
}

export interface EmbedUserNotFound {
  found: false;
  reason: "user_not_found";
}

export type EmbedData = EmbedUserData | EmbedUserNotFound;

export async function getEmbedData(
  tenantId: string,
  externalUserId: string,
  shareBaseUrl: string
): Promise<EmbedData> {
  const user = await db.query.users.findFirst({
    where: and(
      eq(users.tenantId, tenantId),
      eq(users.externalUserId, externalUserId)
    ),
  });

  if (!user) {
    return { found: false, reason: "user_not_found" };
  }

  const referralStats = await db
    .select({
      status: referrals.status,
      count: sql<number>`count(*)::int`,
    })
    .from(referrals)
    .where(
      and(
        eq(referrals.tenantId, tenantId),
        eq(referrals.referrerUserId, user.id)
      )
    )
    .groupBy(referrals.status);

  let totalReferrals = 0;
  let pendingReferrals = 0;
  let completedReferrals = 0;

  for (const stat of referralStats) {
    const count = Number(stat.count);
    totalReferrals += count;
    if (stat.status === "pending") {
      pendingReferrals = count;
    } else if (stat.status === "completed") {
      completedReferrals = count;
    }
  }

  const rewards = await db.query.rewardsLedger.findMany({
    where: and(
      eq(rewardsLedger.tenantId, tenantId),
      eq(rewardsLedger.userId, user.id)
    ),
  });

  const rewardsByType = new Map<string, { amount: number; currency: string; count: number }>();
  let totalRewardsValue = 0;
  let rewardsCurrency = "USD";

  for (const reward of rewards) {
    const rewardJson = reward.rewardJson as { type?: string; amount?: number; currency?: string };
    const type = rewardJson.type || "credit";
    const amount = typeof rewardJson.amount === "number" ? rewardJson.amount : 0;
    const currency = typeof rewardJson.currency === "string" ? rewardJson.currency : "USD";

    totalRewardsValue += amount;
    rewardsCurrency = currency;

    const existing = rewardsByType.get(type);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      rewardsByType.set(type, { amount, currency, count: 1 });
    }
  }

  const rewardsSummary: RewardSummaryItem[] = Array.from(rewardsByType.entries()).map(
    ([type, data]) => ({
      type,
      totalAmount: data.amount,
      currency: data.currency,
      count: data.count,
    })
  );

  const referralLink = shareBaseUrl
    ? `${shareBaseUrl}?ref=${encodeURIComponent(user.referralCode)}`
    : user.referralCode;

  return {
    found: true,
    referralCode: user.referralCode,
    referralLink,
    totalReferrals,
    pendingReferrals,
    completedReferrals,
    rewardsSummary,
    totalRewardsValue,
    rewardsCurrency,
  };
}

export async function logEmbedView(
  tenantId: string,
  externalUserId: string
): Promise<void> {
  try {
    const { events } = await import("@/db/schema");
    await db.insert(events).values({
      tenantId,
      type: "embed.viewed",
      payloadJson: {
        externalUserId,
        viewedAt: new Date().toISOString(),
      },
    });
  } catch {
    // Best-effort logging - never break rendering
  }
}
