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

  /* ---------------- Step card ---------------- */
  function renderStep(mount, step, answers, handlers) {
    clear(mount);
    mount.classList.add('step-card');
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

    var nextLabel = handlers.isLast ? 'See my score →' : 'Continue →';
    var nextBtn = el('button', {
      type: 'button',
      class: 'btn-purple',
      text: nextLabel,
      'aria-label': handlers.isLast ? 'See my bank-ready score' : 'Continue to next step'
    });
    nextBtn.disabled = !handlers.canContinue;
    if (!handlers.canContinue) nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.addEventListener('click', handlers.onNext);

    var meta = el('span', { class: 'step-nav-meta', text: handlers.requiredCount + ' of ' + handlers.requiredTotal + ' answered' });

    nav.appendChild(backBtn);
    nav.appendChild(meta);
    nav.appendChild(nextBtn);
    mount.appendChild(nav);

    // Focus first unanswered choice card for keyboard users
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

  /* ---------------- Result view ---------------- */
  function renderResult(mount, result, handlers) {
    clear(mount);
    mount.hidden = false;
    mount.classList.add('result-view');

    mount.appendChild(buildResultHero(result));
    mount.appendChild(buildMetricGrid(result));
    mount.appendChild(buildRoadmap(result, handlers));

    // Animate dial + count-up
    requestAnimationFrame(function () {
      var dial = mount.querySelector('.result-dial');
      if (dial) dial.style.setProperty('--dial-pct', (result.total * 3.6) + 'deg');
      var scoreEl = mount.querySelector('.score-value');
      if (scoreEl) animateCountUp(scoreEl, result.total);
    });
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

  function buildRoadmap(result, handlers) {
    var card = el('section', { class: 'roadmap-card' });
    card.appendChild(el('p', { class: 'result-kicker', text: 'Highest priority actions' }));
    card.appendChild(el('h2', { text: 'What to fix before you apply' }));
    card.appendChild(el('p', {
      class: 'roadmap-sub',
      text: 'Ranked against your weakest dimensions. Fixing these first has the biggest impact on a credit decision.'
    }));

    var list = el('ol', { class: 'roadmap-list' });
    result.recommendations.forEach(function (rec) {
      var li = el('li');
      li.appendChild(el('div', {}, [
        el('span', { class: 'roadmap-area', text: rec.label }),
        el('p', { text: rec.text })
      ]));
      list.appendChild(li);
    });
    card.appendChild(list);

    var actions = el('div', { class: 'result-actions' });
    var primary = el('a', {
      class: 'btn-purple',
      href: 'https://oneyco.com.au/',
      text: 'Talk to Oney'
    });
    actions.appendChild(primary);

    var restart = el('button', { type: 'button', class: 'btn-ghost', text: 'Start again' });
    restart.addEventListener('click', handlers.onRestart);
    actions.appendChild(restart);

    card.appendChild(actions);

    card.appendChild(el('p', {
      class: 'result-disclaimer',
      text: 'This is a readiness signal, not credit approval or financial advice. It points at the likely gaps before a lender sees them — a qualified broker or commercial banker can confirm the exact next step for your situation.'
    }));

    return card;
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
    renderStep: renderStep,
    renderSupport: renderSupport,
    renderResult: renderResult
  };
})();
