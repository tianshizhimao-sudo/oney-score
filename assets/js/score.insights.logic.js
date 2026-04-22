/* Bank-Ready Score — Business Lending Signals evaluator */
/*
 * Intentionally decoupled from the core score. The core Bank-Ready Score
 * continues to drive the numeric result. This layer only produces:
 *   - signal counts
 *   - up to 3 profile tags
 *   - a short profile summary (strength / weakness / fastest lift)
 *   - recommendation priority boosts
 *   - an internal lead segment
 * No direct influence on the numeric overall score is applied here.
 */
(function () {
  'use strict';

  var TAG_DEFS = {
    documentation_risk: {
      id: 'documentation_risk',
      label: 'Documentation risk',
      priority: 1,
      tone: 'risk',
      summaryWeakness: 'documentation readiness'
    },
    cash_flow_pressure: {
      id: 'cash_flow_pressure',
      label: 'Cash flow pressure',
      priority: 2,
      tone: 'risk',
      summaryWeakness: 'cash flow resilience'
    },
    debt_load_concern: {
      id: 'debt_load_concern',
      label: 'Debt load concern',
      priority: 3,
      tone: 'risk',
      summaryWeakness: 'debt structure'
    },
    compliance_pressure: {
      id: 'compliance_pressure',
      label: 'Compliance pressure',
      priority: 4,
      tone: 'risk',
      summaryWeakness: 'tax and BAS readiness'
    },
    growth_ready_structurally_weak: {
      id: 'growth_ready_structurally_weak',
      label: 'Growth ready, structurally weak',
      priority: 5,
      tone: 'mixed',
      summaryStrength: 'growth momentum',
      summaryWeakness: 'lender-ready presentation'
    },
    profitability_concern: {
      id: 'profitability_concern',
      label: 'Profitability concern',
      priority: 6,
      tone: 'risk',
      summaryWeakness: 'profit margin'
    },
    revenue_volatility: {
      id: 'revenue_volatility',
      label: 'Revenue volatility',
      priority: 7,
      tone: 'risk',
      summaryWeakness: 'revenue consistency'
    },
    expense_control_gap: {
      id: 'expense_control_gap',
      label: 'Expense control gap',
      priority: 8,
      tone: 'risk',
      summaryWeakness: 'expense control'
    },
    banking_discipline_strong: {
      id: 'banking_discipline_strong',
      label: 'Banking discipline strong',
      priority: 9,
      tone: 'positive',
      summaryStrength: 'banking discipline'
    },
    operationally_stable: {
      id: 'operationally_stable',
      label: 'Operationally stable',
      priority: 10,
      tone: 'positive',
      summaryStrength: 'operating stability'
    }
  };

  /* Map a core breakdown entry's ratio into simple strength bands. */
  function ratio(item) {
    return item.weight > 0 ? item.score / item.weight : 0;
  }
  function isWeak(item) { return ratio(item) < 0.5; }
  function isStrong(item) { return ratio(item) >= 0.8; }

  function byId(breakdown) {
    var map = {};
    breakdown.forEach(function (item) { map[item.id] = item; });
    return map;
  }

  function weakDim(core, id) {
    var item = core.breakdownById[id];
    return item ? isWeak(item) : false;
  }
  function strongDim(core, id) {
    var item = core.breakdownById[id];
    return item ? isStrong(item) : false;
  }

  /* Collect signal token counts across answered insight questions. */
  function collectSignals(insightAnswers, schema) {
    var counts = {};
    var answered = 0;
    var total = schema.allQuestions.length;

    schema.allQuestions.forEach(function (entry) {
      var q = entry.question;
      var picked = insightAnswers[q.id];
      if (picked == null) return;
      answered += 1;
      var opt = (q.options || []).find(function (o) { return o.value === picked; });
      if (!opt || !opt.signals) return;
      opt.signals.forEach(function (token) {
        counts[token] = (counts[token] || 0) + 1;
      });
    });

    return {
      signalCounts: counts,
      answeredCount: answered,
      skippedCount: Math.max(0, total - answered),
      totalQuestions: total
    };
  }

  /* Map signal counts + core breakdown into an ordered tag set (max 3). */
  function resolveProfileTags(signals, core, insightAnswers) {
    var s = signals.signalCounts;
    function n(key) { return s[key] || 0; }

    var triggered = [];

    function add(id) {
      if (!TAG_DEFS[id]) return;
      if (triggered.indexOf(id) === -1) triggered.push(id);
    }

    /* Documentation risk — any 2 of: documentation_risk >=1, banking_discipline_mixed >=1,
       core docs weak, core compliance weak. */
    var docRiskScore = 0;
    if (n('documentation_risk') >= 1) docRiskScore++;
    if (n('banking_discipline_mixed') >= 1) docRiskScore++;
    if (weakDim(core, 'docs')) docRiskScore++;
    if (weakDim(core, 'compliance')) docRiskScore++;
    if (docRiskScore >= 2) add('documentation_risk');

    /* Cash flow pressure — any 2 of: cash_flow_pressure >=1, cash_buffer_thin >=1,
       working_capital_pressure >=1, core liquidity weak. */
    var cashScore = 0;
    if (n('cash_flow_pressure') >= 1) cashScore++;
    if (n('cash_buffer_thin') >= 1) cashScore++;
    if (n('working_capital_pressure') >= 1) cashScore++;
    if (weakDim(core, 'liquidity')) cashScore++;
    if (cashScore >= 2) add('cash_flow_pressure');

    /* Expense control gap */
    if (n('expense_control_gap') >= 1 &&
        (n('fixed_cost_pressure') >= 1 || n('cash_flow_pressure') >= 1)) {
      add('expense_control_gap');
    }

    /* Debt load concern — any 2 of: debt_load_concern >=1, core debt weak,
       funding purpose is refinance. */
    var debtScore = 0;
    if (n('debt_load_concern') >= 1) debtScore++;
    if (weakDim(core, 'debt')) debtScore++;
    if (insightAnswers && insightAnswers.funding_reason === 'refinance') debtScore++;
    if (debtScore >= 2) add('debt_load_concern');

    /* Growth ready but structurally weak */
    if (n('growth_ready') >= 1 &&
        (n('documentation_risk') >= 1 || n('debt_load_concern') >= 1 || n('cash_flow_pressure') >= 1)) {
      add('growth_ready_structurally_weak');
    }

    /* Operationally stable */
    if (n('operationally_stable') >= 2 &&
        n('cash_flow_pressure') === 0 &&
        n('debt_load_concern') === 0) {
      add('operationally_stable');
    }

    /* Banking discipline strong */
    if (n('banking_discipline_strong') >= 2 && !weakDim(core, 'docs')) {
      add('banking_discipline_strong');
    }

    /* Compliance pressure */
    if (n('compliance_pressure') >= 2 ||
        (n('compliance_pressure') >= 1 && weakDim(core, 'compliance'))) {
      add('compliance_pressure');
    }

    /* Revenue volatility */
    if (n('volatility_risk') >= 1 || n('revenue_pressure') >= 1) {
      add('revenue_volatility');
    }

    /* Profitability concern */
    if (n('profitability_risk') >= 1 || weakDim(core, 'financials')) {
      add('profitability_concern');
    }

    var sorted = triggered.slice().sort(function (a, b) {
      return TAG_DEFS[a].priority - TAG_DEFS[b].priority;
    });
    return sorted.slice(0, 3).map(function (id) { return TAG_DEFS[id]; });
  }

  /* Derive a short banker-style profile summary from tags + core breakdown. */
  var STRENGTH_LABEL = {
    profile:    'borrower profile',
    history:    'trading history',
    financials: 'profitability',
    liquidity:  'cash buffer',
    compliance: 'tax and BAS readiness',
    debt:       'repayment conduct',
    security:   'security position',
    docs:       'documentation'
  };
  var WEAKNESS_LABEL = {
    profile:    'borrower profile clarity',
    history:    'trading history depth',
    financials: 'profit margin',
    liquidity:  'cash flow resilience',
    compliance: 'tax / BAS readiness',
    debt:       'debt conduct',
    security:   'security position',
    docs:       'documentation readiness'
  };
  var IMPROVEMENT_LABEL = {
    documentation_risk: 'organising BAS, financials and bank statements',
    cash_flow_pressure: 'stabilising the short-term cash cycle',
    debt_load_concern: 'reducing repayment pressure or restructuring debt',
    compliance_pressure: 'bringing tax and BAS fully up to date',
    growth_ready_structurally_weak: 'cleaning up the lender-ready paper trail',
    profitability_concern: 'tightening margin and expense control',
    revenue_volatility: 'showing context around revenue variability',
    expense_control_gap: 'separating business and personal expenses',
    banking_discipline_strong: 'preparing a cleaner bank submission pack',
    operationally_stable: 'clarifying lending purpose and loan structure'
  };

  function pickStrongestDim(core) {
    var best = null;
    core.breakdown.forEach(function (item) {
      if (!best || ratio(item) > ratio(best)) best = item;
    });
    return best;
  }
  function pickWeakestDim(core) {
    var worst = null;
    core.breakdown.forEach(function (item) {
      if (!worst || ratio(item) < ratio(worst)) worst = item;
    });
    return worst;
  }

  function buildProfileSummary(tags, core, signals) {
    var positiveTag = tags.find(function (t) { return t.tone === 'positive'; });
    var riskTag = tags.find(function (t) { return t.tone === 'risk' || t.tone === 'mixed'; });

    var strongest;
    if (positiveTag && positiveTag.summaryStrength) {
      strongest = positiveTag.summaryStrength;
    } else if (signals && signals.answeredCount > 0) {
      var strongDim = pickStrongestDim(core);
      strongest = strongDim ? STRENGTH_LABEL[strongDim.id] : null;
    } else {
      var sd = pickStrongestDim(core);
      strongest = sd ? STRENGTH_LABEL[sd.id] : null;
    }

    var weakest;
    if (riskTag && riskTag.summaryWeakness) {
      weakest = riskTag.summaryWeakness;
    } else {
      var wd = pickWeakestDim(core);
      weakest = wd ? WEAKNESS_LABEL[wd.id] : null;
    }

    var improvement = null;
    var leadTag = tags[0];
    if (leadTag && IMPROVEMENT_LABEL[leadTag.id]) {
      improvement = IMPROVEMENT_LABEL[leadTag.id];
    } else {
      var wd2 = pickWeakestDim(core);
      improvement = wd2 ? IMPROVEMENT_LABEL_BY_DIM[wd2.id] || 'strengthening the weakest dimension' : 'strengthening the weakest dimension';
    }

    return {
      strongestArea: strongest,
      weakestArea: weakest,
      fastestImprovement: improvement
    };
  }

  var IMPROVEMENT_LABEL_BY_DIM = {
    profile:    'clarifying the borrower story',
    history:    'presenting trading history with mitigants',
    financials: 'tightening the profit narrative',
    liquidity:  'building a stronger cash buffer',
    compliance: 'bringing tax and BAS fully up to date',
    debt:       'showing six clean months of repayment conduct',
    security:   'positioning security more clearly',
    docs:       'preparing a clean credit pack'
  };

  /* Boost tokens mapped to recommendation IDs (dimensions). */
  var TAG_RECOMMENDATION_BOOSTS = {
    documentation_risk:             ['docs', 'compliance'],
    cash_flow_pressure:             ['liquidity'],
    debt_load_concern:              ['debt'],
    compliance_pressure:            ['compliance'],
    growth_ready_structurally_weak: ['docs', 'compliance', 'financials'],
    profitability_concern:          ['financials'],
    revenue_volatility:             ['financials'],
    expense_control_gap:            ['docs', 'liquidity'],
    banking_discipline_strong:      ['profile'],
    operationally_stable:           ['profile']
  };

  /* Lead segments for CRM / broker routing. Internal only. */
  function deriveLeadSegment(tags, core) {
    var ids = tags.map(function (t) { return t.id; });
    if (ids.indexOf('debt_load_concern') !== -1) return 'debt-restructure-candidate';
    if (ids.indexOf('documentation_risk') !== -1) return 'documentation-friction';
    if (ids.indexOf('cash_flow_pressure') !== -1) return 'cash-flow-stressed';
    if (ids.indexOf('growth_ready_structurally_weak') !== -1) return 'growth-needs-structure';
    if (ids.indexOf('operationally_stable') !== -1 && core.band === 'strong') return 'stable-bankable';
    if (ids.length === 0) return 'unclear-needs-education';
    return 'unclear-needs-education';
  }

  /* Re-rank core recommendations using tag boosts; never drops baseline items.
     Also prepends an insight-tailored framing line when a lead tag is present. */
  function rerankRecommendations(baseRecs, tags) {
    if (!baseRecs || !baseRecs.length) return baseRecs || [];
    var boosted = {};
    tags.forEach(function (t) {
      (TAG_RECOMMENDATION_BOOSTS[t.id] || []).forEach(function (dimId) {
        boosted[dimId] = (boosted[dimId] || 0) + (4 - Math.min(3, TAG_DEFS[t.id].priority));
      });
    });
    return baseRecs.slice().sort(function (a, b) {
      var aBoost = boosted[a.id] || 0;
      var bBoost = boosted[b.id] || 0;
      return bBoost - aBoost;
    });
  }

  /* Public evaluator. Merges insight output onto a core score result. */
  function evaluateInsights(insightAnswers, coreResult) {
    var schema = window.INSIGHT_SCHEMA;
    var core = Object.assign({}, coreResult, {
      breakdownById: byId(coreResult.breakdown)
    });
    var signals = collectSignals(insightAnswers || {}, schema);
    var answered = signals.answeredCount;
    var total = signals.totalQuestions;

    var completionState;
    if (answered === 0) completionState = 'skipped';
    else if (answered === total) completionState = 'complete';
    else completionState = 'partial';

    var tags = answered > 0 ? resolveProfileTags(signals, core, insightAnswers) : [];
    var summary = answered > 0 ? buildProfileSummary(tags, core, signals) : null;
    var rerankedRecs = rerankRecommendations(coreResult.recommendations, tags);
    var leadSegment = answered > 0 ? deriveLeadSegment(tags, core) : 'no-insight-data';

    return {
      answeredCount: answered,
      totalQuestions: total,
      completionState: completionState,
      profileTags: tags,
      profileSummary: summary,
      recommendationPriorityBoosts: tags.reduce(function (acc, t) {
        (TAG_RECOMMENDATION_BOOSTS[t.id] || []).forEach(function (id) {
          if (acc.indexOf(id) === -1) acc.push(id);
        });
        return acc;
      }, []),
      rerankedRecommendations: rerankedRecs,
      leadSegment: leadSegment,
      signalCounts: signals.signalCounts
    };
  }

  window.INSIGHT_TAG_DEFS = TAG_DEFS;
  window.evaluateInsights = evaluateInsights;
})();
