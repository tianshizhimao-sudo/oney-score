# Bank-Ready Score — report flow integration

This document describes how the front-end talks to a backend (or local
mock) for the "Generate my lending report" flow. The site ships with a
working local-only implementation so the UI is functional end-to-end on
GitHub Pages. Swapping in a real backend is a configuration change, not
a code change.

## Naming convention

The canonical report/automation contract uses **`snake_case`** everywhere it
crosses a boundary: the serialised payload, the hash-encoded share URL, the
persisted localStorage copy, email-template tokens, and the three webhook
bodies. There are no camelCase alias fields on any outgoing payload — one
shape, one contract.

Internal JavaScript objects used inside the app (e.g. the object returned by
`evaluateInsights`, the form state captured by the modal) are camelCase
because they're local to the app runtime. The serializer
(`score.report.serializer.js`) is the single mapping boundary — everything
leaving it is snake_case.

If a consumer prefers camelCase, translate at their ingestion boundary, not
here.

## Config

Set once, from a site-level snippet loaded before `score.report.adapters.js`:

```html
<script>
  window.ONEY_REPORT_CONFIG = {
    leadCaptureUrl:     'https://api.oneyco.com.au/score/leads',
    emailServiceUrl:    'https://api.oneyco.com.au/score/emails',
    internalWebhookUrl: 'https://hooks.oneyco.com.au/score/internal',
    reportViewerUrl:    'https://score.oneyco.com.au/report.html',
    requestTimeoutMs:   8000
  };
</script>
```

Any key left `null` or unset falls back to the local adapter for that
concern (lead capture / email / internal webhook) so partial rollouts
are safe. Secrets never live in the browser — authenticate the request
path on the backend (IP allowlisting on the edge, signed request from a
Cloudflare Worker, server-side HubSpot/CRM keys, etc).

## Submit payload

All three endpoints receive the same report payload shape. Adapters
call them in parallel after a modal submit:

- `leadCapture.submit(payload)` — authoritative "save the lead".
- `email.sendUserReport(payload)` — sends the user copy.
- `email.sendBrokerShare(payload)` — only sent when
  `payload.lead.share.enabled === true` **and**
  `payload.lead.share.consent_share === true`.
- `webhook.postInternal(payload)` — internal triage notification.

### Payload shape

```jsonc
{
  "report_id": "rpt_abc123…",
  "created_at": "2026-04-22T00:00:00.000Z",
  "product_version": "bank-ready-score@1.1.0",
  "scoring_version": "1",
  "disclaimer_version": "1",
  "disclaimer": "This is a readiness signal, not credit approval…",

  "overall_score": 76,
  "readiness_band": "borderline",
  "readiness_label": "Close — polish before applying",
  "next_step": "Broker-led polish first",

  "dimensions": [
    { "id": "profile",    "label": "Business profile",     "score": 8,  "weight": 10, "ratio": 0.8 },
    { "id": "history",    "label": "Trading history",      "score": 8,  "weight": 10, "ratio": 0.8 },
    { "id": "financials", "label": "Revenue & profitability","score": 14,"weight": 20, "ratio": 0.7 }
    // …8 entries
  ],

  "top_actions": [
    { "id": "docs",       "label": "Documentation",        "text": "Prepare a clean credit pack…" }
    // up to 3
  ],

  "insight": {
    "completion_state": "complete" /* | "partial" | "skipped" | "unavailable" */,
    "answered_count": 8,
    "total_questions": 8,
    "profile_tags":    [{ "id": "documentation_risk", "label": "Documentation risk", "tone": "risk" }],
    "profile_summary": {
      "strongest_area":      "operating stability",
      "weakest_area":        "documentation readiness",
      "fastest_improvement": "organising BAS, financials and bank statements"
    },
    "lead_segment":  "documentation-friction",
    "signal_counts": { "documentation_risk": 2, "compliance_pressure": 1 }
  },

  "key_answers": {
    "core":    { "entityType": "company", "industryRisk": "medium", /* … */ },
    "insight": { "funding_reason": "expansion", /* … */ }
  },

  "lead": {
    "first_name": "Alice",
    "email": "alice@example.com",
    "business_name": "Acme Pty Ltd",
    "mobile": "+61400000000",
    "consent_email": true,
    "consent_followup": true,
    "share": {
      "enabled": true,
      "broker_name": "Broker Co",
      "broker_email": "broker@example.com",
      "consent_share": true
    }
  }
}
```

## Backend contracts

### `POST /score/leads` — lead capture

**Request body:** full report payload (above).

**Response:**
```jsonc
{ "ok": true, "lead_id": "lead_abc123" }
```

### `POST /score/emails` — transactional email

**Request body:**
```jsonc
{ "type": "user_report" | "broker_share", "payload": { /* report payload */ } }
```

**Response:** `{ "ok": true }` (the transport doesn't need to block on
actual delivery — rely on your provider's delivery webhook for
reconciliation).

Templates live under `docs/email-templates/`:

- `user-report.html` — sent on every submit, to `payload.lead.email`.
- `broker-review.html` — sent only when `lead.share.enabled && lead.share.consent_share`.

### `POST /hooks/internal` — internal notification / CRM webhook

**Request body:** full report payload.

**Response:** `{ "ok": true }`.

The `internal-notification.html` template is a reference body for
email/Slack/Teams inbox delivery; if you're pushing to HubSpot /
Pipedrive / Attio directly, translate the payload shape at the adapter
layer rather than fanning out multiple webhooks from the browser.

## Report viewer URL

When a backend is configured (`leadCaptureUrl` is set), report URLs
take the form:

```
https://score.oneyco.com.au/report.html?id=<report_id>
```

Your backend is expected to serve / resolve the payload for that id.
You can implement this two ways:

1. **Resolver endpoint + short-lived signed URL:** serve a tiny JSON
   endpoint that returns the payload for an authenticated / signed id.
   Update `report.view.js` to fetch from there (adds one network hop).
2. **Server-rendered report page:** host a rendered HTML at
   `/report.html?id=…` server-side, bypassing the static fallback.

When no backend is configured, report URLs embed the (PII-stripped)
payload in the hash:

```
https://score.oneyco.com.au/report.html#r=<base64-json>
```

This works without any backend — the viewer reads the hash, decodes
it, and renders the same report. Lead contact details are **not**
embedded in the hash so the same URL can be safely shared with a broker.

## Analytics events

All events are routed through the existing whitelisted `trackEvent`
helper (no PII, no free-text). Every event is forwarded to both GTM
`dataLayer` and `gtag` if available. Allowed events added for this
flow:

- `report_generate_clicked`
- `report_modal_opened`
- `report_submitted`
- `report_email_sent`
- `report_share_enabled`
- `report_shared_to_broker`
- `oney_follow_up_opted_in`

## Outstanding / future work

- Server-side resolver for `?id=` URLs when backend lands.
- Real PDF generation (current flow uses the browser's Print dialog,
  which produces a clean PDF from `report.html` without any extra deps).
- Unsubscribe flow for follow-up consent (`unsubscribe_url` token in
  user email template).
- Industry-specific report templates (hook already exists via the
  insight pack system — extend the template registry the same way).
