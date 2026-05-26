// Reusable site chrome (header + footer + mobile menu)
// Used on every page for DRY consistency.

(function() {
  const SITE_NAME = 'AI Glimpse';
  const DOMAIN = 'aiglimpse.ai';

  // W1 wordmark: "A" + dotless i + " Glimpse", with an orange iris dot above the dotless i.
  // Rendered as semantic HTML so it scales with type and ships an accessible label.
  const WORDMARK = `<span class="logo-wordmark" aria-label="AI Glimpse">A<span class="iris-i" aria-hidden="true">\u0131</span><span aria-hidden="true"> Glimpse</span></span>`;

  const NAV_LINKS = [
    { href: '/categories/llms.html', label: 'LLMs' },
    { href: '/categories/research.html', label: 'Research' },
    { href: '/categories/tools.html', label: 'Tools' },
    { href: '/categories/business.html', label: 'Business' },
    { href: '/categories/ethics.html', label: 'Ethics' },
    { href: '/categories/industry.html', label: 'Industry' },
    { href: '/categories/robotics.html', label: 'Robotics' }
  ];

  function currentPath() {
    const p = window.location.pathname;
    return p === '/' || p === '/index.html' ? '/' : p;
  }

  function buildNav() {
    const path = currentPath();
    return NAV_LINKS.map(l =>
      `<a href="${l.href}"${path.startsWith(l.href.replace('.html','')) || path === l.href ? ' class="active"' : ''}>${l.label}</a>`
    ).join('');
  }

  function buildHeader() {
    return `
      <header class="site-header" role="banner">
        <div class="container">
          <div class="header-bar">
            <a href="/" class="logo" aria-label="${SITE_NAME} home">
              ${WORDMARK}
            </a>
            <nav class="nav-primary" aria-label="Primary">
              ${buildNav()}
            </nav>
            <div class="header-actions">
              <button class="search-btn" aria-label="Search">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>
                </svg>
              </button>
              <a href="#newsletter" class="btn btn--primary btn--sm">Subscribe</a>
              <button class="menu-btn" aria-label="Open menu">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>
      <aside class="mobile-menu" aria-label="Mobile menu">
        <div class="mobile-menu-header">
          <a href="/" class="logo">
            ${WORDMARK}
          </a>
          <button class="mobile-menu-close" aria-label="Close menu" style="font-size:24px;">×</button>
        </div>
        ${NAV_LINKS.map(l => `<a href="${l.href}">${l.label}</a>`).join('')}
        <a href="/pages/about.html">About</a>
        <a href="#newsletter">Subscribe</a>
      </aside>
    `;
  }

  function buildFooter() {
    return `
      <footer class="site-footer" role="contentinfo">
        <div class="container">
          <div class="footer-top">
            <div class="footer-brand">
              <a href="/" class="logo">
                ${WORDMARK}
              </a>
              <p>Your daily glimpse into AI. Independent reporting and analysis on the people, products, and policies shaping artificial intelligence.</p>
            </div>
            <div class="footer-col">
              <h5>Categories</h5>
              <ul>
                ${NAV_LINKS.map(l => `<li><a href="${l.href}">${l.label}</a></li>`).join('')}
              </ul>
            </div>
            <div class="footer-col">
              <h5>About</h5>
              <ul>
                <li><a href="/pages/about.html">About AI Glimpse</a></li>
                <li><a href="/pages/contact.html">Contact</a></li>
                <li><a href="/pages/editorial.html">Editorial Standards</a></li>
                <li><a href="/pages/advertise.html">Advertise</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h5>Legal</h5>
              <ul>
                <li><a href="/pages/privacy.html">Privacy Policy</a></li>
                <li><a href="/pages/terms.html">Terms of Service</a></li>
                <li><a href="#" data-consent-open>Cookie preferences</a></li>
                <li><a href="/rss.xml">RSS Feed</a></li>
                <li><a href="/sitemap.xml">Sitemap</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <div>© <span id="year"></span> AI Glimpse · ${DOMAIN}</div>
            <div class="footer-social">
              <a href="#" aria-label="X (Twitter)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
              <a href="#" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
              <a href="/rss.xml" aria-label="RSS"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.503 20.752c0 1.794-1.456 3.248-3.251 3.248-1.796 0-3.252-1.454-3.252-3.248 0-1.794 1.456-3.248 3.252-3.248 1.795 0 3.251 1.454 3.251 3.248zm-6.503-12.572v4.811c6.05.062 10.96 4.966 11.022 11.009h4.817c-.062-8.71-7.118-15.758-15.839-15.82zm0-3.368c10.58.046 19.152 8.594 19.183 19.188h4.817c-.03-13.231-10.755-23.954-24-24v4.812z"/></svg></a>
            </div>
          </div>
        </div>
      </footer>
    `;
  }

  // ─── Cookie consent (Google Consent Mode v2) ─────────────────────────
  // Pairs with the inline gtag('consent','default') snippet in the page
  // <head>. That snippet sets all ad and analytics storage to "denied" by
  // default and restores a saved "granted" choice from localStorage so the
  // banner does not flash for returning visitors.
  //
  // This block renders the banner UI on first visit (or after a saved
  // decision becomes stale, default 12 months) and exposes
  // window.AIGconsent.open() so the footer "Cookie preferences" link can
  // reopen it later.
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
            We use cookies to deliver relevant ads via Google AdSense and to understand how readers use AI Glimpse.
            You can accept all, reject non-essential cookies, or read our
            <a href="/pages/privacy.html">Privacy Policy</a>.
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

  // Inject header/footer/banner on load.
  document.addEventListener('DOMContentLoaded', () => {
    const headerSlot = document.getElementById('site-header-slot');
    const footerSlot = document.getElementById('site-footer-slot');
    if (headerSlot) headerSlot.outerHTML = buildHeader();
    if (footerSlot) footerSlot.outerHTML = buildFooter();
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Wire the footer "Cookie preferences" link added in buildFooter().
    document.querySelectorAll('a[data-consent-open]').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); window.AIGconsent.open(); });
    });

    // Show the banner if the visitor hasn't decided yet.
    if (!readConsent()) showBanner();
  });
})();
