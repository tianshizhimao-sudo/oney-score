/* Bank-Ready Score — transparent scoring logic */
(function () {
  'use strict';

  var WEIGHTS = {
    profile: 10,
    history: 10,
    financials: 20,
    liquidity: 15,
    compliance: 15,
    debt: 10,
    security: 10,
    docs: 10
  };

  var VALUE_SCORE = {
    entityType: {
      sole_trader: 6,
      partnership: 6,
      trust: 7,
      company: 8
    },
    industryRisk:       { low: 10, medium: 7, high: 4 },
    yearsTrading:       { lt1: 2, '1to2': 5, '2to5': 8, gt5: 10 },
    annualRevenueBand:  { falling: 3, stable: 7, growing: 10 },
    profitability:      { loss: 2, thin: 6, healthy: 10 },
    cashBufferMonths:   { lt1: 2, '1to3': 5, '3to6': 8, gt6: 10 },
    cashFlowConfidence: { poor: 3, ok: 7, strong: 10 },
    taxLodgements:      { behind: 2, mostly: 6, current: 10 },
    atoDebt:            { material: 2, managed: 6, none: 10 },
    repaymentConduct:   { poor: 2, ok: 6, clean: 10 },
    securityStrength:   { weak: 3, moderate: 7, strong: 10 },
    docsReady:          { no: 2, partial: 6, yes: 10 }
  };

  var DIMENSION_LABELS = {
    profile:    'Business profile',
    history:    'Trading history',
    financials: 'Revenue & profitability',
    liquidity:  'Cash flow & liquidity',
    compliance: 'Tax / BAS / ATO',
    debt:       'Debt conduct',
    security:   'Security position',
    docs:       'Documentation'
  };

  var RECOMMENDATION_TEMPLATES = {
    profile:    'Sharpen the borrower story: structure, industry positioning, and who actually trades behind the entity.',
    history:    'If trading history is thin, compensate with mitigants — strong management experience, pre-orders, or contracted revenue.',
    financials: 'Tighten the profit story: explain revenue consistency, margins and servicing capacity before a lender guesses.',
    liquidity:  'Build a stronger cash buffer and show cleaner short-term liquidity coverage before you lodge.',
    compliance: 'Bring tax returns, BAS and ATO position fully up to date — this usually moves the dial more than anything else.',
    debt:       'Stabilise existing repayment conduct and show six months clean before you take an application forward.',
    security:   'Clarify available security, or restructure the request around stronger collateral support.',
    docs:       'Prepare a clean credit pack: financials, BAS, statements, ATO evidence and an asset/liability schedule.'
  };

  var DEFAULT_RECOMMENDATION = 'Strengthen the weakest dimensions before approaching a bank directly.';

  function avg(values) {
    if (!values.length) return 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) sum += values[i];
    return sum / values.length;
  }

  function dimensionContribution(values, weight) {
    return Math.round(avg(values) * (weight / 10));
  }

  function bandForScore(score) {
    if (score >= 80) return 'strong';
    if (score >= 60) return 'borderline';
    return 'needs-work';
  }

  function labelForBand(band) {
    if (band === 'strong') return 'Strong bank-ready';
    if (band === 'borderline') return 'Close — polish before applying';
    return 'Needs work before application';
  }

  function nextStepForBand(band) {
    if (band === 'strong') return 'Approach the bank now';
    if (band === 'borderline') return 'Broker-led polish first';
    return 'Improve before application';
  }

  function buildBreakdown(answers) {
    function v(id) {
      var table = VALUE_SCORE[id] || {};
      var picked = answers[id];
      return picked && table[picked] != null ? table[picked] : 0;
    }

    return [
      { id: 'profile',    label: DIMENSION_LABELS.profile,    weight: WEIGHTS.profile,    score: dimensionContribution([v('entityType'), v('industryRisk')], WEIGHTS.profile) },
      { id: 'history',    label: DIMENSION_LABELS.history,    weight: WEIGHTS.history,    score: dimensionContribution([v('yearsTrading')], WEIGHTS.history) },
      { id: 'financials', label: DIMENSION_LABELS.financials, weight: WEIGHTS.financials, score: dimensionContribution([v('annualRevenueBand'), v('profitability')], WEIGHTS.financials) },
      { id: 'liquidity',  label: DIMENSION_LABELS.liquidity,  weight: WEIGHTS.liquidity,  score: dimensionContribution([v('cashBufferMonths'), v('cashFlowConfidence')], WEIGHTS.liquidity) },
      { id: 'compliance', label: DIMENSION_LABELS.compliance, weight: WEIGHTS.compliance, score: dimensionContribution([v('taxLodgements'), v('atoDebt')], WEIGHTS.compliance) },
      { id: 'debt',       label: DIMENSION_LABELS.debt,       weight: WEIGHTS.debt,       score: dimensionContribution([v('repaymentConduct')], WEIGHTS.debt) },
      { id: 'security',   label: DIMENSION_LABELS.security,   weight: WEIGHTS.security,   score: dimensionContribution([v('securityStrength')], WEIGHTS.security) },
      { id: 'docs',       label: DIMENSION_LABELS.docs,       weight: WEIGHTS.docs,       score: dimensionContribution([v('docsReady')], WEIGHTS.docs) }
    ];
  }

  function recommendationsFromBreakdown(breakdown) {
    var ranked = breakdown.slice().sort(function (a, b) {
      var ratioA = a.score / Math.max(a.weight, 1);
      var ratioB = b.score / Math.max(b.weight, 1);
      return ratioA - ratioB;
    });
    var top = ranked.slice(0, 3);
    return top.map(function (item) {
      return {
        id: item.id,
        label: item.label,
        text: RECOMMENDATION_TEMPLATES[item.id] || DEFAULT_RECOMMENDATION
      };
    });
  }

  function evaluateBankReadyScore(answers) {
    var breakdown = buildBreakdown(answers);
    var total = breakdown.reduce(function (sum, item) { return sum + item.score; }, 0);
    total = Math.max(0, Math.min(100, total));
    var band = bandForScore(total);

    return {
      total: total,
      band: band,
      bandLabel: labelForBand(band),
      breakdown: breakdown,
      recommendations: recommendationsFromBreakdown(breakdown),
      nextStep: nextStepForBand(band)
    };
  }

  window.evaluateBankReadyScore = evaluateBankReadyScore;
  window.SCORE_LOGIC = {
    weights: WEIGHTS,
    valueScore: VALUE_SCORE,
    dimensionLabels: DIMENSION_LABELS,
    bandForScore: bandForScore,
    labelForBand: labelForBand,
    evaluate: evaluateBankReadyScore
  };
})();
