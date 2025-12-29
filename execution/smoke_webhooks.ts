import "dotenv/config";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.SMOKE_TEST_API_KEY;

if (!API_KEY) {
  console.error("SMOKE_TEST_API_KEY environment variable is required");
  process.exit(1);
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      error: errorMessage,
      duration: Date.now() - start,
    });
    console.log(`❌ ${name}: ${errorMessage}`);
  }
}

async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  return { status: response.status, data };
}

async function testGetWebhookConfig(): Promise<void> {
  const { status, data } = await apiRequest("GET", "/api/v1/tenant/webhook");

  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data)}`);
  }

  const response = data as { data?: { tenant?: { id?: string } } };
  if (!response.data?.tenant?.id) {
    throw new Error("Response missing tenant data");
  }
}

async function testSetWebhookUrl(): Promise<void> {
  const webhookUrl = `${BASE_URL}/api/v1/dev/webhook-receiver`;

  const { status, data } = await apiRequest("PUT", "/api/v1/tenant/webhook", {
    webhookUrl,
  });

  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data)}`);
  }

  const response = data as { data?: { tenant?: { webhookUrl?: string } } };
  if (response.data?.tenant?.webhookUrl !== webhookUrl) {
    throw new Error("Webhook URL not set correctly");
  }
}

async function testSetWebhookUrlHttpsRequired(): Promise<void> {
  const { status } = await apiRequest("PUT", "/api/v1/tenant/webhook", {
    webhookUrl: "http://example.com/webhook",
  });

  if (status !== 400) {
    throw new Error(`Expected 400 for HTTP URL, got ${status}`);
  }
}

async function testClearWebhookUrl(): Promise<void> {
  const { status, data } = await apiRequest("PUT", "/api/v1/tenant/webhook", {
    webhookUrl: null,
  });

  if (status !== 200) {
    throw new Error(`Expected 200, got ${status}: ${JSON.stringify(data)}`);
  }

  const response = data as { data?: { tenant?: { webhookUrl?: string | null } } };
  if (response.data?.tenant?.webhookUrl !== null) {
    throw new Error("Webhook URL not cleared");
  }
}

async function testWebhookTestWithoutUrl(): Promise<void> {
  await apiRequest("PUT", "/api/v1/tenant/webhook", { webhookUrl: null });

  const { status, data } = await apiRequest("POST", "/api/v1/webhooks/test");

  if (status !== 400) {
    throw new Error(`Expected 400 when no webhook URL, got ${status}: ${JSON.stringify(data)}`);
  }

  const response = data as { error?: { code?: string } };
  if (response.error?.code !== "WEBHOOK_NOT_CONFIGURED") {
    throw new Error(`Expected WEBHOOK_NOT_CONFIGURED error code`);
  }
}

async function testWebhookTestWithUrl(): Promise<void> {
  const webhookUrl = `${BASE_URL}/api/v1/dev/webhook-receiver`;
  await apiRequest("PUT", "/api/v1/tenant/webhook", { webhookUrl });

  const { status, data } = await apiRequest("POST", "/api/v1/webhooks/test");

  if (status !== 201) {
    throw new Error(`Expected 201, got ${status}: ${JSON.stringify(data)}`);
  }

  const response = data as { data?: { eventId?: string; deliveryId?: string } };
  if (!response.data?.eventId || !response.data?.deliveryId) {
    throw new Error("Response missing eventId or deliveryId");
  }
}

async function testWebhookReplayInvalidEvent(): Promise<void> {
  const { status, data } = await apiRequest("POST", "/api/v1/webhooks/replay", {
    eventId: "00000000-0000-0000-0000-000000000000",
  });

  if (status !== 404) {
    throw new Error(`Expected 404 for invalid event, got ${status}: ${JSON.stringify(data)}`);
  }
}

async function testWebhookReplayValidEvent(): Promise<void> {
  const webhookUrl = `${BASE_URL}/api/v1/dev/webhook-receiver`;
  await apiRequest("PUT", "/api/v1/tenant/webhook", { webhookUrl });

  const testResponse = await apiRequest("POST", "/api/v1/webhooks/test");
  const testData = testResponse.data as { data?: { eventId?: string } };
  const eventId = testData.data?.eventId;

  if (!eventId) {
    throw new Error("Failed to create test event");
  }

  const { status, data } = await apiRequest("POST", "/api/v1/webhooks/replay", {
    eventId,
  });

  if (status !== 201) {
    throw new Error(`Expected 201, got ${status}: ${JSON.stringify(data)}`);
  }

  const response = data as { data?: { deliveryId?: string } };
  if (!response.data?.deliveryId) {
    throw new Error("Response missing deliveryId");
  }
}

async function testDevWebhookReceiver(): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/api/v1/dev/webhook-receiver?clear=true`
  );

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  const postResponse = await fetch(
    `${BASE_URL}/api/v1/dev/webhook-receiver`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    }
  );

  if (postResponse.status !== 200) {
    throw new Error(`Expected 200 for POST, got ${postResponse.status}`);
  }

  const getResponse = await fetch(`${BASE_URL}/api/v1/dev/webhook-receiver`);
  const getData = (await getResponse.json()) as {
    data?: { webhooks?: Array<{ body?: unknown }> };
  };

  if (!getData.data?.webhooks?.length) {
    throw new Error("No webhooks received");
  }

  const receivedBody = getData.data.webhooks[0]?.body as { test?: boolean };
  if (receivedBody?.test !== true) {
    throw new Error("Webhook body not received correctly");
  }
}

async function main(): Promise<void> {
  console.log("\n🔧 ReferralOS Webhook Smoke Tests\n");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`API Key: ${API_KEY?.slice(0, 12)}...`);
  console.log("");

  await runTest("GET /api/v1/tenant/webhook", testGetWebhookConfig);
  await runTest("PUT /api/v1/tenant/webhook - set URL", testSetWebhookUrl);
  await runTest(
    "PUT /api/v1/tenant/webhook - HTTPS required",
    testSetWebhookUrlHttpsRequired
  );
  await runTest("PUT /api/v1/tenant/webhook - clear URL", testClearWebhookUrl);
  await runTest(
    "POST /api/v1/webhooks/test - without URL",
    testWebhookTestWithoutUrl
  );
  await runTest(
    "POST /api/v1/webhooks/test - with URL",
    testWebhookTestWithUrl
  );
  await runTest(
    "POST /api/v1/webhooks/replay - invalid event",
    testWebhookReplayInvalidEvent
  );
  await runTest(
    "POST /api/v1/webhooks/replay - valid event",
    testWebhookReplayValidEvent
  );
  await runTest("Dev webhook receiver", testDevWebhookReceiver);

  console.log("\n📊 Results Summary\n");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${results.length}`);
  console.log(`Duration: ${totalDuration}ms`);

  if (failed > 0) {
    console.log("\n❌ Failed Tests:\n");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    process.exit(1);
  }

  console.log("\n✅ All tests passed!\n");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
