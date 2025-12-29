import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const WINDOW_MS = 60_000;

export interface RateLimitConfig {
  key: string;
  tenantId: string;
  limit: number;
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { key, tenantId, limit, windowMs = WINDOW_MS } = config;
  const now = Date.now();
  const windowStart = new Date(now - (now % windowMs));
  const resetAt = Math.ceil((windowStart.getTime() + windowMs) / 1000);

  try {
    const result = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limits (tenant_id, key, window_start, count, updated_at)
      VALUES (${tenantId}, ${key}, ${windowStart}, 1, NOW())
      ON CONFLICT (tenant_id, key, window_start)
      DO UPDATE SET 
        count = rate_limits.count + 1,
        updated_at = NOW()
      RETURNING count
    `);

    const count = result.rows[0]?.count ?? 1;
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    const retryAfterSeconds = allowed ? 0 : Math.ceil((resetAt * 1000 - now) / 1000);

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterSeconds,
    };
  } catch (error) {
    console.error("[rate-limit] Error checking rate limit, failing open:", error);
    return {
      allowed: true,
      remaining: limit,
      resetAt,
      retryAfterSeconds: 0,
    };
  }
}

export async function incrementRateLimitKey(
  tenantId: string,
  key: string,
  amount: number = 1
): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(now - (now % WINDOW_MS));

  try {
    await db.execute(sql`
      INSERT INTO rate_limits (tenant_id, key, window_start, count, updated_at)
      VALUES (${tenantId}, ${key}, ${windowStart}, ${amount}, NOW())
      ON CONFLICT (tenant_id, key, window_start)
      DO UPDATE SET 
        count = rate_limits.count + ${amount},
        updated_at = NOW()
    `);
  } catch (error) {
    console.error("[rate-limit] Error incrementing rate limit key:", error);
  }
}

export async function cleanupOldRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);

  try {
    const result = await db.execute(sql`
      DELETE FROM rate_limits
      WHERE window_start < ${cutoff}
    `);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error("[rate-limit] Error cleaning up old rate limits:", error);
    return 0;
  }
}

export const RATE_LIMITS = {
  CLAIM_PER_IP: 20,
  CLAIM_PER_USER: 10,
  UPSERT_PER_TENANT: 60,
  INVALID_REF_PER_IP: 5,
} as const;

export function getRateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };
}
