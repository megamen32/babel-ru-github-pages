(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;
  const h = app.themes._helpers;

  /* ═══════════════════════════════════════════════════════════
     THEME 4: FEED — Лента
     ═══════════════════════════════════════════════════════════ */

  const feedTheme = {
    renderHome() {
      /* Show a feed of random pages as posts */
      let posts = '';
      for (let i = 0; i < 6; i++) {
        const rx = Math.floor(Math.random() * 200) - 100;
        const ry = Math.floor(Math.random() * 200) - 100;
        const data = lib.getPageByXY(rx, ry, 1, 1, 1, 1);
        const stats = h.charStats(data.indices);
        const snippet = h.pageSnippet(data.indices, 120);
        const pageUrl = lib.coordsToPageUrl(data.coordinates);
        posts += `
        <article class="feed-post">
          <div class="feed-post-header">
            <span class="feed-avatar">📖</span>
            <div class="feed-author">
              <span class="feed-author-name">Зал X:${rx} Y:${ry}</span>
              <span class="feed-author-sub">Сектор ${data.coordinates.sector} · Том ${data.coordinates.volume}</span>
            </div>
            <span class="feed-density ${stats.label === 'Читаемая' ? 'fd-read' : stats.label === 'Разреженная' ? 'fd-sparse' : 'fd-noise'}">${stats.label}</span>
          </div>
          <div class="feed-post-body">${u.esc(snippet)}</div>
          <div class="feed-post-footer">
            <a class="feed-action" href="${pageUrl}">📖 Читать</a>
            <a class="feed-action" href="#/x/${rx}/y/${ry}">🏛 Зал</a>
          </div>
        </article>`;
      }

      return `
      <section class="t-feed home fade-in">
        <div class="feed-header-sticky">
          <h1 class="feed-logo">Вавилон</h1>
          <div class="feed-header-actions">
            <a class="feed-header-btn" href="#/search">🔍</a>
            <a class="feed-header-btn" href="#/x/0/y/0">🗺</a>
          </div>
        </div>
        <div class="feed-stories">
          <a class="feed-story" href="#/x/0/y/0">
            <div class="feed-story-avatar">🏛</div>
            <span>Зал 0:0</span>
          </a>
          <a class="feed-story" href="#/search">
            <div class="feed-story-avatar">🔍</div>
            <span>Поиск</span>
          </a>
          <a class="feed-story" href="#/page/random">
            <div class="feed-story-avatar">🎲</div>
            <span>Случайная</span>
          </a>
          <a class="feed-story" href="#/about">
            <div class="feed-story-avatar">ℹ️</div>
            <span>Алгоритм</span>
          </a>
        </div>
        <div class="feed-timeline">${posts}</div>
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

      /* All books on current wall as feed posts */
      let posts = '';
      for (let v = 1; v <= Math.min(Number(ALG.volumesPerShelf), 16); v++) {
        const data = lib.getPageByXY(x, y, wall, 1, v, 1);
        const stats = h.charStats(data.indices);
        const snippet = h.pageSnippet(data.indices, 150);
        const pageUrl = lib.coordsToPageUrl(data.coordinates);
        posts += `
        <article class="feed-post">
          <div class="feed-post-header">
            <span class="feed-avatar">📖</span>
            <div class="feed-author">
              <span class="feed-author-name">Том ${v}</span>
              <span class="feed-author-sub">Полка 1 · Стена ${wall}</span>
            </div>
            <span class="feed-density ${stats.label === 'Читаемая' ? 'fd-read' : stats.label === 'Разреженная' ? 'fd-sparse' : 'fd-noise'}">${stats.label}</span>
          </div>
          <div class="feed-post-body">${u.esc(snippet)}</div>
          <div class="feed-post-footer">
            <a class="feed-action" href="${pageUrl}">📖 Читать</a>
            <a class="feed-action" href="#/x/${x}/y/${y}/w/${wall === 6 ? 1 : wall + 1}">➡️ Стена</a>
          </div>
        </article>`;
      }

      const dirs = [
        { label: '↖', dq: 0, dr: -1 },
        { label: '↗', dq: 1, dr: -1 },
        { label: '←', dq: -1, dr: 0 },
        { label: '→', dq: 1, dr: 0 },
        { label: '↙', dq: -1, dr: 1 },
        { label: '↘', dq: 0, dr: 1 },
      ];

      return `
      <section class="t-feed wander fade-in">
        <div class="feed-header-sticky">
          <a class="feed-back" href="#/">←</a>
          <h1 class="feed-logo">Зал X:${x} Y:${y}</h1>
          <button class="feed-header-btn" id="randomHallBtn">🎲</button>
        </div>
        <div class="feed-nav-row">
          ${dirs.map(d => `<button class="feed-nav-btn" data-dq="${d.dq}" data-dr="${d.dr}">${d.label}</button>`).join('')}
        </div>
        <div class="feed-wall-row">
          ${[1,2,3,4,5,6].map(w => `<button class="feed-wall-btn ${wall === w ? 'active' : ''}" data-wall="${w}">С${w}</button>`).join('')}
        </div>
        <div class="feed-timeline">${posts}</div>
      </section>`;
    },

    bindWander(route) {
      const parts = route.parts;
      let x = 0, y = 0;
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
      }
      store.pushJourneyStep(x, y, lib.classifyRegion(x, y).kind);
      u.$$('.feed-nav-btn[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/x/${x + dq}/y/${y + dr}`;
        });
      });
      u.$$('.feed-wall-btn[data-wall]').forEach(btn => {
        btn.addEventListener('click', () => {
          location.hash = `#/x/${x}/y/${y}/w/${btn.dataset.wall}`;
        });
      });
      const rb = u.$('#randomHallBtn');
      if (rb) rb.addEventListener('click', () => {
        const { x: rx, y: ry } = lib.randomHallXY();
        location.hash = `#/x/${rx}/y/${ry}`;
      });
    },

    renderPage(route) { return h.sharedPageRender(route, 't-feed'); },
  };

  app.themes._feed = feedTheme;
})();
