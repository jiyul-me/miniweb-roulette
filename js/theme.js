/* 테마 결정은 <head>에서 블로킹으로 실행해 다크모드 깜빡임(FOUC)을 막는다 */
(function () {
  'use strict';

  var KEY = 'rp.v1.theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function resolve() {
    return stored() || (mq.matches ? 'dark' : 'light');
  }

  function apply() {
    document.documentElement.setAttribute('data-theme', resolve());
    document.dispatchEvent(new CustomEvent('rp:themechange'));
  }

  window.Theme = {
    current: function () {
      return document.documentElement.getAttribute('data-theme') || resolve();
    },
    toggle: function () {
      var next = resolve() === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch (e) { /* 저장 불가 환경이면 세션 내에서만 유지 */ }
      document.documentElement.setAttribute('data-theme', next);
      document.dispatchEvent(new CustomEvent('rp:themechange'));
    },
    onChange: function (fn) {
      document.addEventListener('rp:themechange', fn);
    }
  };

  mq.addEventListener('change', function () {
    if (!stored()) apply();
  });

  apply();

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', window.Theme.toggle);
  });
})();
