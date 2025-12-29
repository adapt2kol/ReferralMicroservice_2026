# 08 — Signatures and Embed Security

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the cryptographic signature schemes for embed widget access and webhook delivery, ensuring secure communication between ReferralOS and host applications.

---

## Goals

1. Secure embed widget access with signed URLs
2. Prevent unauthorized iframe embedding
3. Sign all outgoing webhooks for verification
4. Implement time-based expiration for signatures

---

## Non-Goals

- End-to-end encryption of payloads
- Certificate-based authentication
- OAuth token management

---

## Embed Widget Signatures

### Signature Algorithm

**HMAC-SHA256** with tenant's embed signing secret.

### Signature Components

```
signature = HMAC-SHA256(secret, message)
message = `${tenant}.${externalUserId}.${timestamp}`
```

### URL Format

```
https://referralos.example.com/embed/{tenant}?
  userId={externalUserId}&
  ts={timestamp}&
  sig={signature}
```

### Example

```
Tenant: quoteos
External User ID: user_abc123
Timestamp: 1735470600 (2025-12-29T10:30:00Z)
Secret: ros_embed_secret_abc123def456

Message: quoteos.user_abc123.1735470600
Signature: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4

URL: https://referralos.example.com/embed/quoteos?userId=user_abc123&ts=1735470600&sig=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4
```

---

## Signature Generation (Host App)

### TypeScript Implementation

```typescript
import { createHmac } from 'crypto';

interface EmbedSignatureParams {
  tenant: string;
  externalUserId: string;
  secret: string;
  ttlSeconds?: number;
}

interface SignedEmbedUrl {
  url: string;
  expiresAt: Date;
}

function generateEmbedSignature(params: EmbedSignatureParams): SignedEmbedUrl {
  const { tenant, externalUserId, secret, ttlSeconds = 600 } = params;
  
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${tenant}.${externalUserId}.${timestamp}`;
  
  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  const baseUrl = process.env.REFERRALOS_EMBED_URL || 'https://referralos.example.com';
  const url = `${baseUrl}/embed/${tenant}?userId=${encodeURIComponent(externalUserId)}&ts=${timestamp}&sig=${signature}`;
  
  return {
    url,
    expiresAt: new Date((timestamp + ttlSeconds) * 1000),
  };
}
```

---

## Signature Verification (ReferralOS)

### Verification Steps

```
┌─────────────────┐
│  Incoming       │
│  Embed Request  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Extract Params │────>│  Missing Params │──> 400
│  tenant, userId,│     └─────────────────┘
│  ts, sig        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Check          │────>│  Expired        │──> 403
│  Timestamp TTL  │     │  (>10 min old)  │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Lookup Tenant  │────>│  Tenant Not     │──> 404
│  Get Secret     │     │  Found          │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Recompute      │────>│  Signature      │──> 403
│  Signature      │     │  Mismatch       │
│  Compare        │     └─────────────────┘
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Check Origin   │────>│  Origin Not     │──> 403
│  (if iframe)    │     │  Allowed        │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Render Widget  │
└─────────────────┘
```

### TypeScript Implementation

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

interface VerifyEmbedParams {
  tenant: string;
  userId: string;
  timestamp: number;
  signature: string;
  secret: string;
  ttlSeconds?: number;
}

function verifyEmbedSignature(params: VerifyEmbedParams): boolean {
  const { tenant, userId, timestamp, signature, secret, ttlSeconds = 600 } = params;
  
  // Check timestamp is not too old
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > ttlSeconds) {
    return false;
  }
  
  // Check timestamp is not in the future (with 30s tolerance)
  if (timestamp > now + 30) {
    return false;
  }
  
  // Recompute signature
  const message = `${tenant}.${userId}.${timestamp}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  // Timing-safe comparison
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
```

---

## TTL Configuration

| Setting | Default | Range |
|---------|---------|-------|
| Embed Signature TTL | 600 seconds (10 min) | 60 - 3600 seconds |
| Clock Skew Tolerance | 30 seconds | Fixed |

---

## Origin Allowlist

### Configuration

Each tenant can configure allowed origins for iframe embedding:

```json
{
  "allowed_origins": [
    "https://quoteos.com",
    "https://app.quoteos.com",
    "http://localhost:3000"
  ]
}
```

### Verification

```typescript
function verifyOrigin(requestOrigin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) {
    // No restrictions if empty (not recommended for production)
    return true;
  }
  
  return allowedOrigins.some(allowed => {
    // Exact match or wildcard subdomain
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      const originUrl = new URL(requestOrigin);
      return originUrl.hostname.endsWith(domain);
    }
    return requestOrigin === allowed;
  });
}
```

---

## Webhook Signatures

### Signature Format

```
X-ReferralOS-Signature: t=1735470600,v1=a1b2c3d4e5f6...
```

### Components

| Component | Description |
|-----------|-------------|
| `t` | Unix timestamp of signature generation |
| `v1` | HMAC-SHA256 signature (version 1) |

### Signature Computation

```typescript
function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp: number
): string {
  const message = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  return `t=${timestamp},v1=${signature}`;
}
```

---

## Webhook Verification (Host App)

```typescript
interface VerifyWebhookParams {
  payload: string;
  signatureHeader: string;
  secret: string;
  toleranceSeconds?: number;
}

function verifyWebhookSignature(params: VerifyWebhookParams): boolean {
  const { payload, signatureHeader, secret, toleranceSeconds = 300 } = params;
  
  // Parse header
  const parts = signatureHeader.split(',');
  const timestamp = parseInt(parts.find(p => p.startsWith('t='))?.slice(2) || '0');
  const signature = parts.find(p => p.startsWith('v1='))?.slice(3);
  
  if (!timestamp || !signature) {
    return false;
  }
  
  // Check timestamp
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }
  
  // Verify signature
  const message = `${timestamp}.${payload}`;
  const expectedSignature = createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch {
    return false;
  }
}
```

---

## Inputs

- **Embed Request**: tenant, userId, timestamp, signature
- **Webhook Delivery**: payload, signature header

---

## Outputs

- **Embed Access**: Authorized or rejected
- **Webhook Verification**: Valid or invalid

---

## Invariants

1. All signatures use HMAC-SHA256
2. Timing-safe comparison is always used
3. Expired signatures are always rejected
4. Secrets are never exposed in responses
5. Origin verification is enforced for iframes

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Clock skew between servers | 30-second tolerance |
| Malformed signature | Reject with 400 |
| Empty allowed origins | Allow all (dev only) |
| Signature replay | Rejected by timestamp check |

---

## Security Considerations

1. **Timing Attacks**: Use `timingSafeEqual` for all comparisons
2. **Replay Attacks**: Timestamp validation prevents reuse
3. **Clickjacking**: Origin allowlist prevents unauthorized embedding
4. **Secret Rotation**: Support multiple active secrets during rotation

---

## Acceptance Criteria

- [ ] Embed signatures are generated correctly by host apps
- [ ] Embed signatures are verified with timing-safe comparison
- [ ] Expired signatures are rejected
- [ ] Origin allowlist is enforced
- [ ] Webhook signatures follow the defined format
- [ ] Webhook verification is documented for host apps
