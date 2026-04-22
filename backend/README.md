# oney-score-api

Cloudflare Worker backend for the Bank-Ready Score report flow.

Receives the `POST /score-report/submit` request from
`score.oneyco.com.au`, renders three email templates, and sends them
via Resend. Returns the canonical `ReportSubmitResponse` envelope so
the frontend works identically against mock and live modes.

Full transport contract lives in
[`../docs/report-integration.md`](../docs/report-integration.md).
Email content contract lives in
[`../docs/report-email-templates.md`](../docs/report-email-templates.md).

---

## What it does on every submit

1. Accept `POST /score-report/submit` with a `ReportSubmitRequest`
   (snake_case, as the frontend sends it).
2. Validate required fields (`lead.first_name`, `lead.email`,
   `report.report_id`, `report.readiness_band`, share fields if
   `share.enabled`).
3. Fan out 2–3 emails in parallel via Resend:
   - **User email** — always, to `lead.email`.
   - **Broker / lender share** — only when
     `share.enabled && share.consent_confirmed`.
   - **Internal notification** — always, to `INTERNAL_NOTIFY_TO`.
4. Return `ReportSubmitResponse` with `deliveries.*.queued` flags.

If any send fails, the worker still returns `success: true` so the UI
keeps the user on the success path — the failure is visible in the
`deliveries.userEmail.queued === false` flag and in `wrangler tail` /
Resend's dashboard.

---

## Prerequisites

- [Resend account](https://resend.com) with `oneyco.com.au` verified
  (DKIM + SPF DNS records live — you already have this done).
- Resend API key (`re_...`).
- [Node.js](https://nodejs.org/) 18+ installed locally.
- Cloudflare account (free tier is fine).

---

## One-time setup

```bash
cd backend
npm install
npx wrangler login     # opens browser SSO
```

Set the four secrets (they're encrypted at rest in Cloudflare — never
commit these):

```bash
npx wrangler secret put RESEND_API_KEY
# paste: re_xxxxxxxxxxxxxxxxxxxx

npx wrangler secret put MAIL_FROM
# paste (including brand label):
# Oney & Co <hello@oneyco.com.au>

npx wrangler secret put INTERNAL_NOTIFY_TO
# paste: hello@oneyco.com.au

npx wrangler secret put ALLOWED_ORIGIN
# paste: https://score.oneyco.com.au
```

Verify secrets are set (values are hidden):

```bash
npx wrangler secret list
```

---

## Deploy

```bash
npx wrangler deploy
```

Output includes the public URL, e.g.:

```
Published oney-score-api (0.7 sec)
  https://oney-score-api.<your-account>.workers.dev
```

That URL is your `apiBaseUrl`.

---

## Wire the frontend

Add the config snippet to the `<head>` of `index.html` on the root of
the repo (before the `score.report.adapters.js` script tag), swapping
in your worker URL:

```html
<script>
  window.ONEY_REPORT_CONFIG = {
    mode: 'live',
    apiBaseUrl: 'https://oney-score-api.<your-account>.workers.dev',
    endpoints: {
      submitReport: '/score-report/submit',
      getReport:    '/score-report/report',
      unsubscribe:  '/score-report/unsubscribe'
    },
    productVersion:    'bank-ready-score-v1',
    scoringVersion:    'bank-ready-v1',
    disclaimerVersion: '2026-04'
  };
</script>
```

Commit + push to `main`. GitHub Pages redeploys in ~1 minute.
Hard-refresh `score.oneyco.com.au` and confirm the flow via the
steps below.

---

## Smoke test

1. Open `score.oneyco.com.au` in an incognito window.
2. Complete the score + click **Generate my lending report**.
3. Submit the modal with a throwaway email.
4. Within ~10 seconds you should see:
   - A copy at the user's inbox ("Your Bank-Ready Score report")
   - Another copy at `hello@oneyco.com.au` (internal notification)
5. Re-submit with **Send a copy to my broker / lender** ticked + a
   second throwaway email. Confirm the broker email arrives too.

Live log stream while testing:

```bash
npx wrangler tail
```

Resend dashboard shows all three sends with delivery + open status.

---

## Local dev (optional)

Run the worker locally against a `.dev.vars` file:

```bash
# backend/.dev.vars (gitignored)
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=Oney & Co <hello@oneyco.com.au>
INTERNAL_NOTIFY_TO=hello@oneyco.com.au
ALLOWED_ORIGIN=http://localhost:5173
```

```bash
npx wrangler dev
# → http://localhost:8787/score-report/submit
```

Point the site to `http://localhost:8787` by temporarily setting
`window.ONEY_REPORT_CONFIG.apiBaseUrl` in DevTools before submitting.

---

## Custom domain (optional, later)

Keep using `*.workers.dev` until you're happy with the flow. When you
want `api.oneyco.com.au`:

1. Ensure `oneyco.com.au` is on Cloudflare (proxy orange cloud).
2. Edit `wrangler.toml` — uncomment the `[[routes]]` block with
   `pattern = "api.oneyco.com.au/score-report/*"`.
3. `npx wrangler deploy`.
4. Update `apiBaseUrl` in `ONEY_REPORT_CONFIG` to `https://api.oneyco.com.au`.

---

## Operations

| Task | Command |
|---|---|
| Deploy | `npx wrangler deploy` |
| Stream logs | `npx wrangler tail` |
| List secrets | `npx wrangler secret list` |
| Rotate API key | `npx wrangler secret put RESEND_API_KEY` + redeploy |
| Roll back | `npx wrangler deployments list` then `rollback <id>` |

---

## What's NOT implemented

Leave these for later; none break the current UX:

- **`GET /score-report/report/:id` resolver** — the frontend still
  uses hash-encoded URLs, so the viewer resolves from the hash.
  Add this when you want short id-based share URLs.
- **`POST /score-report/unsubscribe` with signed tokens** — the user
  email currently includes a `mailto:` List-Unsubscribe header pointed
  at `INTERNAL_NOTIFY_TO`, which is acceptable for low volume. Swap in
  a signed-token route when the follow-up list grows.
- **Persistent lead storage** — each submit fires off emails and
  forgets. Archive via the raw-payload block in the internal email,
  Resend's own retention, or a CRM webhook. Layer on a KV / D1 write
  here if you want a queryable lead store later.

---

## Contract sync

Email templates in `src/templates/*.ts` mirror the canonical content
in `../docs/email-templates/*.html`. When you edit copy, update both
— the docs folder is the source of truth; the TS files are what the
worker actually bundles.
