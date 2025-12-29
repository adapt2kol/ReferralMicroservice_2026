import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/db/schema";

export interface TenantBranding {
  logoUrl: string | null;
  productName: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  showPoweredBy: boolean;
}

export interface TenantReferralSettings {
  shareBaseUrl: string;
  howItWorks: string[];
  shareMessage: string;
  title: string;
  description: string;
}

export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  branding: TenantBranding;
  referralSettings: TenantReferralSettings;
}

const DEFAULT_BRANDING: TenantBranding = {
  logoUrl: null,
  productName: "Referral Program",
  accentColor: "#3B82F6",
  backgroundColor: "#FFFFFF",
  textColor: "#1F2937",
  showPoweredBy: true,
};

const DEFAULT_REFERRAL_SETTINGS: TenantReferralSettings = {
  shareBaseUrl: "",
  howItWorks: [
    "Share your unique referral link with friends",
    "When they sign up using your link, you both get rewarded",
    "Track your referrals and rewards in real-time",
  ],
  shareMessage: "Join me on {productName}! Use my referral link to sign up.",
  title: "Invite friends, earn rewards",
  description: "Share your unique link and earn rewards for every friend who joins!",
};

function parseBranding(brandingJson: Record<string, unknown> | null): TenantBranding {
  if (!brandingJson) {
    return { ...DEFAULT_BRANDING };
  }

  return {
    logoUrl: typeof brandingJson.logoUrl === "string" ? brandingJson.logoUrl : DEFAULT_BRANDING.logoUrl,
    productName: typeof brandingJson.productName === "string" ? brandingJson.productName : DEFAULT_BRANDING.productName,
    accentColor: typeof brandingJson.accentColor === "string" ? brandingJson.accentColor : DEFAULT_BRANDING.accentColor,
    backgroundColor: typeof brandingJson.backgroundColor === "string" ? brandingJson.backgroundColor : DEFAULT_BRANDING.backgroundColor,
    textColor: typeof brandingJson.textColor === "string" ? brandingJson.textColor : DEFAULT_BRANDING.textColor,
    showPoweredBy: typeof brandingJson.showPoweredBy === "boolean" ? brandingJson.showPoweredBy : DEFAULT_BRANDING.showPoweredBy,
  };
}

function parseReferralSettings(
  settingsJson: Record<string, unknown> | null,
  tenantName: string
): TenantReferralSettings {
  const defaults = { ...DEFAULT_REFERRAL_SETTINGS };
  
  if (!settingsJson) {
    return {
      ...defaults,
      shareMessage: defaults.shareMessage.replace("{productName}", tenantName),
    };
  }

  const howItWorks = Array.isArray(settingsJson.howItWorks)
    ? settingsJson.howItWorks.filter((item): item is string => typeof item === "string")
    : defaults.howItWorks;

  return {
    shareBaseUrl: typeof settingsJson.shareBaseUrl === "string" ? settingsJson.shareBaseUrl : defaults.shareBaseUrl,
    howItWorks: howItWorks.length > 0 ? howItWorks : defaults.howItWorks,
    shareMessage: typeof settingsJson.shareMessage === "string"
      ? settingsJson.shareMessage
      : defaults.shareMessage.replace("{productName}", tenantName),
    title: typeof settingsJson.title === "string" ? settingsJson.title : defaults.title,
    description: typeof settingsJson.description === "string" ? settingsJson.description : defaults.description,
  };
}

export async function getTenantConfigBySlug(slug: string): Promise<TenantConfig | null> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, slug),
  });

  if (!tenant || tenant.status !== "active") {
    return null;
  }

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    branding: parseBranding(tenant.brandingJson),
    referralSettings: parseReferralSettings(tenant.referralSettingsJson, tenant.name),
  };
}

export async function getTenantConfigById(id: string): Promise<TenantConfig | null> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, id),
  });

  if (!tenant || tenant.status !== "active") {
    return null;
  }

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    branding: parseBranding(tenant.brandingJson),
    referralSettings: parseReferralSettings(tenant.referralSettingsJson, tenant.name),
  };
}
