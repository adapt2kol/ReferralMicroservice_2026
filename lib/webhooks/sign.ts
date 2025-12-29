import crypto from "crypto";

function getWebhookSigningSecret(): string {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    throw new Error("WEBHOOK_SIGNING_SECRET environment variable is not set");
  }
  return secret;
}

export interface WebhookSignature {
  timestamp: string;
  signature: string;
}

export function signWebhook(payload: string, ts?: string): WebhookSignature {
  const secret = getWebhookSigningSecret();
  const timestamp = ts ?? String(Math.floor(Date.now() / 1000));
  const message = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return {
    timestamp,
    signature,
  };
}

export function getWebhookHeaders(payload: string): Record<string, string> {
  const { timestamp, signature } = signWebhook(payload);
  return {
    "content-type": "application/json",
    "x-referralos-ts": timestamp,
    "x-referralos-signature": signature,
  };
}

export function verifyWebhookSignature(
  payload: string,
  timestamp: string,
  signature: string
): boolean {
  const secret = getWebhookSigningSecret();
  const message = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
