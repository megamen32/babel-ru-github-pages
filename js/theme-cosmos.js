(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;
  const h = app.themes._helpers;

  /* ═══════════════════════════════════════════════════════════
     THEME 2: COSMOS
     ═══════════════════════════════════════════════════════════ */

  const cosmosTheme = {
    renderHome() {
      return `
      <section class="t-cosmos home fade-in">
        <canvas class="cosmos-canvas" id="cosmosCanvas"></canvas>
        <div class="cosmos-hero">
          <div class="cosmos-emblem">🌌</div>
          <h1 class="cosmos-title">Вавилон</h1>
          <p class="cosmos-subtitle">Звёздный Атлас · Бесконечность</p>
        </div>
        <div class="cosmos-cards">
          <a class="cosmos-card" href="#/wander">
            <span class="cosmos-card-icon">🪐</span>
            <h2>Карта секторов</h2>
            <p>Навигация по звёздным залам библиотеки</p>
          </a>
          <a class="cosmos-card" href="#/search">
            <span class="cosmos-card-icon">🔭</span>
            <h2>Поиск</h2>
            <p>Найди любой текст в бесконечности</p>
          </a>
          <a class="cosmos-card" href="#/atlas">
            <span class="cosmos-card-icon">🗺️</span>
            <h2>Атлас</h2>
            <p>Путешествуй по жанрам</p>
          </a>
          <a class="cosmos-card" href="#/page/random">
            <span class="cosmos-card-icon">🎲</span>
            <h2>Случайная</h2>
            <p>Случайная страница</p>
          </a>
        </div>
        <blockquote class="cosmos-quote">
          Каждая звезда — зал. Каждая планета — книга. Каждое слово — уже здесь.
        </blockquote>
      </section>`;
    },

    bindHome() {
      const canvas = document.getElementById('cosmosCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let stars = [];
      let w, h;

      function resize() {
        w = canvas.width = canvas.clientWidth;
        h = canvas.height = canvas.clientHeight;
        stars = [];
        for (let i = 0; i < 120; i++) {
          stars.push({
            x: Math.random() * w, y: Math.random() * h,
            r: Math.random() * 1.5 + 0.3,
            speed: Math.random() * 0.3 + 0.05,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      resize();
      window.addEventListener('resize', resize);

      let raf;
      function draw() {
        ctx.clearRect(0, 0, w, h);
        const t = Date.now() * 0.001;
        for (const s of stars) {
          const alpha = 0.3 + 0.7 * Math.abs(Math.sin(t * s.speed + s.phase));
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,200,255,${alpha})`;
          ctx.fill();
        }
        raf = requestAnimationFrame(draw);
      }
      draw();
      canvas._cleanup = () => cancelAnimationFrame(raf);
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

      /* Hex map — CSS hexagons */
      const hexDirs = [
        { label: '↖ СЗ', dq: 0, dr: -1 },
        { label: '↗ СВ', dq: 1, dr: -1 },
        { label: '← З',  dq: -1, dr: 0 },
        { label: '→ В',  dq: 1, dr: 0 },
        { label: '↙ ЮЗ', dq: -1, dr: 1 },
        { label: '↘ ЮВ', dq: 0, dr: 1 },
      ];

      const hexCells = hexDirs.map((d, i) => {
        const nx = x + d.dq, ny = y + d.dr;
        const spineText = lib.getBookSpine(nx, ny, 1, 1, 1);
        const preview = u.esc(h.pageSnippet(lib.numberToIndices(lib.coordinatesToNumber(lib.xyToCoordinates(nx, ny, 1, 1, 1, 1))), 30));
        return `<button class="cosmos-hex-cell" data-dq="${d.dq}" data-dr="${d.dr}" title="${d.label}">
          <span class="cosmos-hex-label">${d.label}</span>
          <span class="cosmos-hex-preview">${preview}</span>
        </button>`;
      });

      /* Shelves */
      let shelvesHTML = '';
      for (let s = 1; s <= Number(ALG.shelvesPerWall); s++) {
        let books = '';
        for (let v = 1; v <= Number(ALG.volumesPerShelf); v++) {
          const spineText = lib.getBookSpine(x, y, wall, s, v);
          const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(x, y, wall, s, v, 1));
          books += `<a class="cosmos-book" href="${pageUrl}">Т.${v}</a>`;
        }
        shelvesHTML += `<div class="cosmos-shelf"><span class="cosmos-shelf-num">П.${s}</span>${books}</div>`;
      }

      return `
      <section class="t-cosmos wander fade-in">
        <div class="cosmos-room-header">
          <h1>Звёздный зал</h1>
          <span class="cosmos-coords">⭐ X:${x} Y:${y} · ${lib.classifyRegion(x, y).icon} ${lib.classifyRegion(x, y).label}</span>
        </div>

        <div class="cosmos-hex-map">
          <div class="cosmos-hex-center">⬡<br><small>X:${x} Y:${y}</small></div>
          ${hexCells.join('')}
        </div>

        <div class="cosmos-wall-tabs">
          ${[1,2,3,4,5,6].map(w => `<button class="cosmos-wall-tab ${wall === w ? 'active' : ''}" data-wall="${w}">С${w}</button>`).join('')}
        </div>

        <div class="cosmos-shelves">${shelvesHTML}</div>

        <div class="cosmos-actions">
          <button class="cosmos-btn" id="randomHallBtn">🎲 Случайный зал</button>
          <a class="cosmos-btn-outline" href="#/search">🔭 Искать</a>
          <a class="cosmos-btn-outline" href="#/atlas">🗺️ Атлас</a>
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
      u.$$('.cosmos-hex-cell[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/wander/x/${x + dq}/y/${y + dr}`;
        });
      });
      u.$$('.cosmos-wall-tab[data-wall]').forEach(btn => {
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

    renderPage(route) { return h.sharedPageRender(route, 't-cosmos'); },
  };

  app.themes._cosmos = cosmosTheme;
})();
