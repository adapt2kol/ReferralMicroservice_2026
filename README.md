# ReferralOS

> **Multi-tenant referral microservice using Option C architecture**

ReferralOS is a standalone referral system designed to be integrated with any SaaS product. It manages referral codes, tracks referrals, maintains an immutable rewards ledger, and emits webhooks — while leaving entitlement application (Stripe credits, subscription upgrades, etc.) to the host application.

---

## Architecture: Option C

```
┌─────────────────────────────────────────────────────────────────┐
│                        Host App (e.g., QuoteOS)                 │
├─────────────────────────────────────────────────────────────────┤
│  • Manages user authentication                                   │
│  • Syncs users to ReferralOS                                     │
│  • Receives webhooks from ReferralOS                             │
│  • Applies entitlements (Stripe, credits, etc.)                  │
│  • Embeds referral widget                                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ReferralOS                               │
├─────────────────────────────────────────────────────────────────┤
│  • Stores users, referral codes, referrals                       │
│  • Maintains immutable rewards ledger                            │
│  • Emits webhooks: referral.claimed, reward.granted              │
│  • Provides embeddable widget                                    │
│  • Does NOT touch Stripe or apply entitlements                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle**: ReferralOS tracks *what* rewards are earned. Host apps decide *how* to apply them.

---

## Features

- **Multi-tenant**: Isolated data per tenant with API key authentication
- **Automatic Referral Codes**: Generated on user creation
- **Tier-based Rewards**: Different reward amounts for free/pro/power_pro users
- **Immutable Ledger**: Append-only rewards tracking
- **Signed Webhooks**: HMAC-SHA256 signatures with retry logic
- **Embeddable Widget**: Signed iframe for host app integration
- **Idempotent Operations**: Safe to replay without side effects

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL via Supabase |
| Styling | Tailwind CSS |
| Deployment | Railway |

---

## Project Structure

```
/
├── directives/          # SOP documents (read before implementing)
│   ├── 00_agent_operating_system.md
│   ├── 01_product_scope_option_c.md
│   ├── ...
│   └── _notes.md
├── execution/           # Migrations, seeds, scripts
├── db/                  # Database schema, types, queries
├── lib/                 # Shared utilities
├── app/                 # Next.js application
├── .tmp/                # Temporary files (gitignored)
├── CLAUDE.md            # Agent instructions (mirrors 00_)
├── AGENTS.md            # Agent instructions (mirrors 00_)
├── GEMINI.md            # Agent instructions (mirrors 00_)
├── .env.example         # Example environment variables
└── README.md            # This file
```

---

## Security Highlights

### Embed Widget Security
- HMAC-SHA256 signed URLs
- 10-minute TTL on signatures
- Origin allowlist enforcement

### Webhook Security
- HMAC-SHA256 signed payloads
- Timestamp header for replay protection
- Configurable retry schedule

### API Security
- API key authentication
- Scoped permissions (read, write, admin)
- Rate limiting per key

---

## Phase 1: Local Setup (Foundation)

### Prerequisites

- Node.js 20+
- pnpm 10+ (install via `npm install -g pnpm` or use `npx pnpm`)
- PostgreSQL database (Supabase recommended)

### Quick Start

```bash
# 1. Install dependencies
npx pnpm install

# 2. Copy environment variables
cp .env.example .env.local

# 3. Edit .env.local with your values:
#    - DATABASE_URL: Your PostgreSQL connection string
#    - REFERRALOS_SIGNING_SECRET: Generate with `openssl rand -hex 32`

# 4. Generate Drizzle migrations (first time only)
npx pnpm db:generate

# 5. Run database migrations
npx pnpm db:migrate

# 6. Seed the database (creates tenant, reward rules, API key)
npx pnpm db:seed
# ⚠️ SAVE THE API KEY OUTPUT - it's shown only once!

# 7. Start development server
npx pnpm dev

# 8. Verify health endpoint
curl http://localhost:3000/api/v1/health
```

### Expected Health Response

```json
{
  "ok": true,
  "service": "ReferralOS",
  "ts": "2025-12-29T08:30:00.000Z"
}
```

### Expected Seed Output

```
Starting database seed...
Created tenant "quoteos" (id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
Created reward rule: onboarding_bonus
Created reward rule: referral_free_referrer
Created reward rule: referral_pro_referrer

======================================================================
API KEY GENERATED - SAVE THIS NOW, IT WILL NOT BE SHOWN AGAIN
======================================================================
Raw API Key: ros_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
======================================================================

Seed completed successfully
```

### Troubleshooting: Database Connection

**ENOTFOUND or connection timeout errors:**
- Supabase's direct connection (`db.[project].supabase.co:5432`) may be **IPv6-only**
- Railway and some networks are **IPv4-only** and cannot resolve IPv6 addresses
- **Solution:** Use the **Transaction pooler** connection string (port 6543) instead

**Connection string selection:**
- Scripts prefer `DATABASE_URL_DIRECT` if set and non-empty
- Falls back to `DATABASE_URL` (transaction pooler) otherwise
- For Railway deployment, only set `DATABASE_URL` (pooler) and leave `DATABASE_URL_DIRECT` blank

### Environment Variables (Phase 1 Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `REFERRALOS_SIGNING_SECRET` | Secret for API key hashing (min 32 chars) | `openssl rand -hex 32` |

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm db:generate` | Generate Drizzle migrations from schema |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:seed` | Seed database with tenant and reward rules |
| `pnpm smoke:core` | Run core API smoke tests |

---

## Phase 2: Core Referral Engine API

Phase 2 implements the core referral engine API endpoints with full authentication, multi-tenant isolation, and idempotent operations.

### API Endpoints

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `POST` | `/api/v1/users/upsert` | `write` | Create or update a user with referral code |
| `POST` | `/api/v1/referrals/claim` | `write` | Claim a referral (idempotent) |
| `GET` | `/api/v1/referrals/stats` | `read` | Get referral stats for a user |

### Authentication

All API endpoints require a Bearer token in the Authorization header:

```bash
curl -X POST http://localhost:3000/api/v1/users/upsert \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"externalUserId": "user_123", "email": "user@example.com"}'
```

### User Upsert

Creates a new user or updates an existing one. Automatically generates a unique referral code for new users.

**Request:**
```json
{
  "externalUserId": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "subscriptionTier": "pro"
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "externalUserId": "user_123",
      "email": "user@example.com",
      "plan": "pro",
      "referralCode": "ref_AbCdEfGhIjKl",
      "referralLink": "http://localhost:3000?ref__=ref_AbCdEfGhIjKl",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    },
    "created": true
  },
  "meta": {
    "timestamp": "2025-01-01T00:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

### Referral Claim

Claims a referral for a new user. This operation is idempotent - calling it multiple times with the same `referredUserId` returns the existing referral.

**Request:**
```json
{
  "referralCode": "ref_AbCdEfGhIjKl",
  "referredUserId": "new_user_456"
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "data": {
    "referral": {
      "id": "uuid",
      "referrerUserId": "user_123",
      "referredExternalUserId": "new_user_456",
      "refCodeUsed": "ref_AbCdEfGhIjKl",
      "status": "completed",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    "rewards": {
      "referrerReward": { "amount": 200, "currency": "AUD" },
      "referredReward": null
    },
    "alreadyProcessed": false
  },
  "meta": { ... }
}
```

### Referral Stats

Get referral statistics for a user.

**Request:**
```bash
GET /api/v1/referrals/stats?externalUserId=user_123
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "uuid",
      "externalUserId": "user_123",
      "plan": "pro",
      "referralCode": "ref_AbCdEfGhIjKl",
      "referralLink": "http://localhost:3000?ref__=ref_AbCdEfGhIjKl"
    },
    "stats": {
      "totalReferrals": 5,
      "completedReferrals": 3,
      "pendingReferrals": 2,
      "totalRewardsEarned": 600,
      "currency": "AUD"
    }
  },
  "meta": { ... }
}
```

### Error Responses

All errors follow a consistent format:

```json
{
  "ok": false,
  "error": {
    "code": "SELF_REFERRAL",
    "message": "Users cannot refer themselves"
  },
  "meta": {
    "timestamp": "2025-01-01T00:00:00.000Z",
    "requestId": "req_abc123"
  }
}
```

**Common Error Codes:**
- `MISSING_API_KEY` (401) - No API key provided
- `INVALID_API_KEY` (401) - API key is invalid or revoked
- `INSUFFICIENT_PERMISSIONS` (403) - API key lacks required scope
- `INVALID_REQUEST` (400) - Request validation failed
- `USER_NOT_FOUND` (404) - User does not exist
- `REFERRAL_CODE_NOT_FOUND` (404) - Referral code does not exist
- `SELF_REFERRAL` (400) - User cannot refer themselves

### Running Smoke Tests

After starting the dev server, run the smoke tests:

```bash
# Set the test API key (from seed output)
export REFERRALOS_TEST_API_KEY="rk_live_..."

# Run smoke tests
pnpm smoke:core
```

Expected output:
```
============================================================
ReferralOS Core API Smoke Tests
Base URL: http://localhost:3000
============================================================

[SMOKE] Testing health endpoint...
✓ Health endpoint passed

[SMOKE] Testing missing API key...
✓ Missing API key test passed

[SMOKE] Testing user upsert (create referrer)...
✓ User upsert (create) passed

[SMOKE] Testing referral claim...
✓ Referral claim passed

[SMOKE] Testing referral claim idempotency...
✓ Referral claim idempotency passed

[SMOKE] Testing self-referral prevention...
✓ Self-referral prevention passed

[SMOKE] Testing referral stats...
✓ Referral stats passed

============================================================
✓ ALL SMOKE TESTS PASSED
============================================================
```

---

## Phase 3: Webhooks

### Webhook Configuration

Configure your tenant's webhook URL to receive events:

```bash
# Set webhook URL (must be HTTPS)
curl -X PUT http://localhost:3000/api/v1/tenant/webhook \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": "https://your-app.com/webhooks/referralos"}'

# Get current webhook config
curl http://localhost:3000/api/v1/tenant/webhook \
  -H "Authorization: Bearer $API_KEY"

# Clear webhook URL (disable webhooks)
curl -X PUT http://localhost:3000/api/v1/tenant/webhook \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl": null}'
```

### Webhook Events

When a referral is claimed, a `referral.claimed` event is sent to your webhook URL:

```json
{
  "id": "uuid",
  "type": "referral.claimed",
  "tenantId": "uuid",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "data": {
    "referralId": "uuid",
    "referrerUserId": "external_user_id",
    "referredUserId": "external_user_id",
    "referralCode": "JOHNDX7K2",
    "rewards": {
      "referrer": { "amount": 10, "currency": "USD" },
      "referred": { "amount": 5, "currency": "USD" }
    }
  }
}
```

### Webhook Security

All webhooks are signed with HMAC-SHA256. Verify the signature:

```typescript
import crypto from 'crypto';

function verifyWebhook(payload: string, timestamp: string, signature: string): boolean {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// In your webhook handler:
const timestamp = req.headers['x-referralos-ts'];
const signature = req.headers['x-referralos-signature'];
const isValid = verifyWebhook(req.body, timestamp, signature);
```

### Webhook Retry Schedule

Failed deliveries are retried with exponential backoff:
- Immediate, 10s, 1m, 5m, 30m, 2h

Configure max retries via `WEBHOOK_RETRY_LIMIT` (default: 6).

### Testing Webhooks

```bash
# Send a test webhook
curl -X POST http://localhost:3000/api/v1/webhooks/test \
  -H "Authorization: Bearer $API_KEY"

# Replay a specific event
curl -X POST http://localhost:3000/api/v1/webhooks/replay \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"eventId": "uuid"}'
```

### Running the Webhook Worker

The webhook worker processes pending deliveries:

```bash
# Run continuously
pnpm worker:webhook

# Run once (for testing)
pnpm worker:webhook:once
```

### Webhook Smoke Tests

```bash
# Set API key and run webhook tests
export SMOKE_TEST_API_KEY="rk_live_..."
pnpm smoke:webhooks
```

---

## Phase 4: Embed Widget

The embed widget allows you to display a branded referral interface in your application via iframe.

### Generating Embed Links

Embed links are signed with HMAC-SHA256 and have a 10-minute TTL for security.

```bash
# Generate an embed link using the CLI tool
REFERRALOS_SIGNING_SECRET="your-secret" \
TENANT_SLUG="quoteos" \
EXTERNAL_USER_ID="user_abc123" \
pnpm embed:link

# Or pass arguments directly
REFERRALOS_SIGNING_SECRET="your-secret" pnpm embed:link quoteos user_abc123
```

### Signature Format

The embed URL uses query parameters for authentication:

```
/embed/referral?tenant={slug}&externalUserId={id}&ts={timestamp}&sig={signature}
```

Where signature is computed as:
```typescript
signature = HMAC-SHA256(REFERRALOS_SIGNING_SECRET, `${tenant}.${externalUserId}.${timestamp}`)
```

### Embedding in Your Application

```html
<iframe
  src="https://your-referralos-instance.com/embed/referral?tenant=quoteos&externalUserId=user_abc123&ts=1735470600&sig=a1b2c3..."
  width="100%"
  height="500"
  frameborder="0"
  allow="clipboard-write"
  title="Referral Program"
></iframe>
```

### Generating Links Server-Side (TypeScript)

```typescript
import crypto from 'crypto';

function generateEmbedUrl(tenant: string, externalUserId: string): string {
  const secret = process.env.REFERRALOS_SIGNING_SECRET!;
  const baseUrl = process.env.REFERRALOS_BASE_URL || 'https://referralos.example.com';
  const timestamp = Math.floor(Date.now() / 1000);
  
  const message = `${tenant}.${externalUserId}.${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');
  
  const params = new URLSearchParams({
    tenant,
    externalUserId,
    ts: timestamp.toString(),
    sig: signature,
  });
  
  return `${baseUrl}/embed/referral?${params.toString()}`;
}
```

### TTL and Refresh Flow

- Embed links expire after **10 minutes** (configurable via `EMBED_SIGNATURE_TTL`)
- When a link expires, the widget shows a "Link Expired" message
- Your application should regenerate the embed URL when the user navigates to the referral page
- For SPAs, consider refreshing the iframe src periodically or on user interaction

### Widget Features

- **Branded UI**: Logo, colors, and copy from tenant settings
- **Referral Link**: One-click copy to clipboard
- **Stats**: Total referrals, pending, and rewards earned
- **How It Works**: Customizable step-by-step guide
- **Responsive**: Works on mobile and desktop

### Tenant Branding Configuration

Configure branding via the tenant's `branding_json` column:

```json
{
  "logoUrl": "https://example.com/logo.png",
  "productName": "QuoteOS",
  "accentColor": "#3B82F6",
  "backgroundColor": "#FFFFFF",
  "textColor": "#1F2937",
  "showPoweredBy": true
}
```

### Referral Settings Configuration

Configure referral content via `referral_settings_json`:

```json
{
  "shareBaseUrl": "https://quoteos.com/signup",
  "title": "Invite friends, earn rewards",
  "description": "Share your unique link and earn rewards!",
  "howItWorks": [
    "Share your unique referral link",
    "Friends sign up using your link",
    "You both earn rewards"
  ],
  "shareMessage": "Join me on QuoteOS!"
}
```

### Error States

| State | Display |
|-------|---------|
| Missing params | "Invalid Link" - parameters missing |
| Invalid timestamp | "Invalid Link" - malformed timestamp |
| Expired signature | "Link Expired" - TTL exceeded |
| Invalid signature | "Invalid Link" - signature mismatch |
| Tenant not found | "Unknown Tenant" |
| User not found | "Complete Your Setup" - user not onboarded |

### Event Logging

Each embed view logs an `embed.viewed` event for analytics:

```json
{
  "type": "embed.viewed",
  "tenantId": "uuid",
  "payloadJson": {
    "externalUserId": "user_abc123",
    "viewedAt": "2025-12-29T10:30:00.000Z"
  }
}
```

---

## Phase 5: Admin UI

The Admin UI provides a tenant-scoped dashboard for managing your referral program configuration.

### Accessing the Admin UI

Navigate to `/admin` in your browser. Authentication is required via API key.

**Development Mode:**
```
http://localhost:3000/admin?apiKey=rk_live_your_api_key_here
```

**Production:**
Enter your API key in the login form. The key is stored in session storage.

### Required Scopes

| Page | Required Scope |
|------|----------------|
| Dashboard | `admin:read` or `admin:write` |
| Branding | `admin:write` (edit), `admin:read` (view) |
| Reward Rules | `admin:write` (edit), `admin:read` (view) |
| Webhooks | `admin:write` (edit), `admin:read` (view) |
| API Keys | `admin:write` (create/revoke), `admin:read` (list) |
| Events | `admin:read` or `admin:write` |

### Admin Pages

#### Dashboard (`/admin`)
- Tenant overview with name, slug, and status
- Key metrics: total users, referrals, completed, pending
- Webhook status indicator
- Quick action links

#### Branding (`/admin/branding`)
- **Product Name**: Displayed in embed widget header
- **Logo URL**: HTTPS URL to your logo image
- **Accent Color**: Primary color for buttons and highlights
- **Share Base URL**: Base URL for referral links
- **How It Works**: Steps displayed in embed widget (one per line)

#### Reward Rules (`/admin/rewards`)
- View and edit reward rules
- Toggle rules enabled/disabled
- Edit condition, referrer reward, and referred reward JSON
- Changes affect future referrals only

#### Webhooks (`/admin/webhooks`)
- Configure webhook endpoint URL
- Send test webhook
- View supported event types
- Webhook security documentation

#### API Keys (`/admin/api-keys`)
- List all API keys with scopes and status
- Create new API keys with selected scopes
- Revoke existing keys (cannot revoke current key or last admin key)

**Security Warning:** API keys are shown only once at creation. Store them securely.

#### Events (`/admin/events`)
- View all tenant events with pagination
- Filter by event type
- Expand events to view full payload
- Event types include: `referral.created`, `referral.completed`, `reward.awarded`, `api_key.created`, `api_key.revoked`, `tenant.branding.updated`, `tenant.rules.updated`, `tenant.webhook.updated`

### Admin API Endpoints

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| GET | `/api/v1/tenant` | `read`, `admin:read` | Get tenant info |
| GET | `/api/v1/tenant/stats` | `read`, `admin:read` | Get tenant statistics |
| PUT | `/api/v1/tenant/branding` | `admin:write` | Update branding/settings |
| GET | `/api/v1/tenant/rules` | `read`, `admin:read` | List reward rules |
| PUT | `/api/v1/tenant/rules/:id` | `admin:write` | Update reward rule |
| GET | `/api/v1/admin/api-keys` | `admin:read` | List API keys |
| POST | `/api/v1/admin/api-keys` | `admin:write` | Create API key |
| POST | `/api/v1/admin/api-keys/:id/revoke` | `admin:write` | Revoke API key |
| GET | `/api/v1/admin/events` | `admin:read` | List events |

### Event Audit Trail

All admin actions are logged as events:

| Event Type | Trigger |
|------------|---------|
| `api_key.created` | New API key created |
| `api_key.revoked` | API key revoked |
| `tenant.branding.updated` | Branding or referral settings changed |
| `tenant.rules.updated` | Reward rule modified |
| `tenant.webhook.updated` | Webhook URL changed |

### Security Considerations

1. **API Key Storage**: Keys are hashed with HMAC-SHA256 before storage. Raw keys cannot be retrieved after creation.

2. **Scope Enforcement**: All endpoints enforce scope requirements. `admin` scope grants full access.

3. **Tenant Isolation**: All queries are scoped to the authenticated tenant. Cross-tenant access is impossible.

4. **Session Storage**: API keys in the browser are stored in session storage (cleared on tab close).

5. **No Raw Key Logging**: API keys are never logged or exposed in responses after creation.

---

## Database Schema (Phase 1)

All tables are multi-tenant with `tenant_id` foreign key:

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant configuration, branding, webhook URL |
| `api_keys` | Hashed API keys with scopes |
| `users` | User records with referral codes |
| `referrals` | Referral relationships and status |
| `reward_rules` | Configurable reward logic per tenant |
| `rewards_ledger` | Immutable reward records |
| `events` | Event log for auditing |
| `webhook_deliveries` | Webhook delivery tracking |

---

## Legacy: Full Setup Reference

### Environment Variables (All)

See `.env.example` for all required variables. Key ones include:

- `DATABASE_URL` — PostgreSQL connection string
- `REFERRALOS_SIGNING_SECRET` — Secret for API key hashing and embed signatures
- `WEBHOOK_SIGNING_SECRET` — Secret for webhook signatures

---

## Integration Summary

### 1. Sync Users

```typescript
// On user signup in host app
await fetch('https://api.referralos.com/api/v1/users', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    externalUserId: user.id,
    email: user.email,
    name: user.name,
    subscriptionTier: 'free',
  }),
});
```

### 2. Claim Referrals

```typescript
// When user signs up with referral code
await fetch('https://api.referralos.com/api/v1/referrals/claim', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    referralCode: 'JOHNDX7K2',
    referredUserId: newUser.id,
  }),
});
```

### 3. Handle Webhooks

```typescript
// Webhook endpoint in host app
app.post('/webhooks/referralos', async (req, res) => {
  // Verify signature
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = req.body;
  
  if (event.type === 'reward.granted') {
    // Apply entitlement in your system
    await applyCredits(event.data.externalUserId, event.data.amount);
  }
  
  res.json({ received: true });
});
```

### 4. Embed Widget

```html
<iframe
  src="https://referralos.com/embed/quoteos?userId=user_123&ts=1735470600&sig=..."
  width="100%"
  height="400"
  frameborder="0"
></iframe>
```

---

## Directives

Before implementing any feature, read the relevant directive in `directives/`:

| Directive | Topic |
|-----------|-------|
| 00 | Agent Operating System |
| 01 | Product Scope (Option C) |
| 02 | Architecture and Boundaries |
| 03 | Environment Setup |
| 04 | Repo Structure Conventions |
| 05 | Database Schema |
| 06 | Migrations and Seeding |
| 07 | Auth, API Keys, Scopes |
| 08 | Signatures and Embed Security |
| 09 | API Contract |
| 10 | User Upsert and Referral Code |
| 11 | Referral Claim Idempotency |
| 12 | Reward Rules and Ledger |
| 13 | Webhooks Delivery and Replay |
| 14 | Stats and Reporting |
| 15 | Admin UI and Tenant Config |
| 16 | Embed Widget UI |
| 17 | Rate Limits and Abuse |
| 18 | Observability and Audit Log |
| 19 | Testing, Smoke, CI |
| 20 | Railway Deploy |
| 21 | QuoteOS Integration Playbook |

---

## Next Steps

1. **Read Directives**: Start with `00_agent_operating_system.md`
2. **Set Up Environment**: Configure `.env` from `.env.example`
3. **Run Migrations**: Execute database schema setup
4. **Implement API**: Follow directives 09-13
5. **Build Admin UI**: Follow directive 15
6. **Build Embed Widget**: Follow directive 16
7. **Deploy**: Follow directive 20

---

## License

Proprietary. All rights reserved.
