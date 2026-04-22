/* Bank-Ready Score — report payload serializer
 *
 * Pure function: given the current score + insight result and a lead
 * object (user fields from the capture modal), produce a structured,
 * backend-friendly payload. Kept separate from transport code so the
 * same serialiser can feed the capture adapter, the in-page report
 * view, an email template, or a future CRM webhook.
 */
(function () {
  'use strict';

  var PRODUCT_VERSION = 'bank-ready-score@1.1.0';
  var SCORING_VERSION = '1';
  var DISCLAIMER_VERSION = '1';
  var DISCLAIMER_TEXT =
    'This is a readiness signal, not credit approval or financial advice. ' +
    'It points at the likely gaps before a lender sees them — a qualified ' +
    'broker or commercial banker can confirm the exact next step for your ' +
    'situation.';

  function generateReportId() {
    // URL-safe, non-guessable-enough ID. Avoids external deps.
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

  /* Core schema field IDs are camelCase by historical convention. The
     serialised payload is snake_case-only, so we remap them here at the
     boundary — internal engine state (localStorage) is unchanged. */
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

  function coreAnswersSnapshot(coreAnswers) {
    if (!coreAnswers) return {};
    var out = {};
    Object.keys(CORE_KEY_MAP).forEach(function (internalKey) {
      if (coreAnswers[internalKey] != null) {
        out[CORE_KEY_MAP[internalKey]] = coreAnswers[internalKey];
      }
    });
    return out;
  }

  function insightAnswersSnapshot(insightAnswers) {
    if (!insightAnswers) return {};
    var keys = [
      'funding_reason', 'recent_pressure', 'revenue_drop_resilience',
      'banking_habits', 'transaction_visibility', 'debt_pressure',
      'revenue_trend', 'least_confident_area'
    ];
    var out = {};
    keys.forEach(function (k) {
      if (insightAnswers[k] != null) out[k] = insightAnswers[k];
    });
    return out;
  }

  function serializeDimensions(breakdown) {
    return (breakdown || []).map(function (item) {
      return {
        id: item.id,
        label: item.label,
        score: item.score,
        weight: item.weight,
        ratio: item.weight > 0 ? Number((item.score / item.weight).toFixed(3)) : 0
      };
    });
  }

  /* App-internal objects (e.g. evaluateInsights output) use camelCase.
     Transport / persistence / email payloads are canonical snake_case.
     This mapper is the boundary — no duplicate alias fields emitted. */
  function serializeProfileSummary(summary) {
    if (!summary) return null;
    return {
      strongest_area:      summary.strongestArea || null,
      weakest_area:        summary.weakestArea || null,
      fastest_improvement: summary.fastestImprovement || null
    };
  }

  function serializeTags(tags) {
    return (tags || []).map(function (t) {
      return { id: t.id, label: t.label, tone: t.tone || 'neutral' };
    });
  }

  function serializeRecommendations(recs) {
    return (recs || []).slice(0, 3).map(function (r) {
      return { id: r.id, label: r.label, text: r.text };
    });
  }

  function sanitiseLead(lead) {
    lead = lead || {};
    var out = {
      first_name: (lead.firstName || '').trim(),
      email: (lead.email || '').trim().toLowerCase(),
      business_name: (lead.businessName || '').trim(),
      mobile: (lead.mobile || '').trim(),
      consent_email: !!lead.consentEmail,
      consent_followup: !!lead.consentFollowUp,
      share: {
        enabled: !!(lead.share && lead.share.enabled),
        broker_name: lead.share ? (lead.share.brokerName || '').trim() : '',
        broker_email: lead.share ? (lead.share.brokerEmail || '').trim().toLowerCase() : '',
        consent_share: !!(lead.share && lead.share.consentShare)
      }
    };
    if (!out.share.enabled) {
      // Never leak fields when sharing is off.
      out.share = { enabled: false };
    }
    return out;
  }

  function buildReportPayload(input) {
    input = input || {};
    var result = input.result || {};
    var insightResult = input.insightResult || null;
    var coreAnswers = input.coreAnswers || {};
    var insightAnswers = input.insightAnswers || {};
    var lead = sanitiseLead(input.lead);

    var reportId = input.reportId || generateReportId();
    var createdAt = input.createdAt || new Date().toISOString();

    var recs = (insightResult && insightResult.rerankedRecommendations) || result.recommendations || [];

    return {
      report_id: reportId,
      created_at: createdAt,
      product_version: PRODUCT_VERSION,
      scoring_version: SCORING_VERSION,
      disclaimer_version: DISCLAIMER_VERSION,
      disclaimer: DISCLAIMER_TEXT,

      overall_score: result.total,
      readiness_band: result.band,
      readiness_label: result.bandLabel,
      next_step: result.nextStep,

      dimensions: serializeDimensions(result.breakdown),
      top_actions: serializeRecommendations(recs),

      insight: insightResult ? {
        completion_state: insightResult.completionState,
        answered_count: insightResult.answeredCount,
        total_questions: insightResult.totalQuestions,
        profile_tags: serializeTags(insightResult.profileTags),
        profile_summary: serializeProfileSummary(insightResult.profileSummary),
        lead_segment: insightResult.leadSegment,
        signal_counts: insightResult.signalCounts || {}
      } : {
        completion_state: 'unavailable',
        answered_count: 0,
        total_questions: 0,
        profile_tags: [],
        profile_summary: null,
        lead_segment: 'unavailable',
        signal_counts: {}
      },

      key_answers: {
        core: coreAnswersSnapshot(coreAnswers),
        insight: insightAnswersSnapshot(insightAnswers)
      },

      lead: lead
    };
  }

  window.OneyReportSerializer = {
    build: buildReportPayload,
    generateReportId: generateReportId,
    PRODUCT_VERSION: PRODUCT_VERSION,
    DISCLAIMER_VERSION: DISCLAIMER_VERSION
  };
})();
