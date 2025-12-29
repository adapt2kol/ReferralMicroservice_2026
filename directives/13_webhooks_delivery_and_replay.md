# 13 — Webhooks: Delivery and Replay

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the webhook delivery system, retry logic, and replay capabilities for ReferralOS.

---

## Goals

1. Deliver webhook events reliably to host applications
2. Implement exponential backoff retry strategy
3. Provide webhook replay functionality
4. Ensure webhook failures don't affect core operations

---

## Non-Goals

- Webhook endpoint configuration (see Admin UI directive)
- Signature verification on receiving end (documented for host apps)
- Real-time streaming (webhooks are async)

---

## Webhook Events

### Event Types

| Event | Trigger | Description |
|-------|---------|-------------|
| `referral.claimed` | Referral created | New user claimed a referral code |
| `reward.granted` | Reward added to ledger | Reward entry created |
| `reward.milestone` | Milestone reached | User reached referral milestone |
| `user.created` | New user upserted | New user registered in ReferralOS |
| `user.updated` | User data changed | User subscription tier changed |

### Event Payload Structure

```typescript
interface WebhookEvent {
  id: string;              // Unique event ID
  type: string;            // Event type
  tenantId: string;        // Tenant identifier
  timestamp: string;       // ISO 8601 timestamp
  data: Record<string, unknown>;
}
```

---

## Delivery Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Event Occurs (e.g., referral.claimed)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Create webhook_events record                                 │
│     status: 'pending'                                            │
│     attempt_count: 0                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Queue for immediate delivery                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Webhook Dispatcher picks up event                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Sign payload with tenant's webhook secret                    │
│     Header: X-ReferralOS-Signature: t=...,v1=...                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. POST to tenant's webhook URL                                 │
│     Timeout: 30 seconds                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Success (2xx)      │         │  Failure            │
│  status: delivered  │         │  (timeout, 4xx, 5xx)│
│  delivered_at: now  │         │                     │
└─────────────────────┘         └──────────┬──────────┘
                                           │
                                           ▼
                                ┌─────────────────────┐
                                │  Schedule Retry     │
                                │  (if attempts < max)│
                                └─────────────────────┘
```

---

## Retry Strategy

### Retry Schedule

| Attempt | Delay | Cumulative Time |
|---------|-------|-----------------|
| 1 | Immediate | 0 |
| 2 | 10 seconds | 10s |
| 3 | 1 minute | 1m 10s |
| 4 | 5 minutes | 6m 10s |
| 5 | 30 minutes | 36m 10s |
| 6 | 2 hours | 2h 36m 10s |

### Configuration

```typescript
const RETRY_DELAYS = [
  0,        // Attempt 1: immediate
  10_000,   // Attempt 2: 10 seconds
  60_000,   // Attempt 3: 1 minute
  300_000,  // Attempt 4: 5 minutes
  1800_000, // Attempt 5: 30 minutes
  7200_000, // Attempt 6: 2 hours
];

const MAX_ATTEMPTS = 6; // Configurable via WEBHOOK_RETRY_LIMIT
```

### Retry Logic

```typescript
async function scheduleRetry(event: WebhookEvent): Promise<void> {
  const nextAttempt = event.attemptCount + 1;
  
  if (nextAttempt >= MAX_ATTEMPTS) {
    await updateEventStatus(event.id, 'exhausted');
    return;
  }
  
  const delay = RETRY_DELAYS[nextAttempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
  const nextRetryAt = new Date(Date.now() + delay);
  
  await db.update(webhookEvents)
    .set({
      status: 'failed',
      attemptCount: nextAttempt,
      nextRetryAt,
      lastError: event.lastError,
      lastResponseCode: event.lastResponseCode,
    })
    .where(eq(webhookEvents.id, event.id));
}
```

---

## Webhook Payload Examples

### referral.claimed

```json
{
  "id": "evt_ref_claim_550e8400",
  "type": "referral.claimed",
  "tenantId": "quoteos",
  "timestamp": "2025-12-29T10:30:00Z",
  "data": {
    "referralId": "550e8400-e29b-41d4-a716-446655440002",
    "referrerExternalUserId": "user_abc123",
    "referredExternalUserId": "user_xyz789",
    "referralCode": "JOHNDX7K2",
    "referrerTier": "pro"
  }
}
```

### reward.granted

```json
{
  "id": "evt_reward_550e8400",
  "type": "reward.granted",
  "tenantId": "quoteos",
  "timestamp": "2025-12-29T10:30:00Z",
  "data": {
    "rewardId": "550e8400-e29b-41d4-a716-446655440010",
    "externalUserId": "user_abc123",
    "eventType": "referral_reward",
    "rewardType": "credit",
    "amount": 200,
    "currency": "AUD",
    "referralId": "550e8400-e29b-41d4-a716-446655440002"
  }
}
```

---

## Signature Format

### Header

```
X-ReferralOS-Signature: t=1735470600,v1=a1b2c3d4e5f6...
```

### Signature Generation

```typescript
function signWebhook(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}
```

---

## Replay Functionality

### Admin API Endpoint

```http
POST /api/admin/v1/events/{eventId}/replay
```

### Replay Behavior

1. Fetch original event from database
2. Reset attempt count to 0
3. Set status to 'pending'
4. Queue for immediate delivery
5. Return 202 Accepted

### Replay Response

```json
{
  "data": {
    "eventId": "evt_ref_claim_550e8400",
    "status": "queued",
    "message": "Event queued for redelivery",
    "originalDeliveredAt": "2025-12-29T10:30:01Z"
  }
}
```

---

## Event Status Lifecycle

```
pending ──> delivered
    │
    └──> failed ──> failed ──> ... ──> exhausted
              │
              └──> delivered (on successful retry)
```

### Status Definitions

| Status | Description |
|--------|-------------|
| `pending` | Queued for delivery |
| `delivered` | Successfully delivered (2xx response) |
| `failed` | Delivery failed, retry scheduled |
| `exhausted` | Max retries exceeded |

---

## Failure Handling

### Non-Blocking Principle

Webhook delivery failures **never** rollback the triggering operation.

```typescript
try {
  // Core operation (e.g., claim referral)
  await claimReferral(input);
  
  // Queue webhook (async, non-blocking)
  await queueWebhook('referral.claimed', data);
} catch (error) {
  // Only core operation errors bubble up
  // Webhook queue errors are logged but don't fail the request
}
```

### Error Logging

All webhook failures are logged with:
- Event ID
- Attempt number
- Response code (if any)
- Error message
- Timestamp

---

## Inputs

- **Events**: From core operations
- **Tenant Config**: Webhook URL and secret
- **Replay Requests**: From admin API

---

## Outputs

- **HTTP Requests**: To tenant webhook URLs
- **Event Records**: In webhook_events table
- **Logs**: Delivery attempts and failures

---

## Invariants

1. Webhooks are always signed
2. Delivery failures don't affect core operations
3. Events are delivered in order per tenant
4. Exhausted events can be manually replayed
5. Replay resets attempt count

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Webhook URL not configured | Skip delivery, log warning |
| Tenant webhook disabled | Skip delivery |
| Timeout (30s) | Treat as failure, retry |
| 4xx response | Treat as failure, retry |
| 5xx response | Treat as failure, retry |
| Invalid URL | Mark as exhausted immediately |

---

## Acceptance Criteria

- [ ] Webhooks are signed with HMAC-SHA256
- [ ] Retry schedule follows specification
- [ ] Exhausted events are marked correctly
- [ ] Replay functionality works
- [ ] Failures don't block core operations
- [ ] Event log is queryable
- [ ] Timeout is enforced (30s)
