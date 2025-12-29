# 20 — Railway Deployment

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the Railway deployment configuration and procedures for ReferralOS.

---

## Goals

1. Deploy ReferralOS API to Railway
2. Configure environment variables
3. Set up database connections
4. Enable automatic deployments

---

## Non-Goals

- Multi-region deployment
- Kubernetes configuration
- Custom domain SSL setup

---

## Railway Project Structure

```
ReferralOS (Project)
├── referralos-api (Service)
│   └── Next.js application
├── referralos-db (Service)
│   └── PostgreSQL (or use Supabase)
└── referralos-redis (Service)
    └── Redis for rate limiting/caching
```

---

## Service Configuration

### API Service

```toml
# railway.toml
[build]
builder = "nixpacks"
buildCommand = "pnpm install && pnpm build"

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Security
REFERRALOS_SIGNING_SECRET=ros_sign_...
WEBHOOK_SIGNING_SECRET=ros_whsec_...

# Application
NEXT_PUBLIC_BASE_URL=https://referralos-api.up.railway.app
DEFAULT_TENANT_SLUG=quoteos
NODE_ENV=production

# Rate Limiting
REDIS_URL=redis://...

# Webhook
WEBHOOK_RETRY_LIMIT=6
WEBHOOK_TIMEOUT_MS=30000
```

---

## Deployment Process

### Initial Setup

1. Create Railway project
2. Connect GitHub repository
3. Configure environment variables
4. Deploy initial version
5. Run database migrations
6. Verify health check

### Automatic Deployments

```yaml
# Triggered on push to main
main branch → Build → Test → Deploy → Health Check
```

### Manual Deployment

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link project
railway link

# Deploy
railway up
```

---

## Database Migrations

### Pre-Deploy Hook

```bash
# Run migrations before starting the app
pnpm db:migrate:prod && pnpm start
```

### Migration Script

```typescript
// scripts/migrate-prod.ts
import { migrate } from '@/db/migrate';

async function main() {
  console.log('Running production migrations...');
  await migrate();
  console.log('Migrations complete.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
```

---

## Health Checks

### Endpoint

```http
GET /health
```

### Response

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-12-29T10:30:00Z"
}
```

### Configuration

- **Path**: `/health`
- **Timeout**: 30 seconds
- **Interval**: 10 seconds
- **Threshold**: 3 failures

---

## Scaling

### Horizontal Scaling

```toml
[deploy]
numReplicas = 2
```

### Resource Limits

| Resource | Development | Production |
|----------|-------------|------------|
| Memory | 512 MB | 1 GB |
| CPU | 0.5 vCPU | 1 vCPU |
| Replicas | 1 | 2+ |

---

## Monitoring

### Railway Dashboard

- Deployment logs
- Resource usage
- Request metrics
- Error tracking

### Custom Metrics

Export to external monitoring:
- Prometheus endpoint
- Log aggregation
- Error tracking service

---

## Rollback Procedure

### Automatic Rollback

Railway automatically rolls back if:
- Health check fails after deploy
- Build fails

### Manual Rollback

```bash
# List deployments
railway deployments

# Rollback to specific deployment
railway rollback <deployment-id>
```

---

## Secrets Management

### Railway Variables

- Set via Railway dashboard
- Encrypted at rest
- Injected at runtime

### Rotation Procedure

1. Generate new secret
2. Add as new variable (e.g., `NEW_SIGNING_SECRET`)
3. Update code to accept both
4. Deploy
5. Remove old secret
6. Deploy again

---

## Domain Configuration

### Railway Domain

```
https://referralos-api.up.railway.app
```

### Custom Domain

1. Add domain in Railway dashboard
2. Configure DNS CNAME
3. Wait for SSL provisioning
4. Verify HTTPS works

---

## Inputs

- **Source Code**: GitHub repository
- **Environment Variables**: Railway dashboard
- **Migrations**: SQL files

---

## Outputs

- **Deployed Service**: Running API
- **Public URL**: Accessible endpoint
- **Logs**: Deployment and runtime logs

---

## Invariants

1. Migrations run before app starts
2. Health check must pass for deploy success
3. Environment variables are never logged
4. Rollback is always possible

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Migration fails | Abort deploy, keep old version |
| Health check timeout | Rollback automatically |
| Out of memory | Increase limits, optimize code |
| Database connection fails | Retry with backoff |

---

## Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connection verified
- [ ] Migrations tested locally
- [ ] Health check endpoint works
- [ ] Secrets are set (not committed)
- [ ] Build succeeds locally
- [ ] Smoke tests pass post-deploy

---

## Acceptance Criteria

- [ ] API deploys successfully to Railway
- [ ] Health check passes
- [ ] Database migrations run
- [ ] Environment variables are secure
- [ ] Automatic deployments work
- [ ] Rollback procedure is tested
