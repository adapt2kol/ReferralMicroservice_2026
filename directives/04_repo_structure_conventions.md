# 04 — Repository Structure and Conventions

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the repository structure, file organization, and coding conventions for ReferralOS. This ensures consistency across the codebase and enables efficient navigation.

---

## Goals

1. Establish a clear, predictable folder structure
2. Define naming conventions for files, functions, and variables
3. Specify code organization patterns
4. Enable easy onboarding for new contributors

---

## Non-Goals

- Detailed implementation of specific features
- Framework-specific patterns (covered in individual directives)
- Deployment configuration (see `20_railway_deploy.md`)

---

## Directory Structure

```
/
├── directives/                 # SOPs and requirements documentation
│   ├── 00_agent_operating_system.md
│   ├── 01_product_scope_option_c.md
│   └── ...
│
├── execution/                  # Deterministic scripts and migrations
│   ├── migrations/            # Database migrations
│   │   ├── 001_create_tenants.sql
│   │   └── ...
│   ├── seeds/                 # Seed data scripts
│   │   ├── 001_default_tenant.sql
│   │   └── ...
│   └── scripts/               # Utility scripts
│       ├── generate-api-key.ts
│       └── ...
│
├── db/                        # Database layer
│   ├── schema.ts              # Drizzle schema definitions
│   ├── client.ts              # Database client setup
│   ├── queries/               # Query functions
│   │   ├── tenants.ts
│   │   ├── users.ts
│   │   ├── referrals.ts
│   │   └── rewards.ts
│   └── types.ts               # Database types
│
├── lib/                       # Shared utilities
│   ├── constants.ts           # Application constants
│   ├── env.ts                 # Environment validation
│   ├── errors.ts              # Error classes
│   ├── crypto/                # Cryptographic utilities
│   │   ├── hmac.ts
│   │   └── signatures.ts
│   ├── validation/            # Zod schemas
│   │   ├── api.ts
│   │   └── webhook.ts
│   └── utils/                 # General utilities
│       ├── date.ts
│       └── id.ts
│
├── app/                       # Next.js App Router
│   ├── api/                   # API routes
│   │   ├── v1/               # Public API v1
│   │   │   ├── users/
│   │   │   ├── referrals/
│   │   │   └── ...
│   │   ├── admin/            # Admin API
│   │   │   └── v1/
│   │   ├── embed/            # Embed API
│   │   │   └── v1/
│   │   └── webhooks/         # Incoming webhooks
│   ├── embed/                 # Embed widget pages
│   │   └── [tenant]/
│   ├── admin/                 # Admin UI pages
│   │   └── ...
│   ├── layout.tsx
│   └── page.tsx
│
├── components/                # React components
│   ├── ui/                    # Base UI components
│   ├── embed/                 # Embed widget components
│   └── admin/                 # Admin UI components
│
├── services/                  # Business logic services
│   ├── referral.service.ts
│   ├── reward.service.ts
│   ├── tenant.service.ts
│   ├── webhook.service.ts
│   └── types.ts
│
├── .tmp/                      # Temporary files (gitignored)
│   └── .gitkeep
│
├── tests/                     # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── .gitignore
├── CLAUDE.md
├── AGENTS.md
├── GEMINI.md
├── README.md
├── package.json
├── tsconfig.json
├── next.config.js
└── tailwind.config.js
```

---

## Naming Conventions

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| Directories | `kebab-case` | `api-keys/`, `reward-rules/` |
| TypeScript modules | `kebab-case.ts` | `referral.service.ts` |
| React components | `PascalCase.tsx` | `ReferralWidget.tsx` |
| Test files | `*.test.ts` or `*.spec.ts` | `referral.service.test.ts` |
| Type definition files | `*.types.ts` | `api.types.ts` |
| Constants files | `constants.ts` | `lib/constants.ts` |

### Code Elements

| Type | Convention | Example |
|------|------------|---------|
| Variables | `camelCase` | `referralCode`, `userId` |
| Functions | `camelCase` | `claimReferral()`, `generateCode()` |
| Classes | `PascalCase` | `ReferralService`, `WebhookDispatcher` |
| Interfaces | `PascalCase` | `ReferralClaim`, `TenantConfig` |
| Types | `PascalCase` | `RewardType`, `WebhookEvent` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_RETRY_COUNT`, `DEFAULT_TTL` |
| Enums | `PascalCase` (members too) | `RewardType.ReferralBonus` |
| Database tables | `snake_case` | `referral_codes`, `rewards_ledger` |
| Database columns | `snake_case` | `external_user_id`, `created_at` |
| API routes | `kebab-case` | `/api/v1/referral-codes` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `DATABASE_URL` |

---

## Import Conventions

### Path Aliases

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/db/*": ["./db/*"],
      "@/lib/*": ["./lib/*"],
      "@/services/*": ["./services/*"],
      "@/components/*": ["./components/*"]
    }
  }
}
```

### Import Order

```typescript
// 1. Node.js built-ins
import { createHash } from 'crypto';

// 2. External packages
import { z } from 'zod';
import { NextRequest } from 'next/server';

// 3. Internal aliases
import { db } from '@/db/client';
import { env } from '@/lib/env';
import { ReferralService } from '@/services/referral.service';

// 4. Relative imports
import { validateRequest } from './middleware';

// 5. Type-only imports
import type { Referral } from '@/db/types';
```

---

## Code Organization Patterns

### Service Layer Pattern

```typescript
// services/referral.service.ts
export class ReferralService {
  constructor(private db: Database) {}

  async claimReferral(input: ClaimInput): Promise<ClaimResult> {
    // Business logic here
  }
}
```

### API Route Pattern

```typescript
// app/api/v1/referrals/claim/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ReferralService } from '@/services/referral.service';
import { withAuth } from '@/lib/middleware/auth';
import { withErrorHandling } from '@/lib/middleware/error';

const claimSchema = z.object({
  referralCode: z.string().min(1),
  referredUserId: z.string().uuid(),
});

export const POST = withErrorHandling(
  withAuth(async (req: NextRequest, context: AuthContext) => {
    const body = await req.json();
    const input = claimSchema.parse(body);
    
    const service = new ReferralService(db);
    const result = await service.claimReferral({
      ...input,
      tenantId: context.tenantId,
    });
    
    return NextResponse.json({ data: result });
  })
);
```

### Database Query Pattern

```typescript
// db/queries/referrals.ts
import { db } from '@/db/client';
import { referrals } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function findReferralByCode(
  tenantId: string,
  code: string
): Promise<Referral | null> {
  const [referral] = await db
    .select()
    .from(referrals)
    .where(and(
      eq(referrals.tenantId, tenantId),
      eq(referrals.code, code)
    ))
    .limit(1);
  
  return referral ?? null;
}
```

---

## Inputs

- **Developer**: Code contributions following conventions
- **Linter**: Automated style enforcement

---

## Outputs

- **Consistent Codebase**: Predictable structure and naming
- **Maintainable Code**: Easy to navigate and modify

---

## Invariants

1. All new files follow naming conventions
2. All imports use path aliases where available
3. All database queries are in `db/queries/`
4. All business logic is in `services/`
5. All API routes follow the established pattern

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Legacy file doesn't follow convention | Rename in dedicated refactor PR |
| Ambiguous naming | Prefer clarity over brevity |
| Circular imports | Restructure to break cycle |
| Large file (>300 lines) | Split into smaller modules |

---

## Acceptance Criteria

- [ ] Directory structure matches specification
- [ ] All files follow naming conventions
- [ ] Path aliases are configured and used
- [ ] Import order is consistent
- [ ] Code patterns are documented and followed
- [ ] ESLint rules enforce conventions
