/* Bank-Ready Score — state engine + wiring */
(function () {
  'use strict';

  var STORAGE_KEY = 'oney-score-bank-ready';
  var STORAGE_VERSION = 2;

  /* ---------------- Analytics: whitelisted, silent-degrading ---------------- */
  // Only these events + param keys are ever forwarded to dataLayer / gtag.
  // Anything else is dropped. No raw answers, no free-text, no PII.
  var ALLOWED_EVENTS = {
    score_started:          [],
    score_step_completed:   ['step_id', 'step_index'],
    score_completed:        ['score_total', 'score_band', 'insight_state', 'insight_answered'],
    score_restart:          [],
    score_cta_clicked:      [],
    score_insight_started:  [],
    score_insight_skipped:  [],
    score_insight_completed:['insight_answered']
  };

  function safeCall(fn) {
    try { fn(); } catch (e) { /* analytics must never break the tool */ }
  }

  function trackEvent(eventName, payload) {
    var allowedKeys = ALLOWED_EVENTS[eventName];
    if (!allowedKeys) return; // block unknown events outright

    var cleaned = {};
    if (payload) {
      for (var i = 0; i < allowedKeys.length; i++) {
        var k = allowedKeys[i];
        if (payload[k] != null) cleaned[k] = payload[k];
      }
    }

    safeCall(function () {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        var frame = { event: eventName };
        for (var k in cleaned) if (cleaned.hasOwnProperty(k)) frame[k] = cleaned[k];
        window.dataLayer.push(frame);
      }
    });

    safeCall(function () {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, cleaned);
      }
    });
  }

  if (typeof window.trackEvent !== 'function') {
    window.trackEvent = trackEvent;
  }

  /* ---------------- Engine ---------------- */

  function OneyScoreEngine(config) {
    if (!(this instanceof OneyScoreEngine)) return new OneyScoreEngine(config);
    this.config = config || {};
    this.schema = config.schema || [];
    this.insightSchema = config.insightSchema || null;
    this.evaluate = config.evaluate;
    this.evaluateInsights = config.evaluateInsights || null;
    this.mounts = {
      progress: document.getElementById('progressRail'),
      step:     document.getElementById('stepMount'),
      support:  document.getElementById('supportCopy'),
      result:   document.getElementById('resultMount')
    };
    this.state = this.restore();
    this.result = null;
    this.insightResult = null;
    this.completed = false;
    this._insightStartedTracked = false;
  }

  OneyScoreEngine.prototype.restore = function () {
    var fallback = {
      version: STORAGE_VERSION,
      phase: 'core',
      currentStep: 0,
      insightGroupIndex: 0,
      coreAnswers: {},
      insightAnswers: {},
      insightsSkipped: false
    };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;

      // Legacy v1 shape: { currentStep, answers }
      if (parsed.version !== STORAGE_VERSION) {
        return {
          version: STORAGE_VERSION,
          phase: 'core',
          currentStep: Math.max(0, Math.min(this.schema.length - 1, parsed.currentStep || 0)),
          insightGroupIndex: 0,
          coreAnswers: (parsed.answers && typeof parsed.answers === 'object') ? parsed.answers : {},
          insightAnswers: {},
          insightsSkipped: false
        };
      }

      return {
        version: STORAGE_VERSION,
        phase: ['core', 'transition', 'insight'].indexOf(parsed.phase) !== -1 ? parsed.phase : 'core',
        currentStep: Math.max(0, Math.min(this.schema.length - 1, parsed.currentStep || 0)),
        insightGroupIndex: Math.max(0, parsed.insightGroupIndex || 0),
        coreAnswers: parsed.coreAnswers && typeof parsed.coreAnswers === 'object' ? parsed.coreAnswers : {},
        insightAnswers: parsed.insightAnswers && typeof parsed.insightAnswers === 'object' ? parsed.insightAnswers : {},
        insightsSkipped: !!parsed.insightsSkipped
      };
    } catch (e) {
      return fallback;
    }
  };

  OneyScoreEngine.prototype.persist = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {}
  };

  OneyScoreEngine.prototype.fieldsForStep = function (index) {
    var step = this.schema[index];
    if (!step) return [];
    return step.fields || [];
  };

  OneyScoreEngine.prototype.requiredForStep = function (index) {
    return this.fieldsForStep(index).map(function (f) { return f.id; });
  };

  OneyScoreEngine.prototype.answeredCount = function (index) {
    var answers = this.state.coreAnswers;
    return this.requiredForStep(index).reduce(function (n, id) {
      return n + (answers[id] != null ? 1 : 0);
    }, 0);
  };

  OneyScoreEngine.prototype.canContinue = function () {
    return this.answeredCount(this.state.currentStep) === this.requiredForStep(this.state.currentStep).length;
  };

  OneyScoreEngine.prototype.insightGroups = function () {
    return (this.insightSchema && this.insightSchema.groups) || [];
  };

  OneyScoreEngine.prototype.insightGroupAnsweredCount = function (groupIndex) {
    var groups = this.insightGroups();
    var group = groups[groupIndex];
    if (!group) return { answered: 0, total: 0 };
    var answers = this.state.insightAnswers;
    var total = group.questions.length;
    var answered = group.questions.reduce(function (n, q) {
      return n + (answers[q.id] != null ? 1 : 0);
    }, 0);
    return { answered: answered, total: total };
  };

  OneyScoreEngine.prototype.insightTotalAnswered = function () {
    var answers = this.state.insightAnswers;
    var n = 0;
    this.insightGroups().forEach(function (g) {
      g.questions.forEach(function (q) { if (answers[q.id] != null) n += 1; });
    });
    return n;
  };

  OneyScoreEngine.prototype.insightTotalQuestions = function () {
    var n = 0;
    this.insightGroups().forEach(function (g) { n += g.questions.length; });
    return n;
  };

  OneyScoreEngine.prototype.track = function (event, payload) {
    var tracker = (typeof window.trackEvent === 'function') ? window.trackEvent : trackEvent;
    tracker(event, payload);
  };

  OneyScoreEngine.prototype.start = function () {
    if (!this.schema.length) return;
    if (!this.mounts.step) return;
    this.renderCurrent({ shouldFocus: false });
    if (this.state.phase === 'core' && !this.state.currentStep && this.answeredCount(0) === 0) {
      this.track('score_started');
    }

    var engine = this;
    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#restart') engine.restart();
    });
  };

  /* ---------------- Rendering ---------------- */

  OneyScoreEngine.prototype.renderCurrent = function (opts) {
    opts = opts || {};
    var UI = window.OneyScoreUI;
    if (!UI) return;

    if (this.mounts.result) {
      this.mounts.result.hidden = true;
      this.mounts.result.innerHTML = '';
    }
    if (this.mounts.step) this.mounts.step.hidden = false;

    if (this.state.phase === 'core') this.renderCorePhase(opts);
    else if (this.state.phase === 'transition') this.renderTransitionPhase(opts);
    else if (this.state.phase === 'insight') this.renderInsightPhase(opts);
  };

  OneyScoreEngine.prototype.renderCorePhase = function (opts) {
    var idx = this.state.currentStep;
    var step = this.schema[idx];
    if (!step) return;
    var engine = this;
    var UI = window.OneyScoreUI;

    if (this.mounts.progress) UI.renderProgressRail(this.mounts.progress, this.schema, idx);
    if (this.mounts.support) UI.renderSupport(this.mounts.support, step);

    if (this.mounts.step) {
      UI.renderStep(this.mounts.step, step, this.state.coreAnswers, {
        isFirst: idx === 0,
        isLast: idx === this.schema.length - 1,
        hasInsightLayer: !!(this.insightSchema && this.insightGroups().length),
        canContinue: this.canContinue(),
        shouldFocus: !!opts.shouldFocus,
        requiredCount: this.answeredCount(idx),
        requiredTotal: this.requiredForStep(idx).length,
        onSelect: function (fieldId, value) { engine.selectCoreAnswer(fieldId, value); },
        onNext: function () { engine.nextCore(); },
        onBack: function () { engine.backCore(); }
      });
    }
  };

  OneyScoreEngine.prototype.renderTransitionPhase = function (opts) {
    var engine = this;
    var UI = window.OneyScoreUI;

    if (this.mounts.progress) UI.renderInsightProgress(this.mounts.progress, {
      title: 'Core assessment complete',
      subtitle: 'Optional sharpening layer'
    });
    if (this.mounts.support) UI.renderInsightSupport(this.mounts.support, 'transition');

    if (this.mounts.step) {
      UI.renderInsightTransition(this.mounts.step, this.insightSchema.transition, {
        onSharpen: function () { engine.beginInsights(); },
        onSkip: function () { engine.skipInsights(); },
        shouldFocus: !!opts.shouldFocus
      });
    }
  };

  OneyScoreEngine.prototype.renderInsightPhase = function (opts) {
    var engine = this;
    var UI = window.OneyScoreUI;
    var groups = this.insightGroups();
    var gIdx = Math.min(this.state.insightGroupIndex, groups.length - 1);
    var group = groups[gIdx];
    if (!group) return;
    var answered = this.insightTotalAnswered();
    var total = this.insightTotalQuestions();

    if (this.mounts.progress) UI.renderInsightProgress(this.mounts.progress, {
      title: 'Business Lending Signals',
      subtitle: 'Optional: card ' + (gIdx + 1) + ' of ' + groups.length,
      hint: total > 0 ? (answered + ' of ' + total + ' answered') : null
    });
    if (this.mounts.support) UI.renderInsightSupport(this.mounts.support, 'insight');

    if (this.mounts.step) {
      var isLastGroup = gIdx === groups.length - 1;
      UI.renderInsightGroup(this.mounts.step, group, this.state.insightAnswers, {
        groupIndex: gIdx,
        totalGroups: groups.length,
        isLastGroup: isLastGroup,
        shouldFocus: !!opts.shouldFocus,
        onSelect: function (qId, value) { engine.selectInsightAnswer(qId, value); },
        onClear: function (qId) { engine.clearInsightAnswer(qId); },
        onContinue: function () { engine.nextInsightGroup(); },
        onBack: function () { engine.backInsight(); },
        onSkipAll: function () { engine.skipInsightsMidway(); }
      });
    }
  };

  /* ---------------- Actions: core phase ---------------- */

  OneyScoreEngine.prototype.selectCoreAnswer = function (fieldId, value) {
    this.state.coreAnswers[fieldId] = value;
    this.persist();
    this.renderCurrent({ shouldFocus: false });
  };

  OneyScoreEngine.prototype.nextCore = function () {
    if (!this.canContinue()) return;
    var idx = this.state.currentStep;
    this.track('score_step_completed', {
      step_id: this.schema[idx].id,
      step_index: idx + 1
    });

    if (idx >= this.schema.length - 1) {
      // Core complete → transition phase (if insights configured) or finish.
      if (this.insightSchema && this.insightGroups().length) {
        this.state.phase = 'transition';
        this.state.insightGroupIndex = 0;
        this.persist();
        this.renderCurrent({ shouldFocus: true });
        this.scrollToAssessment();
      } else {
        this.finish();
      }
      return;
    }
    this.state.currentStep = idx + 1;
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.backCore = function () {
    if (this.state.currentStep === 0) {
      this.restart();
      return;
    }
    this.state.currentStep -= 1;
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  /* ---------------- Actions: transition phase ---------------- */

  OneyScoreEngine.prototype.beginInsights = function () {
    this.state.phase = 'insight';
    this.state.insightGroupIndex = 0;
    this.state.insightsSkipped = false;
    this.persist();
    if (!this._insightStartedTracked) {
      this.track('score_insight_started');
      this._insightStartedTracked = true;
    }
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.skipInsights = function () {
    this.state.insightsSkipped = true;
    this.track('score_insight_skipped');
    this.persist();
    this.finish();
  };

  /* ---------------- Actions: insight phase ---------------- */

  OneyScoreEngine.prototype.selectInsightAnswer = function (qId, value) {
    this.state.insightAnswers[qId] = value;
    this.persist();
    this.renderCurrent({ shouldFocus: false });
  };

  OneyScoreEngine.prototype.clearInsightAnswer = function (qId) {
    delete this.state.insightAnswers[qId];
    this.persist();
    this.renderCurrent({ shouldFocus: false });
  };

  OneyScoreEngine.prototype.nextInsightGroup = function () {
    var groups = this.insightGroups();
    var gIdx = this.state.insightGroupIndex;
    if (gIdx >= groups.length - 1) {
      this.track('score_insight_completed', { insight_answered: this.insightTotalAnswered() });
      this.finish();
      return;
    }
    this.state.insightGroupIndex = gIdx + 1;
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.backInsight = function () {
    if (this.state.insightGroupIndex > 0) {
      this.state.insightGroupIndex -= 1;
      this.persist();
      this.renderCurrent({ shouldFocus: true });
      this.scrollToAssessment();
      return;
    }
    // Back from first insight card returns to transition
    this.state.phase = 'transition';
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.skipInsightsMidway = function () {
    // Treat as skipped if no answers; else as partial completion.
    if (this.insightTotalAnswered() === 0) {
      this.state.insightsSkipped = true;
      this.track('score_insight_skipped');
    } else {
      this.track('score_insight_completed', { insight_answered: this.insightTotalAnswered() });
    }
    this.persist();
    this.finish();
  };

  /* ---------------- Finish ---------------- */

  OneyScoreEngine.prototype.finish = function () {
    if (typeof this.evaluate !== 'function') return;
    this.result = this.evaluate(this.state.coreAnswers);

    if (typeof this.evaluateInsights === 'function') {
      this.insightResult = this.evaluateInsights(this.state.insightAnswers, this.result);
    } else {
      this.insightResult = null;
    }

    this.completed = true;
    this.track('score_completed', {
      score_total: this.result.total,
      score_band: this.result.band,
      insight_state: this.insightResult ? this.insightResult.completionState : 'unavailable',
      insight_answered: this.insightResult ? this.insightResult.answeredCount : 0
    });

    if (this.mounts.step) {
      this.mounts.step.hidden = true;
      this.mounts.step.classList.remove('step-card');
      this.mounts.step.innerHTML = '';
    }
    if (this.mounts.progress) this.mounts.progress.innerHTML = '';

    if (this.mounts.result && window.OneyScoreUI) {
      var engine = this;
      window.OneyScoreUI.renderResult(this.mounts.result, this.result, this.insightResult, {
        onRestart: function () { engine.restart(); },
        onAddInsights: function () { engine.reopenInsights(); }
      });
    }
    this.swapSupportForSummary();
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.reopenInsights = function () {
    this.completed = false;
    this.state.phase = 'insight';
    this.state.insightGroupIndex = 0;
    this.state.insightsSkipped = false;
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.swapSupportForSummary = function () {
    if (!this.mounts.support || !this.result) return;
    this.mounts.support.innerHTML = '';
    var kicker = document.createElement('h3');
    kicker.textContent = 'What your score means';
    var title = document.createElement('h4');
    title.textContent = this.result.bandLabel;
    var body = document.createElement('p');
    body.textContent = this.result.band === 'strong'
      ? 'Your answers suggest a bank-ready file. Make sure the paper trail matches the story before you lodge.'
      : this.result.band === 'borderline'
        ? 'You are close. A broker-led polish on the weakest dimensions usually unlocks better outcomes than walking in cold.'
        : 'A direct bank approach today would likely struggle. Fix the top 1–2 weak areas first — that is where most of the points come back.';
    var tip = document.createElement('div');
    tip.className = 'support-tip';
    tip.textContent = 'This is a signal, not a decision. Use it to prepare, not to apply.';
    this.mounts.support.appendChild(kicker);
    this.mounts.support.appendChild(title);
    this.mounts.support.appendChild(body);
    this.mounts.support.appendChild(tip);
  };

  OneyScoreEngine.prototype.restart = function () {
    this.track('score_restart');
    this.state = {
      version: STORAGE_VERSION,
      phase: 'core',
      currentStep: 0,
      insightGroupIndex: 0,
      coreAnswers: {},
      insightAnswers: {},
      insightsSkipped: false
    };
    this.result = null;
    this.insightResult = null;
    this.completed = false;
    this._insightStartedTracked = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.scrollToAssessment = function () {
    var target = document.getElementById('assessment');
    if (!target) return;
    var rect = target.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  function wireCtaAnalytics(engine) {
    document.querySelectorAll('[data-analytics="cta"]').forEach(function (link) {
      link.addEventListener('click', function () {
        engine.track('score_cta_clicked');
      });
    });
  }

  window.OneyScoreEngine = {
    create: function (config) {
      var engine = new OneyScoreEngine(config);
      function boot() {
        engine.start();
        wireCtaAnalytics(engine);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }
      return engine;
    }
  };
})();
