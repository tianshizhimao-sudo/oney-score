/* Oney V2.1 shell: isolated from assessment answers and report data. */
(function () {
  'use strict';
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  onReady(function () {
    var root = document.documentElement;
    var buttons = document.querySelectorAll('.theme-dot');
    function applyTheme(theme, persist) {
      theme = theme === 'dark' ? 'dark' : 'light';
      root.setAttribute('data-theme', theme);
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
      });
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'dark' ? '#17131E' : '#F2F4F3');
      if (persist) {
        try { localStorage.setItem('oney-theme', theme); } catch (e) {}
      }
    }
    var saved = 'light';
    try { saved = localStorage.getItem('oney-theme'); } catch (e) {}
    applyTheme(saved, false);
    buttons.forEach(function (button) {
      button.addEventListener('click', function () { applyTheme(button.dataset.theme, true); });
    });

    var nav = document.querySelector('.oney-nav');
    var toggle = document.querySelector('.nav-menu-toggle');
    var links = document.getElementById('primaryLinks');
    if (!nav || !toggle || !links) return;
    var mobile = window.matchMedia('(max-width: 1024px)');
    var open = false;
    function setOpen(value, returnFocus) {
      open = mobile.matches && value;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
      links.hidden = mobile.matches && !open;
      if (returnFocus) toggle.focus();
    }
    function syncViewport() {
      var hadLinkFocus = links.contains(document.activeElement);
      var hadToggleFocus = document.activeElement === toggle;
      toggle.hidden = !mobile.matches;
      setOpen(false, mobile.matches && hadLinkFocus);
      if (!mobile.matches && hadToggleFocus) {
        var first = links.querySelector('a');
        if (first) first.focus();
      }
    }
    nav.classList.add('menu-ready');
    toggle.addEventListener('click', function () { setOpen(!open, false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false, true); }
    });
    links.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false, false);
    });
    document.addEventListener('click', function (event) {
      if (open && !nav.contains(event.target)) setOpen(false, links.contains(document.activeElement));
    });
    nav.addEventListener('focusout', function (event) {
      if (open && event.relatedTarget && !nav.contains(event.relatedTarget)) setOpen(false, false);
    });
    if (mobile.addEventListener) mobile.addEventListener('change', syncViewport);
    else mobile.addListener(syncViewport);
    syncViewport();
  });
})();
