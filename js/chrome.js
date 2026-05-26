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

  // Inject on load
  document.addEventListener('DOMContentLoaded', () => {
    const headerSlot = document.getElementById('site-header-slot');
    const footerSlot = document.getElementById('site-footer-slot');
    if (headerSlot) headerSlot.outerHTML = buildHeader();
    if (footerSlot) footerSlot.outerHTML = buildFooter();
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  });
})();
