// Cookie consent banner (Google Consent Mode v2).
//
// The header and footer are now baked into every page as static HTML at
// build time (scripts/lib/chrome.mjs), so this file only handles consent.
//
// Pairs with the inline gtag('consent','default') snippet in the page
// <head>. That snippet sets all ad and analytics storage to "denied" by
// default and restores a saved "granted" choice from localStorage so the
// banner does not flash for returning visitors.
//
// This block renders the banner UI on first visit (or after a saved
// decision becomes stale, default 12 months) and exposes
// window.AIGconsent.open() so the footer "Cookie preferences" link can
// reopen it later.

(function() {
  const CONSENT_KEY = 'aiglimpse-consent';
  const CONSENT_STALE_MS = 365 * 24 * 60 * 60 * 1000; // 12 months

  function readConsent() {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      if (!obj.ts || (Date.now() - obj.ts) > CONSENT_STALE_MS) return null;
      return obj;
    } catch { return null; }
  }

  function writeConsent(choice) {
    const payload = { choice, ts: Date.now(), version: 1 };
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(payload)); } catch {}
    if (typeof window.gtag === 'function') {
      const granted = choice === 'granted';
      window.gtag('consent', 'update', {
        'ad_storage': granted ? 'granted' : 'denied',
        'ad_user_data': granted ? 'granted' : 'denied',
        'ad_personalization': granted ? 'granted' : 'denied',
        'analytics_storage': granted ? 'granted' : 'denied'
      });
    }
  }

  function buildConsentBanner() {
    return `
      <div class="consent-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
        <div class="consent-banner-inner">
          <div class="consent-banner-text">
            <strong>We use cookies.</strong>
            We use cookies to understand how readers use AI Glimpse (Google Analytics).
            You can accept all, reject non-essential cookies, or read our
            <a href="/pages/privacy">Privacy Policy</a>.
          </div>
          <div class="consent-banner-actions">
            <button type="button" class="btn btn--ghost btn--sm" data-consent="denied">Reject non-essential</button>
            <button type="button" class="btn btn--primary btn--sm" data-consent="granted">Accept all</button>
          </div>
        </div>
      </div>`;
  }

  function showBanner() {
    if (document.querySelector('.consent-banner')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = buildConsentBanner().trim();
    const banner = wrap.firstChild;
    document.body.appendChild(banner);
    banner.querySelectorAll('button[data-consent]').forEach(btn => {
      btn.addEventListener('click', () => {
        writeConsent(btn.getAttribute('data-consent'));
        banner.remove();
      });
    });
  }

  // Public API used by the "Cookie preferences" footer link.
  window.AIGconsent = {
    open: () => {
      try { localStorage.removeItem(CONSENT_KEY); } catch {}
      showBanner();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    // Wire the footer "Cookie preferences" link.
    document.querySelectorAll('a[data-consent-open]').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); window.AIGconsent.open(); });
    });

    // Show the banner if the visitor hasn't decided yet.
    if (!readConsent()) showBanner();
  });
})();
