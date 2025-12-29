import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

const URL_SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateUrlSafeRandom(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += URL_SAFE_CHARS[bytes[i] % URL_SAFE_CHARS.length];
  }
  return result;
}

export function generateReferralCodeCandidate(): string {
  const randomPart = generateUrlSafeRandom(12);
  return `ref_${randomPart}`;
}

export async function checkCodeExists(
  tenantId: string,
  code: string
): Promise<boolean> {
  const existing = await db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.referralCode, code)),
    columns: { id: true },
  });
  return !!existing;
}

export async function generateUniqueReferralCode(
  tenantId: string,
  maxAttempts: number = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferralCodeCandidate();
    const exists = await checkCodeExists(tenantId, code);
    if (!exists) {
      return code;
    }
  }
  throw new Error("Failed to generate unique referral code after max attempts");
}

export function buildReferralLink(
  baseUrl: string,
  referralCode: string
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("ref__", referralCode);
  return url.toString();
}

export function getShareBaseUrl(
  tenantSettings: Record<string, unknown> | null | undefined
): string {
  if (
    tenantSettings &&
    typeof tenantSettings.share_base_url === "string" &&
    tenantSettings.share_base_url.trim() !== ""
  ) {
    return tenantSettings.share_base_url;
  }
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}
