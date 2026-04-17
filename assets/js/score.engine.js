/* Bank-Ready Score — state engine + wiring */
(function () {
  'use strict';

  var STORAGE_KEY = 'oney-score-bank-ready';

  /* ---------------- Analytics: whitelisted, silent-degrading ---------------- */
  // Only these events + param keys are ever forwarded to dataLayer / gtag.
  // Anything else is dropped. No raw answers, no free-text, no PII.
  var ALLOWED_EVENTS = {
    score_started:        [],
    score_step_completed: ['step_id', 'step_index'],
    score_completed:      ['score_total', 'score_band'],
    score_restart:        [],
    score_cta_clicked:    []
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

    // GTM: dataLayer.push({ event, ...cleaned })
    safeCall(function () {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        var frame = { event: eventName };
        for (var k in cleaned) if (cleaned.hasOwnProperty(k)) frame[k] = cleaned[k];
        window.dataLayer.push(frame);
      }
    });

    // GA4 / gtag.js
    safeCall(function () {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, cleaned);
      }
    });
  }

  // Compatibility layer: anything in the page can call window.trackEvent(...)
  // and get the same whitelist guarantees. If a trackEvent already exists
  // (e.g. defined by a shared brand.js), we leave it alone.
  if (typeof window.trackEvent !== 'function') {
    window.trackEvent = trackEvent;
  }

  function OneyScoreEngine(config) {
    if (!(this instanceof OneyScoreEngine)) return new OneyScoreEngine(config);
    this.config = config || {};
    this.schema = config.schema || [];
    this.evaluate = config.evaluate;
    this.mounts = {
      progress: document.getElementById('progressRail'),
      step:     document.getElementById('stepMount'),
      support:  document.getElementById('supportCopy'),
      result:   document.getElementById('resultMount')
    };
    this.state = this.restore();
    this.result = null;
    this.completed = false;
  }

  OneyScoreEngine.prototype.restore = function () {
    var fallback = { currentStep: 0, answers: {} };
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        currentStep: Math.max(0, Math.min(this.schema.length - 1, parsed.currentStep || 0)),
        answers: parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {}
      };
    } catch (e) {
      return fallback;
    }
  };

  OneyScoreEngine.prototype.persist = function () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        currentStep: this.state.currentStep,
        answers: this.state.answers
      }));
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
    var answers = this.state.answers;
    return this.requiredForStep(index).reduce(function (n, id) {
      return n + (answers[id] != null ? 1 : 0);
    }, 0);
  };

  OneyScoreEngine.prototype.canContinue = function () {
    return this.answeredCount(this.state.currentStep) === this.requiredForStep(this.state.currentStep).length;
  };

  OneyScoreEngine.prototype.allAnswered = function () {
    var engine = this;
    return this.schema.every(function (_step, i) {
      return engine.answeredCount(i) === engine.requiredForStep(i).length;
    });
  };

  OneyScoreEngine.prototype.track = function (event, payload) {
    // Delegate to the whitelisted tracker. If the host page has defined its
    // own window.trackEvent (same signature), honour it.
    var tracker = (typeof window.trackEvent === 'function') ? window.trackEvent : trackEvent;
    tracker(event, payload);
  };

  OneyScoreEngine.prototype.start = function () {
    if (!this.schema.length) return;
    if (!this.mounts.step) return;
    this.renderCurrent({ shouldFocus: false });
    if (!this.state.currentStep && this.answeredCount(0) === 0) {
      this.track('score_started');
    }

    // wire restart if hash flag present
    var engine = this;
    window.addEventListener('hashchange', function () {
      if (window.location.hash === '#restart') {
        engine.restart();
      }
    });
  };

  OneyScoreEngine.prototype.renderCurrent = function (opts) {
    opts = opts || {};
    var idx = this.state.currentStep;
    var step = this.schema[idx];
    if (!step) return;
    var engine = this;
    var UI = window.OneyScoreUI;
    if (!UI) return;

    if (this.mounts.result) {
      this.mounts.result.hidden = true;
      this.mounts.result.innerHTML = '';
    }
    if (this.mounts.step) this.mounts.step.hidden = false;

    if (this.mounts.progress) UI.renderProgressRail(this.mounts.progress, this.schema, idx);
    if (this.mounts.support) UI.renderSupport(this.mounts.support, step);

    if (this.mounts.step) {
      UI.renderStep(this.mounts.step, step, this.state.answers, {
        isFirst: idx === 0,
        isLast: idx === this.schema.length - 1,
        canContinue: this.canContinue(),
        shouldFocus: !!opts.shouldFocus,
        requiredCount: this.answeredCount(idx),
        requiredTotal: this.requiredForStep(idx).length,
        onSelect: function (fieldId, value) { engine.selectAnswer(fieldId, value); },
        onNext: function () { engine.next(); },
        onBack: function () { engine.back(); }
      });
    }
  };

  OneyScoreEngine.prototype.selectAnswer = function (fieldId, value) {
    this.state.answers[fieldId] = value;
    this.persist();
    this.renderCurrent({ shouldFocus: false });
  };

  OneyScoreEngine.prototype.next = function () {
    if (!this.canContinue()) return;
    var idx = this.state.currentStep;
    this.track('score_step_completed', {
      step_id: this.schema[idx].id,
      step_index: idx + 1
    });

    if (idx >= this.schema.length - 1) {
      this.finish();
      return;
    }
    this.state.currentStep = idx + 1;
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.back = function () {
    if (this.state.currentStep === 0) {
      this.restart();
      return;
    }
    this.state.currentStep -= 1;
    this.persist();
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.finish = function () {
    if (typeof this.evaluate !== 'function') return;
    this.result = this.evaluate(this.state.answers);
    this.completed = true;
    this.track('score_completed', {
      score_total: this.result.total,
      score_band: this.result.band
    });

    if (this.mounts.step) {
      this.mounts.step.hidden = true;
      this.mounts.step.classList.remove('step-card');
      this.mounts.step.innerHTML = '';
    }
    if (this.mounts.progress) this.mounts.progress.innerHTML = '';

    if (this.mounts.result && window.OneyScoreUI) {
      var engine = this;
      window.OneyScoreUI.renderResult(this.mounts.result, this.result, {
        onRestart: function () { engine.restart(); }
      });
    }
    this.swapSupportForSummary();
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
    this.state = { currentStep: 0, answers: {} };
    this.result = null;
    this.completed = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    this.renderCurrent({ shouldFocus: true });
    this.scrollToAssessment();
  };

  OneyScoreEngine.prototype.scrollToAssessment = function () {
    var target = document.getElementById('assessment');
    if (!target) return;
    var rect = target.getBoundingClientRect();
    // only scroll if target is out of view
    if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  function wireCtaAnalytics(engine) {
    document.querySelectorAll('[data-analytics="cta"]').forEach(function (link) {
      link.addEventListener('click', function () {
        // No PII / free-text forwarded: CTA label stays out of the payload.
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
