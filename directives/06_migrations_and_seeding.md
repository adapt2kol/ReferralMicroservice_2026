# 06 — Migrations and Seeding

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the migration strategy, seeding procedures, and database versioning approach for ReferralOS.

---

## Goals

1. Establish a reliable, repeatable migration process
2. Define seed data for development and testing
3. Ensure migrations are idempotent and reversible where possible
4. Support multi-environment deployment

---

## Non-Goals

- Specific migration tool implementation details
- Production data migration from external systems
- Database backup and recovery procedures

---

## Migration Strategy

### File Naming Convention

```
execution/migrations/
├── 001_create_extensions.sql
├── 002_create_tenants.sql
├── 003_create_users.sql
├── 004_create_referral_codes.sql
├── 005_create_referrals.sql
├── 006_create_rewards_ledger.sql
├── 007_create_api_keys.sql
├── 008_create_webhook_events.sql
├── 009_create_audit_logs.sql
└── 010_create_indexes.sql
```

### Migration File Format

```sql
-- Migration: 002_create_tenants
-- Description: Create tenants table for multi-tenant configuration
-- Created: 2025-12-29T00:00:00Z

-- Up Migration
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(63) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  -- ... rest of schema
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;

-- Down Migration (commented, for reference)
-- DROP TABLE IF EXISTS tenants;
```

---

## Migration Rules

### Before Creating a Migration

1. Check if the change can be made non-destructively
2. Consider the impact on existing data
3. Plan for rollback if necessary
4. Test on a copy of production data if available

### Migration Best Practices

| Practice | Description |
|----------|-------------|
| **Idempotent** | Use `IF NOT EXISTS` / `IF EXISTS` |
| **Atomic** | Each migration is a single transaction |
| **Ordered** | Migrations run in numerical order |
| **Immutable** | Never modify applied migrations |
| **Documented** | Include description and timestamp |

### Forbidden in Migrations

- Dropping columns with data (use soft deprecation)
- Renaming tables directly (create new, migrate, drop old)
- Adding NOT NULL without default on existing tables
- Long-running operations without timeout

---

## Seed Data

### Seed File Structure

```
execution/seeds/
├── 001_default_tenant.sql
├── 002_test_users.sql
└── 003_sample_referrals.sql
```

### Default Tenant Seed

```sql
-- Seed: 001_default_tenant
-- Description: Create default QuoteOS tenant for development
-- Environment: development, test

INSERT INTO tenants (
  id,
  slug,
  name,
  webhook_url,
  webhook_secret,
  embed_signing_secret,
  allowed_origins,
  reward_rules,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'quoteos',
  'QuoteOS',
  'http://localhost:3001/api/webhooks/referralos',
  'dev_webhook_secret_do_not_use_in_production',
  'dev_embed_secret_do_not_use_in_production_1234',
  ARRAY['http://localhost:3000', 'http://localhost:3001'],
  '{
    "onboarding_bonus": 0,
    "referral_reward_free": 100,
    "referral_reward_pro": 200,
    "referral_reward_power_pro": 300,
    "currency": "AUD"
  }'::jsonb,
  true
) ON CONFLICT (slug) DO NOTHING;
```

### Test Users Seed

```sql
-- Seed: 002_test_users
-- Description: Create test users for development
-- Environment: development, test

-- Test referrer user
INSERT INTO users (
  id,
  tenant_id,
  external_user_id,
  email,
  name,
  subscription_tier
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000001',
  'test_referrer_001',
  'referrer@example.com',
  'Test Referrer',
  'pro'
) ON CONFLICT (tenant_id, external_user_id) DO NOTHING;

-- Create referral code for test referrer
INSERT INTO referral_codes (
  id,
  tenant_id,
  user_id,
  code,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'TESTREF001',
  true
) ON CONFLICT (tenant_id, code) DO NOTHING;

-- Test referred user (no referral yet)
INSERT INTO users (
  id,
  tenant_id,
  external_user_id,
  email,
  name,
  subscription_tier
) VALUES (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000001',
  'test_referred_001',
  'referred@example.com',
  'Test Referred',
  'free'
) ON CONFLICT (tenant_id, external_user_id) DO NOTHING;
```

---

## Running Migrations

### Development

```bash
# Run all pending migrations
pnpm db:migrate

# Run seeds (development only)
pnpm db:seed

# Reset database (drops all, re-runs migrations and seeds)
pnpm db:reset
```

### Production

```bash
# Run migrations only (never run seeds in production)
pnpm db:migrate:prod

# Check migration status
pnpm db:status
```

---

## Migration Tracking

### Schema Version Table

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL
);
```

### Tracking Applied Migrations

```sql
-- After successful migration
INSERT INTO schema_migrations (version, checksum)
VALUES ('002_create_tenants', 'sha256_hash_of_migration_file');
```

---

## Inputs

- **Migration Files**: SQL files in `execution/migrations/`
- **Seed Files**: SQL files in `execution/seeds/`
- **Environment**: Determines which seeds to run

---

## Outputs

- **Database Schema**: Fully migrated database
- **Seed Data**: Development/test data populated
- **Migration Log**: Record of applied migrations

---

## Invariants

1. Migrations are never modified after being applied
2. Migration numbers are never reused
3. Seeds are never run in production
4. All migrations are tested before deployment
5. Rollback procedures are documented for critical migrations

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Migration fails mid-way | Transaction rollback, fix and retry |
| Duplicate migration number | Reject at validation |
| Missing migration in sequence | Error and halt |
| Seed conflicts with existing data | Use ON CONFLICT DO NOTHING |

---

## Acceptance Criteria

- [ ] All migrations run successfully on fresh database
- [ ] Migrations are idempotent (can be run multiple times)
- [ ] Seeds create valid test data
- [ ] Migration tracking table is maintained
- [ ] Rollback procedures are documented
- [ ] Production migration process is defined
