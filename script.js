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

  // === Homepage section highlight (scroll-spy) ===
  // The homepage menu links to sections (#home, #apps, …). The active item is
  // the last section whose top has passed a line ~40% down the visible area,
  // so it follows scrolling in both directions. A section can borrow another
  // item with data-nav-section="id", or light none with data-nav-section="".
  const sectionNav = document.querySelector('.nav-links.nav-sections');
  if (sectionNav) {
    const navItems = new Map();
    sectionNav.querySelectorAll('a[href^="#"]').forEach(link => {
      navItems.set(link.getAttribute('href').slice(1), link);
    });
    const sections = [...document.querySelectorAll('body > section[id]')];
    const navbar = document.querySelector('.navbar');
    let current;
    let lockedUntil = 0;

    const setActive = key => {
      if (key === current) return;
      current = key;
      navItems.forEach((link, id) => {
        const on = id === key;
        link.classList.toggle('active', on);
        if (on) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };

    const sectionInView = () => {
      const navBottom = navbar ? navbar.getBoundingClientRect().bottom : 0;
      const line = navBottom + (window.innerHeight - navBottom) * 0.4;
      let key = 'home';
      sections.forEach(section => {
        if (section.getBoundingClientRect().top <= line) {
          const borrowed = section.dataset.navSection;
          key = borrowed !== undefined ? borrowed : section.id;
        }
      });
      return navItems.has(key) ? key : null;
    };

    let ticking = false;
    const update = () => {
      ticking = false;
      if (Date.now() < lockedUntil) return;
      setActive(sectionInView());
    };
    const requestUpdate = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    // A clicked item lights at once and holds while the smooth scroll passes
    // other sections; scrollend (or the timeout, where unsupported) releases it.
    navItems.forEach((link, id) => {
      link.addEventListener('click', () => {
        setActive(id);
        lockedUntil = Date.now() + 1200;
      });
    });
    window.addEventListener('scrollend', () => { lockedUntil = 0; requestUpdate(); });
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    window.addEventListener('hashchange', requestUpdate);
    window.addEventListener('load', requestUpdate); // after a #section deep link lands
    update();
  }

  // === Search ===
  const apps = [
    { name: 'Sirate Kidase Tutor', desc: 'Interactive tutor for Orthodox Tewahedo Kidase liturgy', url: 'https://kidase.geezword.com', tags: 'learning culture liturgy' },
    { name: 'GeezWord Games', desc: 'Fifteen arcade, puzzle and marble games for learning the Geez alphabet', url: 'https://games.geezword.com', tags: 'game games arcade marble puzzle play alphabet live' },
    { name: 'Daily Fidel Challenge', desc: 'A new Tigrinya fidel puzzle every day, free and without sign-up', url: '/challenge', tags: 'game daily challenge tigrinya alphabet play live' },
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
    '.section-header, .featured, .app-card, .book-card, .category h3, .coming-soon-card, .value-card, .path-card, .teach-card, .community-band'
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
