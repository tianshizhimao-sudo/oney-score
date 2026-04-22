/* Bank-Ready Score — standalone report view renderer
 *
 * Used by report.html. Reads a payload from:
 *   1. `?id=` query param via a backend lookup (if OneyReportPlatform config has a backend),
 *   2. `#r=` hash-encoded payload (used when no backend is present),
 *   3. As a last fallback, any locally-saved report with a matching id.
 *
 * The page is intentionally static / CSS-only so the browser's built-in
 * Print dialog produces a clean PDF without extra libraries.
 */
(function () {
  'use strict';

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

  function readLocalById(id) {
    try {
      var raw = localStorage.getItem('oney-score-reports');
      if (!raw) return null;
      var store = JSON.parse(raw);
      return (store && store[id]) || null;
    } catch (e) { return null; }
  }

  function loadPayload() {
    var hashPayload = getHashPayload();
    if (hashPayload) return hashPayload;
    var id = getQueryId();
    if (id) return readLocalById(id);
    return null;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

  function bandLabel(band) {
    if (band === 'strong') return 'Strong bank-ready';
    if (band === 'borderline') return 'Close — polish before applying';
    if (band === 'needs-work') return 'Needs work before application';
    return band || 'Unavailable';
  }

  function render(payload) {
    var mount = $('#reportMount');
    if (!mount) return;
    mount.innerHTML = '';

    // --- Header ---
    var header = el('header', { class: 'report-doc-header' });
    header.appendChild(el('p', { class: 'report-doc-kicker', text: 'Bank-Ready Score report' }));
    var who = payload.lead && payload.lead.first_name
      ? 'Prepared for ' + payload.lead.first_name + (payload.lead.business_name ? ' — ' + payload.lead.business_name : '')
      : 'Bank-Ready Score report';
    header.appendChild(el('h1', { text: who }));
    header.appendChild(el('p', { class: 'report-doc-meta', text: formatDate(payload.created_at) + ' · Report ID ' + payload.report_id }));
    mount.appendChild(header);

    // --- Score summary ---
    var summary = el('section', { class: 'report-doc-summary' });
    var scoreBox = el('div', { class: 'report-doc-score' });
    scoreBox.appendChild(el('span', { class: 'report-doc-score-number', text: String(payload.overall_score) }));
    scoreBox.appendChild(el('span', { class: 'report-doc-score-out', text: '/ 100' }));
    summary.appendChild(scoreBox);

    var summaryCopy = el('div', { class: 'report-doc-summary-copy' });
    summaryCopy.appendChild(el('p', { class: 'report-doc-band report-doc-band-' + (payload.readiness_band || 'unknown'), text: bandLabel(payload.readiness_band) }));
    if (payload.next_step) summaryCopy.appendChild(el('p', { class: 'report-doc-next', html: 'Recommended path: <strong>' + payload.next_step + '</strong>' }));
    summary.appendChild(summaryCopy);
    mount.appendChild(summary);

    // --- Profile tags + summary ---
    if (payload.insight && payload.insight.completion_state !== 'unavailable' && payload.insight.completion_state !== 'skipped') {
      var profile = el('section', { class: 'report-doc-section' });
      profile.appendChild(el('h2', { text: 'Business profile' }));
      if (payload.insight.profile_tags && payload.insight.profile_tags.length) {
        var tagRow = el('div', { class: 'report-doc-tags' });
        payload.insight.profile_tags.forEach(function (t) {
          tagRow.appendChild(el('span', { class: 'report-doc-tag report-doc-tag-' + (t.tone || 'neutral'), text: t.label }));
        });
        profile.appendChild(tagRow);
      }
      var ps = payload.insight.profile_summary;
      if (ps) {
        var parts = [];
        if (ps.strongest_area) parts.push('strongest in <strong>' + ps.strongest_area + '</strong>');
        if (ps.weakest_area) parts.push('weaker in <strong>' + ps.weakest_area + '</strong>');
        if (ps.fastest_improvement) parts.push('most likely to improve quickly through <strong>' + ps.fastest_improvement + '</strong>');
        if (parts.length) profile.appendChild(el('p', { class: 'report-doc-summary-line', html: 'Based on your answers, your current lending profile looks ' + parts.join(', ') + '.' }));
      }
      mount.appendChild(profile);
    } else {
      var skipped = el('section', { class: 'report-doc-section' });
      skipped.appendChild(el('h2', { text: 'Business profile' }));
      skipped.appendChild(el('p', { class: 'report-doc-summary-line', text: 'Business Lending Signals were skipped, so this report is based on the core Bank-Ready readiness assessment only.' }));
      mount.appendChild(skipped);
    }

    // --- Dimension breakdown ---
    var dims = el('section', { class: 'report-doc-section' });
    dims.appendChild(el('h2', { text: '8-dimension breakdown' }));
    var grid = el('div', { class: 'report-doc-dim-grid' });
    (payload.dimensions || []).forEach(function (d) {
      var pct = Math.round((d.ratio || 0) * 100);
      var state = pct >= 80 ? ' is-strong' : (pct < 50 ? ' is-weak' : '');
      var card = el('div', { class: 'report-doc-dim' + state });
      card.appendChild(el('p', { class: 'report-doc-dim-label', text: d.label }));
      card.appendChild(el('p', { class: 'report-doc-dim-score', html: '<strong>' + d.score + '</strong> <span>of ' + d.weight + '</span>' }));
      var bar = el('div', { class: 'report-doc-dim-bar' });
      var fill = el('div', { class: 'report-doc-dim-bar-fill' });
      fill.style.width = Math.max(4, Math.min(100, pct)) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
      grid.appendChild(card);
    });
    dims.appendChild(grid);
    mount.appendChild(dims);

    // --- Priority actions ---
    if (payload.top_actions && payload.top_actions.length) {
      var actions = el('section', { class: 'report-doc-section' });
      actions.appendChild(el('h2', { text: 'Top 3 actions before application' }));
      var list = el('ol', { class: 'report-doc-actions' });
      payload.top_actions.forEach(function (a) {
        var li = el('li');
        li.appendChild(el('p', { class: 'report-doc-action-label', text: a.label }));
        li.appendChild(el('p', { class: 'report-doc-action-body', text: a.text }));
        list.appendChild(li);
      });
      actions.appendChild(list);
      mount.appendChild(actions);
    }

    // --- CTA + disclaimer ---
    var footer = el('section', { class: 'report-doc-footer' });
    var cta = el('div', { class: 'report-doc-cta' });
    cta.appendChild(el('p', { class: 'report-doc-cta-title', text: 'Want an Oney banker review?' }));
    cta.appendChild(el('p', { class: 'report-doc-cta-body', text: 'A 15-minute review will tell you exactly which dimensions to fix first and how your file would look to a lender today.' }));
    cta.appendChild(el('a', { href: 'https://oneyco.com.au/', class: 'btn-purple report-doc-cta-btn', text: 'Request Oney review', target: '_blank', rel: 'noopener' }));
    footer.appendChild(cta);

    footer.appendChild(el('p', { class: 'report-doc-disclaimer', text: payload.disclaimer || '' }));
    footer.appendChild(el('p', { class: 'report-doc-version', text: payload.product_version + ' · Scoring v' + payload.scoring_version }));
    mount.appendChild(footer);

    // Print button handler
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
    var payload = loadPayload();
    if (!payload || typeof payload !== 'object') {
      renderMissing();
      return;
    }
    render(payload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
