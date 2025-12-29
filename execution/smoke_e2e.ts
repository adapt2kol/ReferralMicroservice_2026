import "dotenv/config";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.REFERRALOS_TEST_API_KEY;

if (!API_KEY) {
  console.error("Error: REFERRALOS_TEST_API_KEY environment variable is required");
  process.exit(1);
}

interface ApiResponse<T> {
  data: T;
  meta: {
    timestamp: string;
    request_id: string;
  };
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data?: T; error?: ApiError }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json();

    if (!response.ok) {
      return { ok: false, status: response.status, error: json };
    }

    return { ok: true, status: response.status, data: json };
  } catch (error) {
    console.error(`Request failed: ${method} ${path}`, error);
    throw error;
  }
}

function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSmokeTests(): Promise<void> {
  log("Starting E2E smoke tests");
  log(`Base URL: ${BASE_URL}`);

  const testId = Date.now().toString(36);
  const referrerExternalId = `smoke_referrer_${testId}`;
  const referredExternalId = `smoke_referred_${testId}`;

  log("Step 1: Health check");
  const healthResult = await apiRequest("GET", "/api/v1/health");
  assert(healthResult.ok, "Health check should succeed");
  log("Health check passed", healthResult.data);

  log("Step 2: Upsert referrer user");
  const referrerResult = await apiRequest<ApiResponse<{ user: { referralCode: string } }>>(
    "POST",
    "/api/v1/users/upsert",
    {
      externalUserId: referrerExternalId,
      email: `${referrerExternalId}@test.example.com`,
      subscriptionTier: "pro",
    }
  );
  assert(referrerResult.ok, "Upsert referrer should succeed");
  const referrerCode = referrerResult.data?.data?.user?.referralCode;
  assert(!!referrerCode, "Referrer should have a referral code");
  log("Referrer created", { referrerCode, externalId: referrerExternalId });

  log("Step 3: Upsert referred user");
  const referredResult = await apiRequest<ApiResponse<{ user: { referralCode: string } }>>(
    "POST",
    "/api/v1/users/upsert",
    {
      externalUserId: referredExternalId,
      email: `${referredExternalId}@test.example.com`,
      subscriptionTier: "free",
    }
  );
  assert(referredResult.ok, "Upsert referred should succeed");
  log("Referred user created", { externalId: referredExternalId });

  log("Step 4: Claim referral (first time)");
  const claimResult = await apiRequest<ApiResponse<{ referral: { id: string }; alreadyProcessed: boolean }>>(
    "POST",
    "/api/v1/referrals/claim",
    {
      referralCode: referrerCode,
      referredUserId: referredExternalId,
    }
  );
  assert(claimResult.ok, "First claim should succeed");
  assert(claimResult.data?.data?.alreadyProcessed === false, "First claim should not be already processed");
  const referralId = claimResult.data?.data?.referral?.id;
  log("Referral claimed", { referralId, alreadyProcessed: false });

  log("Step 5: Claim referral (idempotent - second time)");
  const claimResult2 = await apiRequest<ApiResponse<{ referral: { id: string }; alreadyProcessed: boolean }>>(
    "POST",
    "/api/v1/referrals/claim",
    {
      referralCode: referrerCode,
      referredUserId: referredExternalId,
    }
  );
  assert(claimResult2.ok, "Second claim should succeed (idempotent)");
  assert(claimResult2.data?.data?.alreadyProcessed === true, "Second claim should be already processed");
  assert(claimResult2.data?.data?.referral?.id === referralId, "Referral ID should match");
  log("Idempotent claim verified", { alreadyProcessed: true });

  log("Step 6: Fetch referral stats");
  const statsResult = await apiRequest<ApiResponse<{ referrals: { total: number } }>>(
    "GET",
    "/api/v1/referrals/stats"
  );
  assert(statsResult.ok, "Stats fetch should succeed");
  assert((statsResult.data?.data?.referrals?.total ?? 0) >= 1, "Should have at least 1 referral");
  log("Stats fetched", statsResult.data?.data);

  log("Step 7: Fetch tenant info");
  const tenantResult = await apiRequest<ApiResponse<{ tenant: { id: string } }>>(
    "GET",
    "/api/v1/tenant"
  );
  assert(tenantResult.ok, "Tenant fetch should succeed");
  log("Tenant info fetched", tenantResult.data?.data);

  log("Step 8: Fetch metrics (admin)");
  const metricsResult = await apiRequest<ApiResponse<{ webhooks: { pendingDeliveries: number } }>>(
    "GET",
    "/api/v1/admin/metrics"
  );
  if (metricsResult.ok) {
    log("Metrics fetched", metricsResult.data?.data);
  } else {
    log("Metrics fetch failed (may require admin scope)", metricsResult.error);
  }

  log("Step 9: Test invalid referral code handling");
  const invalidClaimResult = await apiRequest(
    "POST",
    "/api/v1/referrals/claim",
    {
      referralCode: "INVALID_CODE_12345",
      referredUserId: `invalid_user_${testId}`,
    }
  );
  assert(!invalidClaimResult.ok, "Invalid code claim should fail");
  assert(invalidClaimResult.status === 404, "Invalid code should return 404");
  log("Invalid code handling verified", invalidClaimResult.error);

  log("Step 10: Test self-referral prevention");
  const selfReferralResult = await apiRequest(
    "POST",
    "/api/v1/referrals/claim",
    {
      referralCode: referrerCode,
      referredUserId: referrerExternalId,
    }
  );
  assert(!selfReferralResult.ok, "Self-referral should fail");
  assert(selfReferralResult.status === 400, "Self-referral should return 400");
  log("Self-referral prevention verified", selfReferralResult.error);

  log("");
  log("=".repeat(50));
  log("All E2E smoke tests passed!");
  log("=".repeat(50));
}

runSmokeTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Smoke tests failed:", error.message);
    process.exit(1);
  });
