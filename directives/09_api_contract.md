# 09 — API Contract

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the complete API contract for ReferralOS, including all endpoints, request/response formats, and error handling.

---

## Goals

1. Provide a complete reference for all API endpoints
2. Define consistent request/response formats
3. Document all error codes and handling
4. Enable host app integration

---

## Non-Goals

- Implementation details
- Rate limiting specifics (see `17_rate_limits_and_abuse.md`)
- Authentication details (see `07_auth_api_keys_and_scopes.md`)

---

## Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.referralos.com` |
| Staging | `https://api.staging.referralos.com` |
| Development | `http://localhost:3000` |

---

## Common Headers

### Request Headers

```http
Authorization: Bearer ros_api_quoteos_abc123...
Content-Type: application/json
X-Request-ID: req_abc123 (optional, for tracing)
```

### Response Headers

```http
Content-Type: application/json
X-Request-ID: req_abc123
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1735470660
```

---

## Response Formats

### Success Response

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

### Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z",
    "requestId": "req_abc123"
  }
}
```

---

## Public API v1

### POST /api/v1/users

Upsert a user record.

**Request:**

```json
{
  "externalUserId": "user_abc123",
  "email": "user@example.com",
  "name": "John Doe",
  "subscriptionTier": "pro"
}
```

**Response (201 Created / 200 OK):**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "externalUserId": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionTier": "pro",
    "referralCode": "JOHND123",
    "createdAt": "2025-12-29T10:30:00Z",
    "updatedAt": "2025-12-29T10:30:00Z"
  }
}
```

---

### GET /api/v1/users/:externalUserId

Get user by external ID.

**Response (200 OK):**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "externalUserId": "user_abc123",
    "email": "user@example.com",
    "name": "John Doe",
    "subscriptionTier": "pro",
    "referralCode": "JOHND123",
    "createdAt": "2025-12-29T10:30:00Z",
    "updatedAt": "2025-12-29T10:30:00Z"
  }
}
```

---

### GET /api/v1/users/:externalUserId/referral-code

Get user's referral code.

**Response (200 OK):**

```json
{
  "data": {
    "code": "JOHND123",
    "referralLink": "https://quoteos.com/signup?ref=JOHND123",
    "isActive": true,
    "currentUses": 5,
    "maxUses": null,
    "expiresAt": null
  }
}
```

---

### GET /api/v1/users/:externalUserId/stats

Get user's referral statistics.

**Response (200 OK):**

```json
{
  "data": {
    "totalReferrals": 5,
    "pendingReferrals": 1,
    "completedReferrals": 4,
    "totalRewardsEarned": 800,
    "rewardsCurrency": "AUD",
    "referralsByTier": {
      "free": 2,
      "pro": 2,
      "power_pro": 0
    }
  }
}
```

---

### GET /api/v1/users/:externalUserId/rewards

Get user's reward ledger.

**Query Parameters:**

- `limit` (optional, default: 20, max: 100)
- `offset` (optional, default: 0)
- `eventType` (optional, filter by event type)

**Response (200 OK):**

```json
{
  "data": {
    "rewards": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "eventId": "ref_claim_abc123",
        "eventType": "referral_reward",
        "rewardType": "credit",
        "amount": 200,
        "currency": "AUD",
        "description": "Referral reward for user_xyz789",
        "createdAt": "2025-12-29T10:30:00Z",
        "acknowledgedAt": null
      }
    ],
    "total": 800,
    "currency": "AUD"
  },
  "meta": {
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 5
    }
  }
}
```

---

### POST /api/v1/referrals/claim

Claim a referral code for a new user.

**Request:**

```json
{
  "referralCode": "JOHND123",
  "referredUserId": "user_xyz789"
}
```

**Response (201 Created):**

```json
{
  "data": {
    "referralId": "550e8400-e29b-41d4-a716-446655440002",
    "referrerUserId": "user_abc123",
    "referredUserId": "user_xyz789",
    "referralCode": "JOHND123",
    "status": "completed",
    "rewards": {
      "referrer": {
        "eventId": "ref_reward_abc123",
        "amount": 200,
        "currency": "AUD",
        "type": "credit"
      },
      "referred": {
        "eventId": "onboard_xyz789",
        "amount": 0,
        "currency": "AUD",
        "type": "credit"
      }
    },
    "claimedAt": "2025-12-29T10:30:00Z"
  }
}
```

**Response (200 OK - Already Claimed):**

Returns the existing referral without creating duplicates.

---

### GET /api/v1/referral-codes/:code/validate

Validate a referral code without claiming.

**Response (200 OK):**

```json
{
  "data": {
    "valid": true,
    "code": "JOHND123",
    "referrerName": "John D.",
    "isActive": true,
    "remainingUses": null
  }
}
```

---

## Admin API v1

### GET /api/admin/v1/config

Get tenant configuration.

**Response (200 OK):**

```json
{
  "data": {
    "slug": "quoteos",
    "name": "QuoteOS",
    "logoUrl": "https://quoteos.com/logo.png",
    "primaryColor": "#3B82F6",
    "webhookUrl": "https://quoteos.com/api/webhooks/referralos",
    "webhookEnabled": true,
    "allowedOrigins": ["https://quoteos.com"],
    "rewardRules": {
      "onboardingBonus": 0,
      "referralRewardFree": 100,
      "referralRewardPro": 200,
      "referralRewardPowerPro": 300,
      "currency": "AUD"
    }
  }
}
```

---

### PUT /api/admin/v1/config

Update tenant configuration.

**Request:**

```json
{
  "name": "QuoteOS",
  "logoUrl": "https://quoteos.com/logo.png",
  "primaryColor": "#3B82F6",
  "allowedOrigins": ["https://quoteos.com", "https://app.quoteos.com"]
}
```

---

### GET /api/admin/v1/stats

Get aggregate statistics.

**Query Parameters:**

- `startDate` (optional, ISO date)
- `endDate` (optional, ISO date)

**Response (200 OK):**

```json
{
  "data": {
    "period": {
      "start": "2025-12-01T00:00:00Z",
      "end": "2025-12-29T23:59:59Z"
    },
    "totalUsers": 1250,
    "totalReferrals": 340,
    "totalRewardsGranted": 68000,
    "rewardsCurrency": "AUD",
    "conversionRate": 0.27,
    "topReferrers": [
      {
        "externalUserId": "user_abc123",
        "name": "John Doe",
        "referralCount": 15,
        "rewardsEarned": 3000
      }
    ]
  }
}
```

---

### GET /api/admin/v1/events

Get webhook event log.

**Query Parameters:**

- `limit` (optional, default: 50)
- `offset` (optional, default: 0)
- `status` (optional: pending, delivered, failed, exhausted)

**Response (200 OK):**

```json
{
  "data": {
    "events": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "eventType": "referral.claimed",
        "eventId": "ref_claim_abc123",
        "status": "delivered",
        "attemptCount": 1,
        "createdAt": "2025-12-29T10:30:00Z",
        "deliveredAt": "2025-12-29T10:30:01Z"
      }
    ]
  },
  "meta": {
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 1523
    }
  }
}
```

---

### POST /api/admin/v1/events/:eventId/replay

Replay a webhook event.

**Response (202 Accepted):**

```json
{
  "data": {
    "eventId": "ref_claim_abc123",
    "status": "queued",
    "message": "Event queued for redelivery"
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request body validation failed |
| `MISSING_API_KEY` | 401 | No API key provided |
| `INVALID_API_KEY` | 401 | API key is invalid or revoked |
| `INSUFFICIENT_PERMISSIONS` | 403 | API key lacks required scope |
| `USER_NOT_FOUND` | 404 | User does not exist |
| `REFERRAL_CODE_NOT_FOUND` | 404 | Referral code does not exist |
| `SELF_REFERRAL` | 400 | User cannot refer themselves |
| `ALREADY_REFERRED` | 409 | User has already been referred |
| `REFERRAL_CODE_EXPIRED` | 400 | Referral code has expired |
| `REFERRAL_CODE_EXHAUSTED` | 400 | Referral code max uses reached |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Inputs

- **API Requests**: JSON payloads with validated fields
- **Query Parameters**: Pagination and filtering

---

## Outputs

- **API Responses**: JSON with consistent structure
- **HTTP Status Codes**: Appropriate for each operation

---

## Invariants

1. All responses include `meta.timestamp`
2. All errors include `error.code`
3. Pagination uses `limit`/`offset` pattern
4. Dates are ISO 8601 format in UTC

---

## Acceptance Criteria

- [ ] All endpoints return consistent response format
- [ ] Error codes are documented and consistent
- [ ] Pagination works correctly
- [ ] Request validation returns helpful errors
- [ ] API versioning is implemented
