# Report Email Templates

## Purpose

Defines the copy, structure, and template variables for the
`Generate my lending report` email flows used by
`score.oneyco.com.au`.

Companion to [`docs/report-integration.md`](./report-integration.md),
which owns the transport / endpoint contract. This doc owns email
content only.

Three flows:

1. **User report email** — always sent after a successful submit.
2. **Broker / lender share email** — only when the user opts in.
3. **Internal Oney lead notification** — for fast triage.

### Tone across all templates

- credible
- banker-literate
- concise
- clear
- useful first
- not overly salesy

Avoid:

- “quiz result” language
- hype language
- aggressive CTA language
- vague motivational copy

---

## Shared template variables

The email rendering layer maps from the canonical snake_case payload
(see `docs/report-integration.md` → `ReportSubmitRequest`) to the flat
token set below. Templates never reach into payload dot-paths directly.

| Token | Source |
|---|---|
| `{{first_name}}` | `payload.lead.first_name` |
| `{{business_name}}` | `payload.lead.business_name` |
| `{{email}}` | `payload.lead.email` (internal template only) |
| `{{mobile}}` | `payload.lead.mobile` (internal template only) |
| `{{wants_follow_up}}` | `payload.lead.wants_follow_up` (`"yes"`/`"no"`) |
| `{{score}}` | `payload.report.overall_score` |
| `{{score_band}}` | humanised label of `payload.report.readiness_band` |
| `{{recommended_path}}` | humanised label of `payload.report.recommended_path` |
| `{{profile_tags}}` | `payload.report.profile_tags.join(', ')` |
| `{{profile_summary}}` | one-line render of `payload.report.profile_summary` |
| `{{top_action_1}}`, `{{top_action_2}}`, `{{top_action_3}}` | `payload.report.top_priority_actions[i].label` |
| `{{report_url}}` | `response.report.reportUrl` |
| `{{report_download_url}}` | same as `report_url` until a PDF endpoint exists |
| `{{request_review_url}}` | static Oney review CTA URL (config-driven) |
| `{{recipient_name}}` | `payload.share.recipient_name` |
| `{{recipient_type}}` | `payload.share.recipient_type` |
| `{{recipient_email}}` | `payload.share.recipient_email` (internal only) |
| `{{shared_with_recipient}}` | `payload.share.enabled` (`"yes"`/`"no"`) |
| `{{created_at}}` | `payload.report.created_at` |
| `{{disclaimer}}` | default disclaimer copy (see below) |
| `{{unsubscribe_url}}` | **server-side only** — never constructed in the frontend |
| `{{raw_payload_json}}` | `JSON.stringify(payload)` — internal notification archive |

### `{{unsubscribe_url}}` contract

Only used in templates that include follow-up / marketing-style consent.
The final URL must be generated **server-side** after minting a signed
or opaque token. The frontend never fabricates it.

In mock mode the email is not actually sent, so the placeholder token
is left literal in the rendered body — that's expected.

---

## 1. User email

**Subject** (preferred): `Your Bank-Ready Score report`
Alternates: `Your business lending readiness report`, `Your lending readiness summary`

**Preview text** (preferred): `Your score, profile summary, and top actions before application.`
Alternate: `A clear summary you can keep or share with your broker or lender.`

**Trigger:** always, after a successful submit, to `payload.lead.email`.

**Structure:**

1. Header / brand
2. Score summary
3. Business profile summary
4. Top 3 actions
5. View full report CTA
6. Optional Oney review CTA
7. Disclaimer
8. Unsubscribe / preference line (only if `wants_follow_up === true`)

**Plain-text fallback:**

```
Hi {{first_name}},

Your Bank-Ready Score report is ready.

Current result:
- Score: {{score}} / 100
- Readiness: {{score_band}}
- Recommended path: {{recommended_path}}

Business profile:
{{profile_summary}}

Top actions before application:
1. {{top_action_1}}
2. {{top_action_2}}
3. {{top_action_3}}

View your full report:
{{report_url}}

If you want a second set of eyes, you can also request an Oney review:
{{request_review_url}}

Important:
This report is a readiness signal, not credit approval or financial
advice. It is designed to help identify likely gaps before a lender
reviews the application.
```

**CTA labels (approved):**

- `View full report`
- `Open my report`
- `Review my lending summary`

Avoid: `Claim your result`, `Unlock your future`, `See your business superpower`.

**HTML template:** `docs/email-templates/user-report.html`

---

## 2. Broker / lender share email

**Subject** (preferred): `{{first_name}} shared a Bank-Ready Score report for review`
Alternate: `Business lending readiness report shared for review`

**Preview text:** `A client-generated lending readiness summary for your review.`

**Trigger — all three must be true:**

- `payload.share.enabled === true`
- `payload.share.consent_confirmed === true`
- `payload.share.recipient_email` present

**Plain-text fallback:**

```
Hi {{recipient_name}},

{{first_name}} has shared their Bank-Ready Score report with you for review.

Summary:
- Score: {{score}} / 100
- Readiness: {{score_band}}
- Recommended path: {{recommended_path}}

Business profile:
{{profile_summary}}

Top actions currently highlighted:
1. {{top_action_1}}
2. {{top_action_2}}
3. {{top_action_3}}

View the full report:
{{report_url}}

Important:
This report is a readiness signal generated from user-provided
information. It is not credit approval, not a credit decision, and
not formal financial advice.
```

**CTA labels (approved):**

- `View full report`
- `Review shared report`

Avoid: `Approve this file`, `Start application`.

**HTML template:** `docs/email-templates/broker-review.html`

---

## 3. Internal Oney lead notification

**Subject options:**

- `New Bank-Ready Score report lead: {{first_name}} · {{score}}`
- `Bank-Ready Score lead: {{score_band}} / {{recommended_path}}`

**Transport:** email, webhook, Slack/Teams, CRM write, or queue event.
Whatever the transport, keep the `InternalLeadNotification` field
shape from `docs/report-integration.md`.

**Plain-text body:**

```
New Bank-Ready Score report lead

Lead
- Name: {{first_name}}
- Email: {{email}}
- Business: {{business_name}}
- Mobile: {{mobile}}
- Wants follow-up: {{wants_follow_up}}

Report
- Score: {{score}} / 100
- Readiness: {{score_band}}
- Recommended path: {{recommended_path}}
- Created: {{created_at}}

Profile tags
- {{profile_tags}}

Profile summary
- {{profile_summary}}

Top actions
1. {{top_action_1}}
2. {{top_action_2}}
3. {{top_action_3}}

Share status
- Shared with broker/lender: {{shared_with_recipient}}
- Recipient name: {{recipient_name}}
- Recipient type: {{recipient_type}}
- Recipient email: {{recipient_email}}

Report link
{{report_url}}
```

**HTML template:** `docs/email-templates/internal-notification.html`

---

## Conditional rendering rules

**If the user did NOT opt in to Oney follow-up**
User email should:
- still deliver the report
- not include “we may follow up” language
- not require a marketing footer beyond normal operational email requirements

**If the user DID opt in to Oney follow-up**
User email can include:
- one short line about practical next-step guidance
- `{{unsubscribe_url}}`

Keep this subtle.

**If the user skipped optional insight questions**
(i.e. `payload.report.insight_completion_state === 'skipped'`)
Replace `{{profile_summary}}` with:

> This report is based mainly on your core lending readiness answers.

**Profile tags rendering**
- prefer rendering up to 3
- example: `Profile tags: Documentation Risk, Cash Flow Pressure, Compliance Pressure`
- if no tags present, use neutral line:

> The report points to a manageable set of readiness gaps rather than one dominant issue.

---

## Recommended label mappings

Use human-readable labels in email bodies (the wire payload stays
enum-typed).

**Readiness band**

| Enum (`readiness_band`) | Label (`{{score_band}}`) |
|---|---|
| `strong` | Strong |
| `borderline` | Borderline |
| `needs_work` | Needs work before application |

**Recommended path**

| Enum (`recommended_path`) | Label (`{{recommended_path}}`) |
|---|---|
| `approach_bank` | Approach a lender with a well-prepared file |
| `broker_review` | Seek broker-led review before application |
| `improve_first` | Improve key gaps before application |

**Profile tags** — keep title case as emitted:

- `Documentation risk`
- `Cash flow pressure`
- `Debt load concern`
- `Compliance pressure`
- `Operationally stable`
- `Banking discipline strong`
- `Growth ready, structurally weak`
- `Profitability concern`
- `Revenue volatility`
- `Expense control gap`

---

## Disclaimer copy

**Default (user email + full report):**

> This report is a readiness signal, not credit approval, a credit
> decision, or financial advice. It is designed to highlight likely
> lending gaps before a formal lender review.

**Short form (tight-space renders):**

> This report is a readiness signal, not credit approval or financial advice.

**Broker / lender version:**

> This client-shared report is a readiness signal based on user-provided
> information. It is not a formal credit assessment or approval.

---

## Implementation notes

- Keep email templates in `docs/email-templates/*.html`.
- Separate copy from payload-building logic.
- Support both HTML and plain-text variants (plain-text blocks above
  are the canonical drop-in).
- Render conditionally based on:
  - `wants_follow_up`
  - `share.enabled && share.consent_confirmed`
  - `insight_completion_state === 'skipped'`
- Do not hardcode unsubscribe URLs in frontend code.
- Keep subject lines and CTA labels easy to edit (they're stable copy,
  not user-dependent strings).

---

## Quick reference

- User email should feel **useful, calm, clear, actionable**.
- Broker / lender email should feel **professional, neutral, easy to review**.
- Internal notification should feel **concise, triage-ready, structured**.

The product should still feel like a serious lending-readiness tool,
not a marketing funnel disguised as a report.
