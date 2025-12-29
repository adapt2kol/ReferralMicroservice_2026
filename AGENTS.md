# AGENTS.md — Agent Instructions for Cursor/Copilot

> **This file mirrors `directives/00_agent_operating_system.md`**
> 
> The canonical source of truth is in the directives folder. This file exists to ensure agents read the operating system rules at session start.

---

# 00 — Agent Operating System

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

This document defines the operating principles, constraints, and behavioral rules for any AI agent working on the ReferralOS codebase. It serves as the canonical source of truth for agent behavior across all AI platforms (Claude, Cursor, Gemini, etc.).

---

## Goals

1. Ensure consistent, predictable agent behavior across sessions and platforms
2. Prevent destructive actions and maintain codebase integrity
3. Establish clear boundaries between what agents can and cannot do
4. Provide a repeatable framework for multi-session development
5. Maintain security posture (no secret leakage, no unauthorized external calls)

---

## Non-Goals

- This document does not define product features (see `01_product_scope_option_c.md`)
- This document does not specify implementation details (see individual directives)
- This document is not a tutorial for using AI agents

---

## Core Principles

### 1. Directive-Driven Development

- **Always read directives first** before implementing any feature
- Directives in `directives/` are the source of truth for requirements
- If a directive conflicts with a user request, clarify before proceeding
- Never implement features not covered by a directive without explicit approval

### 2. Incremental, Verifiable Changes

- Make small, focused changes that can be tested independently
- After each significant change, verify it works before proceeding
- Prefer editing existing files over creating new ones unless necessary
- Never delete code without explicit instruction

### 3. No Placeholders, No Stubs

- All generated code must be immediately runnable
- Never use `TODO`, `FIXME`, `[fill in]`, or placeholder comments
- If you cannot complete something, stop and ask rather than stub it out
- All imports, dependencies, and configurations must be complete

### 4. Security First

- **Never hardcode secrets** — use environment variables
- Never log sensitive data (API keys, tokens, passwords, PII)
- Always validate and sanitize inputs
- Use parameterized queries for all database operations
- Sign all webhooks and embed tokens with HMAC-SHA256

### 5. Idempotency by Default

- All write operations must be idempotent where possible
- Use unique constraints to prevent duplicate records
- Wrap multi-step operations in transactions
- Replaying an operation must produce the same result without side effects

---

## File System Rules

### Read Before Write

- Always read a file before editing it
- Understand the existing structure and patterns
- Preserve existing code style, indentation, and conventions

### Directory Structure

```
/
├── directives/     # SOPs and requirements (read-only for agents)
├── execution/      # Deterministic scripts, migrations, seeds
├── db/             # Database schema, types, queries
├── lib/            # Shared utilities, helpers, constants
├── app/            # Application code (API routes, UI components)
├── .tmp/           # Temporary files (gitignored except .gitkeep)
├── README.md       # Project overview
├── .env.example    # Example environment variables
└── .gitignore      # Git ignore rules
```

### Protected Paths

- `directives/` — Agents should not modify directive files unless explicitly instructed
- `.env` — Never read, write, or reference actual environment files
- `node_modules/` — Never modify

---

## Code Generation Rules

### Language and Framework Defaults

- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Deployment**: Railway (API) + Netlify (optional admin UI)

### TypeScript Standards

- Use strict mode (`"strict": true`)
- Prefer `interface` over `type` for object shapes
- Use explicit return types on exported functions
- Avoid `any` — use `unknown` and narrow types
- Use Zod for runtime validation of external inputs

### Naming Conventions

- **Files**: `kebab-case.ts` for modules, `PascalCase.tsx` for React components
- **Variables/Functions**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Database Tables**: `snake_case`
- **Database Columns**: `snake_case`
- **API Routes**: `kebab-case` (e.g., `/api/referral-codes`)

### Import Order

1. Node.js built-ins
2. External packages
3. Internal aliases (`@/lib`, `@/db`, etc.)
4. Relative imports
5. Type-only imports last

---

## API Design Rules

### RESTful Conventions

- Use appropriate HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Return appropriate status codes (200, 201, 400, 401, 403, 404, 409, 500)
- Use JSON for request and response bodies
- Include `Content-Type: application/json` header

### Error Response Format

```json
{
  "error": {
    "code": "REFERRAL_NOT_FOUND",
    "message": "The referral code does not exist or has expired",
    "details": {}
  }
}
```

### Success Response Format

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z"
  }
}
```

---

## Database Rules

### Migrations

- All schema changes must go through migrations in `execution/migrations/`
- Migrations are numbered sequentially: `001_create_tenants.sql`
- Never modify a migration after it has been applied
- Use `IF NOT EXISTS` for safety where appropriate

### Transactions

- Wrap multi-table writes in transactions
- Use `SERIALIZABLE` isolation for critical operations (e.g., claiming referrals)
- Always handle transaction rollback on error

### Soft Deletes

- Prefer soft deletes (`deleted_at` timestamp) over hard deletes
- Filter out soft-deleted records in queries by default

---

## Testing Rules

### Test Before Merge

- All new features must have corresponding tests
- Run smoke tests before considering a feature complete
- Use realistic test data, not obviously fake data

### Test Isolation

- Tests must not depend on external services
- Mock external APIs in tests
- Each test must clean up after itself

---

## Session Continuity

### Starting a Session

1. Read `directives/00_agent_operating_system.md` (this file)
2. Read `directives/_notes.md` for accumulated learnings
3. Check `README.md` for current project state
4. Review recent git history if available

### Ending a Session

1. Ensure all changes are saved
2. Update `directives/_notes.md` with any learnings or edge cases discovered
3. Leave the codebase in a working state (no broken builds)

### Handoff Protocol

- If stopping mid-task, document current state in `_notes.md`
- List any pending items or blockers
- Never leave uncommitted breaking changes

---

## Forbidden Actions

1. **Never** execute commands that delete files without explicit approval
2. **Never** make external API calls to production services during development
3. **Never** commit or log secrets, API keys, or credentials
4. **Never** modify `.env` files directly
5. **Never** bypass authentication or authorization checks
6. **Never** disable security features "temporarily"
7. **Never** use `eval()` or dynamic code execution
8. **Never** trust user input without validation

---

## Escalation Protocol

If you encounter any of the following, **stop and ask for clarification**:

- Conflicting requirements between directives
- Security-sensitive operations not covered by directives
- Requests to bypass established patterns
- Uncertainty about multi-tenant isolation
- Database migrations that could cause data loss
- External service integrations not documented

---

## Acceptance Criteria for This Directive

- [ ] Agent reads this file at the start of every session
- [ ] Agent follows all rules defined herein
- [ ] Agent escalates appropriately when encountering edge cases
- [ ] Agent maintains session continuity via `_notes.md`
- [ ] No secrets are ever leaked in code, logs, or responses
