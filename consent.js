// BioStat Quest cookie / storage consent banner.
// Vanilla JS, zero deps. Loaded from every public HTML page (landing, about,
// sources, privacy, terms, cookies) and by the SPA entry (biostat-quest.html).
//
// Public API exposed as `window.bqConsent`:
//   bqConsent.get()            → { v, status: "pending"|"all"|"essential", ts }
//   bqConsent.hasAnalytics()   → true if the user has opted in to analytics
//   bqConsent.setAll()         → accept all (analytics on)
//   bqConsent.setEssential()   → essential only (analytics off)
//   bqConsent.open()           → re-open the banner for change of mind
//
// Event: "bq-consent-change" is dispatched on window whenever the choice
// changes, so the SPA can react (e.g. start/stop logging events).
//
// GDPR stance:
//   "essential" covers strictly-necessary items (auth session, the consent
//   record itself, saved progress/SRS needed for the app to function).
//   "analytics" covers the persistent visitor_id, landing_variant tag, and
//   server-side event logging — all off until explicit accept-all.

(function () {
  'use strict';

  var KEY = 'bq_cookie_consent';
  var VERSION = 1;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return { v: VERSION, status: 'pending', ts: 0 };
      var obj = JSON.parse(raw);
      if (!obj || obj.v !== VERSION) return { v: VERSION, status: 'pending', ts: 0 };
      return obj;
    } catch (e) {
      return { v: VERSION, status: 'pending', ts: 0 };
    }
  }

  function write(status) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: VERSION, status: status, ts: Date.now() }));
    } catch (e) { /* storage blocked — treat as essential-only implicitly */ }
  }

  function dispatch() {
    try {
      window.dispatchEvent(new CustomEvent('bq-consent-change', { detail: read() }));
    } catch (e) { /* ignore older browsers */ }
  }

  // Analytics-bucket localStorage keys. If the user opts out, we actively
  // purge any previously-written analytics identifiers so their next visit
  // is clean. Essential/functional keys (sb-*-auth-token, bq_guest_state,
  // bq_last_email, bq_cookie_consent itself) are NOT in this list.
  var ANALYTICS_KEYS = ['bq_visitor_id', 'bq_landing_variant', 'bq_last_guest_visit'];
  function purgeAnalytics() {
    try {
      for (var i = 0; i < ANALYTICS_KEYS.length; i++) {
        try { localStorage.removeItem(ANALYTICS_KEYS[i]); } catch (e) {}
      }
    } catch (e) {}
  }

  var api = {
    get: read,
    hasAnalytics: function () { return read().status === 'all'; },
    setAll: function () { write('all'); hide(); dispatch(); },
    setEssential: function () { write('essential'); purgeAnalytics(); hide(); dispatch(); },
    open: function () { show(true); }
  };

  var stylesInjected = false;
  function ensureStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var style = document.createElement('style');
    style.textContent = [
      '.bq-consent{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:9999;max-width:560px;margin:0 auto;background:linear-gradient(145deg,rgba(22,28,54,.96),rgba(12,16,36,.98));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:1rem;border:1px solid rgba(148,163,184,.18);box-shadow:0 20px 50px -18px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.04);color:#cbd5e1;font-family:"Inter",system-ui,-apple-system,sans-serif;padding:1.125rem 1.25rem;animation:bq-consent-in .3s cubic-bezier(.2,.8,.2,1) both}',
      '@keyframes bq-consent-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}',
      '.bq-consent__title{font-weight:700;color:#f1f5f9;font-size:.95rem;margin:0 0 .4rem;letter-spacing:-0.005em}',
      '.bq-consent__body{font-size:.8125rem;line-height:1.6;color:#94a3b8;margin:0 0 .9rem}',
      '.bq-consent__body a{color:#22d3ee;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(34,211,238,.4)}',
      '.bq-consent__body a:hover{text-decoration-color:#22d3ee}',
      '.bq-consent__row{display:flex;flex-wrap:wrap;gap:.5rem}',
      '.bq-consent__btn{flex:1;min-width:140px;padding:.625rem 1rem;border-radius:.625rem;font-size:.8125rem;font-weight:600;letter-spacing:.01em;border:0;cursor:pointer;transition:transform .2s cubic-bezier(.4,0,.2,1),box-shadow .2s cubic-bezier(.4,0,.2,1);font-family:inherit}',
      '.bq-consent__btn:hover{transform:translateY(-1px)}',
      '.bq-consent__btn--primary{background:linear-gradient(135deg,#22d3ee,#0891b2);color:#042f3a;box-shadow:0 8px 20px -6px rgba(34,211,238,.45)}',
      '.bq-consent__btn--primary:hover{box-shadow:0 12px 28px -6px rgba(34,211,238,.65)}',
      '.bq-consent__btn--ghost{background:rgba(148,163,184,.06);color:#cbd5e1;border:1px solid rgba(148,163,184,.14)}',
      '.bq-consent__btn--ghost:hover{background:rgba(148,163,184,.14)}',
      '@media (max-width:480px){.bq-consent__btn{min-width:0}}'
    ].join('');
    document.head.appendChild(style);
  }

  var el;
  function show(force) {
    var state = read();
    if (!force && state.status !== 'pending') return;
    ensureStyles();
    if (el) { el.style.display = 'block'; return; }
    el = document.createElement('div');
    el.className = 'bq-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'bq-consent-title');
    el.setAttribute('aria-describedby', 'bq-consent-body');
    el.innerHTML =
      '<div class="bq-consent__title" id="bq-consent-title">Cookies &amp; analytics</div>' +
      '<p class="bq-consent__body" id="bq-consent-body">' +
        'We use essential storage to keep you signed in and save your progress. ' +
        'Optional analytics (a per-browser visitor ID + event log) help us understand what works and improve the site. ' +
        'See the <a href="/cookies.html">Cookies page</a> for the full list, or change your mind any time from the footer.' +
      '</p>' +
      '<div class="bq-consent__row">' +
        '<button type="button" class="bq-consent__btn bq-consent__btn--primary" data-action="all">Accept all</button>' +
        '<button type="button" class="bq-consent__btn bq-consent__btn--ghost" data-action="essential">Essential only</button>' +
      '</div>';
    el.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var a = t.getAttribute('data-action');
      if (a === 'all') api.setAll();
      else if (a === 'essential') api.setEssential();
    });
    document.body.appendChild(el);
  }

  function hide() { if (el) el.style.display = 'none'; }

  window.bqConsent = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { show(false); });
  } else {
    show(false);
  }
})();
