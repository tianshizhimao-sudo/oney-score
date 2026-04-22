/* Bank-Ready Score — report platform (provider-based adapters)
 *
 * One submit from the modal fans out to multiple adapters so the flow
 * can stay identical whether the site is running against the mocked
 * local adapters (static GitHub Pages build) or against a real
 * backend (lead capture API + email service + CRM webhook).
 *
 * Configure via:
 *   window.ONEY_REPORT_CONFIG = {
 *     leadCaptureUrl:   'https://api.oneyco.com.au/score/leads',
 *     emailServiceUrl:  'https://api.oneyco.com.au/score/emails',
 *     internalWebhookUrl: 'https://hooks.oneyco.com.au/score/internal',
 *     reportViewerUrl:  'https://score.oneyco.com.au/report.html'
 *   };
 *
 * Missing endpoints silently fall back to the local adapter so the UI
 * stays functional. Secrets never live here — transport is signed /
 * authed by whatever backend sits behind these URLs (Cloudflare
 * Worker, Lambda, n8n, HubSpot, etc).
 */
(function () {
  'use strict';

  var DEFAULT_CONFIG = {
    leadCaptureUrl:    null,
    emailServiceUrl:   null,
    internalWebhookUrl:null,
    reportViewerUrl:   (function () {
      try {
        var origin = window.location.origin;
        return origin + '/report.html';
      } catch (e) { return '/report.html'; }
    })(),
    requestTimeoutMs:  8000
  };

  function getConfig() {
    var user = window.ONEY_REPORT_CONFIG || {};
    var merged = {};
    Object.keys(DEFAULT_CONFIG).forEach(function (k) { merged[k] = DEFAULT_CONFIG[k]; });
    Object.keys(user).forEach(function (k) { merged[k] = user[k]; });
    return merged;
  }

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

  /* ---------------- Local (mocked) adapters ---------------- */

  var LOCAL_STORAGE_KEY = 'oney-score-reports';

  function readLocalStore() {
    try {
      var raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }
  function writeLocalStore(store) {
    try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function saveLocalReport(payload) {
    var store = readLocalStore();
    store[payload.report_id] = payload;
    writeLocalStore(store);
  }

  var localAdapters = {
    leadCapture: {
      submit: function (payload) {
        saveLocalReport(payload);
        return Promise.resolve({
          ok: true,
          mode: 'local',
          lead_id: 'local_' + payload.report_id
        });
      }
    },
    email: {
      sendUserReport: function (payload) {
        // No backend → we cannot actually send mail. Return ok:false with
        // mode 'local-pending' so the caller can surface a fallback
        // (e.g. an on-page report view + download button).
        return Promise.resolve({ ok: false, mode: 'local-pending' });
      },
      sendBrokerShare: function (payload) {
        return Promise.resolve({ ok: false, mode: 'local-pending' });
      }
    },
    webhook: {
      postInternal: function (payload) {
        return Promise.resolve({ ok: false, mode: 'local-pending' });
      }
    }
  };

  /* ---------------- HTTP adapters (used when URLs are configured) ---------------- */

  function makeHttpAdapters(cfg) {
    return {
      leadCapture: {
        submit: function (payload) {
          if (!cfg.leadCaptureUrl) return localAdapters.leadCapture.submit(payload);
          return postJson(cfg.leadCaptureUrl, payload, cfg.requestTimeoutMs)
            .then(function (res) { return Object.assign({ ok: true, mode: 'remote' }, res); })
            .catch(function () { return localAdapters.leadCapture.submit(payload); });
        }
      },
      email: {
        sendUserReport: function (payload) {
          if (!cfg.emailServiceUrl) return localAdapters.email.sendUserReport(payload);
          return postJson(cfg.emailServiceUrl, {
            type: 'user_report',
            payload: payload
          }, cfg.requestTimeoutMs)
            .then(function () { return { ok: true, mode: 'remote' }; })
            .catch(function () { return { ok: false, mode: 'remote-error' }; });
        },
        sendBrokerShare: function (payload) {
          if (!cfg.emailServiceUrl) return localAdapters.email.sendBrokerShare(payload);
          if (!(payload.lead && payload.lead.share && payload.lead.share.enabled)) {
            return Promise.resolve({ ok: true, mode: 'skipped' });
          }
          return postJson(cfg.emailServiceUrl, {
            type: 'broker_share',
            payload: payload
          }, cfg.requestTimeoutMs)
            .then(function () { return { ok: true, mode: 'remote' }; })
            .catch(function () { return { ok: false, mode: 'remote-error' }; });
        }
      },
      webhook: {
        postInternal: function (payload) {
          if (!cfg.internalWebhookUrl) return localAdapters.webhook.postInternal(payload);
          return postJson(cfg.internalWebhookUrl, payload, cfg.requestTimeoutMs)
            .then(function () { return { ok: true, mode: 'remote' }; })
            .catch(function () { return { ok: false, mode: 'remote-error' }; });
        }
      }
    };
  }

  /* ---------------- Orchestrator ---------------- */

  function submitReport(payload) {
    var cfg = getConfig();
    var adapters = makeHttpAdapters(cfg);

    var share = payload.lead && payload.lead.share;
    var wantsBrokerShare = !!(share && share.enabled && share.broker_email && share.consent_share);

    var p = {
      leadCapture: adapters.leadCapture.submit(payload),
      userEmail: adapters.email.sendUserReport(payload),
      brokerEmail: wantsBrokerShare ? adapters.email.sendBrokerShare(payload) : Promise.resolve({ ok: true, mode: 'skipped' }),
      internal: adapters.webhook.postInternal(payload)
    };

    return Promise.all([p.leadCapture, p.userEmail, p.brokerEmail, p.internal])
      .then(function (results) {
        return {
          ok: true,
          leadCapture: results[0],
          userEmail: results[1],
          brokerEmail: results[2],
          internal: results[3],
          reportUrl: buildReportUrl(payload, cfg),
          config: { hasBackend: !!cfg.leadCaptureUrl || !!cfg.emailServiceUrl }
        };
      });
  }

  /* Shareable URL. Backend-owned when configured (usually
     `/report.html?id=...`); fallback embeds the payload in the hash
     for cross-device viewing when no backend is present. */
  function buildReportUrl(payload, cfg) {
    var base = cfg.reportViewerUrl || '/report.html';
    if (cfg.leadCaptureUrl) {
      // Backend is authoritative — let it resolve by id.
      return base + '?id=' + encodeURIComponent(payload.report_id);
    }
    var encoded = encodePayloadForUrl(payload);
    return base + '#r=' + encoded;
  }

  function encodePayloadForUrl(payload) {
    // Strip PII from shareable URL so the same link can be sent to a
    // broker without leaking the lead's contact details.
    var copy = Object.assign({}, payload);
    copy.lead = {
      first_name: payload.lead && payload.lead.first_name || '',
      business_name: payload.lead && payload.lead.business_name || '',
      share: payload.lead && payload.lead.share && payload.lead.share.enabled ? { enabled: true } : { enabled: false }
    };
    var json = JSON.stringify(copy);
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
      try {
        json = decodeURIComponent(escape(atob(raw)));
      } catch (e) {
        json = raw;
      }
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  window.OneyReportPlatform = {
    submit: submitReport,
    buildReportUrl: buildReportUrl,
    encodePayloadForUrl: encodePayloadForUrl,
    decodePayloadFromUrl: decodePayloadFromUrl,
    _local: localAdapters,
    _config: getConfig
  };
})();
