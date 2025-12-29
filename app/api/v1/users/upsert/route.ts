import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, tenants } from "@/db/schema";
import { withAuth, successResponse, errorResponse, parseJsonBody } from "@/lib/request";
import { generateUniqueReferralCode, buildReferralLink, getShareBaseUrl } from "@/lib/referral-code";
import { normalizeSubscriptionTier } from "@/lib/rewards/normalize";
import { getUserByExternalId, getTenant } from "@/lib/db-helpers";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { RequestContext } from "@/lib/request";

const upsertUserSchema = z.object({
  externalUserId: z.string().min(1, "externalUserId is required"),
  email: z.string().email("Invalid email format").optional().nullable(),
  name: z.string().optional().nullable(),
  subscriptionTier: z.enum(["free", "pro", "power_pro"]).optional().default("free"),
});

type UpsertUserInput = z.infer<typeof upsertUserSchema>;

interface UpsertUserResponse {
  user: {
    id: string;
    externalUserId: string;
    email: string | null;
    plan: string;
    referralCode: string;
    referralLink: string;
    createdAt: string;
    updatedAt: string;
  };
  created: boolean;
}

async function handleUpsertUser(
  request: NextRequest,
  context: RequestContext
) {
  const { tenantId, requestId } = context;

  const rateLimit = await checkRateLimit({
    tenantId,
    key: `upsert:tenant:${tenantId}`,
    limit: RATE_LIMITS.UPSERT_PER_TENANT,
  });

  if (!rateLimit.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      `Too many requests. Please retry after ${rateLimit.retryAfterSeconds} seconds.`,
      requestId,
      429,
      {
        limit: RATE_LIMITS.UPSERT_PER_TENANT,
        window: "1 minute",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }
    );
  }

  const bodyResult = await parseJsonBody<UpsertUserInput>(request, requestId);
  if (!bodyResult.success) {
    return bodyResult.response;
  }

  const parseResult = upsertUserSchema.safeParse(bodyResult.data);
  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0];
    return errorResponse(
      "INVALID_REQUEST",
      firstError?.message || "Invalid request body",
      requestId,
      400,
      { validation_errors: parseResult.error.errors }
    );
  }

  const input = parseResult.data;
  const normalizedTier = normalizeSubscriptionTier(input.subscriptionTier);

  const existingUser = await getUserByExternalId(tenantId, input.externalUserId);

  if (existingUser) {
    const [updatedUser] = await db
      .update(users)
      .set({
        email: input.email ?? existingUser.email,
        plan: normalizedTier,
        updatedAt: new Date(),
      })
      .where(
        and(eq(users.tenantId, tenantId), eq(users.externalUserId, input.externalUserId))
      )
      .returning();

    const tenant = await getTenant(tenantId);
    const baseUrl = getShareBaseUrl(tenant?.referralSettingsJson);
    const referralLink = buildReferralLink(baseUrl, updatedUser.referralCode);

    return successResponse<UpsertUserResponse>(
      {
        user: {
          id: updatedUser.id,
          externalUserId: updatedUser.externalUserId,
          email: updatedUser.email,
          plan: updatedUser.plan,
          referralCode: updatedUser.referralCode,
          referralLink,
          createdAt: updatedUser.createdAt.toISOString(),
          updatedAt: updatedUser.updatedAt.toISOString(),
        },
        created: false,
      },
      requestId,
      200
    );
  }

  const referralCode = await generateUniqueReferralCode(tenantId);

  const [newUser] = await db
    .insert(users)
    .values({
      tenantId,
      externalUserId: input.externalUserId,
      email: input.email ?? null,
      plan: normalizedTier,
      referralCode,
    })
    .returning();

  const tenant = await getTenant(tenantId);
  const baseUrl = getShareBaseUrl(tenant?.referralSettingsJson);
  const referralLink = buildReferralLink(baseUrl, newUser.referralCode);

  return successResponse<UpsertUserResponse>(
    {
      user: {
        id: newUser.id,
        externalUserId: newUser.externalUserId,
        email: newUser.email,
        plan: newUser.plan,
        referralCode: newUser.referralCode,
        referralLink,
        createdAt: newUser.createdAt.toISOString(),
        updatedAt: newUser.updatedAt.toISOString(),
      },
      created: true,
    },
    requestId,
    201
  );
}

export const POST = withAuth("write", handleUpsertUser);
