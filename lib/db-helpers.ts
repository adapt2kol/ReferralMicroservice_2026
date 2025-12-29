import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, referrals, rewardsLedger, tenants, events } from "@/db/schema";

export async function getUserByExternalId(tenantId: string, externalUserId: string) {
  return db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.externalUserId, externalUserId)),
  });
}

export async function getUserByReferralCode(tenantId: string, referralCode: string) {
  return db.query.users.findFirst({
    where: and(eq(users.tenantId, tenantId), eq(users.referralCode, referralCode)),
  });
}

export async function getUserById(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function getTenant(tenantId: string) {
  return db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
}

export async function getReferralByReferredExternalUserId(
  tenantId: string,
  referredExternalUserId: string
) {
  return db.query.referrals.findFirst({
    where: and(
      eq(referrals.tenantId, tenantId),
      eq(referrals.referredExternalUserId, referredExternalUserId)
    ),
  });
}

export async function getReferralById(referralId: string) {
  return db.query.referrals.findFirst({
    where: eq(referrals.id, referralId),
  });
}

export async function countReferralsByReferrer(tenantId: string, referrerUserId: string) {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(and(eq(referrals.tenantId, tenantId), eq(referrals.referrerUserId, referrerUserId)));
  return result[0]?.count ?? 0;
}

export async function countCompletedReferralsByReferrer(
  tenantId: string,
  referrerUserId: string
) {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referrals)
    .where(
      and(
        eq(referrals.tenantId, tenantId),
        eq(referrals.referrerUserId, referrerUserId),
        eq(referrals.status, "completed")
      )
    );
  return result[0]?.count ?? 0;
}

export async function sumRewardsByUser(tenantId: string, userId: string) {
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM((reward_json->>'amount')::numeric), 0)::int`,
    })
    .from(rewardsLedger)
    .where(and(eq(rewardsLedger.tenantId, tenantId), eq(rewardsLedger.userId, userId)));
  return result[0]?.total ?? 0;
}

export async function getRewardsByUser(tenantId: string, userId: string) {
  return db.query.rewardsLedger.findMany({
    where: and(eq(rewardsLedger.tenantId, tenantId), eq(rewardsLedger.userId, userId)),
    orderBy: (ledger, { desc }) => [desc(ledger.createdAt)],
  });
}

export async function insertEvent(
  tenantId: string,
  type: string,
  payloadJson: Record<string, unknown>
) {
  const [event] = await db
    .insert(events)
    .values({
      tenantId,
      type,
      payloadJson,
    })
    .returning();
  return event;
}
