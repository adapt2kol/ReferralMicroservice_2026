import { verifyEmbed, EmbedVerificationError } from "@/lib/embed/verify";
import { getTenantConfigBySlug } from "@/lib/tenant/config";
import { getEmbedData, logEmbedView } from "@/lib/embed/data";
import CopyLink from "./CopyLink";

interface EmbedPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function ErrorDisplay({
  title,
  message,
  accentColor = "#3B82F6",
}: {
  title: string;
  message: string;
  accentColor?: string;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <div
          className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          <svg
            className="w-8 h-8"
            style={{ color: accentColor }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

export default async function EmbedReferralPage({ searchParams }: EmbedPageProps) {
  const params = await searchParams;
  const urlSearchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      urlSearchParams.set(key, value);
    }
  }

  let verifiedContext;
  try {
    verifiedContext = verifyEmbed(urlSearchParams);
  } catch (error) {
    if (error instanceof EmbedVerificationError) {
      switch (error.code) {
        case "MISSING_PARAMS":
          return (
            <ErrorDisplay
              title="Invalid Link"
              message="This referral link is missing required parameters. Please use the link provided by your application."
            />
          );
        case "INVALID_TIMESTAMP":
          return (
            <ErrorDisplay
              title="Invalid Link"
              message="This referral link contains an invalid timestamp. Please request a new link from your application."
            />
          );
        case "EXPIRED_SIGNATURE":
          return (
            <ErrorDisplay
              title="Link Expired"
              message="This referral link has expired. Please refresh the page from your application to get a new link."
            />
          );
        case "INVALID_SIGNATURE":
          return (
            <ErrorDisplay
              title="Invalid Link"
              message="This referral link could not be verified. Please use the link provided by your application."
            />
          );
      }
    }
    return (
      <ErrorDisplay
        title="Error"
        message="An unexpected error occurred. Please try again later."
      />
    );
  }

  const tenantConfig = await getTenantConfigBySlug(verifiedContext.tenantSlug);
  if (!tenantConfig) {
    return (
      <ErrorDisplay
        title="Unknown Tenant"
        message="This referral program could not be found. Please contact support."
      />
    );
  }

  const { branding, referralSettings } = tenantConfig;

  logEmbedView(tenantConfig.id, verifiedContext.externalUserId);

  const embedData = await getEmbedData(
    tenantConfig.id,
    verifiedContext.externalUserId,
    referralSettings.shareBaseUrl
  );

  if (!embedData.found) {
    return (
      <ErrorDisplay
        title="Complete Your Setup"
        message="Finish onboarding in your application to get your referral link and start earning rewards."
        accentColor={branding.accentColor}
      />
    );
  }

  return (
    <div
      className="min-h-screen p-4 sm:p-6"
      style={{ backgroundColor: branding.backgroundColor }}
    >
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <header className="flex items-center gap-3 mb-6">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.productName}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: branding.accentColor }}
            >
              {branding.productName.charAt(0).toUpperCase()}
            </div>
          )}
          <span
            className="font-semibold text-lg"
            style={{ color: branding.textColor }}
          >
            {branding.productName}
          </span>
        </header>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Title Section */}
          <div className="p-6 pb-4">
            <h1
              className="text-2xl font-bold mb-2"
              style={{ color: branding.textColor }}
            >
              {referralSettings.title}
            </h1>
            <p className="text-gray-600">{referralSettings.description}</p>
          </div>

          {/* Referral Link Section */}
          <div className="px-6 pb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your referral link
            </label>
            <CopyLink
              link={embedData.referralLink}
              accentColor={branding.accentColor}
            />
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-6 pb-6">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div
                className="text-3xl font-bold mb-1"
                style={{ color: branding.accentColor }}
              >
                {embedData.totalReferrals}
              </div>
              <div className="text-sm text-gray-600">Total Referrals</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div
                className="text-3xl font-bold mb-1"
                style={{ color: branding.accentColor }}
              >
                {embedData.pendingReferrals}
              </div>
              <div className="text-sm text-gray-600">Pending</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center col-span-2 sm:col-span-1">
              <div
                className="text-3xl font-bold mb-1"
                style={{ color: branding.accentColor }}
              >
                {formatCurrency(embedData.totalRewardsValue, embedData.rewardsCurrency)}
              </div>
              <div className="text-sm text-gray-600">Rewards Earned</div>
            </div>
          </div>

          {/* Rewards Breakdown */}
          {embedData.rewardsSummary.length > 0 && (
            <div className="px-6 pb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Rewards Breakdown
              </h3>
              <div className="space-y-2">
                {embedData.rewardsSummary.map((reward) => (
                  <div
                    key={reward.type}
                    className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3"
                  >
                    <span className="text-gray-700 capitalize">{reward.type}</span>
                    <span className="font-medium" style={{ color: branding.accentColor }}>
                      {formatCurrency(reward.totalAmount, reward.currency)} ({reward.count}x)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How It Works Section */}
          <div className="border-t border-gray-100 px-6 py-6">
            <h3
              className="font-semibold mb-4"
              style={{ color: branding.textColor }}
            >
              How it works
            </h3>
            <ol className="space-y-3">
              {referralSettings.howItWorks.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: branding.accentColor }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-gray-600 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Footer */}
        {branding.showPoweredBy && (
          <footer className="text-center mt-6 text-xs text-gray-400">
            Powered by ReferralOS
          </footer>
        )}
      </div>
    </div>
  );
}
