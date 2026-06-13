// AI Glimpse, site JS
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
  document.querySelectorAll('.newsletter-form').forEach(newsletterForm => {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = newsletterForm.querySelector('input[type="email"]');
      const btn = newsletterForm.querySelector('button[type="submit"]');
      const note = newsletterForm.querySelector('.newsletter-note');
      const email = input?.value.trim();
      if (!email || !input || !btn) return;

      const defaultLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Subscribing...';

      try {
        const res = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Subscribe failed');

        btn.textContent = 'Check your inbox';
        if (note) note.textContent = 'We sent a confirmation link. Click it to start AI Glimpse Daily.';
        input.value = '';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = defaultLabel;
          if (note) note.textContent = 'Free forever. Unsubscribe in one click. We never sell your data.';
        }, 8000);
      } catch (err) {
        btn.textContent = 'Try again';
        btn.disabled = false;
        if (note) note.textContent = err.message || 'Something went wrong. Please try again.';
      }
    });
  });

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
