import crypto from "crypto";

const BASE_URL = process.env.REFERRALOS_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.REFERRALOS_TEST_API_KEY;

if (!API_KEY) {
  console.error("ERROR: REFERRALOS_TEST_API_KEY environment variable is required");
  process.exit(1);
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

async function makeRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const json = await response.json();
  return json as ApiResponse<T>;
}

function generateTestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function log(message: string, data?: unknown): void {
  console.log(`[SMOKE] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function testHealthEndpoint(): Promise<void> {
  log("Testing health endpoint...");
  const response = await fetch(`${BASE_URL}/api/health`);
  const json = await response.json();
  assert(json.status === "ok", "Health endpoint should return ok status");
  log("✓ Health endpoint passed", json);
}

async function testUserUpsert(): Promise<{
  referrerExternalId: string;
  referrerReferralCode: string;
  referredExternalId: string;
}> {
  const testId = generateTestId();
  const referrerExternalId = `smoke_referrer_${testId}`;
  const referredExternalId = `smoke_referred_${testId}`;

  log("Testing user upsert (create referrer)...");
  const createResponse = await makeRequest<{
    user: {
      id: string;
      externalUserId: string;
      referralCode: string;
      plan: string;
    };
    created: boolean;
  }>("POST", "/api/v1/users/upsert", {
    externalUserId: referrerExternalId,
    email: `${referrerExternalId}@test.local`,
    subscriptionTier: "pro",
  });

  assert(createResponse.ok === true, "User upsert should succeed");
  assert(createResponse.data?.created === true, "User should be created");
  assert(
    createResponse.data?.user.externalUserId === referrerExternalId,
    "External user ID should match"
  );
  assert(
    createResponse.data?.user.referralCode?.startsWith("ref_") === true,
    "Referral code should start with ref_"
  );
  assert(createResponse.data?.user.plan === "pro", "Plan should be pro");
  log("✓ User upsert (create) passed", createResponse.data);

  const referrerReferralCode = createResponse.data!.user.referralCode;

  log("Testing user upsert (update existing)...");
  const updateResponse = await makeRequest<{
    user: {
      id: string;
      externalUserId: string;
      referralCode: string;
      plan: string;
    };
    created: boolean;
  }>("POST", "/api/v1/users/upsert", {
    externalUserId: referrerExternalId,
    subscriptionTier: "power_pro",
  });

  assert(updateResponse.ok === true, "User upsert update should succeed");
  assert(updateResponse.data?.created === false, "User should not be created (update)");
  assert(
    updateResponse.data?.user.referralCode === referrerReferralCode,
    "Referral code should not change on update"
  );
  assert(updateResponse.data?.user.plan === "power_pro", "Plan should be updated to power_pro");
  log("✓ User upsert (update) passed", updateResponse.data);

  return {
    referrerExternalId,
    referrerReferralCode,
    referredExternalId,
  };
}

async function testReferralClaim(
  referrerReferralCode: string,
  referredExternalId: string
): Promise<void> {
  log("Testing referral claim...");
  const claimResponse = await makeRequest<{
    referral: {
      id: string;
      referrerUserId: string;
      referredExternalUserId: string;
      refCodeUsed: string;
      status: string;
    };
    rewards: {
      referrerReward: { amount: number; currency: string } | null;
      referredReward: { amount: number; currency: string } | null;
    };
    alreadyProcessed: boolean;
  }>("POST", "/api/v1/referrals/claim", {
    referralCode: referrerReferralCode,
    referredUserId: referredExternalId,
  });

  assert(claimResponse.ok === true, "Referral claim should succeed");
  assert(claimResponse.data?.alreadyProcessed === false, "Should not be already processed");
  assert(
    claimResponse.data?.referral.refCodeUsed === referrerReferralCode,
    "Referral code used should match"
  );
  assert(
    claimResponse.data?.referral.referredExternalUserId === referredExternalId,
    "Referred user ID should match"
  );
  assert(claimResponse.data?.referral.status === "completed", "Referral status should be completed");
  log("✓ Referral claim passed", claimResponse.data);

  log("Testing referral claim idempotency...");
  const idempotentResponse = await makeRequest<{
    referral: {
      id: string;
    };
    alreadyProcessed: boolean;
  }>("POST", "/api/v1/referrals/claim", {
    referralCode: referrerReferralCode,
    referredUserId: referredExternalId,
  });

  assert(idempotentResponse.ok === true, "Idempotent claim should succeed");
  assert(
    idempotentResponse.data?.alreadyProcessed === true,
    "Should be marked as already processed"
  );
  log("✓ Referral claim idempotency passed", idempotentResponse.data);
}

async function testSelfReferral(
  referrerExternalId: string,
  referrerReferralCode: string
): Promise<void> {
  log("Testing self-referral prevention...");
  const selfReferralResponse = await makeRequest<unknown>("POST", "/api/v1/referrals/claim", {
    referralCode: referrerReferralCode,
    referredUserId: referrerExternalId,
  });

  assert(selfReferralResponse.ok === false, "Self-referral should fail");
  assert(
    selfReferralResponse.error?.code === "SELF_REFERRAL",
    "Error code should be SELF_REFERRAL"
  );
  log("✓ Self-referral prevention passed", selfReferralResponse.error);
}

async function testInvalidReferralCode(): Promise<void> {
  log("Testing invalid referral code...");
  const invalidCodeResponse = await makeRequest<unknown>("POST", "/api/v1/referrals/claim", {
    referralCode: "ref_invalid_code_12345",
    referredUserId: `smoke_invalid_${generateTestId()}`,
  });

  assert(invalidCodeResponse.ok === false, "Invalid code claim should fail");
  assert(
    invalidCodeResponse.error?.code === "REFERRAL_CODE_NOT_FOUND",
    "Error code should be REFERRAL_CODE_NOT_FOUND"
  );
  log("✓ Invalid referral code test passed", invalidCodeResponse.error);
}

async function testReferralStats(referrerExternalId: string): Promise<void> {
  log("Testing referral stats...");
  const statsResponse = await makeRequest<{
    user: {
      id: string;
      externalUserId: string;
      referralCode: string;
      plan: string;
    };
    stats: {
      totalReferrals: number;
      completedReferrals: number;
      pendingReferrals: number;
      totalRewardsEarned: number;
      currency: string;
    };
  }>("GET", `/api/v1/referrals/stats?externalUserId=${encodeURIComponent(referrerExternalId)}`);

  assert(statsResponse.ok === true, "Stats request should succeed");
  assert(
    statsResponse.data?.user.externalUserId === referrerExternalId,
    "User external ID should match"
  );
  assert(
    (statsResponse.data?.stats.totalReferrals ?? 0) >= 1,
    "Should have at least 1 referral"
  );
  assert(
    (statsResponse.data?.stats.completedReferrals ?? 0) >= 1,
    "Should have at least 1 completed referral"
  );
  log("✓ Referral stats passed", statsResponse.data);
}

async function testMissingApiKey(): Promise<void> {
  log("Testing missing API key...");
  const response = await fetch(`${BASE_URL}/api/v1/users/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ externalUserId: "test" }),
  });
  const json = await response.json();

  assert(json.ok === false, "Request without API key should fail");
  assert(
    json.error?.code === "MISSING_API_KEY",
    "Error code should be MISSING_API_KEY"
  );
  log("✓ Missing API key test passed", json.error);
}

async function testInvalidApiKey(): Promise<void> {
  log("Testing invalid API key...");
  const response = await fetch(`${BASE_URL}/api/v1/users/upsert`, {
    method: "POST",
    headers: {
      Authorization: "Bearer rk_live_invalid_key_12345678901234567890",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ externalUserId: "test" }),
  });
  const json = await response.json();

  assert(json.ok === false, "Request with invalid API key should fail");
  assert(
    json.error?.code === "INVALID_API_KEY",
    "Error code should be INVALID_API_KEY"
  );
  log("✓ Invalid API key test passed", json.error);
}

async function runSmokeTests(): Promise<void> {
  console.log("=".repeat(60));
  console.log("ReferralOS Core API Smoke Tests");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("=".repeat(60));
  console.log("");

  try {
    await testHealthEndpoint();
    console.log("");

    await testMissingApiKey();
    await testInvalidApiKey();
    console.log("");

    const { referrerExternalId, referrerReferralCode, referredExternalId } =
      await testUserUpsert();
    console.log("");

    await testReferralClaim(referrerReferralCode, referredExternalId);
    console.log("");

    await testSelfReferral(referrerExternalId, referrerReferralCode);
    console.log("");

    await testInvalidReferralCode();
    console.log("");

    await testReferralStats(referrerExternalId);
    console.log("");

    console.log("=".repeat(60));
    console.log("✓ ALL SMOKE TESTS PASSED");
    console.log("=".repeat(60));
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("=".repeat(60));
    console.error("✗ SMOKE TESTS FAILED");
    console.error("=".repeat(60));
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runSmokeTests();
