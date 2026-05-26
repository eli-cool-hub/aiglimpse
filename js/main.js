// AI Glimpse — site JS
(function() {
  'use strict';

  // ----- Mobile menu -----
  const menuBtn = document.querySelector('.menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');
  const closeBtn = document.querySelector('.mobile-menu-close');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => mobileMenu.classList.add('is-open'));
  }
  if (closeBtn && mobileMenu) {
    closeBtn.addEventListener('click', () => mobileMenu.classList.remove('is-open'));
  }

  // ----- Relative time formatter -----
  function formatRelative(iso) {
    const now = new Date();
    const then = new Date(iso);
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  document.querySelectorAll('time[datetime]').forEach(el => {
    const iso = el.getAttribute('datetime');
    if (iso && el.dataset.relative !== 'false') {
      el.textContent = formatRelative(iso);
    }
  });

  // ----- Newsletter form -----
  const newsletterForm = document.querySelector('.newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input[type="email"]');
      const btn = newsletterForm.querySelector('button[type="submit"]');
      const email = input.value.trim();
      if (!email) return;

      btn.disabled = true;
      btn.textContent = 'Subscribing...';

      // Replace with your real endpoint (Beehiiv, ConvertKit, Mailchimp, etc.)
      try {
        // Example placeholder — wire up your provider here
        await new Promise(r => setTimeout(r, 600));
        btn.textContent = '✓ Subscribed!';
        input.value = '';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Subscribe';
        }, 2500);
      } catch (err) {
        btn.textContent = 'Try again';
        btn.disabled = false;
      }
    });
  }

  // ----- Reading progress (article pages) -----
  const progressBar = document.querySelector('.reading-progress');
  if (progressBar) {
    const articleBody = document.querySelector('.article-body');
    if (articleBody) {
      window.addEventListener('scroll', () => {
        const rect = articleBody.getBoundingClientRect();
        const total = articleBody.offsetHeight - window.innerHeight;
        const scrolled = Math.max(0, -rect.top);
        const pct = Math.min(100, (scrolled / total) * 100);
        progressBar.style.width = pct + '%';
      }, { passive: true });
    }
  }

  // ----- Search modal (basic) -----
  const searchBtn = document.querySelector('.search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const q = prompt('Search AI Glimpse:');
      if (q) window.location.href = `/search.html?q=${encodeURIComponent(q)}`;
    });
  }
})();
