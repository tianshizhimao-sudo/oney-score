/* Bank-Ready Score — standalone report renderer
 *
 * Used by report.html. Payload resolution strategy (renderer is agnostic):
 *   1. `?id=<report_id>` — resolved via OneyReportPlatform.resolveReportById
 *      (backend GET in live mode, localStorage in mock mode).
 *   2. `#r=<base64>` — hash-encoded slim payload for cross-device share.
 *
 * The page is static CSS-driven so the browser's Print dialog produces
 * a clean PDF without any extra libraries.
 *
 * The transport payload uses contract-canonical snake_case. Labels and
 * tones are not in the payload — they live in this renderer so the
 * contract stays minimal.
 */
(function () {
  'use strict';

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
  var DIMENSION_WEIGHTS = {
    profile: 10, history: 10, financials: 20, liquidity: 15,
    compliance: 15, debt: 10, security: 10, docs: 10
  };
  var DIMENSION_ORDER = [
    'profile', 'history', 'financials', 'liquidity',
    'compliance', 'debt', 'security', 'docs'
  ];

  var BAND_LABELS = {
    strong:     'Strong bank-ready',
    borderline: 'Close — polish before applying',
    needs_work: 'Needs work before application'
  };

  var PATH_LABELS = {
    approach_bank:              'Approach a lender with a well-prepared file',
    broker_review:              'Seek broker-led review before application',
    improve_first:              'Improve key gaps before application',
    improve_before_application: 'Improve before application'
  };

  var RISK_TAGS = {
    'Documentation risk': 1,
    'Cash flow pressure': 1,
    'Debt load concern': 1,
    'Compliance pressure': 1,
    'Profitability concern': 1,
    'Revenue volatility': 1,
    'Expense control gap': 1
  };
  var POSITIVE_TAGS = {
    'Banking discipline strong': 1,
    'Operationally stable': 1
  };
  var MIXED_TAGS = {
    'Growth ready, structurally weak': 1
  };
  function toneForTag(label) {
    if (RISK_TAGS[label]) return 'risk';
    if (POSITIVE_TAGS[label]) return 'positive';
    if (MIXED_TAGS[label]) return 'mixed';
    return 'neutral';
  }

  var DEFAULT_DISCLAIMER = 'This report is a readiness signal, not credit approval, a credit decision, or financial advice. It is designed to highlight likely lending gaps before a formal lender review.';

  function $(sel) { return document.querySelector(sel); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    if (children) children.forEach(function (c) {
      if (c == null) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function getHashPayload() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    var parts = hash.split('&');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.indexOf('r=') === 0) {
        return window.OneyReportPlatform.decodePayloadFromUrl(p.slice(2));
      }
    }
    return null;
  }

  function getQueryId() {
    var search = (window.location.search || '').replace(/^\?/, '');
    var parts = search.split('&');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.indexOf('id=') === 0) return decodeURIComponent(p.slice(3));
    }
    return null;
  }

  function loadView() {
    // 1. Hash-encoded slim payload → immediate render.
    var hashSlim = getHashPayload();
    if (hashSlim && hashSlim.report) return Promise.resolve(hashSlim);

    // 2. id-based resolution via platform adapter (backend in live mode,
    //    localStorage in mock mode).
    var id = getQueryId();
    if (id && window.OneyReportPlatform && window.OneyReportPlatform.resolveReportById) {
      return Promise.resolve(window.OneyReportPlatform.resolveReportById(id)).then(function (payload) {
        if (!payload) return null;
        // Normalise: localStorage stores the full submit request; we only
        // need report + minimal lead/share summaries here.
        if (payload.report) {
          return {
            report: payload.report,
            lead: payload.lead ? {
              first_name: payload.lead.first_name || '',
              business_name: payload.lead.business_name || ''
            } : { first_name: '', business_name: '' },
            share: (payload.share && payload.share.enabled) ? {
              enabled: true,
              recipient_type: payload.share.recipient_type || 'broker'
            } : { enabled: false }
          };
        }
        return null;
      });
    }
    return Promise.resolve(null);
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

  function render(view) {
    var report = view.report || {};
    var lead   = view.lead   || {};
    var mount  = $('#reportMount');
    if (!mount) return;
    mount.innerHTML = '';

    /* --- Header --- */
    var header = el('header', { class: 'report-doc-header' });
    header.appendChild(el('p', { class: 'report-doc-kicker', text: 'Bank-Ready Score report' }));
    var who = lead.first_name
      ? 'Prepared for ' + lead.first_name + (lead.business_name ? ' — ' + lead.business_name : '')
      : 'Bank-Ready Score report';
    header.appendChild(el('h1', { text: who }));
    header.appendChild(el('p', { class: 'report-doc-meta', text: formatDate(report.created_at) + ' · Report ID ' + (report.report_id || '—') }));
    mount.appendChild(header);

    /* --- Score summary --- */
    var summary = el('section', { class: 'report-doc-summary' });
    var scoreBox = el('div', { class: 'report-doc-score' });
    scoreBox.appendChild(el('span', { class: 'report-doc-score-number', text: String(report.overall_score == null ? '—' : report.overall_score) }));
    scoreBox.appendChild(el('span', { class: 'report-doc-score-out', text: '/ 100' }));
    summary.appendChild(scoreBox);

    var summaryCopy = el('div', { class: 'report-doc-summary-copy' });
    var bandKey  = report.readiness_band || 'unknown';
    var bandText = BAND_LABELS[bandKey] || bandKey;
    summaryCopy.appendChild(el('p', { class: 'report-doc-band report-doc-band-' + bandKey, text: bandText }));
    if (report.recommended_path) {
      var pathLabel = PATH_LABELS[report.recommended_path] || report.recommended_path;
      summaryCopy.appendChild(el('p', { class: 'report-doc-next', html: 'Recommended path: <strong>' + pathLabel + '</strong>' }));
    }
    summary.appendChild(summaryCopy);
    mount.appendChild(summary);

    /* --- Business profile --- */
    var completion = report.insight_completion_state;
    if (completion && completion !== 'skipped') {
      var profile = el('section', { class: 'report-doc-section' });
      profile.appendChild(el('h2', { text: 'Business profile' }));
      if (report.profile_tags && report.profile_tags.length) {
        var tagRow = el('div', { class: 'report-doc-tags' });
        report.profile_tags.forEach(function (label) {
          tagRow.appendChild(el('span', {
            class: 'report-doc-tag report-doc-tag-' + toneForTag(label),
            text: label
          }));
        });
        profile.appendChild(tagRow);
      }
      var ps = report.profile_summary;
      if (ps) {
        var parts = [];
        if (ps.strongest_area)      parts.push('strongest in <strong>' + ps.strongest_area + '</strong>');
        if (ps.weakest_area)        parts.push('weaker in <strong>' + ps.weakest_area + '</strong>');
        if (ps.fastest_improvement) parts.push('most likely to improve quickly through <strong>' + ps.fastest_improvement + '</strong>');
        if (parts.length) profile.appendChild(el('p', { class: 'report-doc-summary-line', html: 'Based on your answers, your current lending profile looks ' + parts.join(', ') + '.' }));
      }
      mount.appendChild(profile);
    } else {
      var skipped = el('section', { class: 'report-doc-section' });
      skipped.appendChild(el('h2', { text: 'Business profile' }));
      skipped.appendChild(el('p', { class: 'report-doc-summary-line', text: 'This report is based mainly on the core Bank-Ready readiness answers; the optional Business Lending Signals were skipped.' }));
      mount.appendChild(skipped);
    }

    /* --- 8-dimension breakdown --- */
    var dims = el('section', { class: 'report-doc-section' });
    dims.appendChild(el('h2', { text: '8-dimension breakdown' }));
    var grid = el('div', { class: 'report-doc-dim-grid' });
    var scoresMap = report.dimension_scores || {};
    DIMENSION_ORDER.forEach(function (dimId) {
      var score = scoresMap[dimId];
      if (score == null) return;
      var weight = DIMENSION_WEIGHTS[dimId] || 10;
      var pct = Math.round((score / Math.max(weight, 1)) * 100);
      var state = pct >= 80 ? ' is-strong' : (pct < 50 ? ' is-weak' : '');
      var card = el('div', { class: 'report-doc-dim' + state });
      card.appendChild(el('p', { class: 'report-doc-dim-label', text: DIMENSION_LABELS[dimId] || dimId }));
      card.appendChild(el('p', { class: 'report-doc-dim-score', html: '<strong>' + score + '</strong> <span>of ' + weight + '</span>' }));
      var bar = el('div', { class: 'report-doc-dim-bar' });
      var fill = el('div', { class: 'report-doc-dim-bar-fill' });
      fill.style.width = Math.max(4, Math.min(100, pct)) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
      grid.appendChild(card);
    });
    dims.appendChild(grid);
    mount.appendChild(dims);

    /* --- Top 3 actions --- */
    if (report.top_priority_actions && report.top_priority_actions.length) {
      var actions = el('section', { class: 'report-doc-section' });
      actions.appendChild(el('h2', { text: 'Top 3 actions before application' }));
      var list = el('ol', { class: 'report-doc-actions' });
      report.top_priority_actions.forEach(function (a) {
        var li = el('li');
        li.appendChild(el('p', { class: 'report-doc-action-label', text: a.label }));
        li.appendChild(el('p', { class: 'report-doc-action-body', text: a.body || '' }));
        list.appendChild(li);
      });
      actions.appendChild(list);
      mount.appendChild(actions);
    }

    /* --- CTA + disclaimer --- */
    var footer = el('section', { class: 'report-doc-footer' });
    var cta = el('div', { class: 'report-doc-cta' });
    cta.appendChild(el('p', { class: 'report-doc-cta-title', text: 'Want an Oney banker review?' }));
    cta.appendChild(el('p', { class: 'report-doc-cta-body', text: 'A 15-minute review will tell you exactly which dimensions to fix first and how your file would look to a lender today.' }));
    cta.appendChild(el('a', { href: 'https://oneyco.com.au/', class: 'btn-purple report-doc-cta-btn', text: 'Request Oney review', target: '_blank', rel: 'noopener' }));
    footer.appendChild(cta);

    footer.appendChild(el('p', { class: 'report-doc-disclaimer', text: DEFAULT_DISCLAIMER }));
    var v = (report.product_version || '—') + ' · Scoring ' + (report.scoring_version || '—') + ' · Disclaimer ' + (report.disclaimer_version || '—');
    footer.appendChild(el('p', { class: 'report-doc-version', text: v }));
    mount.appendChild(footer);

    var printBtn = $('#reportPrint');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });
  }

  function renderMissing(reason) {
    var mount = $('#reportMount');
    if (!mount) return;
    mount.innerHTML = '';
    mount.appendChild(el('div', { class: 'report-doc-missing' }, [
      el('h1', { text: 'Report not available' }),
      el('p', { text: reason || 'This report link may have expired or is no longer valid. You can generate a new one from the Bank-Ready Score.' }),
      el('a', { href: '/', class: 'btn-purple', text: 'Back to Bank-Ready Score' })
    ]));
  }

  function boot() {
    loadView().then(function (view) {
      if (!view || !view.report) { renderMissing(); return; }
      render(view);
    }).catch(function () { renderMissing(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
