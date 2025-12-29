# 19 — Testing, Smoke Tests, and CI

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the testing strategy, smoke test requirements, and CI/CD pipeline for ReferralOS.

---

## Goals

1. Ensure code quality through automated testing
2. Catch regressions before deployment
3. Validate critical paths with smoke tests
4. Automate build and deployment pipeline

---

## Non-Goals

- Performance/load testing specifics
- Security penetration testing
- Manual QA procedures

---

## Testing Pyramid

```
        ┌─────────┐
        │   E2E   │  Few, slow, high confidence
        ├─────────┤
        │ Integr. │  Some, medium speed
        ├─────────┤
        │  Unit   │  Many, fast, focused
        └─────────┘
```

### Test Distribution

| Type | Coverage Target | Speed |
|------|-----------------|-------|
| Unit | 80%+ | < 1s each |
| Integration | Critical paths | < 5s each |
| E2E | Happy paths | < 30s each |

---

## Unit Tests

### Scope

- Pure functions
- Business logic
- Validation schemas
- Utility functions

### Example

```typescript
// lib/crypto/signatures.test.ts
import { describe, it, expect } from 'vitest';
import { generateEmbedSignature, verifyEmbedSignature } from './signatures';

describe('Embed Signatures', () => {
  const secret = 'test_secret_32_characters_long!!';
  
  it('generates valid signature', () => {
    const result = generateEmbedSignature({
      tenant: 'quoteos',
      externalUserId: 'user_123',
      secret,
    });
    
    expect(result.url).toContain('sig=');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });
  
  it('verifies valid signature', () => {
    const { url } = generateEmbedSignature({
      tenant: 'quoteos',
      externalUserId: 'user_123',
      secret,
    });
    
    const params = new URL(url).searchParams;
    const isValid = verifyEmbedSignature({
      tenant: 'quoteos',
      userId: params.get('userId')!,
      timestamp: parseInt(params.get('ts')!),
      signature: params.get('sig')!,
      secret,
    });
    
    expect(isValid).toBe(true);
  });
  
  it('rejects expired signature', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 700; // 11+ minutes ago
    
    const isValid = verifyEmbedSignature({
      tenant: 'quoteos',
      userId: 'user_123',
      timestamp: oldTimestamp,
      signature: 'any',
      secret,
      ttlSeconds: 600,
    });
    
    expect(isValid).toBe(false);
  });
});
```

---

## Integration Tests

### Scope

- API endpoints
- Database operations
- Service interactions

### Test Database

```typescript
// tests/setup.ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '@/db/client';
import { migrate } from '@/db/migrate';

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, referrals, rewards_ledger CASCADE`);
});

afterAll(async () => {
  await db.end();
});
```

### Example

```typescript
// tests/integration/referral-claim.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestTenant, createTestUser } from '../helpers';

describe('POST /api/v1/referrals/claim', () => {
  let tenant: Tenant;
  let referrer: User;
  let referred: User;
  
  beforeEach(async () => {
    tenant = await createTestTenant();
    referrer = await createTestUser(tenant.id, { tier: 'pro' });
    referred = await createTestUser(tenant.id);
  });
  
  it('creates referral and grants rewards', async () => {
    const response = await fetch('/api/v1/referrals/claim', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenant.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        referralCode: referrer.referralCode,
        referredUserId: referred.externalUserId,
      }),
    });
    
    expect(response.status).toBe(201);
    
    const { data } = await response.json();
    expect(data.referralId).toBeDefined();
    expect(data.rewards.referrer.amount).toBe(200); // Pro tier
  });
  
  it('returns existing referral on replay', async () => {
    // First claim
    await claimReferral(referrer.referralCode, referred.externalUserId);
    
    // Replay
    const response = await claimReferral(referrer.referralCode, referred.externalUserId);
    
    expect(response.status).toBe(200);
    expect(response.data.meta.created).toBe(false);
  });
});
```

---

## Smoke Tests

### Critical Paths

1. **User Upsert**: Create user, get referral code
2. **Referral Claim**: Claim code, verify rewards
3. **Webhook Delivery**: Event triggers webhook
4. **Embed Widget**: Load widget, display stats

### Smoke Test Script

```typescript
// tests/smoke/index.ts
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.SMOKE_TEST_URL || 'http://localhost:3000';
const API_KEY = process.env.SMOKE_TEST_API_KEY;

describe('Smoke Tests', () => {
  it('health check passes', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    expect(response.status).toBe(200);
  });
  
  it('can create user and get referral code', async () => {
    const response = await fetch(`${BASE_URL}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        externalUserId: `smoke_test_${Date.now()}`,
        name: 'Smoke Test User',
      }),
    });
    
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.referralCode).toBeDefined();
  });
  
  it('embed widget loads', async () => {
    // Generate signed URL and verify widget loads
    // ...
  });
});
```

---

## CI Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
```

---

## Test Commands

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run smoke tests
pnpm test:smoke

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch
```

---

## Coverage Requirements

| Metric | Minimum |
|--------|---------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

---

## Inputs

- **Source Code**: Files to test
- **Test Database**: Isolated test environment
- **CI Triggers**: Push, PR events

---

## Outputs

- **Test Results**: Pass/fail status
- **Coverage Report**: Code coverage metrics
- **Build Artifacts**: Deployable assets

---

## Invariants

1. All tests pass before merge
2. Coverage doesn't decrease
3. Smoke tests run post-deploy
4. Test data is isolated

---

## Acceptance Criteria

- [ ] Unit tests cover core logic
- [ ] Integration tests cover API endpoints
- [ ] Smoke tests validate critical paths
- [ ] CI pipeline runs on all PRs
- [ ] Coverage meets minimum thresholds
- [ ] Tests are isolated and repeatable
