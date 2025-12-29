# 03 — Environment Setup

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the environment configuration, required services, and setup procedures for developing and deploying ReferralOS.

---

## Goals

1. Establish consistent development environments across team members
2. Define all required environment variables
3. Document external service dependencies
4. Provide clear setup instructions for local development

---

## Non-Goals

- Production deployment procedures (see `20_railway_deploy.md`)
- Database schema setup (see `06_migrations_and_seeding.md`)
- CI/CD pipeline configuration (see `19_testing_smoke_and_ci.md`)

---

## Required Services

### Core Services

| Service | Purpose | Environment |
|---------|---------|-------------|
| **Supabase** | PostgreSQL database + Auth | All |
| **Railway** | API hosting | Production |
| **Node.js 20+** | Runtime | All |

### Development Tools

| Tool | Purpose | Required |
|------|---------|----------|
| **pnpm** | Package manager | Yes |
| **TypeScript 5+** | Type checking | Yes |
| **ESLint** | Linting | Yes |
| **Prettier** | Formatting | Yes |

---

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/referralos

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Security
REFERRALOS_SIGNING_SECRET=ros_sign_32_char_random_string_here
WEBHOOK_SIGNING_SECRET=ros_whsec_32_char_random_string_here

# Application
NEXT_PUBLIC_BASE_URL=http://localhost:3000
DEFAULT_TENANT_SLUG=quoteos

# Webhook Configuration
WEBHOOK_RETRY_LIMIT=6
WEBHOOK_TIMEOUT_MS=30000
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Development
ENABLE_DEBUG_ENDPOINTS=false
MOCK_WEBHOOKS=false
```

---

## Environment Files

### File Hierarchy

```
/
├── .env.example      # Template with example values (committed)
├── .env              # Local development (gitignored)
├── .env.local        # Local overrides (gitignored)
├── .env.test         # Test environment (gitignored)
└── .env.production   # Production values (gitignored, managed by Railway)
```

### Loading Order

1. `.env` (base)
2. `.env.local` (overrides)
3. Environment-specific (`.env.test`, `.env.production`)
4. Process environment variables (highest priority)

---

## Local Development Setup

### Step 1: Clone and Install

```bash
git clone <repository-url>
cd referralos
pnpm install
```

### Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env with your local values
```

### Step 3: Setup Supabase

1. Create a new Supabase project
2. Copy the project URL and service role key to `.env`
3. Run migrations (see `06_migrations_and_seeding.md`)

### Step 4: Generate Secrets

```bash
# Generate signing secrets (run in terminal)
node -e "console.log('REFERRALOS_SIGNING_SECRET=ros_sign_' + require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log('WEBHOOK_SIGNING_SECRET=ros_whsec_' + require('crypto').randomBytes(24).toString('hex'))"
```

### Step 5: Start Development Server

```bash
pnpm dev
```

---

## Secret Generation Rules

### Signing Secrets

- Minimum 32 characters
- Use cryptographically secure random generation
- Prefix with purpose identifier:
  - `ros_sign_` for embed signing
  - `ros_whsec_` for webhook signing
  - `ros_api_` for API keys

### API Keys

- Format: `ros_api_{tenant_slug}_{random_24_hex}`
- Example: `ros_api_quoteos_a1b2c3d4e5f6g7h8i9j0k1l2`

---

## Supabase Configuration

### Required Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### Connection Pooling

- Use connection pooler URL for application connections
- Use direct URL for migrations only
- Pool mode: Transaction

### Row Level Security

- RLS is enabled on all tables
- Service role key bypasses RLS (use only server-side)
- Anon key should never be used in ReferralOS

---

## Inputs

- **Developer**: Environment variable values
- **Supabase**: Project credentials
- **Railway**: Deployment configuration

---

## Outputs

- **Configured Environment**: Ready for development/deployment
- **Generated Secrets**: Secure signing keys

---

## Invariants

1. `.env` files with real secrets are never committed
2. All secrets are generated with cryptographic randomness
3. Service role keys are only used server-side
4. Environment variables are validated at startup

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Missing required env var | Fail fast with clear error message |
| Invalid DATABASE_URL format | Validate and reject at startup |
| Expired Supabase key | Return 500 with logged error |
| Local port conflict | Suggest alternative port |

---

## Validation Script

```typescript
// lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(100),
  REFERRALOS_SIGNING_SECRET: z.string().min(32),
  WEBHOOK_SIGNING_SECRET: z.string().min(32),
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  DEFAULT_TENANT_SLUG: z.string().min(1),
  WEBHOOK_RETRY_LIMIT: z.coerce.number().int().min(1).max(10).default(6),
});

export const env = envSchema.parse(process.env);
```

---

## Acceptance Criteria

- [ ] All required environment variables are documented
- [ ] `.env.example` contains safe example values
- [ ] Secret generation produces cryptographically secure values
- [ ] Environment validation fails fast with clear errors
- [ ] Local development can start with minimal setup
- [ ] No secrets are ever committed to version control
