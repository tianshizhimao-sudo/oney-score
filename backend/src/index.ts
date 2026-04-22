/* oney-score-api — Cloudflare Worker
 *
 * Receives POST /score-report/submit from score.oneyco.com.au, validates
 * the ReportSubmitRequest, renders the three email templates with token
 * substitution, and sends via Resend. Returns the canonical
 * ReportSubmitResponse envelope so the frontend never has to branch on
 * mock vs live.
 *
 * See docs/report-integration.md for the full contract.
 */

import type { Env, ReportSubmitRequest, ReportSubmitResponse } from './types';
import { validateSubmitRequest, ValidationError } from './validate';
import { renderTemplate, escapeHtml } from './render';
import {
  BAND_LABELS, PATH_LABELS, DEFAULT_DISCLAIMER, BROKER_DISCLAIMER,
  REVIEW_CTA_URL, renderProfileSummary, tagsOrNeutral,
} from './labels';
import { sendViaResend } from './resend';
import {
  USER_REPORT_SUBJECT, USER_REPORT_PREVIEW, USER_REPORT_HTML, USER_REPORT_TEXT,
} from './templates/user-report';
import {
  BROKER_SUBJECT, BROKER_HTML, BROKER_TEXT,
} from './templates/broker-review';
import {
  INTERNAL_SUBJECT, INTERNAL_HTML, INTERNAL_TEXT,
} from './templates/internal-notification';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') return preflight(env);

    // Liveness probe
    if (req.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'oney-score-api' }, 200, env);
    }

    // Submit endpoint
    if (req.method === 'POST' && url.pathname === '/score-report/submit') {
      return handleSubmit(req, env);
    }

    return json({ error: 'not_found' }, 404, env);
  },
};

/* ---------------- Submit handler ---------------- */

async function handleSubmit(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400, env); }

  let payload: ReportSubmitRequest;
  try { payload = validateSubmitRequest(body); }
  catch (err) {
    if (err instanceof ValidationError) {
      return json({ error: 'validation', field: err.field, message: err.message }, 400, env);
    }
    return json({ error: 'validation', message: (err as Error).message }, 400, env);
  }

  const tokens = buildTokens(payload, env);
  const wantsShare = env.ENABLE_BROKER_SHARE !== 'false'
    && payload.share.enabled === true
    && !!payload.share.recipient_email
    && payload.share.consent_confirmed === true;

  // Fan out in parallel — Resend handles queueing on their side.
  const [userRes, recipientRes, internalRes] = await Promise.all([
    sendUserEmail(env, payload, tokens),
    wantsShare ? sendBrokerEmail(env, payload, tokens) : Promise.resolve(null),
    sendInternalEmail(env, payload, tokens),
  ]);

  const response: ReportSubmitResponse = {
    success: true,
    mode: 'live',
    report: {
      reportId:   payload.report.report_id,
      reportUrl:  payload.meta.report_url || '',
      reportPath: null,
      expiresAt:  null,
    },
    deliveries: {
      userEmail: {
        queued: userRes.ok,
        sent: userRes.ok,
        email: payload.lead.email,
      },
      internalNotification: {
        queued: internalRes.ok,
        sent: internalRes.ok,
      },
    },
    unsubscribeUrlTemplate: null,
    message: userRes.ok ? null : `user email failed: ${userRes.error || 'unknown'}`,
  };
  if (wantsShare && recipientRes) {
    response.deliveries.recipientEmail = {
      queued: recipientRes.ok,
      sent: recipientRes.ok,
      email: payload.share.recipient_email || '',
    };
  }

  return json(response, 200, env);
}

/* ---------------- Token map (shared by all 3 templates) ---------------- */

function buildTokens(p: ReportSubmitRequest, env: Env): Record<string, string> {
  const r = p.report;
  const summary = r.profile_summary || { strongest_area: null, weakest_area: null, fastest_improvement: null };
  const actions = r.top_priority_actions || [];

  const scoreBandLabel = BAND_LABELS[r.readiness_band] || r.readiness_band;
  const pathLabel = PATH_LABELS[r.recommended_path] || r.recommended_path;

  return {
    first_name:        p.lead.first_name,
    business_name:     p.lead.business_name || '',
    email:             p.lead.email,
    mobile:            p.lead.mobile || '',
    wants_follow_up:   p.lead.wants_follow_up ? 'yes' : 'no',

    recipient_name:    p.share.recipient_name || 'there',
    recipient_type:    p.share.recipient_type || 'broker',
    recipient_email:   p.share.recipient_email || '',

    score:             String(r.overall_score ?? '—'),
    score_band:        scoreBandLabel,
    recommended_path:  pathLabel,

    profile_tags:      tagsOrNeutral(r.profile_tags),
    profile_summary:   renderProfileSummary({
      completion: r.insight_completion_state,
      strongest:  summary.strongest_area,
      weakest:    summary.weakest_area,
      fastest:    summary.fastest_improvement,
    }),

    top_action_1:      actions[0]?.label || '',
    top_action_2:      actions[1]?.label || '',
    top_action_3:      actions[2]?.label || '',

    report_url:        p.meta.report_url || '',
    report_download_url: p.meta.report_url || '',
    request_review_url: REVIEW_CTA_URL,

    created_at:        r.created_at,

    shared_with_recipient: (p.share.enabled === true) ? 'yes' : 'no',

    disclaimer:        DEFAULT_DISCLAIMER,

    // Unsubscribe: Resend handles list-level unsub via the header we set
    // in sendUserEmail below. The template token is a mailto fallback —
    // documented in docs/report-integration.md.
    unsubscribe_url:   `mailto:${env.INTERNAL_NOTIFY_TO}?subject=Unsubscribe%20me`,

    raw_payload_json:  escapeHtml(JSON.stringify(p, null, 2)),
  };
}

/* ---------------- Individual sends ---------------- */

async function sendUserEmail(env: Env, p: ReportSubmitRequest, tokens: Record<string, string>) {
  const preview = USER_REPORT_PREVIEW;
  // Prepend a hidden preview snippet for inbox preview consistency.
  const html = `<span style="display:none;visibility:hidden;opacity:0;max-height:0;overflow:hidden;">${escapeHtml(preview)}</span>` +
    renderTemplate(USER_REPORT_HTML, tokens, { escape: true });
  const text = renderTemplate(USER_REPORT_TEXT, tokens, { escape: false });

  return sendViaResend(env.RESEND_API_KEY, {
    from: env.MAIL_FROM,
    to: p.lead.email,
    subject: USER_REPORT_SUBJECT,
    html,
    text,
    replyTo: env.INTERNAL_NOTIFY_TO,
    headers: p.lead.wants_follow_up ? {
      'List-Unsubscribe': `<mailto:${env.INTERNAL_NOTIFY_TO}?subject=Unsubscribe%20me>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    } : undefined,
  });
}

async function sendBrokerEmail(env: Env, p: ReportSubmitRequest, tokens: Record<string, string>) {
  const html = renderTemplate(BROKER_HTML, {
    ...tokens,
    disclaimer: BROKER_DISCLAIMER,
  }, { escape: true });
  const text = renderTemplate(BROKER_TEXT, tokens, { escape: false });
  const subject = renderTemplate(BROKER_SUBJECT, tokens, { escape: false });

  return sendViaResend(env.RESEND_API_KEY, {
    from: env.MAIL_FROM,
    to: p.share.recipient_email!,
    subject,
    html,
    text,
    replyTo: p.lead.email,
  });
}

async function sendInternalEmail(env: Env, p: ReportSubmitRequest, tokens: Record<string, string>) {
  const html = renderTemplate(INTERNAL_HTML, tokens, { escape: true });
  const text = renderTemplate(INTERNAL_TEXT, tokens, { escape: false });
  const subject = renderTemplate(INTERNAL_SUBJECT, tokens, { escape: false });

  return sendViaResend(env.RESEND_API_KEY, {
    from: env.MAIL_FROM,
    to: env.INTERNAL_NOTIFY_TO,
    subject,
    html,
    text,
    replyTo: p.lead.email,
  });
}

/* ---------------- HTTP helpers ---------------- */

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function preflight(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env) },
  });
}
