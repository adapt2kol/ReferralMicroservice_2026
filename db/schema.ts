import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  brandingJson: jsonb("branding_json").$type<Record<string, unknown>>(),
  referralSettingsJson: jsonb("referral_settings_json").$type<Record<string, unknown>>(),
  webhookUrl: text("webhook_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    keyHash: text("key_hash").notNull(),
    label: text("label").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("api_keys_tenant_id_idx").on(table.tenantId)]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalUserId: text("external_user_id").notNull(),
    email: text("email"),
    plan: text("plan").notNull().default("free"),
    referralCode: text("referral_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_tenant_external_user_idx").on(table.tenantId, table.externalUserId),
    uniqueIndex("users_tenant_referral_code_idx").on(table.tenantId, table.referralCode),
    index("users_tenant_id_idx").on(table.tenantId),
  ]
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredExternalUserId: text("referred_external_user_id").notNull(),
    referredUserId: uuid("referred_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    refCodeUsed: text("ref_code_used").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("referrals_tenant_referred_external_idx").on(
      table.tenantId,
      table.referredExternalUserId
    ),
    index("referrals_tenant_id_idx").on(table.tenantId),
    index("referrals_referrer_user_id_idx").on(table.referrerUserId),
    index("referrals_status_idx").on(table.status),
  ]
);

export const rewardRules = pgTable(
  "reward_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ruleKey: text("rule_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    conditionJson: jsonb("condition_json").$type<Record<string, unknown>>(),
    rewardReferrerJson: jsonb("reward_referrer_json").$type<Record<string, unknown>>(),
    rewardReferredJson: jsonb("reward_referred_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reward_rules_tenant_rule_key_idx").on(table.tenantId, table.ruleKey),
    index("reward_rules_tenant_id_idx").on(table.tenantId),
  ]
);

export const rewardsLedger = pgTable(
  "rewards_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    rewardJson: jsonb("reward_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rewards_ledger_tenant_event_user_idx").on(
      table.tenantId,
      table.eventId,
      table.userId
    ),
    index("rewards_ledger_tenant_id_idx").on(table.tenantId),
    index("rewards_ledger_user_id_idx").on(table.userId),
  ]
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_tenant_id_idx").on(table.tenantId),
    index("events_type_idx").on(table.type),
    index("events_created_at_idx").on(table.createdAt),
  ]
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rate_limits_tenant_key_window_idx").on(
      table.tenantId,
      table.key,
      table.windowStart
    ),
    index("rate_limits_tenant_id_idx").on(table.tenantId),
    index("rate_limits_window_start_idx").on(table.windowStart),
  ]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull(),
    url: text("url").notNull(),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("webhook_deliveries_tenant_id_idx").on(table.tenantId),
    index("webhook_deliveries_status_idx").on(table.status),
    index("webhook_deliveries_next_attempt_at_idx").on(table.nextAttemptAt),
    index("webhook_deliveries_event_id_idx").on(table.eventId),
  ]
);
