// Mobile nav toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (toggle && navLinks) {
    // Expose the open/closed state to assistive technology.
    if (!navLinks.id) navLinks.id = 'primary-menu';
    toggle.setAttribute('aria-controls', navLinks.id);
    const navEl = navLinks.closest('nav');
    if (navEl && !navEl.hasAttribute('aria-label')) navEl.setAttribute('aria-label', 'Primary');

    const setOpen = open => {
      navLinks.classList.toggle('open', open);
      toggle.textContent = open ? '\u2715' : '\u2630';
      toggle.setAttribute('aria-expanded', String(open));
    };
    setOpen(false);

    toggle.addEventListener('click', () => {
      setOpen(!navLinks.classList.contains('open'));
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => setOpen(false));
    });

    // Escape closes the open mobile menu and returns focus to its button.
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Set active nav link — unless the page marks its own (aria-current="page"),
  // e.g. /start, where Start and Community share the same href.
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (!document.querySelector('.nav-links a[aria-current="page"]')) {
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPage || (currentPage === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }

  // A menu item can point at a section of the current page (Keyboard →
  // downloads.html#keyboards on /downloads). Light that item when the address
  // names its section, and the page's own item (Downloads) otherwise.
  const pageItem = document.querySelector('.nav-links a[aria-current="page"]');
  if (pageItem) {
    const pageHref = pageItem.getAttribute('href');
    const hashItems = [...document.querySelectorAll('.nav-links a')]
      .filter(a => a.getAttribute('href').startsWith(pageHref + '#'));
    if (hashItems.length) {
      const syncHashItem = () => {
        const hit = hashItems.find(a => a.getAttribute('href').slice(pageHref.length) === window.location.hash);
        const on = hit || pageItem;
        [pageItem, ...hashItems].forEach(a => {
          a.classList.toggle('active', a === on);
          if (a === on) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        });
      };
      syncHashItem();
      window.addEventListener('hashchange', syncHashItem);
    }
  }

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

    // Show all apps on focus (but not when Escape just returned focus here)
    let keepClosedOnFocus = false;
    searchInput.addEventListener('focus', () => {
      if (keepClosedOnFocus) { keepClosedOnFocus = false; return; }
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

    // Close when keyboard focus leaves the search box and its results, so
    // the panel doesn't cover the page while someone tabs on.
    const searchBox = searchInput.closest('.nav-search') || searchInput.parentElement;
    searchBox.addEventListener('focusout', (e) => {
      if (!e.relatedTarget || !searchBox.contains(e.relatedTarget)) {
        searchResults.classList.remove('open');
      }
    });

    // Escape closes the results and keeps focus in the search box.
    searchBox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchResults.classList.contains('open')) {
        searchResults.classList.remove('open');
        if (document.activeElement !== searchInput) {
          keepClosedOnFocus = true;
          searchInput.focus();
        }
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

// === Re-align a #section link after the page settles ===
// When a page opens at a #section, the browser jumps there before web fonts
// and images finish loading; that late layout shift can leave the section
// under the sticky navigation. Once loading is done, scroll the target into
// place again (its CSS scroll-margin-top clears the navigation) — unless the
// visitor has already started scrolling or interacting.
(() => {
  if (window.location.hash.length < 2) return;
  let visitorMoved = false;
  const moved = () => { visitorMoved = true; };
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(type =>
    window.addEventListener(type, moved, { once: true, passive: true }));
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const loaded = new Promise(resolve => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  Promise.all([fontsReady, loaded]).then(() => {
    if (visitorMoved) return;
    let target = null;
    try { target = document.getElementById(decodeURIComponent(window.location.hash.slice(1))); } catch (e) { /* bad hash */ }
    if (!target) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });

    // A font swap can resize content above the target while that scroll runs
    // and leave it a little off. Snap it into place (no animation) if so:
    // once the scroll has finished, and on layout changes for one more second.
    const snap = () => {
      if (visitorMoved) return;
      const want = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const top = target.getBoundingClientRect().top;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
      if (Math.abs(top - want) > 2 && !(atBottom && top > want)) {
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    };
    if ('onscrollend' in window) window.addEventListener('scrollend', snap, { once: true });
    setTimeout(snap, 1200);
    if (typeof ResizeObserver !== 'function') return;
    let first = true; // observe() reports the current size once; that is not a change
    const realign = new ResizeObserver(() => {
      if (first) { first = false; return; }
      snap();
    });
    realign.observe(document.body);
    setTimeout(() => realign.disconnect(), 1000);
  });
})();
