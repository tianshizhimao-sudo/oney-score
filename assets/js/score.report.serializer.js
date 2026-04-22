/* Bank-Ready Score — report payload serializer
 *
 * Boundary mapper from internal app state (camelCase) to the canonical
 * wire / persistence / email-template payload (snake_case only).
 *
 * Shape follows `docs/report-integration.md` → ReportSubmitRequest:
 *   { lead, share?, report, meta }
 *
 * Reference docs:
 *   docs/report-integration.md      — transport / endpoint contract
 *   docs/report-email-templates.md  — email template token map
 */
(function () {
  'use strict';

  var DEFAULTS = {
    productVersion:   'bank-ready-score-v1',
    scoringVersion:   'bank-ready-v1',
    disclaimerVersion:'2026-04'
  };

  function versions() {
    var cfg = (window.ONEY_REPORT_CONFIG || {});
    return {
      product_version:    cfg.productVersion    || DEFAULTS.productVersion,
      scoring_version:    cfg.scoringVersion    || DEFAULTS.scoringVersion,
      disclaimer_version: cfg.disclaimerVersion || DEFAULTS.disclaimerVersion
    };
  }

  function mode() {
    var cfg = (window.ONEY_REPORT_CONFIG || {});
    return cfg.mode === 'live' ? 'live' : 'mock';
  }

  function generateReportId() {
    var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var rand = '';
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint8Array(10);
      window.crypto.getRandomValues(buf);
      for (var i = 0; i < buf.length; i++) rand += alphabet[buf[i] % alphabet.length];
    } else {
      for (var j = 0; j < 10; j++) rand += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return 'rpt_' + rand;
  }

  /* Internal engine field IDs are camelCase by historical convention.
     Remap at the boundary. Engine state in localStorage is unchanged. */
  var CORE_KEY_MAP = {
    entityType:         'entity_type',
    industryRisk:       'industry_risk',
    yearsTrading:       'years_trading',
    annualRevenueBand:  'annual_revenue_band',
    profitability:      'profitability',
    cashBufferMonths:   'cash_buffer_months',
    cashFlowConfidence: 'cash_flow_confidence',
    taxLodgements:      'tax_lodgements',
    atoDebt:            'ato_debt',
    repaymentConduct:   'repayment_conduct',
    securityStrength:   'security_strength',
    docsReady:          'docs_ready'
  };

  var INSIGHT_KEYS = [
    'funding_reason', 'recent_pressure', 'revenue_drop_resilience',
    'banking_habits', 'transaction_visibility', 'debt_pressure',
    'revenue_trend', 'least_confident_area'
  ];

  function keyAnswers(coreAnswers, insightAnswers) {
    var out = {};
    if (coreAnswers) {
      Object.keys(CORE_KEY_MAP).forEach(function (k) {
        if (coreAnswers[k] != null) out[CORE_KEY_MAP[k]] = coreAnswers[k];
      });
    }
    if (insightAnswers) {
      INSIGHT_KEYS.forEach(function (k) {
        if (insightAnswers[k] != null) out[k] = insightAnswers[k];
      });
    }
    return out;
  }

  /* Contract: readiness_band = strong | borderline | needs_work (underscore). */
  function normaliseBand(band) {
    if (band === 'needs-work') return 'needs_work';
    if (band === 'strong' || band === 'borderline' || band === 'needs_work') return band;
    return band;
  }

  /* Contract: recommended_path = approach_bank | broker_review | improve_first. */
  function recommendedPathFromBand(band) {
    if (band === 'strong')     return 'approach_bank';
    if (band === 'borderline') return 'broker_review';
    return 'improve_first';
  }

  /* Flat map { dimension_id: numeric_score }. Labels stay in the viewer. */
  function dimensionScores(breakdown) {
    var out = {};
    (breakdown || []).forEach(function (item) {
      out[item.id] = item.score;
    });
    return out;
  }

  /* Contract: profile_tags is a string[] of tag labels. Tone / id stay internal. */
  function profileTagLabels(tags) {
    return (tags || []).map(function (t) { return t.label; });
  }

  function profileSummary(summary) {
    if (!summary) return null;
    return {
      strongest_area:      summary.strongestArea || null,
      weakest_area:        summary.weakestArea || null,
      fastest_improvement: summary.fastestImprovement || null
    };
  }

  function topPriorityActions(recs) {
    return (recs || []).slice(0, 3).map(function (r) {
      return { id: r.id, label: r.label, body: r.text };
    });
  }

  /* Contract: funding_signals is a unique string[] of signal tokens the
     user's insight answers fired. Derived here; no separate counts leak. */
  function fundingSignals(insightAnswers, insightSchema) {
    var schema = insightSchema || window.INSIGHT_SCHEMA;
    if (!schema || !insightAnswers) return [];
    var seen = {};
    var out = [];
    (schema.allQuestions || []).forEach(function (entry) {
      var q = entry.question;
      var picked = insightAnswers[q.id];
      if (picked == null) return;
      var opt = (q.options || []).find(function (o) { return o.value === picked; });
      if (!opt || !opt.signals) return;
      opt.signals.forEach(function (tok) {
        if (!seen[tok]) { seen[tok] = 1; out.push(tok); }
      });
    });
    return out;
  }

  function insightCompletionState(insightResult) {
    if (!insightResult) return 'skipped';
    var s = insightResult.completionState;
    return (s === 'complete' || s === 'partial' || s === 'skipped') ? s : 'skipped';
  }

  /* ---------------- Sub-payload builders ---------------- */

  function buildLead(raw) {
    raw = raw || {};
    return {
      first_name:      (raw.firstName || '').trim(),
      email:           (raw.email || '').trim().toLowerCase(),
      business_name:   (raw.businessName || '').trim(),
      mobile:          (raw.mobile || '').trim(),
      wants_follow_up: !!raw.consentFollowUp
    };
  }

  function buildShare(raw) {
    raw = raw || {};
    var enabled = !!(raw.share && raw.share.enabled);
    if (!enabled) return { enabled: false };
    return {
      enabled:           true,
      recipient_type:    (raw.share.recipientType || 'broker').toLowerCase(),
      recipient_name:    (raw.share.recipientName || '').trim(),
      recipient_email:   (raw.share.recipientEmail || '').trim().toLowerCase(),
      consent_confirmed: !!raw.share.consentConfirmed
    };
  }

  function buildReport(input, versionBlock) {
    var result = input.result || {};
    var insightResult = input.insightResult || null;
    var recs = (insightResult && insightResult.rerankedRecommendations) || result.recommendations || [];
    var band = normaliseBand(result.band);

    return {
      report_id:               input.reportId || generateReportId(),
      created_at:              input.createdAt || new Date().toISOString(),
      overall_score:           result.total,
      readiness_band:          band,
      recommended_path:        recommendedPathFromBand(band),
      dimension_scores:        dimensionScores(result.breakdown),
      insight_completion_state: insightCompletionState(insightResult),
      profile_tags:            profileTagLabels(insightResult && insightResult.profileTags),
      profile_summary:         profileSummary(insightResult && insightResult.profileSummary),
      top_priority_actions:    topPriorityActions(recs),
      key_answers:             keyAnswers(input.coreAnswers, input.insightAnswers),
      funding_signals:         fundingSignals(input.insightAnswers),
      product_version:         versionBlock.product_version,
      scoring_version:         versionBlock.scoring_version,
      disclaimer_version:      versionBlock.disclaimer_version
    };
  }

  function buildMeta(input) {
    return {
      source:    'bank-ready-score',
      mode:      mode(),
      user_agent: (navigator && navigator.userAgent) || null,
      locale:    (navigator && navigator.language) || null,
      page_url:  (window.location && window.location.href) || null,
      report_url: input.reportUrl || null
    };
  }

  /* ---------------- Public: full submit payload ---------------- */

  function buildSubmitRequest(input) {
    input = input || {};
    var versionBlock = versions();
    var payload = {
      lead:   buildLead(input.lead),
      share:  buildShare(input.lead),
      report: buildReport(input, versionBlock),
      meta:   buildMeta(input)
    };
    return payload;
  }

  /* Legacy callers used `build(input)` — keep as alias. */
  function build(input) { return buildSubmitRequest(input); }

  window.OneyReportSerializer = {
    build: build,
    buildSubmitRequest: buildSubmitRequest,
    generateReportId: generateReportId,
    _recommendedPathFromBand: recommendedPathFromBand
  };
})();
