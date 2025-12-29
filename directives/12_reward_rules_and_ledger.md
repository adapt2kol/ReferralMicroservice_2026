# 12 — Reward Rules and Ledger

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the reward rules system and immutable ledger for tracking all rewards in ReferralOS.

---

## Goals

1. Maintain an immutable ledger of all rewards
2. Support configurable reward rules per tenant
3. Calculate totals from ledger (derived, not stored)
4. Enable tier-based reward differentiation

---

## Non-Goals

- Reward redemption (handled by host app)
- Currency conversion
- Reward expiration

---

## Reward Rules Configuration

### Default Rules Structure

```json
{
  "onboarding_bonus": 0,
  "referral_reward_free": 100,
  "referral_reward_pro": 200,
  "referral_reward_power_pro": 300,
  "currency": "AUD"
}
```

### Rule Definitions

| Rule | Description | Default |
|------|-------------|---------|
| `onboarding_bonus` | Credits given to new referred users | 0 |
| `referral_reward_free` | Credits given to referrer (free tier) | 100 |
| `referral_reward_pro` | Credits given to referrer (pro tier) | 200 |
| `referral_reward_power_pro` | Credits given to referrer (power_pro tier) | 300 |
| `currency` | Currency code for rewards | AUD |

### Updating Rules

```http
PUT /api/admin/v1/config
```

```json
{
  "rewardRules": {
    "onboarding_bonus": 50,
    "referral_reward_free": 150,
    "referral_reward_pro": 250,
    "referral_reward_power_pro": 400,
    "currency": "AUD"
  }
}
```

Rules changes apply to **future referrals only**. Past rewards are immutable.

---

## Ledger Design

### Immutability Principle

The rewards ledger is **append-only**. Entries are never modified or deleted.

To reverse a reward, create a negative adjustment entry:

```json
{
  "event_type": "manual_adjustment",
  "event_id": "adj_20251229_user123_reversal",
  "amount": -200,
  "description": "Reversal of fraudulent referral"
}
```

### Ledger Entry Structure

```typescript
interface RewardLedgerEntry {
  id: string;
  tenantId: string;
  userId: string;
  eventId: string;           // Unique per tenant+user
  eventType: RewardEventType;
  rewardType: RewardType;
  amount: number;            // Can be negative for adjustments
  currency: string;
  referralId?: string;       // Link to referral if applicable
  metadata: Record<string, unknown>;
  description?: string;
  acknowledgedAt?: Date;     // When host app confirmed receipt
  createdAt: Date;
}

type RewardEventType = 
  | 'onboarding_bonus'
  | 'referral_reward'
  | 'tier_bonus'
  | 'manual_adjustment';

type RewardType = 
  | 'credit'
  | 'discount_percent'
  | 'subscription_days'
  | 'custom';
```

---

## Calculating Totals

Totals are always derived from the ledger, never stored separately.

### User Total Query

```sql
SELECT 
  user_id,
  SUM(amount) as total_rewards,
  currency
FROM rewards_ledger
WHERE tenant_id = $1 AND user_id = $2
GROUP BY user_id, currency;
```

### TypeScript Implementation

```typescript
async function getUserRewardTotal(
  tenantId: string,
  userId: string
): Promise<{ total: number; currency: string }> {
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${rewardsLedger.amount}), 0)`,
      currency: rewardsLedger.currency,
    })
    .from(rewardsLedger)
    .where(and(
      eq(rewardsLedger.tenantId, tenantId),
      eq(rewardsLedger.userId, userId)
    ))
    .groupBy(rewardsLedger.currency);
  
  return result[0] ?? { total: 0, currency: 'AUD' };
}
```

---

## Reward Granting Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Referral Claimed                                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Get Tenant Reward Rules                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Get Referrer Subscription Tier                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Calculate Reward Amount                                      │
│     reward = rules[`referral_reward_${tier}`]                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Generate Deterministic Event ID                              │
│     eventId = `ref_reward_${referralId}_${userId}`               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Insert Ledger Entry (within transaction)                     │
│     ON CONFLICT (tenant_id, event_id, user_id) DO NOTHING        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Queue Webhook: reward.granted                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Reward Acknowledgment

Host apps can acknowledge receipt of rewards:

```http
POST /api/v1/rewards/{rewardId}/acknowledge
```

This sets `acknowledged_at` timestamp, useful for:
- Tracking which rewards have been processed
- Debugging integration issues
- Audit trail

---

## Example Ledger Entries

### Referral Reward (Referrer)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "tenantId": "quoteos",
  "userId": "user_abc123",
  "eventId": "ref_reward_550e8400_user_abc123",
  "eventType": "referral_reward",
  "rewardType": "credit",
  "amount": 200,
  "currency": "AUD",
  "referralId": "550e8400-e29b-41d4-a716-446655440002",
  "metadata": {
    "referredUserId": "user_xyz789",
    "referrerTier": "pro"
  },
  "description": "Referral reward for referring user_xyz789",
  "createdAt": "2025-12-29T10:30:00Z"
}
```

### Onboarding Bonus (Referred)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440011",
  "tenantId": "quoteos",
  "userId": "user_xyz789",
  "eventId": "onboard_550e8400_user_xyz789",
  "eventType": "onboarding_bonus",
  "rewardType": "credit",
  "amount": 50,
  "currency": "AUD",
  "referralId": "550e8400-e29b-41d4-a716-446655440002",
  "metadata": {
    "referrerUserId": "user_abc123"
  },
  "description": "Welcome bonus for signing up via referral",
  "createdAt": "2025-12-29T10:30:00Z"
}
```

### Manual Adjustment

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440012",
  "tenantId": "quoteos",
  "userId": "user_abc123",
  "eventId": "adj_20251229_fraud_reversal",
  "eventType": "manual_adjustment",
  "rewardType": "credit",
  "amount": -200,
  "currency": "AUD",
  "metadata": {
    "reason": "Fraudulent referral reversed",
    "adminId": "admin_001"
  },
  "description": "Reversal: Fraudulent referral detected",
  "createdAt": "2025-12-29T11:00:00Z"
}
```

---

## Inputs

- **Referral Events**: Trigger reward creation
- **Tenant Rules**: Determine reward amounts
- **Admin Actions**: Manual adjustments

---

## Outputs

- **Ledger Entries**: Immutable reward records
- **Derived Totals**: Calculated from ledger
- **Webhook Events**: reward.granted

---

## Invariants

1. Ledger entries are never modified or deleted
2. Totals are always derived, never cached
3. Event IDs are deterministic and unique
4. Rule changes don't affect past rewards
5. Negative amounts require manual_adjustment type

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Zero reward amount | Don't create ledger entry |
| Negative adjustment exceeds total | Allow (total can go negative) |
| Currency mismatch | Reject with error |
| Duplicate event ID | ON CONFLICT DO NOTHING |

---

## Acceptance Criteria

- [ ] Ledger entries are immutable
- [ ] Totals are calculated from ledger
- [ ] Tier-based rewards are applied correctly
- [ ] Rule changes affect only future rewards
- [ ] Manual adjustments are supported
- [ ] Event IDs prevent duplicates
- [ ] Acknowledgment tracking works
