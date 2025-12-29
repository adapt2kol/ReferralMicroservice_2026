# 17 — Rate Limits and Abuse Prevention

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define rate limiting strategies and abuse prevention mechanisms for ReferralOS.

---

## Goals

1. Protect API from abuse and overload
2. Ensure fair usage across tenants
3. Prevent referral fraud
4. Maintain service availability

---

## Non-Goals

- DDoS protection (infrastructure level)
- Bot detection (beyond basic measures)
- Legal fraud investigation

---

## Rate Limiting

### Limits by Endpoint Type

| Endpoint Type | Limit | Window | Scope |
|---------------|-------|--------|-------|
| Public API (read) | 1000 | 1 minute | Per API key |
| Public API (write) | 100 | 1 minute | Per API key |
| Admin API | 60 | 1 minute | Per API key |
| Embed API | 300 | 1 minute | Per tenant |
| Webhook replay | 10 | 1 minute | Per tenant |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1735470660
```

### Rate Limit Response (429)

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please retry after 45 seconds.",
    "details": {
      "limit": 100,
      "window": "1 minute",
      "retryAfter": 45
    }
  }
}
```

---

## Implementation

### Sliding Window Algorithm

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Remove old entries
  await redis.zremrangebyscore(key, 0, windowStart);
  
  // Count current entries
  const count = await redis.zcard(key);
  
  if (count >= limit) {
    const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const resetAt = Math.ceil((parseInt(oldestEntry[1]) + windowMs) / 1000);
    
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }
  
  // Add new entry
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, Math.ceil(windowMs / 1000));
  
  return {
    allowed: true,
    remaining: limit - count - 1,
    resetAt: Math.ceil((now + windowMs) / 1000),
  };
}
```

---

## Abuse Prevention

### Referral Fraud Patterns

| Pattern | Detection | Response |
|---------|-----------|----------|
| Self-referral | Check referrer != referred | Block, log |
| Rapid claims | >10 claims/hour from same IP | Rate limit |
| Disposable emails | Email domain blocklist | Flag for review |
| Same device | Device fingerprint matching | Flag for review |
| Bulk creation | >50 users/hour from same tenant | Alert admin |

### Fraud Scoring

```typescript
interface FraudSignals {
  sameIpAsReferrer: boolean;
  disposableEmail: boolean;
  rapidClaim: boolean;
  suspiciousUserAgent: boolean;
  knownVpn: boolean;
}

function calculateFraudScore(signals: FraudSignals): number {
  let score = 0;
  
  if (signals.sameIpAsReferrer) score += 40;
  if (signals.disposableEmail) score += 20;
  if (signals.rapidClaim) score += 15;
  if (signals.suspiciousUserAgent) score += 10;
  if (signals.knownVpn) score += 15;
  
  return score; // 0-100
}

// Score thresholds:
// 0-30: Allow
// 31-60: Allow, flag for review
// 61-100: Block, require manual approval
```

---

## IP-Based Protections

### Per-IP Limits

| Action | Limit | Window |
|--------|-------|--------|
| Referral claims | 10 | 1 hour |
| User registrations | 20 | 1 hour |
| Failed auth attempts | 5 | 15 minutes |

### IP Blocklist

- Maintain blocklist of known bad IPs
- Auto-block after repeated abuse
- Manual unblock via admin

---

## Tenant-Level Protections

### Anomaly Detection

Monitor for unusual patterns:
- Sudden spike in referrals (>10x normal)
- High failure rate on webhooks
- Unusual geographic distribution

### Alerts

```typescript
interface AnomalyAlert {
  tenantId: string;
  type: 'referral_spike' | 'webhook_failures' | 'geo_anomaly';
  severity: 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
  timestamp: string;
}
```

---

## Graceful Degradation

### Under Load

1. Prioritize authenticated requests
2. Cache read endpoints aggressively
3. Queue non-critical writes
4. Return 503 with Retry-After header

### Circuit Breaker

```typescript
interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
  nextRetry: number;
}

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT = 30000; // 30 seconds
```

---

## Logging and Monitoring

### Rate Limit Events

Log all rate limit hits:
- API key / tenant
- Endpoint
- Current count
- Limit
- Timestamp

### Abuse Events

Log all blocked requests:
- Reason
- IP address
- User agent
- Request details
- Fraud score

---

## Inputs

- **API Requests**: Subject to rate limiting
- **Referral Claims**: Subject to fraud detection
- **IP Addresses**: For per-IP limits

---

## Outputs

- **Rate Limit Headers**: On all responses
- **429 Responses**: When limits exceeded
- **Alerts**: For anomaly detection
- **Logs**: For audit and debugging

---

## Invariants

1. Rate limits are always enforced
2. Blocked requests are always logged
3. Fraud scores are calculated consistently
4. Circuit breaker protects downstream services

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Redis unavailable | Fail open with logging |
| Clock skew | Use server time only |
| Shared IP (NAT) | Higher per-IP limits |
| Legitimate spike | Manual limit increase |

---

## Acceptance Criteria

- [ ] Rate limits are enforced per specification
- [ ] Rate limit headers are included
- [ ] 429 responses include retry information
- [ ] Fraud detection flags suspicious activity
- [ ] IP-based limits work correctly
- [ ] Anomaly alerts are generated
- [ ] Circuit breaker prevents cascade failures
