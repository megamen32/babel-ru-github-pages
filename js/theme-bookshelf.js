(() => {
  'use strict';
  try {
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;
  const h = app.themes._helpers;

  /* ═══════════════════════════════════════════════════════════
     THEME 1: BOOKSHELF
     ═══════════════════════════════════════════════════════════ */

  const bookshelfTheme = {
    renderHome() {
      return `
      <section class="t-bookshelf home fade-in">
        <div class="bk-hero">
          <div class="bk-emblem">📖</div>
          <h1 class="bk-title">Вавилон</h1>
          <p class="bk-subtitle">Гексагональная Бесконечность</p>
        </div>
        <div class="bk-cards">
          <a class="bk-card" href="#/x/0/y/0">
            <span class="bk-card-icon">🏛</span>
            <h2>Залы</h2>
            <p>Блуждай по бесконечным шестигранным залам</p>
          </a>
          <a class="bk-card" href="#/search">
            <span class="bk-card-icon">🔍</span>
            <h2>Каталог</h2>
            <p>Найди любой текст во вселенной</p>
          </a>
          <a class="bk-card" href="#/atlas">
            <span class="bk-card-icon">🗺️</span>
            <h2>Атлас</h2>
            <p>Путешествуй по жанрам библиотеки</p>
          </a>
          <a class="bk-card" href="#/random">
            <span class="bk-card-icon">🎲</span>
            <h2>Случайная</h2>
            <p>Открой случайную страницу</p>
          </a>
        </div>
        <blockquote class="bk-quote">
          Всё что когда-либо было или будет написано уже хранится здесь.
          Здесь — <em>дневник твоей смерти</em>, все твои мысли,
          изобретения, и даже <em>рецепт борща мамы</em>.
        </blockquote>
      </section>`;
    },

    renderWander(route) {
      const parts = route.parts;
      let x = 0, y = 0;
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parts[i + 1];
        if (parts[i] === 'y') y = parts[i + 1];
      }
      const nx = Number(x) || 0, ny = Number(y) || 0;
      const hallInfo = lib.xyToHallXY(x, y);

      /* Book spines — show 10 volumes on the shelf (z=1..10) */
      let spinesHTML = '';
      for (let z = 1; z <= 10; z++) {
        const spineText = lib.getBookSpine(x, y, z);
        const cls = lib.classifySpine(spineText);
        const display = u.esc(spineText || 'пусто');
        const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(x, y, z));
        spinesHTML += `<a class="bk-spine ${cls === 'text' ? 'bk-has-text' : cls === 'noise' ? 'bk-noise' : ''}" href="${pageUrl}" title="Z:${z}">${display}</a>`;
      }

      /* Direction buttons */
      const dirs = [
        { key: 'nw', label: '↖ СЗ', dq: 0, dr: -1 },
        { key: 'ne', label: 'СВ ↗', dq: 1, dr: -1 },
        { key: 'w',  label: '← З',  dq: -1, dr: 0 },
        { key: 'e',  label: 'В →',  dq: 1, dr: 0 },
        { key: 'sw', label: '↙ ЮЗ', dq: -1, dr: 1 },
        { key: 'se', label: 'ЮВ ↘', dq: 0, dr: 1 },
      ];
      const navHTML = dirs.map(d =>
        `<button class="bk-nav-btn" data-dq="${d.dq}" data-dr="${d.dr}">${d.label}</button>`
      ).join('');

      return `
      <section class="t-bookshelf wander fade-in">
        <div class="bk-room-header">
          <h1>Шестигранный зал</h1>
          <span class="bk-coords">X: ${nx} · Y: ${ny} · ${lib.classifyRegion(nx, ny).icon} ${lib.classifyRegion(nx, ny).label}</span>
        </div>

        <div class="bk-nav">${navHTML}</div>

        <div class="bk-shelves">
          <div class="bk-shelf">
            <div class="bk-shelf-label">Книги</div>
            <div class="bk-shelf-books">${spinesHTML}</div>
            <div class="bk-shelf-wood"></div>
          </div>
        </div>

        <div class="bk-actions">
          <button class="bk-btn" id="randomHallBtn">🎲 Случайный зал</button>
          <a class="bk-btn-outline" href="#/search">🔍 Искать текст</a>
          <a class="bk-btn-outline" href="#/atlas">🗺️ Атлас</a>
        </div>
      </section>`;
    },

    bindWander(route) {
      const parts = route.parts;
      let x = 0, y = 0;
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parts[i + 1];
        if (parts[i] === 'y') y = parts[i + 1];
      }
      const nx = Number(x) || 0, ny = Number(y) || 0;
      /* Track visit on wander map */
      store.pushWanderVisit(nx, ny);
      store.pushJourneyStep(nx, ny, lib.classifyRegion(nx, ny).kind);
      u.$$('.bk-nav-btn[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/x/${nx + dq}/y/${ny + dr}`;
        });
      });
      const rb = u.$('#randomHallBtn');
      if (rb) rb.addEventListener('click', () => {
        const { x: rx, y: ry } = lib.randomHallXY();
        location.hash = `#/x/${rx}/y/${ry}`;
      });
    },

    renderPage(route) { return h.sharedPageRender(route, 't-bookshelf'); },
  };

  app.themes._bookshelf = bookshelfTheme;
  } catch(e) { console.error('[babel] theme-bookshelf.js failed:', e); app.themes = app.themes || {}; app.themes._bookshelf = null; }
})();
