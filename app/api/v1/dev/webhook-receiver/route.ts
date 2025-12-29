import { NextRequest, NextResponse } from "next/server";

const receivedWebhooks: Array<{
  timestamp: string;
  headers: Record<string, string>;
  body: unknown;
}> = [];

const MAX_STORED_WEBHOOKS = 100;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  const timestamp = new Date().toISOString();
  const headers: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const webhook = {
    timestamp,
    headers,
    body,
  };

  receivedWebhooks.unshift(webhook);

  if (receivedWebhooks.length > MAX_STORED_WEBHOOKS) {
    receivedWebhooks.pop();
  }

  console.log(
    JSON.stringify({
      timestamp,
      level: "info",
      message: "Webhook received",
      signature: headers["x-referralos-signature"]?.slice(0, 20) + "...",
      ts: headers["x-referralos-ts"],
      bodyType: body ? typeof body : "null",
    })
  );

  return NextResponse.json({
    ok: true,
    message: "Webhook received",
    timestamp,
  });
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "10", 10);
  const clear = url.searchParams.get("clear") === "true";

  if (clear) {
    receivedWebhooks.length = 0;
    return NextResponse.json({
      ok: true,
      message: "Webhooks cleared",
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      webhooks: receivedWebhooks.slice(0, limit),
      total: receivedWebhooks.length,
    },
  });
}
