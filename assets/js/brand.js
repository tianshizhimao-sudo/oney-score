/* Oney & Co brand shell — theme switcher + fade-up observer */
(function () {
  'use strict';

  function initThemeSwitcher() {
    var root = document.documentElement;
    var dots = document.querySelectorAll('.theme-dot');
    var saved = 'dark';
    try {
      saved = localStorage.getItem('oney-theme') || 'dark';
    } catch (e) {
      saved = 'dark';
    }

    root.classList.add('no-transition');
    root.setAttribute('data-theme', saved);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.remove('no-transition');
      });
    });

    function applyTheme(theme) {
      root.setAttribute('data-theme', theme);
      try { localStorage.setItem('oney-theme', theme); } catch (e) {}
      dots.forEach(function (d) {
        var match = d.dataset.theme === theme;
        d.classList.toggle('active', match);
        d.setAttribute('aria-checked', match ? 'true' : 'false');
      });
    }

    dots.forEach(function (dot) {
      var match = dot.dataset.theme === saved;
      dot.classList.toggle('active', match);
      dot.setAttribute('aria-checked', match ? 'true' : 'false');
      dot.addEventListener('click', function () {
        applyTheme(dot.dataset.theme);
      });
      dot.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          applyTheme(dot.dataset.theme);
        }
      });
    });
  }

  function initFadeObserver() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.fade-up').forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.fade-up').forEach(function (el) {
      io.observe(el);
    });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    initThemeSwitcher();
    initFadeObserver();
  });
})();
