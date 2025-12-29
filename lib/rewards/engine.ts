import {
  normalizeRewardRules,
  getRewardAmountForTier,
  normalizeSubscriptionTier,
} from "./normalize";
import type { RewardRulesConfig, SubscriptionTier } from "./normalize";

export interface RewardEntry {
  userId: string;
  eventId: string;
  source: string;
  rewardJson: {
    type: string;
    amount: number;
    currency: string;
    description: string;
    referralId?: string;
    referrerTier?: string;
    referredExternalUserId?: string;
    referrerExternalUserId?: string;
  };
}

export interface CalculateRewardsInput {
  referralId: string;
  referrerUserId: string;
  referrerExternalUserId: string;
  referrerTier: string;
  referredUserId: string;
  referredExternalUserId: string;
  tenantRewardSettings: Record<string, unknown> | null | undefined;
}

export interface CalculateRewardsOutput {
  referrerReward: RewardEntry | null;
  referredReward: RewardEntry | null;
}

export function calculateRewards(input: CalculateRewardsInput): CalculateRewardsOutput {
  const rules = normalizeRewardRules(input.tenantRewardSettings);
  const tier = normalizeSubscriptionTier(input.referrerTier);

  const referrerReward = calculateReferrerReward(input, rules, tier);
  const referredReward = calculateReferredReward(input, rules);

  return {
    referrerReward,
    referredReward,
  };
}

function calculateReferrerReward(
  input: CalculateRewardsInput,
  rules: RewardRulesConfig,
  tier: SubscriptionTier
): RewardEntry | null {
  const amount = getRewardAmountForTier(rules, tier);

  if (amount <= 0) {
    return null;
  }

  const eventId = `ref_reward_${input.referralId}_${input.referrerUserId}`;

  return {
    userId: input.referrerUserId,
    eventId,
    source: "referral_reward",
    rewardJson: {
      type: "credit",
      amount,
      currency: rules.currency,
      description: `Referral reward for referring ${input.referredExternalUserId}`,
      referralId: input.referralId,
      referrerTier: tier,
      referredExternalUserId: input.referredExternalUserId,
    },
  };
}

function calculateReferredReward(
  input: CalculateRewardsInput,
  rules: RewardRulesConfig
): RewardEntry | null {
  const amount = rules.onboarding_bonus;

  if (amount <= 0) {
    return null;
  }

  const eventId = `onboard_${input.referralId}_${input.referredUserId}`;

  return {
    userId: input.referredUserId,
    eventId,
    source: "onboarding_bonus",
    rewardJson: {
      type: "credit",
      amount,
      currency: rules.currency,
      description: "Welcome bonus for signing up via referral",
      referralId: input.referralId,
      referrerExternalUserId: input.referrerExternalUserId,
    },
  };
}

export function generateReferralEventId(referralId: string, userId: string): string {
  return `ref_reward_${referralId}_${userId}`;
}

export function generateOnboardingEventId(referralId: string, userId: string): string {
  return `onboard_${referralId}_${userId}`;
}
