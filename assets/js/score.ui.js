/* Bank-Ready Score — pure DOM render helpers */
(function () {
  'use strict';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null) return;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') {
          Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
        } else if (key.indexOf('aria-') === 0 || key === 'role' || key === 'tabindex' || key === 'type' || key === 'id' || key === 'for' || key === 'hidden' || key === 'disabled') {
          if (value === false || value == null) return;
          if (value === true) node.setAttribute(key, '');
          else node.setAttribute(key, value);
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key === 'html') {
          node.innerHTML = value;
        } else {
          node[key] = value;
        }
      });
    }
    if (children) {
      children.forEach(function (child) {
        if (child == null) return;
        if (typeof child === 'string') node.appendChild(document.createTextNode(child));
        else node.appendChild(child);
      });
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ---------------- Progress rail ---------------- */
  function renderProgressRail(mount, schema, currentIndex) {
    clear(mount);
    var rail = el('div', { class: 'progress-rail', role: 'progressbar',
      'aria-valuemin': '1', 'aria-valuemax': String(schema.length),
      'aria-valuenow': String(currentIndex + 1) });
    schema.forEach(function (_step, i) {
      var stepDot = el('div', { class: 'progress-step' + (i < currentIndex ? ' is-complete' : (i === currentIndex ? ' is-active' : '')) });
      rail.appendChild(stepDot);
    });
    var meta = el('div', { class: 'progress-meta' }, [
      el('span', { class: 'meta-title', text: 'Step ' + (currentIndex + 1) + ' of ' + schema.length }),
      el('span', { text: schema[currentIndex].title })
    ]);
    mount.appendChild(rail);
    mount.appendChild(meta);
  }

  /* Insight-phase progress: lighter, unnumbered, intentionally separate.
     Never rolls into the numbered core progress. */
  function renderInsightProgress(mount, info) {
    clear(mount);
    var rail = el('div', { class: 'progress-rail progress-rail-insight', 'aria-hidden': 'true' });
    rail.appendChild(el('div', { class: 'progress-step is-complete' }));
    rail.appendChild(el('div', { class: 'progress-step is-complete' }));
    mount.appendChild(rail);

    var meta = el('div', { class: 'progress-meta progress-meta-insight' }, [
      el('span', { class: 'meta-title', text: info.title }),
      el('span', { text: info.subtitle || '' })
    ]);
    mount.appendChild(meta);

    if (info.hint) {
      mount.appendChild(el('div', { class: 'progress-hint', text: info.hint }));
    }
  }

  /* ---------------- Core step card ---------------- */
  function renderStep(mount, step, answers, handlers) {
    clear(mount);
    mount.classList.add('step-card');
    mount.classList.remove('step-card-insight', 'step-card-transition');
    mount.hidden = false;

    var header = el('div', {}, [
      el('h2', { text: step.title }),
      el('p', { class: 'step-description', text: step.description })
    ]);
    mount.appendChild(header);

    step.fields.forEach(function (field) {
      mount.appendChild(renderField(field, answers, handlers));
    });

    var nav = el('div', { class: 'step-nav' });

    var backBtn = el('button', {
      type: 'button',
      class: 'btn-ghost',
      text: handlers.isFirst ? 'Reset' : '← Back',
      'aria-label': handlers.isFirst ? 'Reset answers' : 'Go to previous step'
    });
    backBtn.addEventListener('click', handlers.onBack);

    var nextLabel = (handlers.isLast && !handlers.hasInsightLayer) ? 'See my score →' : 'Continue →';
    var nextBtn = el('button', {
      type: 'button',
      class: 'btn-purple',
      text: nextLabel,
      'aria-label': handlers.isLast
        ? (handlers.hasInsightLayer ? 'Continue to optional business signals' : 'See my bank-ready score')
        : 'Continue to next step'
    });
    nextBtn.disabled = !handlers.canContinue;
    if (!handlers.canContinue) nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.addEventListener('click', handlers.onNext);

    var meta = el('span', { class: 'step-nav-meta', text: handlers.requiredCount + ' of ' + handlers.requiredTotal + ' answered' });

    nav.appendChild(backBtn);
    nav.appendChild(meta);
    nav.appendChild(nextBtn);
    mount.appendChild(nav);

    var firstUnanswered = mount.querySelector('.choice-card:not(.is-selected)');
    if (firstUnanswered && handlers.shouldFocus) firstUnanswered.focus();
  }

  function renderField(field, answers, handlers) {
    var wrap = el('div', { class: 'question-group' });
    wrap.appendChild(el('label', { class: 'question-label', text: field.label }));

    if (field.type === 'choice') {
      var cols = field.columns || 2;
      var grid = el('div', {
        class: 'choice-grid' + (cols === 3 ? ' choice-grid-3' : cols === 4 ? ' choice-grid-4' : ''),
        role: 'radiogroup',
        'aria-label': field.label
      });

      field.options.forEach(function (opt) {
        var selected = answers[field.id] === opt.value;
        var card = el('button', {
          type: 'button',
          class: 'choice-card' + (selected ? ' is-selected' : ''),
          role: 'radio',
          'aria-checked': selected ? 'true' : 'false',
          tabindex: selected || (!answers[field.id] && opt === field.options[0]) ? '0' : '-1',
          dataset: { fieldId: field.id, value: opt.value },
          text: opt.label
        });
        card.addEventListener('click', function () {
          handlers.onSelect(field.id, opt.value);
        });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlers.onSelect(field.id, opt.value);
          }
        });
        grid.appendChild(card);
      });

      wrap.appendChild(grid);
    }

    return wrap;
  }

  /* ---------------- Insight transition card ---------------- */
  function renderInsightTransition(mount, copy, handlers) {
    clear(mount);
    mount.classList.add('step-card', 'step-card-transition');
    mount.classList.remove('step-card-insight');
    mount.hidden = false;

    mount.appendChild(el('div', { class: 'insight-transition-eyebrow' }, [
      el('span', { class: 'insight-transition-dot' }),
      el('span', { text: copy.eyebrow || 'Optional sharpening layer' })
    ]));
    mount.appendChild(el('h2', { class: 'insight-transition-title', text: copy.title }));
    mount.appendChild(el('p', { class: 'insight-transition-body', text: copy.body }));

    if (copy.note) {
      mount.appendChild(el('p', { class: 'insight-transition-note', text: copy.note }));
    }

    var actions = el('div', { class: 'insight-transition-actions' });
    var primary = el('button', {
      type: 'button',
      class: 'btn-purple',
      text: copy.primaryCta || 'Sharpen my result'
    });
    primary.addEventListener('click', handlers.onSharpen);
    actions.appendChild(primary);

    var secondary = el('button', {
      type: 'button',
      class: 'btn-ghost',
      text: copy.secondaryCta || 'Skip and see score'
    });
    secondary.addEventListener('click', handlers.onSkip);
    actions.appendChild(secondary);

    mount.appendChild(actions);

    if (handlers.shouldFocus) primary.focus();
  }

  /* ---------------- Insight group card ---------------- */
  function renderInsightGroup(mount, group, answers, handlers) {
    clear(mount);
    mount.classList.add('step-card', 'step-card-insight');
    mount.classList.remove('step-card-transition');
    mount.hidden = false;

    var header = el('div', { class: 'insight-group-header' });
    header.appendChild(el('div', { class: 'insight-group-eyebrow' }, [
      el('span', { class: 'insight-transition-dot' }),
      el('span', { text: (group.eyebrow || 'Optional sharpening layer') }),
      el('span', { class: 'insight-optional-pill', text: 'Optional' })
    ]));
    header.appendChild(el('h2', { text: group.title }));
    if (group.description) {
      header.appendChild(el('p', { class: 'step-description', text: group.description }));
    }
    mount.appendChild(header);

    group.questions.forEach(function (question) {
      mount.appendChild(renderInsightQuestion(question, answers, handlers));
    });

    var nav = el('div', { class: 'step-nav' });

    var backBtn = el('button', {
      type: 'button',
      class: 'btn-ghost',
      text: '← Back',
      'aria-label': 'Go back'
    });
    backBtn.addEventListener('click', handlers.onBack);
    nav.appendChild(backBtn);

    var skipLink = el('button', {
      type: 'button',
      class: 'btn-link insight-skip-link',
      text: 'Skip and see score'
    });
    skipLink.addEventListener('click', handlers.onSkipAll);
    nav.appendChild(skipLink);

    var continueLabel = handlers.isLastGroup ? 'See my score →' : 'Continue →';
    var continueBtn = el('button', {
      type: 'button',
      class: 'btn-purple',
      text: continueLabel
    });
    continueBtn.addEventListener('click', handlers.onContinue);
    nav.appendChild(continueBtn);

    mount.appendChild(nav);

    if (handlers.shouldFocus) {
      var firstCard = mount.querySelector('.choice-card');
      if (firstCard) firstCard.focus();
    }
  }

  function renderInsightQuestion(question, answers, handlers) {
    var wrap = el('div', { class: 'question-group insight-question' });
    var prompt = el('label', { class: 'question-label', text: question.prompt });
    wrap.appendChild(prompt);

    var options = question.options || [];
    var cols = options.length >= 5 ? 3 : 2;
    var grid = el('div', {
      class: 'choice-grid insight-choice-grid' + (cols === 3 ? ' choice-grid-3' : ''),
      role: 'radiogroup',
      'aria-label': question.prompt
    });

    options.forEach(function (opt, i) {
      var selected = answers[question.id] === opt.value;
      var card = el('button', {
        type: 'button',
        class: 'choice-card' + (selected ? ' is-selected' : ''),
        role: 'radio',
        'aria-checked': selected ? 'true' : 'false',
        tabindex: selected || (!answers[question.id] && i === 0) ? '0' : '-1',
        dataset: { questionId: question.id, value: opt.value },
        text: opt.label
      });
      card.addEventListener('click', function () {
        if (selected) handlers.onClear(question.id);
        else handlers.onSelect(question.id, opt.value);
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (selected) handlers.onClear(question.id);
          else handlers.onSelect(question.id, opt.value);
        }
      });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    return wrap;
  }

  /* ---------------- Support panel ---------------- */
  function renderSupport(mount, step) {
    clear(mount);
    var support = step.support || {};
    mount.appendChild(el('h3', { text: support.kicker || 'Why this matters' }));
    mount.appendChild(el('h4', { text: support.title || step.title }));
    mount.appendChild(el('p', { text: support.body || step.description }));
    if (support.tip) {
      mount.appendChild(el('div', { class: 'support-tip', text: support.tip }));
    }
  }

  function renderInsightSupport(mount, phase) {
    clear(mount);
    if (phase === 'transition') {
      mount.appendChild(el('h3', { text: 'Why answer these' }));
      mount.appendChild(el('h4', { text: 'Context sharpens the result' }));
      mount.appendChild(el('p', { text: 'These answers do not change your Bank-Ready Score. They help us tailor the next-step guidance to the pressures actually shaping your file — cash flow, debt structure, documentation, compliance.' }));
      mount.appendChild(el('div', { class: 'support-tip', text: 'Skip if you want the score now — you can come back and add context later.' }));
    } else {
      mount.appendChild(el('h3', { text: 'How these answers are used' }));
      mount.appendChild(el('h4', { text: 'Profile tags, not score moves' }));
      mount.appendChild(el('p', { text: 'Each answer adds signal tokens that resolve into up to 3 profile tags on your result. Your numeric score stays driven by the core readiness assessment.' }));
      mount.appendChild(el('div', { class: 'support-tip', text: 'Answer as honestly as you can — this is signal for a banker read, not a quiz.' }));
    }
  }

  /* ---------------- Result view ---------------- */
  function renderResult(mount, result, insightResult, handlers) {
    clear(mount);
    mount.hidden = false;
    mount.classList.add('result-view');

    mount.appendChild(buildResultHero(result));
    mount.appendChild(buildMetricGrid(result));
    mount.appendChild(buildProfileCard(insightResult, handlers));
    mount.appendChild(buildRoadmap(result, insightResult, handlers));

    requestAnimationFrame(function () {
      var dial = mount.querySelector('.result-dial');
      if (dial) dial.style.setProperty('--dial-pct', (result.total * 3.6) + 'deg');
      var scoreEl = mount.querySelector('.score-value');
      if (scoreEl) animateCountUp(scoreEl, result.total);
    });

    // Swap the result actions into a success state when the report
    // capture modal reports success. Re-runs on every submit so
    // "Email another copy" refreshes the banner with the latest email
    // and reportUrl. Previous listener is replaced because the
    // `mount` reference is stable across re-renders.
    if (mount._oneyReportListener) {
      window.removeEventListener('oney:report:generated', mount._oneyReportListener);
    }
    var onGenerated = function (e) {
      if (!e || !e.detail) return;
      swapActionsToSuccess(mount, e.detail.payload, e.detail.result, handlers);
    };
    mount._oneyReportListener = onGenerated;
    window.addEventListener('oney:report:generated', onGenerated);
  }

  function buildResultHero(result) {
    var card = el('section', { class: 'result-hero-card' });
    var copy = el('div', { class: 'result-hero-copy' });

    var textWrap = el('div');
    textWrap.appendChild(el('p', { class: 'result-kicker', text: 'Your Bank-Ready Score' }));
    var scoreRow = el('div', { class: 'result-score' }, [
      el('span', { class: 'score-value', text: '0' }),
      el('span', { class: 'score-out-of', text: '/ 100' })
    ]);
    textWrap.appendChild(scoreRow);
    textWrap.appendChild(el('span', {
      class: 'readiness-badge readiness-' + result.band,
      text: result.bandLabel
    }));
    textWrap.appendChild(el('p', {
      class: 'result-summary',
      html: 'Recommended path: <strong>' + escapeHtml(result.nextStep) + '</strong>'
    }));

    var dial = el('div', { class: 'result-dial', 'aria-hidden': 'true' }, [
      el('div', {
        class: 'result-dial-label',
        html: 'Score<strong>' + result.total + '</strong>'
      })
    ]);

    copy.appendChild(textWrap);
    copy.appendChild(dial);
    card.appendChild(copy);
    return card;
  }

  function buildMetricGrid(result) {
    var grid = el('section', { class: 'result-metric-grid', 'aria-label': 'Dimension scores' });
    result.breakdown.forEach(function (item) {
      var pct = Math.round((item.score / Math.max(item.weight, 1)) * 100);
      var state = pct >= 80 ? ' is-strong' : (pct < 50 ? ' is-weak' : '');
      var card = el('article', { class: 'criteria-card' + state });
      card.appendChild(el('p', { class: 'criteria-label', text: item.label }));
      card.appendChild(el('div', { class: 'criteria-score-row' }, [
        el('h3', { text: String(item.score) }),
        el('span', { class: 'criteria-weight', text: 'of ' + item.weight })
      ]));
      var bar = el('div', { class: 'criteria-bar' }, [
        el('div', { class: 'criteria-bar-fill' })
      ]);
      card.appendChild(bar);
      grid.appendChild(card);

      requestAnimationFrame(function () {
        var fill = card.querySelector('.criteria-bar-fill');
        if (fill) fill.style.width = Math.max(4, Math.min(100, pct)) + '%';
      });
    });
    return grid;
  }

  /* Business profile card — always rendered; content depends on insight state. */
  function buildProfileCard(insightResult, handlers) {
    var card = el('section', { class: 'profile-card' });
    card.appendChild(el('p', { class: 'result-kicker', text: 'Your business profile' }));

    if (!insightResult || insightResult.completionState === 'skipped') {
      card.appendChild(el('h2', { text: 'Your business profile' }));
      card.appendChild(el('p', {
        class: 'profile-skipped-body',
        text: 'You skipped the optional business signals questions, so this result is based on your core lending readiness answers only.'
      }));
      if (handlers && typeof handlers.onAddInsights === 'function') {
        var reopen = el('button', {
          type: 'button',
          class: 'btn-ghost profile-reopen-btn',
          text: 'Add business context'
        });
        reopen.addEventListener('click', handlers.onAddInsights);
        card.appendChild(reopen);
      }
      return card;
    }

    card.appendChild(el('h2', { text: 'Your business profile' }));

    var tags = insightResult.profileTags || [];
    if (tags.length) {
      var tagRow = el('div', { class: 'profile-tag-row', role: 'list' });
      tags.forEach(function (tag) {
        tagRow.appendChild(el('span', {
          class: 'profile-tag profile-tag-' + (tag.tone || 'neutral'),
          role: 'listitem',
          text: tag.label
        }));
      });
      card.appendChild(tagRow);
    }

    var summary = insightResult.profileSummary;
    if (summary) {
      var parts = [];
      if (summary.strongestArea) parts.push('strongest in <strong>' + escapeHtml(summary.strongestArea) + '</strong>');
      if (summary.weakestArea)   parts.push('weaker in <strong>' + escapeHtml(summary.weakestArea) + '</strong>');
      if (summary.fastestImprovement) parts.push('most likely to improve quickly through <strong>' + escapeHtml(summary.fastestImprovement) + '</strong>');

      if (parts.length) {
        card.appendChild(el('p', {
          class: 'profile-summary',
          html: 'Based on your answers, your current lending profile looks ' + parts.join(', ') + '.'
        }));
      }
    }

    if (insightResult.completionState === 'partial') {
      card.appendChild(el('p', {
        class: 'profile-footnote',
        text: 'Based on ' + insightResult.answeredCount + ' of ' + insightResult.totalQuestions + ' optional signal questions.'
      }));
    }

    return card;
  }

  function buildRoadmap(result, insightResult, handlers) {
    var card = el('section', { class: 'roadmap-card' });
    card.appendChild(el('p', { class: 'result-kicker', text: 'Highest priority actions' }));
    card.appendChild(el('h2', { text: 'What to fix before you apply' }));

    var subText = 'Ranked against your weakest dimensions. Fixing these first has the biggest impact on a credit decision.';
    if (insightResult && insightResult.profileTags && insightResult.profileTags.length) {
      subText = 'Ranked against your weakest dimensions and sharpened by your profile tags. Fixing these first has the biggest impact.';
    }
    card.appendChild(el('p', { class: 'roadmap-sub', text: subText }));

    var recs = (insightResult && insightResult.rerankedRecommendations) || result.recommendations;
    var list = el('ol', { class: 'roadmap-list' });
    recs.forEach(function (rec) {
      var li = el('li');
      li.appendChild(el('div', {}, [
        el('span', { class: 'roadmap-area', text: rec.label }),
        el('p', { text: rec.text })
      ]));
      list.appendChild(li);
    });
    card.appendChild(list);

    var actions = el('div', { class: 'result-actions result-actions-report' });
    actions.dataset.slot = 'result-actions';

    var primary = el('button', {
      type: 'button',
      class: 'btn-purple',
      text: 'Generate my lending report'
    });
    primary.addEventListener('click', function () {
      if (typeof window.trackEvent === 'function') window.trackEvent('report_generate_clicked');
      if (window.OneyReportModal && typeof handlers.onGenerateReport === 'function') {
        handlers.onGenerateReport();
      } else if (window.OneyReportModal) {
        // Fallback: open without extra context (shouldn't happen in practice)
        window.OneyReportModal.open({ result: {}, insightResult: null });
      }
    });
    actions.appendChild(primary);

    var review = el('a', {
      class: 'btn-ghost',
      href: 'https://oneyco.com.au/',
      text: 'Request Oney review',
      target: '_blank',
      rel: 'noopener',
      dataset: { analytics: 'cta' }
    });
    review.addEventListener('click', function () {
      if (typeof window.trackEvent === 'function') window.trackEvent('score_cta_clicked');
    });
    actions.appendChild(review);

    var restart = el('button', { type: 'button', class: 'btn-link', text: 'Start again' });
    restart.addEventListener('click', handlers.onRestart);
    actions.appendChild(restart);

    card.appendChild(actions);

    card.appendChild(el('p', {
      class: 'result-actions-hint',
      text: 'Email yourself a clear lending summary, or send it to your broker or lender for review.'
    }));

    card.appendChild(el('p', {
      class: 'result-disclaimer',
      text: 'This is a readiness signal, not credit approval or financial advice. It points at the likely gaps before a lender sees them — a qualified broker or commercial banker can confirm the exact next step for your situation.'
    }));

    return card;
  }

  /* ---------------- Success state on result page ---------------- */
  function swapActionsToSuccess(mount, payload, submitResult, handlers) {
    var slot = mount.querySelector('[data-slot="result-actions"]');
    if (!slot) return;

    var hint = mount.querySelector('.result-actions-hint');
    if (hint) hint.remove();

    clear(slot);
    slot.classList.add('result-actions-success');

    var banner = el('div', { class: 'result-success-banner', role: 'status', 'aria-live': 'polite' });
    banner.appendChild(el('span', { class: 'result-success-tick', 'aria-hidden': 'true', html: '&#10003;' }));

    var copy = el('div', { class: 'result-success-copy' });
    copy.appendChild(el('p', { class: 'result-success-title', text: 'Report ready' }));

    var lines = [];
    var userOk = submitResult && submitResult.deliveries && submitResult.deliveries.userEmail && submitResult.deliveries.userEmail.queued;
    lines.push(userOk
      ? 'A copy has been sent to ' + payload.lead.email + '.'
      : 'Your report is ready below — open or download it now.');
    if (payload.share && payload.share.enabled) {
      var recipientOk = submitResult && submitResult.deliveries && submitResult.deliveries.recipientEmail && submitResult.deliveries.recipientEmail.queued;
      lines.push(recipientOk
        ? 'A copy has also been shared with ' + (payload.share.recipient_email || 'your broker') + '.'
        : 'Sharing with ' + (payload.share.recipient_email || 'your broker') + ' is queued.');
    }
    lines.forEach(function (line) {
      copy.appendChild(el('p', { class: 'result-success-line', text: line }));
    });
    banner.appendChild(copy);

    slot.appendChild(banner);

    var actions = el('div', { class: 'result-success-actions' });
    var download = el('a', {
      class: 'btn-purple',
      href: (submitResult && submitResult.report && submitResult.report.reportUrl) ? submitResult.report.reportUrl : '#',
      target: '_blank',
      rel: 'noopener',
      text: 'Download report'
    });
    actions.appendChild(download);

    var another = el('button', { type: 'button', class: 'btn-ghost', text: 'Email another copy' });
    another.addEventListener('click', function () {
      if (typeof handlers.onGenerateReport === 'function') handlers.onGenerateReport();
    });
    actions.appendChild(another);

    var review = el('a', {
      class: 'btn-link',
      href: 'https://oneyco.com.au/',
      target: '_blank',
      rel: 'noopener',
      text: 'Request Oney review'
    });
    review.addEventListener('click', function () {
      if (typeof window.trackEvent === 'function') window.trackEvent('score_cta_clicked');
    });
    actions.appendChild(review);

    slot.appendChild(actions);
  }

  /* ---------------- Utilities ---------------- */
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function animateCountUp(node, target) {
    var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      node.textContent = String(target);
      return;
    }
    var start = performance.now();
    var duration = 700;
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
      else node.textContent = String(target);
    }
    requestAnimationFrame(tick);
  }

  window.OneyScoreUI = {
    renderProgressRail: renderProgressRail,
    renderInsightProgress: renderInsightProgress,
    renderStep: renderStep,
    renderSupport: renderSupport,
    renderInsightSupport: renderInsightSupport,
    renderInsightTransition: renderInsightTransition,
    renderInsightGroup: renderInsightGroup,
    renderResult: renderResult
  };
})();
