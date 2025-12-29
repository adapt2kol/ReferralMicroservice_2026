# QuoteOS Integration Playbook

This guide explains how to integrate ReferralOS with QuoteOS for referral tracking, reward distribution, and embedded widgets.

## Overview

ReferralOS provides:
- **Referral tracking**: Capture and attribute referrals via `ref__` URL parameters
- **Reward calculation**: Automatic reward calculation based on configurable rules
- **Webhooks**: Real-time notifications when referrals are claimed
- **Embeddable widget**: Display referral stats and share links in your app

---

## 1. Capturing Referral Codes

When a user arrives via a referral link (e.g., `https://quoteos.app?ref__ABC123`), capture and store the referral code.

### Next.js Middleware Example

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REFERRAL_COOKIE_NAME = "ros_ref_code";
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const url = request.nextUrl;

  // Check for ref__ parameter
  const refCode = url.searchParams.get("ref__");
  
  if (refCode) {
    // Store in cookie for later use during signup
    response.cookies.set(REFERRAL_COOKIE_NAME, refCode, {
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    // Optionally remove from URL for cleaner UX
    url.searchParams.delete("ref__");
    return NextResponse.redirect(url, { headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

### Server-Side Helper

```typescript
// lib/referral.ts
import { cookies } from "next/headers";

const REFERRAL_COOKIE_NAME = "ros_ref_code";

export function getCapturedReferralCode(): string | null {
  const cookieStore = cookies();
  return cookieStore.get(REFERRAL_COOKIE_NAME)?.value ?? null;
}

export function clearReferralCode(): void {
  const cookieStore = cookies();
  cookieStore.delete(REFERRAL_COOKIE_NAME);
}
```

---

## 2. Claiming Referrals

Call the ReferralOS claim endpoint when a user completes onboarding (e.g., after email verification or first purchase).

### Node.js/TypeScript Example

```typescript
// lib/referralos-client.ts
const REFERRALOS_API_URL = process.env.REFERRALOS_API_URL!;
const REFERRALOS_API_KEY = process.env.REFERRALOS_API_KEY!;

interface ClaimReferralParams {
  referralCode: string;
  referredUserId: string;
}

interface ClaimReferralResult {
  success: boolean;
  referralId?: string;
  alreadyProcessed?: boolean;
  error?: string;
}

export async function claimReferral(
  params: ClaimReferralParams
): Promise<ClaimReferralResult> {
  try {
    const response = await fetch(`${REFERRALOS_API_URL}/api/v1/referrals/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${REFERRALOS_API_KEY}`,
      },
      body: JSON.stringify({
        referralCode: params.referralCode,
        referredUserId: params.referredUserId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || "Failed to claim referral",
      };
    }

    return {
      success: true,
      referralId: data.data.referral.id,
      alreadyProcessed: data.data.alreadyProcessed,
    };
  } catch (error) {
    console.error("ReferralOS claim error:", error);
    return {
      success: false,
      error: "Network error",
    };
  }
}
```

### Next.js Route Handler Example

```typescript
// app/api/onboarding/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { claimReferral } from "@/lib/referralos-client";
import { getCapturedReferralCode, clearReferralCode } from "@/lib/referral";

export async function POST(request: NextRequest) {
  const { userId } = await request.json();

  // Get stored referral code
  const referralCode = getCapturedReferralCode();

  if (referralCode) {
    // Claim the referral (fire-and-forget or await)
    const result = await claimReferral({
      referralCode,
      referredUserId: userId,
    });

    if (result.success) {
      console.log("Referral claimed:", result.referralId);
      clearReferralCode();
    }
  }

  return NextResponse.json({ success: true });
}
```

---

## 3. Generating Embed Signatures

To embed the ReferralOS widget, generate a signed token server-side.

### Signature Generation

```typescript
// lib/referralos-embed.ts
import crypto from "crypto";

const EMBED_SECRET = process.env.REFERRALOS_EMBED_SECRET!;
const SIGNATURE_TTL_SECONDS = 600; // 10 minutes

interface EmbedParams {
  externalUserId: string;
  tenantId: string;
}

export function generateEmbedSignature(params: EmbedParams): {
  signature: string;
  timestamp: number;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${params.externalUserId}:${params.tenantId}:${timestamp}`;
  
  const signature = crypto
    .createHmac("sha256", EMBED_SECRET)
    .update(payload)
    .digest("hex");

  return { signature, timestamp };
}

export function generateEmbedUrl(params: EmbedParams): string {
  const { signature, timestamp } = generateEmbedSignature(params);
  const baseUrl = process.env.REFERRALOS_API_URL!;
  
  const url = new URL(`${baseUrl}/embed/referral`);
  url.searchParams.set("externalUserId", params.externalUserId);
  url.searchParams.set("tenantId", params.tenantId);
  url.searchParams.set("sig", signature);
  url.searchParams.set("ts", timestamp.toString());
  
  return url.toString();
}
```

### Embedding in React

```tsx
// components/ReferralWidget.tsx
"use client";

import { useEffect, useState } from "react";

interface ReferralWidgetProps {
  userId: string;
}

export function ReferralWidget({ userId }: ReferralWidgetProps) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);

  useEffect(() => {
    // Fetch signed embed URL from your API
    fetch(`/api/referral/embed-url?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => setEmbedUrl(data.embedUrl));
  }, [userId]);

  if (!embedUrl) return <div>Loading...</div>;

  return (
    <iframe
      src={embedUrl}
      width="100%"
      height="400"
      style={{ border: "none", borderRadius: "8px" }}
      title="Referral Widget"
    />
  );
}
```

---

## 4. Verifying Webhook Signatures

When receiving webhooks from ReferralOS, verify the signature to ensure authenticity.

### Signature Verification

```typescript
// lib/referralos-webhook.ts
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.REFERRALOS_WEBHOOK_SECRET!;

interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string
): WebhookVerificationResult {
  // Check timestamp freshness (within 5 minutes)
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  
  if (Math.abs(now - ts) > 300) {
    return { valid: false, error: "Timestamp too old" };
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  // Constant-time comparison
  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: "Invalid signature length" };
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: "Signature mismatch" };
  }

  return { valid: true };
}
```

### Next.js Webhook Handler

```typescript
// app/api/webhooks/referralos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/referralos-webhook";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-referralos-signature");
  const timestamp = request.headers.get("x-referralos-timestamp");
  
  if (!signature || !timestamp) {
    return NextResponse.json(
      { error: "Missing signature headers" },
      { status: 401 }
    );
  }

  const body = await request.text();
  const verification = verifyWebhookSignature(body, signature, timestamp);

  if (!verification.valid) {
    console.error("Webhook verification failed:", verification.error);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const event = JSON.parse(body);

  // Handle different event types
  switch (event.type) {
    case "referral.claimed":
      await handleReferralClaimed(event.payload);
      break;
    case "reward.credited":
      await handleRewardCredited(event.payload);
      break;
    default:
      console.log("Unhandled event type:", event.type);
  }

  return NextResponse.json({ received: true });
}

async function handleReferralClaimed(payload: {
  referralId: string;
  referrerUserId: string;
  referredUserId: string;
  rewards: {
    referrer: { amount: number; currency: string } | null;
    referred: { amount: number; currency: string } | null;
  };
}) {
  console.log("Referral claimed:", payload);
  
  // Apply entitlements in your system
  // e.g., credit account balance, unlock features, etc.
}

async function handleRewardCredited(payload: {
  userId: string;
  amount: number;
  currency: string;
  source: string;
}) {
  console.log("Reward credited:", payload);
}
```

---

## 5. Environment Variables

Add these to your `.env`:

```bash
# ReferralOS API
REFERRALOS_API_URL=https://your-referralos-instance.railway.app
REFERRALOS_API_KEY=ros_...

# Webhook verification
REFERRALOS_WEBHOOK_SECRET=whsec_...

# Embed widget signing
REFERRALOS_EMBED_SECRET=embed_...
```

---

## 6. Testing Checklist

- [ ] Referral code captured from URL and stored in cookie
- [ ] Referral claimed on user onboarding completion
- [ ] Idempotent claim (second call returns `alreadyProcessed: true`)
- [ ] Webhook signature verification working
- [ ] Embed widget displays correctly
- [ ] Rewards credited to both referrer and referred

---

## 7. Troubleshooting

### Common Issues

**Referral not claimed:**
- Check that the referral code cookie is being set
- Verify the API key has `write` scope
- Ensure the referred user ID is unique

**Webhook verification failing:**
- Confirm the webhook secret matches
- Check that the timestamp is within 5 minutes
- Ensure you're using the raw request body for verification

**Embed widget not loading:**
- Verify the embed signature is generated server-side
- Check that the timestamp is fresh (within 10 minutes)
- Ensure the tenant ID matches your ReferralOS tenant

---

## Support

For issues or questions, check the ReferralOS documentation or contact support.
