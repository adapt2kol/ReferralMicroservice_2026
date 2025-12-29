# 07 — Authentication: API Keys and Scopes

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the API key authentication system, permission scopes, and access control mechanisms for ReferralOS.

---

## Goals

1. Secure API access with tenant-scoped API keys
2. Implement granular permission scopes
3. Support key rotation and revocation
4. Enable audit logging of all authenticated requests

---

## Non-Goals

- User authentication (handled by host apps)
- OAuth/OIDC implementation
- Session management

---

## API Key Format

### Structure

```
ros_api_{tenant_slug}_{random_24_hex}
```

### Examples

```
ros_api_quoteos_a1b2c3d4e5f6g7h8i9j0k1l2
ros_api_quoteos_f9e8d7c6b5a4938271605040
```

### Components

| Component | Description | Example |
|-----------|-------------|---------|
| Prefix | Identifies key type | `ros_api_` |
| Tenant Slug | Identifies tenant | `quoteos` |
| Random | Unique identifier | `a1b2c3d4e5f6g7h8i9j0k1l2` |

---

## Key Storage

### Hashing

API keys are stored as SHA-256 hashes. The original key is only shown once at creation.

```typescript
import { createHash } from 'crypto';

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

### Database Record

```typescript
interface ApiKeyRecord {
  id: string;
  tenant_id: string;
  key_hash: string;      // SHA-256 hash
  key_prefix: string;    // First 12 chars for identification
  name: string;          // Human-readable name
  scopes: string[];      // Permission scopes
  last_used_at: Date | null;
  use_count: number;
  expires_at: Date | null;
  is_active: boolean;
  created_at: Date;
  revoked_at: Date | null;
}
```

---

## Permission Scopes

### Available Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read` | Read referral data | GET /users, GET /stats |
| `write` | Create/update referrals | POST /users, POST /referrals/claim |
| `admin` | Tenant configuration | All /admin/* endpoints |
| `webhook` | Webhook management | GET/PUT /admin/webhooks |

### Scope Hierarchy

```
admin
  └── webhook
  └── write
        └── read
```

Admin scope includes all other scopes.

### Default Scopes

- **Public API Key**: `['read', 'write']`
- **Admin API Key**: `['admin']`

---

## Authentication Flow

### Request Authentication

```
┌─────────────────┐
│  Incoming       │
│  Request        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Extract API    │
│  Key from       │
│  Header         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Parse Key      │────>│  Invalid Format │──> 401
│  Format         │     └─────────────────┘
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Hash Key       │────>│  Key Not Found  │──> 401
│  Lookup in DB   │     └─────────────────┘
└────────┬────────┘
         │ Found
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Check Active   │────>│  Key Revoked    │──> 401
│  & Not Expired  │     └─────────────────┘
└────────┬────────┘
         │ Valid
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Check Scope    │────>│  Insufficient   │──> 403
│  for Endpoint   │     │  Permissions    │
└────────┬────────┘     └─────────────────┘
         │ Authorized
         ▼
┌─────────────────┐
│  Process        │
│  Request        │
└─────────────────┘
```

### Header Format

```http
Authorization: Bearer ros_api_quoteos_a1b2c3d4e5f6g7h8i9j0k1l2
```

Or:

```http
X-API-Key: ros_api_quoteos_a1b2c3d4e5f6g7h8i9j0k1l2
```

---

## API Key Management

### Create Key

```typescript
interface CreateApiKeyInput {
  tenantId: string;
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

interface CreateApiKeyResult {
  id: string;
  key: string;  // Only returned once!
  keyPrefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}
```

### Example Response (Create)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "key": "ros_api_quoteos_a1b2c3d4e5f6g7h8i9j0k1l2",
    "keyPrefix": "ros_api_quot",
    "name": "Production API Key",
    "scopes": ["read", "write"],
    "expiresAt": null,
    "createdAt": "2025-12-29T10:00:00Z"
  },
  "meta": {
    "warning": "Store this key securely. It will not be shown again."
  }
}
```

### List Keys

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "keyPrefix": "ros_api_quot",
      "name": "Production API Key",
      "scopes": ["read", "write"],
      "lastUsedAt": "2025-12-29T09:45:00Z",
      "useCount": 1523,
      "expiresAt": null,
      "isActive": true,
      "createdAt": "2025-12-29T10:00:00Z"
    }
  ]
}
```

### Revoke Key

```http
DELETE /api/admin/v1/api-keys/{id}
```

Revocation is immediate and permanent. The key cannot be reactivated.

---

## Rate Limiting by Key

| Scope | Rate Limit | Window |
|-------|------------|--------|
| `read` | 1000 req | 1 minute |
| `write` | 100 req | 1 minute |
| `admin` | 60 req | 1 minute |

Rate limits are per API key, not per tenant.

---

## Inputs

- **API Key**: In Authorization header or X-API-Key header
- **Endpoint**: Determines required scope

---

## Outputs

- **Authentication Context**: Tenant ID, scopes, key ID
- **Error Responses**: 401 Unauthorized, 403 Forbidden

---

## Invariants

1. API keys are never logged in full
2. Key hashes are stored, never plaintext keys
3. Revoked keys cannot be reactivated
4. All authenticated requests are audit logged
5. Keys are always scoped to a single tenant

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Expired key | 401 with `KEY_EXPIRED` error code |
| Revoked key | 401 with `KEY_REVOKED` error code |
| Missing header | 401 with `MISSING_API_KEY` error code |
| Invalid format | 401 with `INVALID_API_KEY_FORMAT` error code |
| Insufficient scope | 403 with `INSUFFICIENT_PERMISSIONS` error code |

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid or has been revoked",
    "details": {}
  }
}
```

### 403 Forbidden

```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "This API key does not have the required scope for this operation",
    "details": {
      "required_scope": "admin",
      "key_scopes": ["read", "write"]
    }
  }
}
```

---

## Acceptance Criteria

- [ ] API keys follow the defined format
- [ ] Keys are hashed before storage
- [ ] Scopes are enforced on all endpoints
- [ ] Rate limiting is applied per key
- [ ] Key creation returns key only once
- [ ] Revocation is immediate and permanent
- [ ] All authentication events are audit logged
