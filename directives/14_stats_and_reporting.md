# 14 — Statistics and Reporting

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the statistics and reporting capabilities for ReferralOS, enabling tenants and users to understand referral performance.

---

## Goals

1. Provide user-level referral statistics
2. Provide tenant-level aggregate statistics
3. Support date range filtering
4. Enable top referrer leaderboards

---

## Non-Goals

- Real-time analytics dashboards
- Data export functionality
- Custom report generation
- Historical trend analysis

---

## User Statistics

### Endpoint

```http
GET /api/v1/users/:externalUserId/stats
```

### Response

```json
{
  "data": {
    "userId": "user_abc123",
    "totalReferrals": 15,
    "pendingReferrals": 2,
    "completedReferrals": 13,
    "totalRewardsEarned": 2600,
    "rewardsCurrency": "AUD",
    "referralsByTier": {
      "free": 5,
      "pro": 7,
      "power_pro": 1
    },
    "referralCode": "JOHNDX7K2",
    "referralLink": "https://quoteos.com/signup?ref=JOHNDX7K2"
  },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z"
  }
}
```

### Query Implementation

```sql
SELECT 
  u.external_user_id,
  COUNT(r.id) as total_referrals,
  COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending_referrals,
  COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as completed_referrals,
  COALESCE(SUM(rl.amount), 0) as total_rewards_earned
FROM users u
LEFT JOIN referrals r ON r.referrer_user_id = u.id
LEFT JOIN rewards_ledger rl ON rl.user_id = u.id
WHERE u.tenant_id = $1 AND u.external_user_id = $2
GROUP BY u.id, u.external_user_id;
```

---

## Tenant Statistics

### Endpoint

```http
GET /api/admin/v1/stats?startDate=2025-12-01&endDate=2025-12-31
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startDate` | ISO date | 30 days ago | Start of period |
| `endDate` | ISO date | Today | End of period |

### Response

```json
{
  "data": {
    "period": {
      "start": "2025-12-01T00:00:00Z",
      "end": "2025-12-31T23:59:59Z"
    },
    "summary": {
      "totalUsers": 1250,
      "newUsersInPeriod": 340,
      "totalReferrals": 520,
      "referralsInPeriod": 85,
      "totalRewardsGranted": 104000,
      "rewardsInPeriod": 17000,
      "rewardsCurrency": "AUD"
    },
    "metrics": {
      "conversionRate": 0.27,
      "averageReferralsPerUser": 0.42,
      "averageRewardPerReferral": 200
    },
    "breakdown": {
      "referralsByTier": {
        "free": 45,
        "pro": 32,
        "power_pro": 8
      },
      "referralsByDay": [
        { "date": "2025-12-01", "count": 3 },
        { "date": "2025-12-02", "count": 5 }
      ]
    },
    "topReferrers": [
      {
        "rank": 1,
        "externalUserId": "user_abc123",
        "name": "John Doe",
        "referralCount": 15,
        "rewardsEarned": 3000,
        "tier": "power_pro"
      },
      {
        "rank": 2,
        "externalUserId": "user_def456",
        "name": "Jane Smith",
        "referralCount": 12,
        "rewardsEarned": 2400,
        "tier": "pro"
      }
    ]
  },
  "meta": {
    "timestamp": "2025-12-29T10:30:00Z",
    "generatedAt": "2025-12-29T10:30:00Z"
  }
}
```

---

## Metrics Calculations

### Conversion Rate

```
conversionRate = completedReferrals / totalUsers
```

Represents the percentage of users who have successfully referred at least one person.

### Average Referrals Per User

```
averageReferralsPerUser = totalReferrals / totalUsers
```

### Average Reward Per Referral

```
averageRewardPerReferral = totalRewardsGranted / totalReferrals
```

---

## Top Referrers Query

```sql
SELECT 
  u.external_user_id,
  u.name,
  u.subscription_tier,
  COUNT(r.id) as referral_count,
  COALESCE(SUM(rl.amount), 0) as rewards_earned
FROM users u
LEFT JOIN referrals r ON r.referrer_user_id = u.id
  AND r.status = 'completed'
  AND r.completed_at BETWEEN $2 AND $3
LEFT JOIN rewards_ledger rl ON rl.user_id = u.id
  AND rl.event_type = 'referral_reward'
  AND rl.created_at BETWEEN $2 AND $3
WHERE u.tenant_id = $1
GROUP BY u.id
HAVING COUNT(r.id) > 0
ORDER BY referral_count DESC, rewards_earned DESC
LIMIT 10;
```

---

## Referrals by Day Query

```sql
SELECT 
  DATE(claimed_at) as date,
  COUNT(*) as count
FROM referrals
WHERE tenant_id = $1
  AND claimed_at BETWEEN $2 AND $3
GROUP BY DATE(claimed_at)
ORDER BY date;
```

---

## Caching Strategy

### User Stats

- Cache TTL: 5 minutes
- Cache key: `stats:user:{tenantId}:{externalUserId}`
- Invalidate on: referral claim, reward grant

### Tenant Stats

- Cache TTL: 15 minutes
- Cache key: `stats:tenant:{tenantId}:{startDate}:{endDate}`
- Invalidate on: significant data changes

---

## Inputs

- **User ID**: For user-level stats
- **Date Range**: For tenant-level filtering
- **Tenant Context**: From authenticated API key

---

## Outputs

- **User Stats**: Individual referral performance
- **Tenant Stats**: Aggregate metrics and leaderboards

---

## Invariants

1. Stats are derived from source data (not pre-aggregated)
2. Date ranges are inclusive
3. Currency is consistent within a tenant
4. Top referrers list is limited to 10

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No referrals in period | Return zeros |
| User not found | Return 404 |
| Invalid date range | Return 400 |
| Future dates | Allow (returns zeros) |

---

## Acceptance Criteria

- [ ] User stats return accurate counts
- [ ] Tenant stats support date filtering
- [ ] Top referrers are correctly ranked
- [ ] Metrics are calculated correctly
- [ ] Empty results return zeros, not errors
- [ ] Caching improves performance
