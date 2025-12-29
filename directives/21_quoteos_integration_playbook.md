# 21 — QuoteOS Integration Playbook

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Provide a step-by-step integration guide for connecting QuoteOS (host app) with ReferralOS.

---

## Goals

1. Document complete integration flow
2. Provide code examples for QuoteOS
3. Define webhook handling requirements
4. Explain entitlement application

---

## Non-Goals

- QuoteOS internal architecture changes
- Stripe integration details (QuoteOS responsibility)
- UI design for QuoteOS referral pages

---

## Integration Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          QuoteOS                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. User signs up                                                │
│  2. Call ReferralOS: POST /users                                 │
│  3. If referral code in cookie:                                  │
│     - Call ReferralOS: POST /referrals/claim                     │
│  4. Receive webhook: referral.claimed, reward.granted            │
│  5. Apply entitlement (Stripe coupon, credits, etc.)             │
│  6. Embed referral widget in user dashboard                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Tenant Setup

### Request API Keys

Contact ReferralOS admin to receive:
- Tenant slug: `quoteos`
- API key: `ros_api_quoteos_...`
- Admin API key: `ros_api_quoteos_admin_...`
- Embed signing secret: `ros_embed_...`
- Webhook secret: `ros_whsec_...`

### Configure Environment

```bash
# QuoteOS .env
REFERRALOS_API_URL=https://api.referralos.com
REFERRALOS_API_KEY=ros_api_quoteos_...
REFERRALOS_EMBED_SECRET=ros_embed_...
REFERRALOS_WEBHOOK_SECRET=ros_whsec_...
```

---

## Step 2: User Registration Flow

### On User Signup

```typescript
// QuoteOS: app/api/auth/signup/route.ts
import { createReferralOSUser, claimReferral } from '@/lib/referralos';

export async function POST(req: Request) {
  const { email, name, password } = await req.json();
  
  // 1. Create QuoteOS user
  const user = await createUser({ email, name, password });
  
  // 2. Sync to ReferralOS
  const referralUser = await createReferralOSUser({
    externalUserId: user.id,
    email: user.email,
    name: user.name,
    subscriptionTier: 'free',
  });
  
  // 3. Check for referral code in cookie
  const referralCode = cookies().get('referral_code')?.value;
  if (referralCode) {
    await claimReferral({
      referralCode,
      referredUserId: user.id,
    });
    cookies().delete('referral_code');
  }
  
  return Response.json({ user });
}
```

### ReferralOS Client

```typescript
// QuoteOS: lib/referralos.ts
const REFERRALOS_API_URL = process.env.REFERRALOS_API_URL;
const REFERRALOS_API_KEY = process.env.REFERRALOS_API_KEY;

export async function createReferralOSUser(data: {
  externalUserId: string;
  email?: string;
  name?: string;
  subscriptionTier?: string;
}) {
  const response = await fetch(`${REFERRALOS_API_URL}/api/v1/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REFERRALOS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error(`ReferralOS error: ${response.status}`);
  }
  
  return response.json();
}

export async function claimReferral(data: {
  referralCode: string;
  referredUserId: string;
}) {
  const response = await fetch(`${REFERRALOS_API_URL}/api/v1/referrals/claim`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REFERRALOS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  // 200 = already claimed (idempotent), 201 = new claim
  if (!response.ok && response.status !== 409) {
    throw new Error(`ReferralOS error: ${response.status}`);
  }
  
  return response.json();
}
```

---

## Step 3: Referral Link Handling

### Landing Page with Referral Code

```typescript
// QuoteOS: app/signup/page.tsx
import { cookies } from 'next/headers';

export default function SignupPage({
  searchParams,
}: {
  searchParams: { ref?: string };
}) {
  // Store referral code in cookie
  if (searchParams.ref) {
    cookies().set('referral_code', searchParams.ref, {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
  }
  
  return <SignupForm />;
}
```

---

## Step 4: Webhook Handler

### Webhook Endpoint

```typescript
// QuoteOS: app/api/webhooks/referralos/route.ts
import { createHmac, timingSafeEqual } from 'crypto';
import { applyReferralReward } from '@/lib/rewards';

const WEBHOOK_SECRET = process.env.REFERRALOS_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('X-ReferralOS-Signature');
  
  // Verify signature
  if (!verifySignature(payload, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }
  
  const event = JSON.parse(payload);
  
  switch (event.type) {
    case 'referral.claimed':
      await handleReferralClaimed(event.data);
      break;
    case 'reward.granted':
      await handleRewardGranted(event.data);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
  
  return Response.json({ received: true });
}

function verifySignature(payload: string, header: string | null): boolean {
  if (!header) return false;
  
  const parts = header.split(',');
  const timestamp = parseInt(parts.find(p => p.startsWith('t='))?.slice(2) || '0');
  const signature = parts.find(p => p.startsWith('v1='))?.slice(3);
  
  if (!timestamp || !signature) return false;
  
  // Check timestamp (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;
  
  // Verify signature
  const message = `${timestamp}.${payload}`;
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(message)
    .digest('hex');
  
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

async function handleRewardGranted(data: {
  externalUserId: string;
  amount: number;
  currency: string;
  rewardType: string;
}) {
  // Apply reward in QuoteOS
  await applyReferralReward({
    userId: data.externalUserId,
    amount: data.amount,
    currency: data.currency,
    type: data.rewardType,
  });
}
```

---

## Step 5: Apply Entitlements

### Reward Application

```typescript
// QuoteOS: lib/rewards.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function applyReferralReward(data: {
  userId: string;
  amount: number;
  currency: string;
  type: string;
}) {
  const user = await getUserById(data.userId);
  
  if (data.type === 'credit') {
    // Option 1: Add credits to user account
    await addCredits(user.id, data.amount);
    
    // Option 2: Apply Stripe coupon
    if (user.stripeCustomerId) {
      const coupon = await stripe.coupons.create({
        amount_off: data.amount,
        currency: data.currency.toLowerCase(),
        duration: 'once',
        name: `Referral Reward - ${data.amount} ${data.currency}`,
      });
      
      await stripe.customers.update(user.stripeCustomerId, {
        coupon: coupon.id,
      });
    }
  }
  
  // Log the reward application
  await logRewardApplication({
    userId: user.id,
    amount: data.amount,
    type: data.type,
    appliedAt: new Date(),
  });
}
```

---

## Step 6: Embed Widget

### Generate Signed URL

```typescript
// QuoteOS: lib/referralos.ts
import { createHmac } from 'crypto';

export function generateEmbedUrl(externalUserId: string): string {
  const tenant = 'quoteos';
  const timestamp = Math.floor(Date.now() / 1000);
  const secret = process.env.REFERRALOS_EMBED_SECRET!;
  
  const message = `${tenant}.${externalUserId}.${timestamp}`;
  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  const baseUrl = process.env.REFERRALOS_EMBED_URL || 'https://referralos.com';
  return `${baseUrl}/embed/${tenant}?userId=${encodeURIComponent(externalUserId)}&ts=${timestamp}&sig=${signature}`;
}
```

### Embed in Dashboard

```tsx
// QuoteOS: app/dashboard/referrals/page.tsx
import { generateEmbedUrl } from '@/lib/referralos';
import { getCurrentUser } from '@/lib/auth';

export default async function ReferralsPage() {
  const user = await getCurrentUser();
  const embedUrl = generateEmbedUrl(user.id);
  
  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Referral Program</h1>
      <iframe
        src={embedUrl}
        className="w-full min-h-[400px] border-0 rounded-lg"
        allow="clipboard-write"
        title="Referral Program"
      />
    </div>
  );
}
```

---

## Step 7: Subscription Tier Sync

### On Subscription Change

```typescript
// QuoteOS: After Stripe webhook processes subscription change
async function syncSubscriptionTier(userId: string, tier: string) {
  await fetch(`${REFERRALOS_API_URL}/api/v1/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REFERRALOS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      externalUserId: userId,
      subscriptionTier: tier, // 'free', 'pro', 'power_pro'
    }),
  });
}
```

---

## Testing Checklist

- [ ] User signup creates ReferralOS user
- [ ] Referral code cookie is captured
- [ ] Referral claim works on signup
- [ ] Webhook signature verification works
- [ ] Rewards are applied correctly
- [ ] Embed widget loads and displays
- [ ] Subscription tier syncs correctly

---

## Acceptance Criteria

- [ ] Complete integration flow works end-to-end
- [ ] Webhooks are verified and processed
- [ ] Entitlements are applied correctly
- [ ] Embed widget is functional
- [ ] Error handling is robust
- [ ] Idempotency is maintained
