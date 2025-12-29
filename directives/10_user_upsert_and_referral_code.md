# 10 — User Upsert and Referral Code Generation

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the user upsert flow and automatic referral code generation for ReferralOS.

---

## Goals

1. Create or update user records from host app data
2. Automatically generate unique referral codes for new users
3. Support subscription tier updates
4. Maintain idempotency for all operations

---

## Non-Goals

- User authentication (handled by host app)
- Email verification
- Profile management beyond referral needs

---

## User Upsert Flow

```
┌─────────────────┐
│  POST /users    │
│  with payload   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Validate       │────>│  Invalid        │──> 400
│  Input          │     │  Payload        │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Check if user  │
│  exists by      │
│  externalUserId │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌───────┐
│ New   │ │Exists │
└───┬───┘ └───┬───┘
    │         │
    ▼         ▼
┌───────────────────────────────────────┐
│  Transaction Start                     │
├───────────────────────────────────────┤
│  1. Insert/Update user record          │
│  2. Generate referral code (if new)    │
│  3. Emit user.created event (if new)   │
│  4. Emit user.updated event (if exists)│
├───────────────────────────────────────┤
│  Transaction Commit                    │
└───────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  Return user    │
│  with code      │
└─────────────────┘
```

---

## Referral Code Generation

### Code Format

```
{PREFIX}{RANDOM}
```

| Component | Description | Example |
|-----------|-------------|---------|
| PREFIX | First 4-5 chars of name (uppercase, alphanumeric only) | `JOHND` |
| RANDOM | 3-4 random alphanumeric characters | `X7K2` |

### Examples

- John Doe → `JOHNDX7K2`
- Alice → `ALICM3P9`
- Bob Smith → `BOBSQ2R4`

### Generation Algorithm

```typescript
function generateReferralCode(name: string, tenantId: string): string {
  const sanitized = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  
  const prefix = sanitized.length >= 3 ? sanitized : 'REF';
  const random = generateRandomAlphanumeric(4);
  
  return `${prefix}${random}`;
}

function generateRandomAlphanumeric(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1
  let result = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}
```

### Collision Handling

1. Generate code
2. Check uniqueness in database (tenant-scoped)
3. If collision, regenerate with different random suffix
4. Max 5 attempts before failing

```typescript
async function generateUniqueCode(
  name: string,
  tenantId: string,
  maxAttempts = 5
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferralCode(name, tenantId);
    const exists = await checkCodeExists(tenantId, code);
    if (!exists) {
      return code;
    }
  }
  throw new Error('Failed to generate unique referral code');
}
```

---

## Input Validation

### Required Fields

| Field | Type | Constraints |
|-------|------|-------------|
| `externalUserId` | string | 1-255 chars, required |

### Optional Fields

| Field | Type | Constraints | Default |
|-------|------|-------------|---------|
| `email` | string | Valid email format | null |
| `name` | string | 1-255 chars | null |
| `subscriptionTier` | string | Enum: free, pro, power_pro | 'free' |

### Validation Schema

```typescript
const upsertUserSchema = z.object({
  externalUserId: z.string().min(1).max(255),
  email: z.string().email().optional(),
  name: z.string().min(1).max(255).optional(),
  subscriptionTier: z.enum(['free', 'pro', 'power_pro']).default('free'),
});
```

---

## Subscription Tier Updates

When a user's subscription tier changes:

1. Update the `subscription_tier` column
2. Future referral rewards use the new tier
3. Past rewards are not retroactively adjusted
4. Emit `user.updated` event with tier change

---

## Example Payloads

### Request: Create New User

```json
{
  "externalUserId": "user_abc123",
  "email": "john@example.com",
  "name": "John Doe",
  "subscriptionTier": "pro"
}
```

### Response: New User Created (201)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "externalUserId": "user_abc123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscriptionTier": "pro",
    "referralCode": "JOHNDX7K2",
    "createdAt": "2025-12-29T10:30:00Z",
    "updatedAt": "2025-12-29T10:30:00Z"
  },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z",
    "created": true
  }
}
```

### Request: Update Existing User

```json
{
  "externalUserId": "user_abc123",
  "subscriptionTier": "power_pro"
}
```

### Response: User Updated (200)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "externalUserId": "user_abc123",
    "email": "john@example.com",
    "name": "John Doe",
    "subscriptionTier": "power_pro",
    "referralCode": "JOHNDX7K2",
    "createdAt": "2025-12-29T10:30:00Z",
    "updatedAt": "2025-12-29T10:35:00Z"
  },
  "meta": {
    "timestamp": "2025-12-29T10:35:00Z",
    "created": false
  }
}
```

---

## Inputs

- **API Request**: User data from host app
- **Tenant Context**: From authenticated API key

---

## Outputs

- **User Record**: Created or updated user
- **Referral Code**: Generated for new users
- **Events**: user.created or user.updated

---

## Invariants

1. Each user has exactly one referral code per tenant
2. Referral codes are unique within a tenant
3. External user IDs are unique within a tenant
4. Upsert is idempotent (same input = same output)

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Empty name | Use 'REF' as prefix |
| Name with special chars | Strip non-alphanumeric |
| Code collision | Retry with new random suffix |
| Max collision retries | Return 500 error |
| Invalid email format | Return 400 error |

---

## Acceptance Criteria

- [ ] Users are created with unique referral codes
- [ ] Existing users are updated without changing codes
- [ ] Subscription tier updates are tracked
- [ ] Upsert is idempotent
- [ ] Code generation handles collisions
- [ ] Input validation rejects invalid data
