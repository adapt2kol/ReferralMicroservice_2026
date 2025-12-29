export interface RewardRulesConfig {
  onboarding_bonus: number;
  referral_reward_free: number;
  referral_reward_pro: number;
  referral_reward_power_pro: number;
  currency: string;
}

export const DEFAULT_REWARD_RULES: RewardRulesConfig = {
  onboarding_bonus: 0,
  referral_reward_free: 100,
  referral_reward_pro: 200,
  referral_reward_power_pro: 300,
  currency: "AUD",
};

export function normalizeRewardRules(
  rawRules: Record<string, unknown> | null | undefined
): RewardRulesConfig {
  if (!rawRules) {
    return { ...DEFAULT_REWARD_RULES };
  }

  return {
    onboarding_bonus:
      typeof rawRules.onboarding_bonus === "number"
        ? rawRules.onboarding_bonus
        : DEFAULT_REWARD_RULES.onboarding_bonus,
    referral_reward_free:
      typeof rawRules.referral_reward_free === "number"
        ? rawRules.referral_reward_free
        : DEFAULT_REWARD_RULES.referral_reward_free,
    referral_reward_pro:
      typeof rawRules.referral_reward_pro === "number"
        ? rawRules.referral_reward_pro
        : DEFAULT_REWARD_RULES.referral_reward_pro,
    referral_reward_power_pro:
      typeof rawRules.referral_reward_power_pro === "number"
        ? rawRules.referral_reward_power_pro
        : DEFAULT_REWARD_RULES.referral_reward_power_pro,
    currency:
      typeof rawRules.currency === "string" && rawRules.currency.trim() !== ""
        ? rawRules.currency
        : DEFAULT_REWARD_RULES.currency,
  };
}

export type SubscriptionTier = "free" | "pro" | "power_pro";

export function getRewardAmountForTier(
  rules: RewardRulesConfig,
  tier: SubscriptionTier
): number {
  switch (tier) {
    case "free":
      return rules.referral_reward_free;
    case "pro":
      return rules.referral_reward_pro;
    case "power_pro":
      return rules.referral_reward_power_pro;
    default:
      return rules.referral_reward_free;
  }
}

export function normalizeSubscriptionTier(tier: string | null | undefined): SubscriptionTier {
  if (!tier) return "free";
  const normalized = tier.toLowerCase().trim();
  if (normalized === "pro") return "pro";
  if (normalized === "power_pro" || normalized === "powerpro") return "power_pro";
  return "free";
}
