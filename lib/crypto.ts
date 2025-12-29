import crypto from "crypto";

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function generateBase62(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % 62];
  }
  return result;
}

export function generateApiKey(): string {
  return `rk_live_${generateBase62(32)}`;
}

export function hashApiKey(rawKey: string, signingSecret: string): string {
  return crypto
    .createHmac("sha256", signingSecret)
    .update(rawKey)
    .digest("hex");
}

export function generateReferralCode(prefix: string): string {
  const randomPart = generateBase62(6).toUpperCase();
  return `${prefix}${randomPart}`;
}

export function constantTimeCompare(a: string, b: string): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function generateEmbedSignature(
  tenant: string,
  externalUserId: string,
  timestamp: number,
  secret: string
): string {
  const message = `${tenant}.${externalUserId}.${timestamp}`;
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}
