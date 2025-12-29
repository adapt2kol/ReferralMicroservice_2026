# 05 — Database Schema

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the complete database schema for ReferralOS, including all tables, columns, constraints, indexes, and relationships.

---

## Goals

1. Establish a multi-tenant data model with complete isolation
2. Define all tables required for referral tracking and rewards
3. Ensure idempotency through unique constraints
4. Support audit logging and soft deletes

---

## Non-Goals

- Query optimization strategies (implementation detail)
- Specific ORM configuration (see implementation)
- Data migration from other systems

---

## Schema Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     tenants     │────<│      users      │────<│ referral_codes  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │                       │
         │                      │                       │
         ▼                      ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   api_keys      │     │   referrals     │────>│ rewards_ledger  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                      │
         │                      ▼
         │              ┌─────────────────┐
         │              │ webhook_events  │
         │              └─────────────────┘
         ▼
┌─────────────────┐
│  audit_logs     │
└─────────────────┘
```

---

## Table Definitions

### tenants

Stores tenant configuration and settings.

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(63) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  
  -- Branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#3B82F6',
  
  -- Webhook configuration
  webhook_url TEXT,
  webhook_secret VARCHAR(64),
  webhook_enabled BOOLEAN DEFAULT true,
  
  -- Embed configuration
  embed_signing_secret VARCHAR(64) NOT NULL,
  allowed_origins TEXT[] DEFAULT '{}',
  
  -- Reward rules (JSON)
  reward_rules JSONB NOT NULL DEFAULT '{
    "onboarding_bonus": 0,
    "referral_reward_free": 100,
    "referral_reward_pro": 200,
    "referral_reward_power_pro": 300
  }',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;
```

### users

Stores user records linked to external user IDs from host apps.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  external_user_id VARCHAR(255) NOT NULL,
  
  -- User info (optional, for display)
  email VARCHAR(255),
  name VARCHAR(255),
  
  -- Subscription tier (from host app)
  subscription_tier VARCHAR(50) DEFAULT 'free',
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT uq_users_tenant_external UNIQUE (tenant_id, external_user_id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_external ON users(tenant_id, external_user_id) WHERE deleted_at IS NULL;
```

### referral_codes

Stores unique referral codes for each user.

```sql
CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- The referral code (unique per tenant)
  code VARCHAR(20) NOT NULL,
  
  -- Optional custom slug
  custom_slug VARCHAR(50),
  
  -- Usage limits
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  
  -- Validity
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_referral_codes_tenant_code UNIQUE (tenant_id, code),
  CONSTRAINT uq_referral_codes_tenant_slug UNIQUE (tenant_id, custom_slug)
);

CREATE INDEX idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_lookup ON referral_codes(tenant_id, code) WHERE is_active = true;
```

### referrals

Tracks referral relationships between users.

```sql
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- The user who referred (owns the referral code)
  referrer_user_id UUID NOT NULL REFERENCES users(id),
  
  -- The user who was referred (used the code)
  referred_user_id UUID NOT NULL REFERENCES users(id),
  
  -- The referral code used
  referral_code_id UUID NOT NULL REFERENCES referral_codes(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  -- pending: referral recorded, rewards not yet granted
  -- completed: rewards granted
  -- cancelled: referral was cancelled/reversed
  
  -- Timestamps
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Idempotency: one referral per referred user per tenant
  CONSTRAINT uq_referrals_tenant_referred UNIQUE (tenant_id, referred_user_id),
  
  -- Prevent self-referral
  CONSTRAINT chk_no_self_referral CHECK (referrer_user_id != referred_user_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_user_id);
CREATE INDEX idx_referrals_status ON referrals(tenant_id, status);
```

### rewards_ledger

Immutable ledger of all rewards granted.

```sql
CREATE TABLE rewards_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  -- Event that triggered this reward
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  -- event_types: onboarding_bonus, referral_reward, tier_bonus, manual_adjustment
  
  -- Reward details
  reward_type VARCHAR(50) NOT NULL,
  -- reward_types: credit, discount_percent, subscription_days, custom
  
  amount INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'AUD',
  
  -- Reference to related entities
  referral_id UUID REFERENCES referrals(id),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  description TEXT,
  
  -- Status tracking (for host app acknowledgment)
  acknowledged_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Idempotency: one reward per event per user per tenant
  CONSTRAINT uq_rewards_ledger_event UNIQUE (tenant_id, event_id, user_id)
);

CREATE INDEX idx_rewards_ledger_user ON rewards_ledger(user_id);
CREATE INDEX idx_rewards_ledger_tenant_user ON rewards_ledger(tenant_id, user_id);
CREATE INDEX idx_rewards_ledger_event_type ON rewards_ledger(tenant_id, event_type);
```

### api_keys

Stores API keys for tenant authentication.

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Key details
  key_hash VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(12) NOT NULL,
  name VARCHAR(100) NOT NULL,
  
  -- Permissions
  scopes TEXT[] DEFAULT '{read,write}',
  -- scopes: read, write, admin, webhook
  
  -- Usage tracking
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  
  -- Validity
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id) WHERE is_active = true;
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix) WHERE is_active = true;
```

### webhook_events

Tracks webhook delivery attempts.

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  
  -- Event details
  event_type VARCHAR(50) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  
  -- Delivery status
  status VARCHAR(20) DEFAULT 'pending',
  -- pending, delivered, failed, exhausted
  
  -- Retry tracking
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 6,
  next_retry_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  last_response_code INTEGER,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  
  CONSTRAINT uq_webhook_events_event UNIQUE (tenant_id, event_id)
);

CREATE INDEX idx_webhook_events_pending ON webhook_events(next_retry_at) 
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_webhook_events_tenant ON webhook_events(tenant_id, created_at DESC);
```

### audit_logs

Tracks all significant actions for compliance and debugging.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id),
  
  -- Actor
  actor_type VARCHAR(20) NOT NULL,
  -- system, api_key, admin, webhook
  actor_id VARCHAR(255),
  
  -- Action
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  
  -- Details
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
```

---

## Inputs

- **Migrations**: SQL files defining schema changes
- **Application**: Data through parameterized queries

---

## Outputs

- **Schema**: Complete database structure
- **Constraints**: Data integrity rules
- **Indexes**: Query performance optimization

---

## Invariants

1. All tables include `tenant_id` for multi-tenant isolation
2. All tables include `created_at` timestamp
3. Soft delete uses `deleted_at` timestamp where applicable
4. Unique constraints enforce idempotency
5. Foreign keys maintain referential integrity

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Duplicate referral claim | Rejected by unique constraint |
| Self-referral attempt | Rejected by check constraint |
| Expired referral code | Checked in application logic |
| Deleted tenant | Cascade behavior defined per table |

---

## Acceptance Criteria

- [ ] All tables are created with proper constraints
- [ ] Indexes support expected query patterns
- [ ] Multi-tenant isolation is enforced
- [ ] Idempotency constraints are in place
- [ ] Audit logging captures all significant actions
- [ ] Soft deletes are implemented where appropriate
