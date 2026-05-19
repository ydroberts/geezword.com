// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      toggle.textContent = navLinks.classList.contains('open') ? '\u2715' : '\u2630';
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        toggle.textContent = '\u2630';
      });
    });
  }

  // Set active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // === Search ===
  const apps = [
    { name: 'Geez Fidel Marble Games', desc: 'Learn the Geez alphabet through a marble matching game', url: 'https://marbles.geezword.com', tags: 'game alphabet play' },
    { name: 'Sirate Kidase Tutor', desc: 'Interactive tutor for Orthodox Tewahedo Kidase liturgy', url: 'https://kidase.geezword.com', tags: 'learning culture liturgy' },
    { name: 'Geez Fidel Arcade', desc: 'Fifteen arcade and puzzle games for learning the Geez alphabet', url: 'https://arcade.geezword.com', tags: 'game arcade play alphabet live' },
    { name: 'Geez Cycling', desc: 'Cycling game with Geez character challenges', url: 'apps.html', tags: 'game play cycling' },
    { name: 'Geez Car Racing', desc: 'Racing game while learning Geez consonants', url: 'https://racing.geezword.com', tags: 'game racing play live' },
    { name: 'Amharic Alphabet Reading', desc: 'Learn to read the Amharic alphabet with audio', url: 'apps.html', tags: 'learning reading amharic' },
    { name: 'Tigrinya Alphabet Reading', desc: 'Learn to read the Tigrinya alphabet with audio', url: 'apps.html', tags: 'learning reading tigrinya' },
    { name: 'Geez Alphabet Tracing', desc: 'Practice writing Geez characters with interactive tracing', url: 'https://tracing.geezword.com', tags: 'learning writing tracing live' },
    { name: 'GeezWord AI', desc: 'AI-powered alphabet lessons with audio pronunciation', url: 'apps.html', tags: 'ai learning audio' },
    { name: 'GeezType to Unicode', desc: 'Convert GeezType text to Unicode with DOCX export', url: 'apps.html', tags: 'tool converter unicode' },
    { name: 'GeezmezGeb', desc: 'Geez text utility for working with Geez script', url: 'apps.html', tags: 'tool utility' },
    { name: 'Geez Lissan', desc: 'Language learning for Amharic, Tigrinya, English, and Arabic', url: 'https://lissan.geezword.com', tags: 'learning languages live' },
    { name: 'Amharic Learning Portal', desc: 'Unified portal combining multiple Amharic learning apps', url: 'playground.html', tags: 'learning portal amharic alpha' },
    { name: 'GeezWord AI Chat', desc: 'AI chatbot for conversational Geez language practice', url: 'playground.html', tags: 'ai chat alpha' },
  ];

  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  if (searchInput && searchResults) {
    function renderApps(list) {
      if (list.length === 0) {
        searchResults.innerHTML = '<div class="search-no-results">No apps found</div>';
      } else {
        searchResults.innerHTML = list.map(app =>
          `<a href="${app.url}" class="search-result-item">
            <h4>${app.name}</h4>
            <p>${app.desc}</p>
          </a>`
        ).join('');
      }
      searchResults.classList.add('open');
    }

    // Show all apps on focus
    searchInput.addEventListener('focus', () => {
      const query = searchInput.value.toLowerCase().trim();
      if (!query) {
        renderApps(apps);
      }
    });

    // Filter as you type
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();

      if (!query) {
        renderApps(apps);
        return;
      }

      const matches = apps.filter(app =>
        app.name.toLowerCase().includes(query) ||
        app.desc.toLowerCase().includes(query) ||
        app.tags.includes(query)
      );

      renderApps(matches);
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav-search')) {
        searchResults.classList.remove('open');
      }
    });
  }

  // === Scroll-reveal — fade sections and cards up as they enter the viewport ===
  const revealTargets = document.querySelectorAll(
    '.section-header, .featured, .app-card, .book-card, .category h3, .coming-soon-card, .value-card'
  );
  if (revealTargets.length && 'IntersectionObserver' in window) {
    revealTargets.forEach(el => el.classList.add('reveal'));
    const revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealTargets.forEach(el => revealObserver.observe(el));
  }
});
