# 11 — Referral Claim and Idempotency

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the referral claim process with strict idempotency guarantees, ensuring that replaying a claim request produces identical results without double-granting rewards.

---

## Goals

1. Process referral claims atomically
2. Prevent duplicate referrals for the same user
3. Ensure idempotent responses for replay scenarios
4. Grant rewards correctly based on referrer tier

---

## Non-Goals

- Reward application (handled by host app via webhooks)
- Referral code generation (see directive 10)
- Multi-level referral chains

---

## Claim Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    POST /referrals/claim                         │
│                    {referralCode, referredUserId}                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Validate Input                                               │
│     - referralCode exists and is active                          │
│     - referredUserId exists in users table                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Check Idempotency                                            │
│     - Query: SELECT * FROM referrals                             │
│       WHERE tenant_id = ? AND referred_user_id = ?               │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Referral Exists    │         │  No Existing        │
│  Return existing    │         │  Referral           │
│  (200 OK)           │         │                     │
└─────────────────────┘         └──────────┬──────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Validate Business Rules                                      │
│     - Referrer != Referred (no self-referral)                    │
│     - Code not expired                                           │
│     - Code not exhausted (if max_uses set)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. BEGIN TRANSACTION (SERIALIZABLE)                             │
├─────────────────────────────────────────────────────────────────┤
│  4a. Double-check no existing referral (race condition guard)    │
│  4b. Insert referral record                                      │
│  4c. Increment referral_code.current_uses                        │
│  4d. Calculate rewards based on referrer tier                    │
│  4e. Insert reward ledger entries                                │
│  4f. Queue webhook events                                        │
├─────────────────────────────────────────────────────────────────┤
│  COMMIT TRANSACTION                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Dispatch Webhooks (async, outside transaction)               │
│     - referral.claimed                                           │
│     - reward.granted (for each reward)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Return Response (201 Created)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Idempotency Guarantees

### Database Constraints

```sql
-- Ensures one referral per referred user per tenant
CONSTRAINT uq_referrals_tenant_referred 
  UNIQUE (tenant_id, referred_user_id)

-- Ensures one reward per event per user per tenant
CONSTRAINT uq_rewards_ledger_event 
  UNIQUE (tenant_id, event_id, user_id)
```

### Idempotent Response Behavior

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| First claim | 201 Created | New referral + rewards |
| Replay (same code, same user) | 200 OK | Existing referral (no new rewards) |
| Different code, same user | 409 Conflict | Error: already referred |

### Event ID Generation

Event IDs are deterministic to ensure reward idempotency:

```typescript
function generateEventId(type: string, referralId: string, userId: string): string {
  return `${type}_${referralId}_${userId}`;
}

// Examples:
// ref_reward_550e8400-e29b-41d4-a716-446655440000_user123
// onboard_bonus_550e8400-e29b-41d4-a716-446655440000_user456
```

---

## Transaction Isolation

### Why SERIALIZABLE?

The claim process involves:
1. Reading to check for existing referral
2. Writing the new referral
3. Writing reward entries

Without SERIALIZABLE isolation, concurrent claims could both pass the existence check and create duplicates.

### Implementation

```typescript
await db.transaction(async (tx) => {
  // Set isolation level
  await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
  
  // Double-check no existing referral
  const existing = await tx.query.referrals.findFirst({
    where: and(
      eq(referrals.tenantId, tenantId),
      eq(referrals.referredUserId, referredUserId)
    )
  });
  
  if (existing) {
    // Return existing without creating new
    return { existing: true, referral: existing };
  }
  
  // Create new referral and rewards
  // ...
}, { isolationLevel: 'serializable' });
```

---

## Reward Calculation

### Tier-Based Rewards

| Referrer Tier | Referrer Reward | Referred Reward |
|---------------|-----------------|-----------------|
| free | 100 credits | 0 credits |
| pro | 200 credits | 0 credits |
| power_pro | 300 credits | 0 credits |

### Reward Ledger Entries

For each successful claim, create:

1. **Referrer Reward** (if > 0)
   - event_type: `referral_reward`
   - event_id: `ref_reward_{referralId}_{referrerUserId}`

2. **Referred Reward** (if onboarding bonus > 0)
   - event_type: `onboarding_bonus`
   - event_id: `onboard_{referralId}_{referredUserId}`

---

## Example Payloads

### Request: Claim Referral

```json
{
  "referralCode": "JOHNDX7K2",
  "referredUserId": "user_xyz789"
}
```

### Response: First Claim (201 Created)

```json
{
  "data": {
    "referralId": "550e8400-e29b-41d4-a716-446655440002",
    "referrerUserId": "user_abc123",
    "referredUserId": "user_xyz789",
    "referralCode": "JOHNDX7K2",
    "status": "completed",
    "rewards": {
      "referrer": {
        "eventId": "ref_reward_550e8400_user_abc123",
        "amount": 200,
        "currency": "AUD",
        "type": "credit"
      },
      "referred": {
        "eventId": "onboard_550e8400_user_xyz789",
        "amount": 0,
        "currency": "AUD",
        "type": "credit"
      }
    },
    "claimedAt": "2025-12-29T10:30:00Z"
  },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z",
    "created": true
  }
}
```

### Response: Replay Claim (200 OK)

```json
{
  "data": {
    "referralId": "550e8400-e29b-41d4-a716-446655440002",
    "referrerUserId": "user_abc123",
    "referredUserId": "user_xyz789",
    "referralCode": "JOHNDX7K2",
    "status": "completed",
    "rewards": {
      "referrer": {
        "eventId": "ref_reward_550e8400_user_abc123",
        "amount": 200,
        "currency": "AUD",
        "type": "credit"
      },
      "referred": null
    },
    "claimedAt": "2025-12-29T10:30:00Z"
  },
  "meta": {
    "timestamp": "2025-12-29T10:35:00Z",
    "created": false,
    "note": "Referral already exists"
  }
}
```

---

## Error Responses

### Self-Referral (400)

```json
{
  "error": {
    "code": "SELF_REFERRAL",
    "message": "Users cannot refer themselves",
    "details": {}
  }
}
```

### Already Referred (409)

```json
{
  "error": {
    "code": "ALREADY_REFERRED",
    "message": "This user has already been referred",
    "details": {
      "existingReferralId": "550e8400-e29b-41d4-a716-446655440002"
    }
  }
}
```

### Code Expired (400)

```json
{
  "error": {
    "code": "REFERRAL_CODE_EXPIRED",
    "message": "This referral code has expired",
    "details": {
      "expiredAt": "2025-12-28T00:00:00Z"
    }
  }
}
```

---

## Inputs

- **referralCode**: The code being claimed
- **referredUserId**: External ID of the user claiming

---

## Outputs

- **Referral Record**: Created or existing
- **Reward Entries**: In ledger (if new)
- **Webhook Events**: Queued for delivery

---

## Invariants

1. A user can only be referred once per tenant
2. Replaying a claim returns the same response
3. Rewards are never double-granted
4. Transaction ensures atomicity
5. Webhook failures don't rollback the claim

---

## Acceptance Criteria

- [ ] First claim creates referral and rewards
- [ ] Replay returns existing referral (200 OK)
- [ ] Self-referral is rejected
- [ ] Already-referred users get 409 error
- [ ] Expired codes are rejected
- [ ] Exhausted codes are rejected
- [ ] Transaction is SERIALIZABLE
- [ ] Webhooks are dispatched after commit
