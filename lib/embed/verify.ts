import { constantTimeCompare, generateEmbedSignature } from "@/lib/crypto";

const EMBED_TTL_SECONDS = parseInt(process.env.EMBED_SIGNATURE_TTL || "600", 10);
const CLOCK_SKEW_TOLERANCE_SECONDS = 30;

export type EmbedErrorCode =
  | "MISSING_PARAMS"
  | "INVALID_TIMESTAMP"
  | "EXPIRED_SIGNATURE"
  | "INVALID_SIGNATURE";

export class EmbedVerificationError extends Error {
  code: EmbedErrorCode;

  constructor(code: EmbedErrorCode, message: string) {
    super(message);
    this.name = "EmbedVerificationError";
    this.code = code;
  }
}

export interface EmbedParams {
  tenant: string;
  externalUserId: string;
  ts: string;
  sig: string;
}

export interface VerifiedEmbedContext {
  tenantSlug: string;
  externalUserId: string;
  timestamp: number;
}

export function parseEmbedParams(
  searchParams: URLSearchParams
): EmbedParams {
  const tenant = searchParams.get("tenant");
  const externalUserId = searchParams.get("externalUserId");
  const ts = searchParams.get("ts");
  const sig = searchParams.get("sig");

  if (!tenant || !externalUserId || !ts || !sig) {
    throw new EmbedVerificationError(
      "MISSING_PARAMS",
      "Missing required parameters: tenant, externalUserId, ts, sig"
    );
  }

  return { tenant, externalUserId, ts, sig };
}

export function verifyEmbedSignature(
  params: EmbedParams,
  secret: string
): VerifiedEmbedContext {
  const { tenant, externalUserId, ts, sig } = params;

  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    throw new EmbedVerificationError(
      "INVALID_TIMESTAMP",
      "Timestamp must be a valid positive integer"
    );
  }

  const now = Math.floor(Date.now() / 1000);

  if (timestamp > now + CLOCK_SKEW_TOLERANCE_SECONDS) {
    throw new EmbedVerificationError(
      "INVALID_TIMESTAMP",
      "Timestamp is in the future"
    );
  }

  if (now - timestamp > EMBED_TTL_SECONDS) {
    throw new EmbedVerificationError(
      "EXPIRED_SIGNATURE",
      "Signature has expired. Please refresh the page from your application."
    );
  }

  const expectedSignature = generateEmbedSignature(
    tenant,
    externalUserId,
    timestamp,
    secret
  );

  if (!constantTimeCompare(sig, expectedSignature)) {
    throw new EmbedVerificationError(
      "INVALID_SIGNATURE",
      "Invalid signature"
    );
  }

  return {
    tenantSlug: tenant,
    externalUserId,
    timestamp,
  };
}

export function verifyEmbed(
  searchParams: URLSearchParams
): VerifiedEmbedContext {
  const secret = process.env.REFERRALOS_SIGNING_SECRET;
  if (!secret) {
    throw new Error("REFERRALOS_SIGNING_SECRET environment variable is not set");
  }

  const params = parseEmbedParams(searchParams);
  return verifyEmbedSignature(params, secret);
}
