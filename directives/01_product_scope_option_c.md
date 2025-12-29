# 01 — Product Scope: Option C

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the product scope, architecture choice, and boundaries for ReferralOS. This directive establishes that ReferralOS operates under **Option C**: a ledger-based referral microservice that emits webhooks, leaving entitlement application to host applications.

---

## Goals

1. Provide a reusable, multi-tenant referral tracking system
2. Maintain a source-of-truth ledger for all referral rewards
3. Emit webhook events for host applications to consume
4. Enable host apps to apply their own entitlements (Stripe changes, credits, etc.)
5. Support embeddable widgets for end-user referral interfaces

---

## Non-Goals

- ReferralOS does **not** directly modify Stripe subscriptions
- ReferralOS does **not** apply credits or extend subscriptions itself
- ReferralOS does **not** manage user authentication (relies on host app)
- ReferralOS does **not** send transactional emails (host app responsibility)

---

## Option C Architecture

### What ReferralOS Does

| Responsibility | Description |
|----------------|-------------|
| **Referral Code Management** | Generate, store, and validate unique referral codes per user |
| **Referral Tracking** | Record when a referred user signs up and links to referrer |
| **Reward Ledger** | Maintain immutable ledger of all rewards earned |
| **Webhook Emission** | Send signed webhook events to host applications |
| **Embed Widget** | Provide embeddable UI for users to share referral links |
| **Admin API** | Allow tenants to configure rules, branding, and view stats |

### What Host Apps Do

| Responsibility | Description |
|----------------|-------------|
| **User Authentication** | Authenticate users and provide external user IDs |
| **Entitlement Application** | Apply rewards (Stripe discounts, credits, subscription extensions) |
| **Webhook Consumption** | Receive and process ReferralOS webhook events |
| **Email Notifications** | Send referral-related emails to users |
| **Subscription Management** | Manage Stripe subscriptions and billing |

---

## Integration Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Host App      │     │   ReferralOS    │     │   Host App      │
│   (QuoteOS)     │     │   Microservice  │     │   Webhook       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. Upsert User       │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │  2. Get Referral Code │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  3. Claim Referral    │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  4. Emit Webhook      │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │                       │  5. Apply Entitlement
         │                       │                       │  (Stripe coupon, etc.)
         │                       │                       │
```

---

## Webhook Events

ReferralOS emits the following webhook events:

| Event Type | Trigger | Payload Includes |
|------------|---------|------------------|
| `referral.claimed` | New user claims a referral code | referrer_id, referred_id, referral_code |
| `reward.granted` | Reward added to ledger | user_id, reward_type, amount, event_id |
| `reward.milestone` | User reaches reward milestone | user_id, milestone_type, total_referrals |

---

## Reward Types

| Reward Type | Description | Typical Application |
|-------------|-------------|---------------------|
| `onboarding_bonus` | New user signs up | Credit to new user |
| `referral_reward` | Successful referral | Credit/discount to referrer |
| `tier_bonus` | Referrer tier upgrade | Enhanced rewards |

---

## Multi-Tenant Design

- Each tenant (e.g., QuoteOS) has isolated data
- Tenant configuration includes:
  - Branding (colors, logo, copy)
  - Reward rules (amounts, tiers)
  - Webhook endpoint
  - API keys
  - Embed widget settings

---

## Inputs

- **From Host App**: External user IDs, subscription tier, referral claims
- **From Admin**: Tenant configuration, reward rules, branding

---

## Outputs

- **To Host App**: Webhook events, API responses, embed widget
- **To Admin**: Statistics, audit logs, configuration UI

---

## Invariants

1. ReferralOS never calls Stripe APIs directly
2. All rewards are recorded in the ledger before webhooks are sent
3. Webhook delivery failures do not rollback ledger entries
4. Each referral can only be claimed once per tenant
5. Referral codes are unique per tenant

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User claims own referral code | Reject with error |
| Referral code doesn't exist | Return 404 |
| User already claimed a referral | Return existing claim (idempotent) |
| Webhook endpoint unreachable | Queue for retry |
| Tenant not configured | Reject API calls with 403 |

---

## Acceptance Criteria

- [ ] ReferralOS stores all referral data in its own database
- [ ] ReferralOS emits signed webhooks for all reward events
- [ ] ReferralOS never makes Stripe API calls
- [ ] Host apps can fully apply entitlements from webhook data
- [ ] Multi-tenant isolation is enforced at all layers
- [ ] Embed widget works across different host app domains
