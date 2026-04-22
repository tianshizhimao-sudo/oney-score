# Report Integration Contract

## Purpose

Defines the backend contract for the `Generate my lending report` flow on
`score.oneyco.com.au`.

Two modes:

- **`mock` mode** — default. Works fully on GitHub Pages with no backend.
  Reports are encoded into a hash fragment and also persisted to
  `localStorage` for same-device access.
- **`live` mode** — single submit endpoint drives the downstream
  workflow (lead capture, user email, optional broker share,
  internal notification). Enabled by injecting
  `window.ONEY_REPORT_CONFIG`.

The frontend is written so switching from mock to live is an
**adapter/config change**, not a rewrite.

See also: [`docs/report-email-templates.md`](./report-email-templates.md)
for the email content contract.

---

## Naming convention

Transport, persistence, share URL, and email-template payloads are
**`snake_case` only** — one contract, no aliases. See commit history
for the rule enforcement.

TypeScript interfaces below are illustrative shape references. Whatever
the developer-facing app type signatures look like, the wire payload is
always snake_case and the serializer is the single mapping boundary.

---

## Frontend config contract

The site checks for a global config object:

```ts
declare global {
  interface Window {
    ONEY_REPORT_CONFIG?: {
      mode?: 'mock' | 'live';
      apiBaseUrl?: string;
      endpoints?: {
        submitReport?: string; // default '/score-report/submit'
        getReport?: string;    // default '/score-report/report'
        unsubscribe?: string;  // default '/score-report/unsubscribe'
      };
      analytics?: {
        enabled?: boolean;
        provider?: string;
      };
      productVersion?: string;
      scoringVersion?: string;
      disclaimerVersion?: string;
      reportViewerUrl?: string;   // default `${origin}/report.html`
      requestTimeoutMs?: number;  // default 10000
    };
  }
}
```

### Example injection (live mode)

```html
<script>
  window.ONEY_REPORT_CONFIG = {
    mode: 'live',
    apiBaseUrl: 'https://api.example.com',
    endpoints: {
      submitReport: '/score-report/submit',
      getReport:    '/score-report/report',
      unsubscribe:  '/score-report/unsubscribe'
    },
    analytics:        { enabled: true, provider: 'ga4' },
    productVersion:   'bank-ready-score-v1',
    scoringVersion:   'bank-ready-v1',
    disclaimerVersion:'2026-04'
  };
</script>
```

### Fallback rule

If `window.ONEY_REPORT_CONFIG` is missing or `mode !== 'live'`:

- default to mock mode
- never fail the UI
- continue the report flow using the local adapter

Secrets **never** live in this config. Authenticate the backend edge
(Cloudflare Worker, API Gateway + IAM, signed webhook receivers, etc).

---

## Core payload model

Every submit sends one `ReportSubmitRequest`. The wire shape is
snake_case (TS interface below is illustrative).

```ts
// Developer-facing shape (illustrative)
export interface ReportSubmitRequest {
  lead: {
    firstName: string;
    email: string;
    businessName?: string;
    mobile?: string;
    wantsFollowUp: boolean;
  };
  share?: {
    enabled: boolean;
    recipientType?: 'broker' | 'lender' | 'banker' | 'other';
    recipientName?: string;
    recipientEmail?: string;
    consentConfirmed?: boolean;
  };
  report: {
    reportId: string;
    createdAt: string;
    overallScore: number;
    readinessBand: 'strong' | 'borderline' | 'needs_work';
    recommendedPath: 'approach_bank' | 'broker_review' | 'improve_first';
    dimensionScores: Record<string, number>;
    insightCompletionState: 'skipped' | 'partial' | 'complete';
    profileTags: string[];
    profileSummary: {
      strongestArea?: string;
      weakestArea?: string;
      fastestImprovement?: string;
    };
    topPriorityActions: Array<{ id: string; label: string; body: string }>;
    keyAnswers?: Record<string, string | string[]>;
    fundingSignals?: string[];
    productVersion: string;
    scoringVersion: string;
    disclaimerVersion: string;
  };
  meta: {
    source: 'bank-ready-score';
    mode: 'mock' | 'live';
    userAgent?: string;
    locale?: string;
    pageUrl?: string;
    reportUrl?: string;
  };
}
```

### Canonical JSON wire shape (what the frontend actually sends)

```jsonc
{
  "lead": {
    "first_name": "Alice",
    "email": "alice@example.com",
    "business_name": "Acme Pty Ltd",
    "mobile": "",
    "wants_follow_up": true
  },
  "share": {
    "enabled": true,
    "recipient_type": "broker",
    "recipient_name": "Broker Co",
    "recipient_email": "broker@example.com",
    "consent_confirmed": true
  },
  "report": {
    "report_id": "rpt_abc123…",
    "created_at": "2026-04-22T00:00:00.000Z",
    "overall_score": 66,
    "readiness_band": "borderline",
    "recommended_path": "broker_review",
    "dimension_scores": {
      "profile": 8, "history": 8, "financials": 14, "liquidity": 9,
      "compliance": 6, "debt": 6, "security": 7, "docs": 6
    },
    "insight_completion_state": "complete",
    "profile_tags": ["Documentation risk", "Compliance pressure", "Growth ready, structurally weak"],
    "profile_summary": {
      "strongest_area": "borrower profile",
      "weakest_area": "documentation readiness",
      "fastest_improvement": "organising BAS, financials and bank statements"
    },
    "top_priority_actions": [
      { "id": "compliance", "label": "Tax / BAS / ATO", "body": "Bring tax returns, BAS and ATO position fully up to date…" }
    ],
    "key_answers": { "entity_type": "company", "funding_reason": "expansion" },
    "funding_signals": ["growth_intent", "compliance_pressure"],
    "product_version": "bank-ready-score-v1",
    "scoring_version": "bank-ready-v1",
    "disclaimer_version": "2026-04"
  },
  "meta": {
    "source": "bank-ready-score",
    "mode": "mock",
    "user_agent": "Mozilla/5.0 …",
    "locale": "en-AU",
    "page_url": "https://score.oneyco.com.au/",
    "report_url": "https://score.oneyco.com.au/report.html#r=…"
  }
}
```

When `share.enabled` is `false`, the `share` object is
`{ "enabled": false }` — no recipient fields are emitted.

---

## Endpoints

### 1. `POST {apiBaseUrl}/score-report/submit`

Handles the full downstream workflow:

- validate input
- persist report + lead
- queue / send user email
- queue / send broker-share email if `share.enabled && share.consent_confirmed`
- queue / send internal Oney notification (email, webhook, Slack/Teams, CRM)
- return canonical report access info

**Request body:** `ReportSubmitRequest` (above).

**Response body:**

```ts
export interface ReportSubmitResponse {
  success: boolean;
  mode: 'mock' | 'live';
  report: {
    reportId: string;
    reportUrl: string;
    reportPath?: string | null;
    expiresAt?: string | null;
  };
  deliveries: {
    userEmail:            { queued: boolean; sent?: boolean; email: string };
    recipientEmail?:      { queued: boolean; sent?: boolean; email: string };
    internalNotification: { queued: boolean; sent?: boolean };
  };
  unsubscribeUrlTemplate?: string; // e.g. ".../unsubscribe?token={{token}}"
  message?: string;
}
```

**Validation rules (backend-side):**

- `lead.first_name` required
- `lead.email` required and valid email
- `share.recipient_email` required if `share.enabled === true`
- `share.consent_confirmed` must be `true` if `share.enabled === true`
- `report.*` must be present and well-formed enough to re-render

**Recommended backend behaviour:** return once everything is queued,
don't block on upstream email provider final delivery. Reconciliation
happens via provider webhooks.

### 2. `GET {apiBaseUrl}/score-report/report/:id`

Resolves a report by id — used by the viewer when the URL is
`?id=<report_id>` rather than a hash-encoded payload.

**Response body:**

```ts
export interface GetReportResponse {
  success: boolean;
  report: ReportSubmitRequest['report'];
  leadSummary?: {
    firstName?: string;
    businessName?: string;
  };
  shareSummary?: {
    enabled: boolean;
    recipientName?: string;
    recipientType?: string;
  };
}
```

Do not return `lead.email`, `lead.mobile`, or share-recipient contact
details from this endpoint — a share URL can end up forwarded.

### 3. `POST {apiBaseUrl}/score-report/unsubscribe`

Follow-up opt-out for users who had `wants_follow_up === true`.

**Request body:** `{ token: string; reason?: string }`
**Response body:** `{ success: boolean; message?: string }`

The frontend email template contains `{{unsubscribe_url}}` as a **template placeholder only**. Unsubscribe URLs are minted server-side with a signed or opaque token at send time — the frontend never constructs this URL.

---

## Mock mode contract

Mock mode mirrors the same UI flow without network I/O.

**Persists three localStorage keys:**

- `oney-score-report-leads` — trimmed lead + share + score summary, keyed by `report_id`
- `oney-score-report-records` — full `ReportSubmitRequest` payloads, keyed by `report_id`
- `oney-score-report-last-submit` — the most recent submit's `{ report_id, submitted_at, mode }`

**Response shape:** same `ReportSubmitResponse` as live mode, with
`mode: 'mock'` and `deliveries.*.queued: true, sent: false`. Keeps the
UI branch-free.

**Report URL:** hash-encoded slim payload —
`report.html#r=<base64(JSON)>`. PII (email, mobile, share recipient
contact, follow-up consent, meta.user_agent, meta.page_url) is
**stripped** from the hash so the link is safe to hand to a broker.

---

## Canonical report URL strategy

The renderer in `report.html` is URL-strategy-agnostic:

1. If `#r=<encoded>` is present → decode and render.
2. Else if `?id=<report_id>` is present → resolve via adapter
   (live = `GET /score-report/report/:id`; mock = localStorage lookup).
3. Else → render `renderMissing()`.

This lets the site move from hash-encoded to id-based URLs without a
renderer rewrite. The slim hash payload only carries
`{ report, lead:{first_name,business_name}, share:{enabled,recipient_type?} }`.

---

## Internal notification contract

Shape recommended for email, webhook, Slack/Teams message, CRM write,
or queue event:

```ts
export interface InternalLeadNotification {
  lead: {
    first_name: string;
    email: string;
    business_name?: string;
    mobile?: string;
    wants_follow_up: boolean;
  };
  report: {
    report_id: string;
    overall_score: number;
    readiness_band: string;
    recommended_path: string;
    profile_tags: string[];
    top_priority_actions: Array<{ id: string; label: string }>;
  };
  share: {
    enabled: boolean;
    recipient_name?: string;
    recipient_email?: string;
    recipient_type?: string;
  };
  meta: {
    created_at: string;
    source: 'bank-ready-score';
    report_url?: string;
  };
}
```

Triage signal fields of interest:
- `wants_follow_up` → filter follow-up queue
- `recommended_path === 'improve_first'` with
  `profile_tags.includes('Debt load concern')` → restructure candidate
- `share.enabled === true` → client already engaged a broker / lender

---

## Analytics events

Routed through the whitelisted `trackEvent` helper (no PII, no free-text).
Forwarded to both GTM `dataLayer` and `gtag` if present.

- `report_generate_clicked`
- `report_modal_opened`
- `report_submitted`
- `report_email_sent`
- `report_share_enabled`
- `report_shared_to_broker`
- `oney_follow_up_opted_in`

---

## Security / privacy notes

- Never hardcode provider secrets in the frontend.
- Validate consent fields server-side — don't trust client.
- Internal-notification transport must be protected (auth, IP allowlist,
  signed webhook, or private queue).
- The hash-encoded share URL is a share-by-possession artifact. It's safe
  for brokers (no email / mobile) but is not a secure document vault.
  If reports become long-lived, layer expiry + access control onto the
  `?id=` resolver.

---

## Recommended implementation sequencing

1. ✅ Ship mock mode fully working on GitHub Pages.
2. Wire `window.ONEY_REPORT_CONFIG` injection template.
3. Implement `POST /score-report/submit` (persist + user email + internal
   notification).
4. Implement optional broker-share email branch.
5. Implement `GET /score-report/report/:id` resolver.
6. Implement `POST /score-report/unsubscribe` with signed tokens.
7. Switch share URLs from hash-encoded to id-based once the resolver
   is live. Keep the hash-decoder for backward compatibility.
8. Optional: server-side PDF rendering from the same `report` payload.

## Open backend decisions

Settleable later without breaking the frontend contract:

- database choice
- queue provider
- email provider + delivery provider (SES, Postmark, etc)
- CRM destination (HubSpot, Pipedrive, Attio, internal)
- signed-token format for unsubscribe
- report retention policy (expiry)
- whether broker vs lender recipients should receive different templates

The wire payload and the three endpoint shapes are the stable surface.
