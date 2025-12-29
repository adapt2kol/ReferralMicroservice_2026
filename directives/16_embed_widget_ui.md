# 16 — Embed Widget UI

> **Version**: 1.0.0  
> **Last Updated**: 2025-12-29T00:00:00Z  
> **Timezone**: Europe/London

---

## Purpose

Define the embeddable referral widget that host applications can integrate via iframe.

---

## Goals

1. Provide a branded, embeddable referral interface
2. Display user's referral link with copy functionality
3. Show referral statistics and rewards summary
4. Include "How it works" educational content

---

## Non-Goals

- Full referral management (admin functionality)
- User authentication (handled by host app)
- Direct reward redemption

---

## Widget Features

### 1. Referral Link Section

- Display shareable referral link
- One-click copy to clipboard
- Social sharing buttons (optional)
- QR code generation (optional)

### 2. Statistics Display

- Total referrals count
- Pending vs completed referrals
- Total rewards earned
- Current tier indicator

### 3. How It Works

- Step-by-step explanation
- Reward tiers breakdown
- Terms and conditions link

### 4. Branding

- Tenant logo
- Primary color theming
- Custom title and description

---

## Widget Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  Your Referral Program                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Share your unique link and earn rewards!                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  https://quoteos.com/signup?ref=JOHNDX7K2    [Copy] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Referrals  │  │   Pending   │  │   Earned    │        │
│  │     15      │  │      2      │  │  $30.00     │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  How it works                                               │
│                                                             │
│  1. Share your unique referral link                         │
│  2. Friends sign up using your link                         │
│  3. You earn rewards for each successful referral           │
│                                                             │
│  Pro tip: Upgrade to Pro for 2x rewards!                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Embed URL Format

```
https://referralos.example.com/embed/{tenant}?userId={externalUserId}&ts={timestamp}&sig={signature}
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `tenant` | Tenant slug (path) |
| `userId` | External user ID from host app |
| `ts` | Unix timestamp |
| `sig` | HMAC-SHA256 signature |

---

## Host App Integration

### iframe Embedding

```html
<iframe
  src="https://referralos.example.com/embed/quoteos?userId=user_abc123&ts=1735470600&sig=a1b2c3..."
  width="100%"
  height="400"
  frameborder="0"
  allow="clipboard-write"
  title="Referral Program"
></iframe>
```

### Responsive Container

```html
<div style="max-width: 600px; margin: 0 auto;">
  <iframe ... style="width: 100%; min-height: 400px; border: none;"></iframe>
</div>
```

---

## Widget API Endpoints

### Initialize Widget

```http
POST /api/embed/v1/init
```

Validates signature and returns widget configuration.

**Response:**

```json
{
  "data": {
    "tenant": {
      "name": "QuoteOS",
      "logoUrl": "https://quoteos.com/logo.png",
      "primaryColor": "#3B82F6"
    },
    "user": {
      "referralCode": "JOHNDX7K2",
      "referralLink": "https://quoteos.com/signup?ref=JOHNDX7K2"
    },
    "content": {
      "title": "Your Referral Program",
      "description": "Share your unique link and earn rewards!",
      "howItWorks": [
        "Share your unique referral link",
        "Friends sign up using your link",
        "You earn rewards for each successful referral"
      ]
    }
  }
}
```

### Get User Stats

```http
GET /api/embed/v1/stats
```

**Response:**

```json
{
  "data": {
    "totalReferrals": 15,
    "pendingReferrals": 2,
    "completedReferrals": 13,
    "totalRewardsEarned": 2600,
    "rewardsCurrency": "AUD",
    "currentTier": "pro"
  }
}
```

---

## Styling

### CSS Variables

```css
:root {
  --ros-primary: #3B82F6;
  --ros-primary-hover: #2563EB;
  --ros-background: #FFFFFF;
  --ros-text: #1F2937;
  --ros-text-muted: #6B7280;
  --ros-border: #E5E7EB;
  --ros-success: #10B981;
  --ros-radius: 8px;
}
```

### Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 480px | Single column |
| Tablet | 480-768px | Two column stats |
| Desktop | > 768px | Full layout |

---

## Accessibility

### Requirements

- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- Sufficient color contrast
- Focus indicators

### ARIA Labels

```html
<button aria-label="Copy referral link to clipboard">Copy</button>
<div role="status" aria-live="polite">Link copied!</div>
```

---

## Security

### Signature Validation

Every widget request must include valid signature:
- Tenant + userId + timestamp signed with HMAC-SHA256
- 10-minute TTL on signatures
- Origin validation against allowlist

### Content Security

- No inline scripts
- Strict CSP headers
- XSS prevention

---

## Inputs

- **Signed URL**: From host app
- **User Context**: External user ID

---

## Outputs

- **Widget UI**: Rendered in iframe
- **Clipboard**: Referral link copy

---

## Invariants

1. Widget only loads with valid signature
2. Expired signatures are rejected
3. Origin must be in allowlist
4. User data is scoped to authenticated user

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Expired signature | Show "Session expired" message |
| Invalid origin | Refuse to render |
| User not found | Show error, suggest contact support |
| No referrals yet | Show encouraging message |
| Copy fails | Show fallback "Select and copy" |

---

## Acceptance Criteria

- [ ] Widget renders with tenant branding
- [ ] Referral link displays correctly
- [ ] Copy to clipboard works
- [ ] Stats are accurate
- [ ] How it works section is clear
- [ ] Responsive on all screen sizes
- [ ] Accessible to screen readers
- [ ] Signature validation enforced
- [ ] Origin allowlist enforced
