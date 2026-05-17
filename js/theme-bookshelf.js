(() => {
  'use strict';
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
          <a class="bk-card" href="#/wander">
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
          <a class="bk-card" href="#/page/random">
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
      let x = 0, y = 0, wall = 1;
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'wall') wall = parseInt(parts[i + 1]) || 1;
      }
      const hallInfo = lib.xyToHallXY(x, y);

      /* Shelves with book spines */
      let shelvesHTML = '';
      for (let s = 1; s <= Number(ALG.shelvesPerWall); s++) {
        let spines = '';
        for (let v = 1; v <= Number(ALG.volumesPerShelf); v++) {
          const spineText = lib.getBookSpine(x, y, wall, s, v);
          const cls = lib.classifySpine(spineText);
          const display = u.esc(spineText || 'пусто');
          const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(x, y, wall, s, v, 1));
          spines += `<a class="bk-spine ${cls === 'text' ? 'bk-has-text' : cls === 'noise' ? 'bk-noise' : ''}" href="${pageUrl}" title="Том ${v}">${display}</a>`;
        }
        shelvesHTML += `
        <div class="bk-shelf">
          <div class="bk-shelf-label">Полка ${s}</div>
          <div class="bk-shelf-books">${spines}</div>
          <div class="bk-shelf-wood"></div>
        </div>`;
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
          <span class="bk-coords">X: ${x} · Y: ${y} · ${lib.classifyRegion(x, y).icon} ${lib.classifyRegion(x, y).label}</span>
        </div>

        <div class="bk-nav">${navHTML}</div>

        <div class="bk-wall-tabs">
          ${[1,2,3,4,5,6].map(w => `<button class="bk-wall-tab ${wall === w ? 'active' : ''}" data-wall="${w}">С${w}</button>`).join('')}
        </div>

        <div class="bk-shelves">${shelvesHTML}</div>

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
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
      }
      /* Track visit on wander map */
      store.pushWanderVisit(x, y);
      store.pushJourneyStep(x, y, lib.classifyRegion(x, y).kind);
      u.$$('.bk-nav-btn[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/wander/x/${x + dq}/y/${y + dr}`;
        });
      });
      u.$$('.bk-wall-tab[data-wall]').forEach(btn => {
        btn.addEventListener('click', () => {
          location.hash = `#/wander/x/${x}/y/${y}/wall/${btn.dataset.wall}`;
        });
      });
      const rb = u.$('#randomHallBtn');
      if (rb) rb.addEventListener('click', () => {
        const { x: rx, y: ry } = lib.randomHallXY();
        location.hash = `#/wander/x/${rx}/y/${ry}`;
      });
    },

    renderPage(route) { return h.sharedPageRender(route, 't-bookshelf'); },
  };

  app.themes._bookshelf = bookshelfTheme;
})();
