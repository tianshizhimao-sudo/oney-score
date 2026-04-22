/* Bank-Ready Score — report platform (provider-based adapters)
 *
 * Two modes of operation, selected by `window.ONEY_REPORT_CONFIG.mode`:
 *
 *   'mock' — default, static/GitHub-Pages build. Persists to localStorage,
 *            encodes the share URL in a hash fragment, returns a structured
 *            ReportSubmitResponse so the UI does not branch on mode.
 *
 *   'live' — single `POST {apiBaseUrl}{endpoints.submitReport}` that the
 *            backend fans out into lead capture + user email + optional
 *            broker share + internal notification. Share URL is id-based
 *            (`?id=<report_id>`); the viewer resolves via
 *            `GET {apiBaseUrl}{endpoints.getReport}/:id`.
 *
 * Contract docs:
 *   docs/report-integration.md      — endpoint + payload + response shapes
 *   docs/report-email-templates.md  — email template token contracts
 *
 * Secrets never live here. The backend authenticates the request path
 * (Cloudflare Worker, API Gateway + IAM, signed webhooks, etc).
 */
(function () {
  'use strict';

  /* ---------------- Config resolution ---------------- */

  var DEFAULT_ENDPOINTS = {
    submitReport: '/score-report/submit',
    getReport:    '/score-report/report',
    unsubscribe:  '/score-report/unsubscribe'
  };

  function getConfig() {
    var user = window.ONEY_REPORT_CONFIG || {};
    var endpoints = Object.assign({}, DEFAULT_ENDPOINTS, (user.endpoints || {}));
    var baseUrl = user.apiBaseUrl || null;
    return {
      mode:            user.mode === 'live' ? 'live' : 'mock',
      apiBaseUrl:      baseUrl,
      endpoints:       endpoints,
      submitUrl:       baseUrl ? joinUrl(baseUrl, endpoints.submitReport) : null,
      getReportUrl:    baseUrl ? joinUrl(baseUrl, endpoints.getReport)   : null,
      unsubscribeUrl:  baseUrl ? joinUrl(baseUrl, endpoints.unsubscribe) : null,
      reportViewerUrl: user.reportViewerUrl || defaultViewerUrl(),
      requestTimeoutMs: user.requestTimeoutMs || 10000,
      analytics:       user.analytics || { enabled: true }
    };
  }

  function defaultViewerUrl() {
    try { return window.location.origin + '/report.html'; }
    catch (e) { return '/report.html'; }
  }

  function joinUrl(base, path) {
    if (!base) return path;
    if (!path) return base;
    return base.replace(/\/+$/, '') + (path[0] === '/' ? '' : '/') + path;
  }

  /* ---------------- HTTP helpers ---------------- */

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(timer); resolve(v); },
                   function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function postJson(url, payload, timeoutMs) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch-unavailable'));
    var req = fetch(url, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('http-' + r.status);
      return r.json().catch(function () { return {}; });
    });
    return withTimeout(req, timeoutMs);
  }

  function getJson(url, timeoutMs) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch-unavailable'));
    var req = fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      if (!r.ok) throw new Error('http-' + r.status);
      return r.json();
    });
    return withTimeout(req, timeoutMs);
  }

  /* ---------------- Local storage (mock mode) ---------------- */

  var STORAGE_KEYS = {
    leads:   'oney-score-report-leads',
    records: 'oney-score-report-records',
    last:    'oney-score-report-last-submit'
  };

  function readStore(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }
  function writeStore(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  function persistMockSubmit(payload) {
    var records = readStore(STORAGE_KEYS.records);
    records[payload.report.report_id] = payload;
    writeStore(STORAGE_KEYS.records, records);

    var leads = readStore(STORAGE_KEYS.leads);
    leads[payload.report.report_id] = {
      lead: payload.lead,
      share: payload.share,
      report_id: payload.report.report_id,
      created_at: payload.report.created_at,
      overall_score: payload.report.overall_score,
      readiness_band: payload.report.readiness_band,
      recommended_path: payload.report.recommended_path,
      profile_tags: payload.report.profile_tags,
      lead_segment: null, // intentional: not in public contract
      source: 'bank-ready-score'
    };
    writeStore(STORAGE_KEYS.leads, leads);

    writeStore(STORAGE_KEYS.last, {
      report_id: payload.report.report_id,
      submitted_at: new Date().toISOString(),
      mode: 'mock'
    });
  }

  function readLocalReport(reportId) {
    var store = readStore(STORAGE_KEYS.records);
    return store[reportId] || null;
  }

  /* ---------------- Submit orchestrator ---------------- */

  function submitReport(payload) {
    var cfg = getConfig();
    // Inject resolved report_url into meta before any transport sees it.
    var reportUrl = buildReportUrl(payload, cfg);
    payload.meta = Object.assign({}, payload.meta || {}, { report_url: reportUrl });

    if (cfg.mode === 'live' && cfg.submitUrl) {
      return postJson(cfg.submitUrl, payload, cfg.requestTimeoutMs)
        .then(function (res) { return normaliseSubmitResponse(res, payload, cfg, 'live'); })
        .catch(function () {
          // Graceful live→mock fallback so the UI never breaks mid-submit.
          return mockSubmit(payload, cfg);
        });
    }
    return mockSubmit(payload, cfg);
  }

  function mockSubmit(payload, cfg) {
    persistMockSubmit(payload);
    var wantsShare = !!(payload.share && payload.share.enabled && payload.share.recipient_email && payload.share.consent_confirmed);
    var response = {
      success: true,
      mode: 'mock',
      report: {
        reportId:   payload.report.report_id,
        reportUrl:  buildReportUrl(payload, cfg || getConfig()),
        reportPath: null,
        expiresAt:  null
      },
      deliveries: {
        userEmail: { queued: true, sent: false, email: payload.lead.email },
        internalNotification: { queued: true, sent: false }
      },
      unsubscribeUrlTemplate: null,
      message: 'Stored locally. Live delivery will happen once a backend is configured.'
    };
    if (wantsShare) {
      response.deliveries.recipientEmail = {
        queued: true, sent: false, email: payload.share.recipient_email
      };
    }
    return Promise.resolve(response);
  }

  /* Backend shape hygiene: guarantee the UI sees a consistent envelope
     even if the live endpoint returns partial fields. */
  function normaliseSubmitResponse(res, payload, cfg, mode) {
    var reportId  = (res.report && res.report.reportId)  || payload.report.report_id;
    var reportUrl = (res.report && res.report.reportUrl) || buildReportUrl(payload, cfg);
    return {
      success: res.success !== false,
      mode: res.mode || mode,
      report: {
        reportId:   reportId,
        reportUrl:  reportUrl,
        reportPath: (res.report && res.report.reportPath) || null,
        expiresAt:  (res.report && res.report.expiresAt)  || null
      },
      deliveries: res.deliveries || {
        userEmail: { queued: true, email: payload.lead.email },
        internalNotification: { queued: true }
      },
      unsubscribeUrlTemplate: res.unsubscribeUrlTemplate || null,
      message: res.message || null
    };
  }

  /* ---------------- Report URL builder + resolver ---------------- */

  /* Canonical report URL:
       mock mode → hash-encoded payload (4KB-ish, safe to share)
       live mode → id-based link resolved server-side
     Renderer is URL-strategy-agnostic (see score.report.view.js). */
  function buildReportUrl(payload, cfg) {
    cfg = cfg || getConfig();
    var base = cfg.reportViewerUrl;
    if (cfg.mode === 'live') {
      return base + '?id=' + encodeURIComponent(payload.report.report_id);
    }
    return base + '#r=' + encodePayloadForUrl(payload);
  }

  /* The hash-encoded payload carries only what the viewer needs to
     render the report. PII (email, mobile, share contact details,
     follow-up consent, meta.user_agent) is stripped so the same URL
     is safe to hand to a broker. */
  function encodePayloadForUrl(payload) {
    var slim = {
      report: payload.report,
      lead: {
        first_name:    (payload.lead && payload.lead.first_name) || '',
        business_name: (payload.lead && payload.lead.business_name) || ''
      },
      share: payload.share && payload.share.enabled
        ? { enabled: true, recipient_type: payload.share.recipient_type || 'broker' }
        : { enabled: false }
    };
    var json = JSON.stringify(slim);
    try {
      return encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
    } catch (e) {
      return encodeURIComponent(json);
    }
  }

  function decodePayloadFromUrl(encoded) {
    try {
      var raw = decodeURIComponent(encoded);
      var json;
      try { json = decodeURIComponent(escape(atob(raw))); }
      catch (e) { json = raw; }
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  /* Viewer-side helper: given a report id, fetch the canonical payload.
     Live mode → GET resolver; mock mode → localStorage lookup. */
  function resolveReportById(reportId) {
    var cfg = getConfig();
    if (cfg.mode === 'live' && cfg.getReportUrl) {
      return getJson(joinUrl(cfg.getReportUrl, encodeURIComponent(reportId)), cfg.requestTimeoutMs)
        .then(function (res) {
          // Expected shape: { success, report, leadSummary?, shareSummary? }
          if (res && res.success && res.report) {
            return {
              report: res.report,
              lead: res.leadSummary
                ? { first_name: res.leadSummary.firstName || '', business_name: res.leadSummary.businessName || '' }
                : { first_name: '', business_name: '' },
              share: res.shareSummary || { enabled: false }
            };
          }
          return null;
        })
        .catch(function () { return readLocalReport(reportId); });
    }
    return Promise.resolve(readLocalReport(reportId));
  }

  /* ---------------- Public surface ---------------- */

  window.OneyReportPlatform = {
    submit:               submitReport,
    buildReportUrl:       buildReportUrl,
    encodePayloadForUrl:  encodePayloadForUrl,
    decodePayloadFromUrl: decodePayloadFromUrl,
    resolveReportById:    resolveReportById,
    _config:              getConfig,
    _storageKeys:         STORAGE_KEYS
  };
})();
