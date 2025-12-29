import crypto from "crypto";

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";

import * as schema from "../db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateBase62(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % 62];
  }
  return result;
}

function generateApiKey(): string {
  return `rk_live_${generateBase62(32)}`;
}

function hashApiKey(rawKey: string, signingSecret: string): string {
  return crypto.createHmac("sha256", signingSecret).update(rawKey).digest("hex");
}

interface SeedConfig {
  tenantSlug: string;
  tenantName: string;
  signingSecret: string;
}

async function seed(config: SeedConfig): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  if (!config.signingSecret || config.signingSecret.length < 32) {
    console.error("ERROR: REFERRALOS_SIGNING_SECRET must be set and at least 32 characters");
    process.exit(1);
  }

  console.log("Starting database seed...");

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const db = drizzle(pool, { schema });

  try {
    const existingTenant = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, config.tenantSlug))
      .limit(1);

    let tenantId: string;

    if (existingTenant.length > 0) {
      tenantId = existingTenant[0].id;
      console.log(`Tenant "${config.tenantSlug}" already exists (id: ${tenantId})`);
    } else {
      const [newTenant] = await db
        .insert(schema.tenants)
        .values({
          slug: config.tenantSlug,
          name: config.tenantName,
          status: "active",
          brandingJson: {
            primaryColor: "#3B82F6",
            logoUrl: null,
          },
          referralSettingsJson: {
            codePrefix: "QOS",
            maxReferralsPerUser: 100,
          },
          webhookUrl: null,
        })
        .returning();
      tenantId = newTenant.id;
      console.log(`Created tenant "${config.tenantSlug}" (id: ${tenantId})`);
    }

    const rewardRulesData = [
      {
        tenantId,
        ruleKey: "onboarding_bonus",
        enabled: true,
        conditionJson: { trigger: "user_signup" },
        rewardReferrerJson: null,
        rewardReferredJson: { type: "bonus_scans", amount: 1 },
      },
      {
        tenantId,
        ruleKey: "referral_free_referrer",
        enabled: true,
        conditionJson: { referrerPlan: ["free"] },
        rewardReferrerJson: { type: "bonus_scans", amount: 5 },
        rewardReferredJson: { type: "bonus_scans", amount: 5 },
      },
      {
        tenantId,
        ruleKey: "referral_pro_referrer",
        enabled: true,
        conditionJson: { referrerPlan: ["pro", "power_pro"] },
        rewardReferrerJson: { type: "free_months", amount: 1 },
        rewardReferredJson: { type: "free_months", amount: 1 },
      },
    ];

    for (const rule of rewardRulesData) {
      const existingRule = await db
        .select()
        .from(schema.rewardRules)
        .where(eq(schema.rewardRules.tenantId, tenantId))
        .limit(1);

      if (existingRule.length === 0) {
        await db.insert(schema.rewardRules).values(rule);
        console.log(`Created reward rule: ${rule.ruleKey}`);
      } else {
        console.log(`Reward rule "${rule.ruleKey}" already exists`);
      }
    }

    const existingApiKey = await db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.tenantId, tenantId))
      .limit(1);

    if (existingApiKey.length === 0) {
      const rawKey = generateApiKey();
      const keyHash = hashApiKey(rawKey, config.signingSecret);

      await db.insert(schema.apiKeys).values({
        tenantId,
        keyHash,
        label: "dev-seed",
        scopes: ["users:write", "referrals:claim", "stats:read", "admin:write", "webhooks:replay"],
      });

      console.log("");
      console.log("=".repeat(70));
      console.log("API KEY GENERATED - SAVE THIS NOW, IT WILL NOT BE SHOWN AGAIN");
      console.log("=".repeat(70));
      console.log(`Raw API Key: ${rawKey}`);
      console.log("=".repeat(70));
      console.log("");
    } else {
      console.log('API key "dev-seed" already exists (not regenerating)');
    }

    console.log("Seed completed successfully");
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const signingSecret = process.env.REFERRALOS_SIGNING_SECRET;
if (!signingSecret) {
  console.error("ERROR: REFERRALOS_SIGNING_SECRET environment variable is not set");
  console.error("Generate one with: openssl rand -hex 32");
  process.exit(1);
}

seed({
  tenantSlug: "quoteos",
  tenantName: "QuoteOS",
  signingSecret,
});
