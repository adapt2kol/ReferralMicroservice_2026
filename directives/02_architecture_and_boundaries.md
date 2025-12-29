# 02 — Architecture and Boundaries

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the technical architecture, system boundaries, and integration points for ReferralOS. This directive establishes how components interact and where responsibilities begin and end.

---

## Goals

1. Establish clear system boundaries between ReferralOS and host applications
2. Define the internal component architecture
3. Specify integration protocols and data flow
4. Ensure scalability and maintainability patterns

---

## Non-Goals

- Detailed implementation of individual components (see specific directives)
- Infrastructure provisioning details (see `20_railway_deploy.md`)
- Database schema specifics (see `05_database_schema.md`)

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Host Application                            │
│                         (e.g., QuoteOS on Netlify)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │   Frontend   │  │   Backend    │  │   Webhook    │                   │
│  │   (Next.js)  │  │   (API)      │  │   Handler    │                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
└─────────┼─────────────────┼─────────────────┼───────────────────────────┘
          │                 │                 ▲
          │ iframe          │ API calls       │ Webhooks
          ▼                 ▼                 │
┌─────────────────────────────────────────────┴───────────────────────────┐
│                           ReferralOS Service                             │
│                            (Railway Deploy)                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Embed      │  │   Public     │  │   Webhook    │  │   Admin      │ │
│  │   Widget     │  │   API        │  │   Dispatcher │  │   API        │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │                 │         │
│         └─────────────────┴────────┬────────┴─────────────────┘         │
│                                    │                                     │
│                          ┌─────────▼─────────┐                          │
│                          │   Core Services   │                          │
│                          │  ┌─────────────┐  │                          │
│                          │  │  Referral   │  │                          │
│                          │  │  Service    │  │                          │
│                          │  ├─────────────┤  │                          │
│                          │  │  Reward     │  │                          │
│                          │  │  Service    │  │                          │
│                          │  ├─────────────┤  │                          │
│                          │  │  Tenant     │  │                          │
│                          │  │  Service    │  │                          │
│                          │  └─────────────┘  │                          │
│                          └─────────┬─────────┘                          │
│                                    │                                     │
│                          ┌─────────▼─────────┐                          │
│                          │   Supabase DB     │                          │
│                          │   (PostgreSQL)    │                          │
│                          └───────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### ReferralOS Components

| Component | Responsibility | Boundary |
|-----------|----------------|----------|
| **Public API** | Handle referral operations from host apps | Accepts signed requests, returns JSON |
| **Admin API** | Tenant configuration and management | Requires admin API key |
| **Embed Widget** | User-facing referral UI | Served via iframe, signed access |
| **Webhook Dispatcher** | Send events to host apps | Outbound HTTP, retry logic |
| **Core Services** | Business logic layer | Internal only, no direct exposure |
| **Database** | Persistent storage | Supabase PostgreSQL |

### Host Application Components

| Component | Responsibility | Boundary |
|-----------|----------------|----------|
| **User Auth** | Authenticate users, provide external IDs | Host app internal |
| **Webhook Handler** | Receive and process ReferralOS events | HTTP endpoint |
| **Entitlement Logic** | Apply rewards (Stripe, credits) | Host app internal |
| **Embed Container** | Host the ReferralOS widget iframe | Frontend |

---

## API Layers

### Layer 1: Public API (Host App → ReferralOS)

**Base Path**: `/api/v1`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users` | POST | Upsert user with external ID |
| `/users/:id/referral-code` | GET | Get user's referral code |
| `/referrals/claim` | POST | Claim a referral code |
| `/users/:id/stats` | GET | Get user's referral stats |
| `/users/:id/rewards` | GET | Get user's reward ledger |

### Layer 2: Admin API (Tenant Admin → ReferralOS)

**Base Path**: `/api/admin/v1`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/config` | GET/PUT | Tenant configuration |
| `/rules` | GET/PUT | Reward rules |
| `/webhooks` | GET/PUT | Webhook settings |
| `/api-keys` | GET/POST/DELETE | API key management |
| `/stats` | GET | Aggregate statistics |
| `/events` | GET | Event log |

### Layer 3: Embed API (Widget → ReferralOS)

**Base Path**: `/api/embed/v1`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/init` | POST | Initialize widget session |
| `/referral-link` | GET | Get shareable referral link |
| `/stats` | GET | Get user's referral summary |

---

## Data Flow Patterns

### Pattern 1: User Registration with Referral

```
1. User signs up on Host App
2. Host App calls ReferralOS: POST /api/v1/users
3. ReferralOS creates user record, generates referral code
4. If user has referral code cookie:
   a. Host App calls: POST /api/v1/referrals/claim
   b. ReferralOS records referral, grants rewards
   c. ReferralOS emits webhook: referral.claimed
   d. ReferralOS emits webhook: reward.granted (for each reward)
5. Host App webhook handler applies entitlements
```

### Pattern 2: Embed Widget Interaction

```
1. Host App renders iframe with signed URL
2. Widget calls: POST /api/embed/v1/init (validates signature)
3. Widget displays referral link and stats
4. User copies link, shares externally
5. New user clicks link, lands on Host App with referral code
6. Flow continues as Pattern 1
```

### Pattern 3: Webhook Delivery

```
1. Event occurs in ReferralOS (referral claimed, reward granted)
2. Webhook Dispatcher queues event
3. Dispatcher signs payload with tenant's webhook secret
4. Dispatcher sends POST to tenant's webhook URL
5. If failure: retry with exponential backoff
6. After max retries: mark as failed, log for manual review
```

---

## Security Boundaries

### Authentication Layers

| Layer | Method | Scope |
|-------|--------|-------|
| **Public API** | API Key (header) | Per-tenant, scoped permissions |
| **Admin API** | Admin API Key | Full tenant access |
| **Embed Widget** | Signed URL (HMAC) | Per-user, time-limited |
| **Webhooks** | Signature verification | Per-tenant secret |

### Data Isolation

- All database queries include `tenant_id` filter
- API keys are scoped to single tenant
- Cross-tenant data access is impossible by design
- Audit logs track all data access

---

## Inputs

- **API Requests**: JSON payloads with required fields
- **Embed Signatures**: HMAC-SHA256 signed parameters
- **Configuration**: Tenant settings via Admin API

---

## Outputs

- **API Responses**: JSON with data/error structure
- **Webhooks**: Signed JSON payloads
- **Embed Widget**: HTML/JS served via iframe

---

## Invariants

1. All API requests must include valid authentication
2. All database queries must be tenant-scoped
3. All webhooks must be signed
4. All embed access must be signature-verified
5. No direct database access from outside ReferralOS

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid API key | 401 Unauthorized |
| Expired embed signature | 403 Forbidden |
| Tenant not found | 404 Not Found |
| Rate limit exceeded | 429 Too Many Requests |
| Database unavailable | 503 Service Unavailable |

---

## Acceptance Criteria

- [ ] All components have clearly defined boundaries
- [ ] API layers are properly separated
- [ ] Authentication is enforced at all entry points
- [ ] Data isolation is guaranteed by design
- [ ] Webhook delivery is reliable with retry logic
- [ ] Embed widget is secure against unauthorized access
