# 18 — Observability and Audit Logging

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the observability strategy and audit logging requirements for ReferralOS.

---

## Goals

1. Enable debugging and troubleshooting
2. Maintain compliance audit trail
3. Monitor system health and performance
4. Track all security-relevant events

---

## Non-Goals

- Real-time alerting infrastructure
- Log aggregation platform selection
- Compliance certification specifics

---

## Logging Strategy

### Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Unexpected failures | Database connection failed |
| `warn` | Recoverable issues | Rate limit approaching |
| `info` | Significant events | Referral claimed |
| `debug` | Development details | Query execution time |

### Log Format

```json
{
  "timestamp": "2025-12-29T10:30:00.123Z",
  "level": "info",
  "message": "Referral claimed successfully",
  "service": "referralos",
  "traceId": "abc123def456",
  "tenantId": "quoteos",
  "userId": "user_abc123",
  "data": {
    "referralId": "550e8400-e29b-41d4-a716-446655440002",
    "referralCode": "JOHNDX7K2"
  }
}
```

---

## Audit Log

### Audited Events

| Category | Events |
|----------|--------|
| **Authentication** | API key used, key created, key revoked |
| **Users** | User created, user updated |
| **Referrals** | Referral claimed, referral cancelled |
| **Rewards** | Reward granted, manual adjustment |
| **Configuration** | Settings changed, webhook updated |
| **Admin** | Admin login, config export |

### Audit Log Schema

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  actor_type VARCHAR(20) NOT NULL,  -- system, api_key, admin
  actor_id VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Audit Log Entry Example

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440100",
  "tenantId": "quoteos",
  "actorType": "api_key",
  "actorId": "ros_api_quot...",
  "action": "referral.claimed",
  "resourceType": "referral",
  "resourceId": "550e8400-e29b-41d4-a716-446655440002",
  "details": {
    "referrerUserId": "user_abc123",
    "referredUserId": "user_xyz789",
    "referralCode": "JOHNDX7K2"
  },
  "ipAddress": "203.0.113.42",
  "userAgent": "QuoteOS-Backend/1.0",
  "createdAt": "2025-12-29T10:30:00Z"
}
```

---

## Request Tracing

### Trace ID Propagation

```typescript
// Incoming request
const traceId = req.headers['x-request-id'] || generateTraceId();

// Add to all logs
logger.info('Processing request', { traceId });

// Pass to downstream calls
await fetch(url, {
  headers: {
    'X-Request-ID': traceId,
  },
});

// Include in response
res.setHeader('X-Request-ID', traceId);
```

### Trace ID Format

```
ros_{timestamp}_{random}
Example: ros_1735470600_a1b2c3d4
```

---

## Metrics

### Key Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `referralos_requests_total` | Counter | Total API requests |
| `referralos_request_duration_ms` | Histogram | Request latency |
| `referralos_referrals_total` | Counter | Total referrals claimed |
| `referralos_rewards_total` | Counter | Total rewards granted |
| `referralos_webhook_deliveries` | Counter | Webhook delivery attempts |
| `referralos_errors_total` | Counter | Error count by type |

### Labels

- `tenant`: Tenant slug
- `endpoint`: API endpoint
- `method`: HTTP method
- `status`: Response status code

---

## Health Checks

### Endpoints

```http
GET /health          # Basic liveness
GET /health/ready    # Full readiness
```

### Liveness Response

```json
{
  "status": "ok",
  "timestamp": "2025-12-29T10:30:00Z"
}
```

### Readiness Response

```json
{
  "status": "ok",
  "timestamp": "2025-12-29T10:30:00Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 5 },
    "redis": { "status": "ok", "latencyMs": 2 }
  }
}
```

---

## Error Tracking

### Error Context

```typescript
interface ErrorContext {
  traceId: string;
  tenantId?: string;
  userId?: string;
  endpoint: string;
  method: string;
  errorCode: string;
  errorMessage: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}
```

### Sensitive Data Redaction

Never log:
- API keys (full)
- Webhook secrets
- User emails (hash if needed)
- IP addresses in debug logs

---

## Log Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Application logs | 30 days | Log aggregator |
| Audit logs | 2 years | Database |
| Error traces | 90 days | Error tracker |
| Metrics | 1 year | Metrics store |

---

## Inputs

- **Application Events**: All significant actions
- **HTTP Requests**: All API calls
- **System Events**: Health, errors

---

## Outputs

- **Structured Logs**: JSON format
- **Audit Trail**: Database records
- **Metrics**: Prometheus format
- **Health Status**: HTTP endpoints

---

## Invariants

1. All requests have trace IDs
2. Audit logs are immutable
3. Sensitive data is never logged
4. Errors include sufficient context
5. Health checks are always available

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Log storage full | Alert, continue with reduced retention |
| Audit write fails | Retry, then fail request |
| Metrics unavailable | Continue without metrics |
| Trace ID missing | Generate new one |

---

## Acceptance Criteria

- [ ] All requests are logged with trace IDs
- [ ] Audit log captures all specified events
- [ ] Sensitive data is never logged
- [ ] Health endpoints respond correctly
- [ ] Metrics are exposed
- [ ] Log format is consistent
- [ ] Retention policies are enforced
