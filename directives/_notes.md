# _notes.md — Append-Only Learning Log

> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

This file captures learnings, edge cases, and integration gotchas discovered during development. It is **append-only** — never delete content, only add new entries.

---

## How to Use

1. Add new entries at the bottom of the relevant section
2. Include date and context for each entry
3. Reference related directive numbers where applicable
4. Keep entries concise but actionable

---

## Learnings

### 2025-12-29 — Initial Setup

- Repository scaffolded with directives pack
- Option C architecture chosen: ReferralOS manages ledger, host apps apply entitlements
- Multi-tenant isolation enforced at database query level

---

## Edge Cases Found

### Template

```
### YYYY-MM-DD — [Brief Title]
- **Context**: What were you trying to do?
- **Issue**: What unexpected behavior occurred?
- **Resolution**: How was it resolved?
- **Directive**: Which directive does this relate to?
```

---

## Provider Quirks

### Supabase

- Connection pooler URL required for serverless environments
- Service role key bypasses RLS (use carefully)
- Transactions require direct connection, not pooler

### Railway

- Health check must respond within 30 seconds
- Environment variables are injected at runtime
- Nixpacks builder auto-detects Node.js projects

---

## Integration Gotchas (QuoteOS)

### Template

```
### YYYY-MM-DD — [Brief Title]
- **Symptom**: What appeared to be wrong?
- **Cause**: What was the actual issue?
- **Fix**: How was it resolved?
```

---

## Open Questions

- None yet. Add questions here as they arise during development.

---

## Decisions Log

### 2025-12-29 — Architecture Decision: Option C

- **Decision**: Use ledger + webhook model (Option C)
- **Rationale**: Keeps ReferralOS decoupled from Stripe, allows host apps full control over entitlements
- **Trade-offs**: Host apps must implement webhook handlers and entitlement logic

---

## Reminders

- Always run migrations before deploying
- Never log full API keys
- Test webhook signature verification with real payloads
- Keep this file updated after each session
