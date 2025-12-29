# 15 — Admin UI and Tenant Configuration

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the Admin UI requirements and tenant configuration capabilities for ReferralOS.

---

## Goals

1. Enable tenant self-service configuration
2. Provide branding customization
3. Manage reward rules and webhook settings
4. View event logs and statistics

---

## Non-Goals

- End-user facing UI (see Embed Widget directive)
- Super-admin multi-tenant management
- White-label domain configuration

---

## Admin UI Sections

### 1. Dashboard

Overview of key metrics:
- Total users
- Total referrals (this month)
- Total rewards granted
- Conversion rate
- Top 5 referrers

### 2. Configuration

#### Branding Settings

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Tenant display name |
| `logoUrl` | URL | Logo image URL |
| `primaryColor` | hex | Primary brand color |
| `widgetTitle` | string | Embed widget title |
| `widgetDescription` | string | Embed widget description |

#### Reward Rules

| Field | Type | Description |
|-------|------|-------------|
| `onboardingBonus` | number | Credits for new referred users |
| `referralRewardFree` | number | Referrer reward (free tier) |
| `referralRewardPro` | number | Referrer reward (pro tier) |
| `referralRewardPowerPro` | number | Referrer reward (power_pro tier) |
| `currency` | string | Currency code (e.g., AUD) |

### 3. Webhooks

#### Webhook Configuration

| Field | Type | Description |
|-------|------|-------------|
| `webhookUrl` | URL | Endpoint to receive events |
| `webhookEnabled` | boolean | Enable/disable delivery |
| `webhookSecret` | string | Signing secret (read-only display) |

#### Webhook Events Log

- Event type
- Event ID
- Status (pending, delivered, failed, exhausted)
- Attempt count
- Created at
- Delivered at / Last error

#### Actions

- **Replay Event**: Re-queue failed event
- **View Payload**: Inspect event data

### 4. API Keys

#### Key Management

- List all API keys (prefix, name, scopes, last used)
- Create new key (returns full key once)
- Revoke key (immediate, permanent)

#### Key Creation Form

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `scopes` | multi-select | Yes |
| `expiresAt` | date | No |

### 5. Embed Settings

#### Origin Allowlist

Manage allowed origins for iframe embedding:
- Add origin
- Remove origin
- Test origin

#### Embed Preview

Live preview of the embed widget with current branding.

---

## UI Components

### Configuration Form

```tsx
interface TenantConfigForm {
  name: string;
  logoUrl: string;
  primaryColor: string;
  rewardRules: {
    onboardingBonus: number;
    referralRewardFree: number;
    referralRewardPro: number;
    referralRewardPowerPro: number;
    currency: string;
  };
  webhookUrl: string;
  webhookEnabled: boolean;
  allowedOrigins: string[];
}
```

### Event Log Table

| Column | Description |
|--------|-------------|
| Type | Event type badge |
| Event ID | Truncated ID with copy |
| Status | Color-coded status |
| Attempts | X / max |
| Created | Relative time |
| Actions | Replay, View |

### API Key Table

| Column | Description |
|--------|-------------|
| Prefix | First 12 chars |
| Name | User-defined name |
| Scopes | Scope badges |
| Last Used | Relative time |
| Actions | Revoke |

---

## Access Control

### Admin API Key Required

All admin UI operations require an API key with `admin` scope.

### Session Management

- API key stored in secure HTTP-only cookie
- Session expires after 24 hours of inactivity
- Logout clears session

---

## Validation Rules

### Branding

- `name`: 1-255 characters
- `logoUrl`: Valid HTTPS URL
- `primaryColor`: Valid hex color (#RRGGBB)

### Reward Rules

- All amounts: Non-negative integers
- `currency`: 3-letter ISO code

### Webhook

- `webhookUrl`: Valid HTTPS URL (HTTP allowed for localhost)
- Secret: Auto-generated, 64 characters

### Origins

- Valid URL format
- HTTPS required (except localhost)
- Wildcard subdomain supported (*.example.com)

---

## Inputs

- **Admin User**: Configuration changes
- **API Key**: Authentication

---

## Outputs

- **Updated Configuration**: Saved to database
- **UI Feedback**: Success/error messages

---

## Invariants

1. Webhook secret cannot be changed (only regenerated)
2. API key full value shown only once at creation
3. Revoked keys cannot be reactivated
4. Configuration changes take effect immediately

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Invalid logo URL | Show validation error |
| Webhook URL unreachable | Allow save, show warning |
| Last admin key revoked | Prevent revocation |
| Empty allowed origins | Allow all origins (dev only warning) |

---

## Acceptance Criteria

- [ ] Dashboard shows accurate metrics
- [ ] Branding changes reflect in embed widget
- [ ] Reward rules can be updated
- [ ] Webhook configuration works
- [ ] Event log shows all events
- [ ] Event replay functionality works
- [ ] API keys can be created and revoked
- [ ] Origin allowlist is enforced
