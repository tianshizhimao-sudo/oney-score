/* Bank-Ready Score — report capture modal
 *
 * Lightweight modal / sheet that opens from the result page's primary
 * CTA. Kept deliberately minimal: no free-text fields beyond what is
 * strictly needed, consent framed as opt-in, broker share revealed
 * progressively so mobile users see a single short form by default.
 */
(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null) return;
        if (key === 'class') node.className = value;
        else if (key === 'dataset') {
          Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
        } else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.indexOf('aria-') === 0 || key === 'role' || key === 'tabindex' ||
                 key === 'type' || key === 'id' || key === 'for' || key === 'hidden' ||
                 key === 'disabled' || key === 'name' || key === 'placeholder' ||
                 key === 'checked' || key === 'required' || key === 'autocomplete' ||
                 key === 'inputmode' || key === 'maxlength') {
          if (value === false || value == null) return;
          if (value === true) node.setAttribute(key, '');
          else node.setAttribute(key, value);
        } else node[key] = value;
      });
    }
    if (children) children.forEach(function (c) {
      if (c == null) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function track(name, params) {
    if (typeof window.trackEvent === 'function') {
      try { window.trackEvent(name, params || {}); } catch (e) {}
    }
  }

  /* ---------------- Open / close ---------------- */

  var activeBackdrop = null;
  var previousFocus = null;

  function lockScroll() {
    document.documentElement.style.overflow = 'hidden';
  }
  function unlockScroll() {
    document.documentElement.style.overflow = '';
  }

  function openModal(context) {
    if (activeBackdrop) return;
    previousFocus = document.activeElement;
    track('report_modal_opened');
    var backdrop = buildModal(context);
    document.body.appendChild(backdrop);
    activeBackdrop = backdrop;
    lockScroll();
    requestAnimationFrame(function () {
      backdrop.classList.add('is-open');
      var firstInput = backdrop.querySelector('input[name="firstName"]');
      if (firstInput) firstInput.focus();
    });
  }

  function closeModal() {
    if (!activeBackdrop) return;
    activeBackdrop.classList.remove('is-open');
    var node = activeBackdrop;
    activeBackdrop = null;
    unlockScroll();
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      if (previousFocus && typeof previousFocus.focus === 'function') {
        try { previousFocus.focus(); } catch (e) {}
      }
    }, 200);
  }

  /* ---------------- Build modal ---------------- */

  function buildModal(context) {
    var backdrop = el('div', {
      class: 'report-modal-backdrop',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'reportModalTitle'
    });

    var sheet = el('div', { class: 'report-modal-sheet' });

    var closeBtn = el('button', {
      type: 'button',
      class: 'report-modal-close',
      'aria-label': 'Close report capture dialog',
      html: '&times;'
    });
    closeBtn.addEventListener('click', closeModal);
    sheet.appendChild(closeBtn);

    var header = el('div', { class: 'report-modal-header' });
    header.appendChild(el('p', { class: 'result-kicker', text: 'Your report' }));
    header.appendChild(el('h2', { id: 'reportModalTitle', text: 'Generate my lending report' }));
    header.appendChild(el('p', {
      class: 'report-modal-sub',
      text: 'Email yourself a clear lending summary, or send it to your broker or lender for review. Takes about 20 seconds.'
    }));
    sheet.appendChild(header);

    sheet.appendChild(buildForm(context));

    backdrop.appendChild(sheet);

    // Dismiss on backdrop click
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });
    // Dismiss on Escape
    backdrop.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    return backdrop;
  }

  function field(id, label, attrs, helper) {
    var inputAttrs = Object.assign({ id: id, name: id, class: 'report-input' }, attrs || {});
    var wrap = el('label', { class: 'report-field', for: id });
    wrap.appendChild(el('span', { class: 'report-field-label', text: label }));
    if (helper) wrap.appendChild(el('span', { class: 'report-field-helper', text: helper }));
    wrap.appendChild(el('input', inputAttrs));
    wrap.appendChild(el('span', { class: 'report-field-error', role: 'alert' }));
    return wrap;
  }

  function checkbox(id, labelText, opts) {
    opts = opts || {};
    var row = el('label', { class: 'report-checkbox', for: id });
    var input = el('input', Object.assign({
      id: id, name: id, type: 'checkbox', class: 'report-checkbox-input'
    }, opts));
    row.appendChild(input);
    row.appendChild(el('span', { class: 'report-checkbox-label', text: labelText }));
    return row;
  }

  function buildForm(context) {
    var form = el('form', { class: 'report-form', novalidate: true });

    var row1 = el('div', { class: 'report-field-row' });
    row1.appendChild(field('firstName', 'First name', { required: true, autocomplete: 'given-name', maxlength: '80' }));
    row1.appendChild(field('email', 'Email', { required: true, type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: '180' }));
    form.appendChild(row1);

    var row2 = el('div', { class: 'report-field-row' });
    row2.appendChild(field('businessName', 'Business name', { autocomplete: 'organization', maxlength: '140' }, 'Optional'));
    row2.appendChild(field('mobile', 'Mobile', { autocomplete: 'tel', inputmode: 'tel', maxlength: '24' }, 'Optional'));
    form.appendChild(row2);

    var shareToggle = checkbox('shareWithBroker', 'Send a copy to my broker / lender');
    form.appendChild(shareToggle);

    var shareBlock = el('div', { class: 'report-share-block', hidden: true });
    shareBlock.appendChild(field('recipientName', 'Broker or lender name', { autocomplete: 'off', maxlength: '140' }, 'Optional'));
    shareBlock.appendChild(field('recipientEmail', 'Broker or lender email', { type: 'email', autocomplete: 'off', inputmode: 'email', maxlength: '180' }, 'Required if sharing'));
    shareBlock.appendChild(checkbox('consentConfirmed', 'I confirm I’m happy to share this result with the recipient above'));
    form.appendChild(shareBlock);

    shareToggle.querySelector('input').addEventListener('change', function (e) {
      var enabled = e.target.checked;
      shareBlock.hidden = !enabled;
      if (enabled) track('report_share_enabled');
    });

    var consents = el('div', { class: 'report-consent-group' });
    consents.appendChild(checkbox('consentEmail', 'Email me my report', { checked: true }));
    consents.appendChild(checkbox('consentFollowUp', 'I’m happy for Oney to follow up about my lending readiness'));
    form.appendChild(consents);

    var note = el('p', {
      class: 'report-privacy-note',
      text: 'We use your details to send the report and, if you opt in, to follow up. You can unsubscribe at any time.'
    });
    form.appendChild(note);

    var actions = el('div', { class: 'report-form-actions' });
    var cancel = el('button', { type: 'button', class: 'btn-ghost', text: 'Cancel' });
    cancel.addEventListener('click', closeModal);
    actions.appendChild(cancel);

    var submit = el('button', { type: 'submit', class: 'btn-purple', text: 'Generate my report' });
    actions.appendChild(submit);
    form.appendChild(actions);

    var formError = el('p', { class: 'report-form-error', role: 'alert', 'aria-live': 'polite' });
    form.appendChild(formError);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Generating…';
      formError.textContent = '';
      handleSubmit(form, context).then(function () {
        // success path swaps UI
      }).catch(function (err) {
        submit.disabled = false;
        submit.textContent = 'Generate my report';
        formError.textContent = (err && err.message) || 'Something went wrong. Please try again.';
      });
    });

    return form;
  }

  /* ---------------- Validation + submit ---------------- */

  function collectAndValidate(form) {
    var errors = {};
    function val(name) {
      var n = form.querySelector('[name="' + name + '"]');
      if (!n) return '';
      if (n.type === 'checkbox') return !!n.checked;
      return (n.value || '').trim();
    }
    function setErr(name, msg) {
      errors[name] = msg;
      var field = form.querySelector('[name="' + name + '"]');
      if (!field) return;
      var wrap = field.closest('.report-field');
      if (wrap) {
        var errNode = wrap.querySelector('.report-field-error');
        if (errNode) errNode.textContent = msg || '';
        wrap.classList.toggle('is-invalid', !!msg);
      }
    }
    // Reset prior errors
    Array.prototype.forEach.call(form.querySelectorAll('.report-field'), function (n) {
      n.classList.remove('is-invalid');
      var e = n.querySelector('.report-field-error');
      if (e) e.textContent = '';
    });

    var firstName = val('firstName');
    var email = val('email');
    var businessName = val('businessName');
    var mobile = val('mobile');
    var share = val('shareWithBroker');
    var recipientName = val('recipientName');
    var recipientEmail = val('recipientEmail');
    var consentEmail = val('consentEmail');
    var consentFollowUp = val('consentFollowUp');
    var consentConfirmed = val('consentConfirmed');

    if (!firstName) setErr('firstName', 'Please enter your first name.');
    if (!email) setErr('email', 'Please enter your email.');
    else if (!EMAIL_RE.test(email)) setErr('email', 'That doesn’t look like a valid email address.');

    if (share) {
      if (!recipientEmail) setErr('recipientEmail', 'Add the recipient’s email or uncheck sharing.');
      else if (!EMAIL_RE.test(recipientEmail)) setErr('recipientEmail', 'Recipient email looks invalid.');
    }

    if (!consentEmail) {
      return { ok: false, global: 'Please leave “Email me my report” checked — we need it to send the report.' };
    }
    if (share && !consentConfirmed) {
      return { ok: false, global: 'Please confirm you’re happy to share the report with the recipient above.' };
    }

    if (Object.keys(errors).length > 0) return { ok: false, global: 'Please fix the highlighted fields.' };

    return {
      ok: true,
      lead: {
        firstName: firstName,
        email: email,
        businessName: businessName,
        mobile: mobile,
        consentEmail: consentEmail,
        consentFollowUp: consentFollowUp,
        share: {
          enabled: share,
          recipientType: 'broker',
          recipientName: recipientName,
          recipientEmail: recipientEmail,
          consentConfirmed: consentConfirmed
        }
      }
    };
  }

  function handleSubmit(form, context) {
    var validation = collectAndValidate(form);
    if (!validation.ok) {
      var err = new Error(validation.global || 'Form has errors.');
      return Promise.reject(err);
    }

    var payload = window.OneyReportSerializer.build({
      result: context.result,
      insightResult: context.insightResult,
      coreAnswers: context.coreAnswers,
      insightAnswers: context.insightAnswers,
      lead: validation.lead
    });

    if (validation.lead.consentFollowUp) track('oney_follow_up_opted_in');
    if (validation.lead.share && validation.lead.share.enabled) track('report_shared_to_broker');
    track('report_submitted');

    return window.OneyReportPlatform.submit(payload).then(function (res) {
      track('report_email_sent');
      showSuccessState(form, payload, res, context);
      if (typeof context.onSuccess === 'function') {
        try { context.onSuccess(payload, res); } catch (e) {}
      }
      return res;
    });
  }

  /* ---------------- Success state ---------------- */

  function showSuccessState(form, payload, res, context) {
    var sheet = form.closest('.report-modal-sheet');
    if (!sheet) return;
    // Replace form + header with success block
    var header = sheet.querySelector('.report-modal-header');
    if (header) header.remove();
    form.remove();

    var success = el('div', { class: 'report-success' });
    success.appendChild(el('div', { class: 'report-success-tick', 'aria-hidden': 'true', html: '&#10003;' }));
    success.appendChild(el('h2', { text: 'Report ready' }));

    var lines = [];
    var userEmailOk = res.deliveries && res.deliveries.userEmail && res.deliveries.userEmail.queued;
    if (userEmailOk) {
      lines.push('A copy has been sent to ' + payload.lead.email + '.');
    } else {
      lines.push('Your report is ready below — you can download or open it, and we’ll email a copy as soon as delivery is confirmed.');
    }
    if (payload.share && payload.share.enabled) {
      var recipientOk = res.deliveries && res.deliveries.recipientEmail && res.deliveries.recipientEmail.queued;
      if (recipientOk) {
        lines.push('A copy has also been shared with ' + payload.share.recipient_email + '.');
      } else {
        lines.push('Sharing with ' + (payload.share.recipient_email || 'your broker') + ' is queued.');
      }
    }
    lines.forEach(function (line) {
      success.appendChild(el('p', { class: 'report-success-line', text: line }));
    });

    var actions = el('div', { class: 'report-success-actions' });
    var viewBtn = el('a', {
      class: 'btn-purple',
      href: (res.report && res.report.reportUrl) || '#',
      target: '_blank',
      rel: 'noopener',
      text: 'Open / download report'
    });
    actions.appendChild(viewBtn);

    var emailAnotherBtn = el('button', { type: 'button', class: 'btn-ghost', text: 'Email another copy' });
    emailAnotherBtn.addEventListener('click', function () {
      closeModal();
      setTimeout(function () { openCaptureModal(context); }, 200);
    });
    actions.appendChild(emailAnotherBtn);

    var reviewLink = el('a', {
      class: 'btn-link',
      href: 'https://oneyco.com.au/',
      text: 'Request Oney review',
      target: '_blank',
      rel: 'noopener'
    });
    actions.appendChild(reviewLink);

    success.appendChild(actions);
    sheet.appendChild(success);

    // Notify page-level code so the result card can swap into its own
    // success state (outside the modal) too.
    var evt;
    try {
      evt = new CustomEvent('oney:report:generated', { detail: { payload: payload, result: res } });
    } catch (e) {
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('oney:report:generated', true, true, { payload: payload, result: res });
    }
    window.dispatchEvent(evt);
  }

  function openCaptureModal(context) {
    openModal(context);
  }

  window.OneyReportModal = {
    open: openCaptureModal,
    close: closeModal
  };
})();
