(() => {
  'use strict';
  try {
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;
  const h = app.themes._helpers;

  if (!h) throw new Error('theme-helpers._helpers is null — theme-helpers.js may have failed');

  /* Collect theme objects registered by earlier files */
  const bookshelfTheme = app.themes._bookshelf;
  const cosmosTheme = app.themes._cosmos;
  const messengerTheme = app.themes._messenger;
  const feedTheme = app.themes._feed;
  const terminalTheme = app.themes._terminal;

  /* ═══════════════════════════════════════════════════════════
     SHARED PAGE RENDER (for themes that don't override)
     ═══════════════════════════════════════════════════════════ */

  function sharedPageRender(route, themeClass) {
    if (!route.pageNumber) return `<div class="${themeClass}"><div class="notice">Страница не указана</div></div>`;

    let number;
    try { number = route.pageNumber; } catch {
      return `<div class="${themeClass}"><div class="notice">Неверный адрес страницы</div></div>`;
    }

    /* Используем токенный декодер для генерации страницы */
    const coords = lib.numberToCoordinates(number);
    const xy = lib.coordinatesToXY(coords);
    const z = typeof coords.z === 'bigint' ? coords.z : BigInt(coords.z || 1);
    const pageData = lib.getPageByXY(xy.x, xy.y, z);
    const text = pageData.text;
    const indices = pageData.indices;
    const highlight = lib.parseHighlight(route.params);

    /* Рендерим текст — конвертируем в HTML */
    let pageTextHTML = '';
    if (highlight) {
      /* С подсветкой */
      const before = u.esc(text.slice(0, highlight.start));
      const marked = u.esc(text.slice(highlight.start, highlight.start + highlight.length));
      const after = u.esc(text.slice(highlight.start + highlight.length));
      pageTextHTML = before + '<mark>' + marked + '</mark>' + after;
    } else {
      pageTextHTML = u.esc(text);
    }
    /* Newlines → <br> */
    pageTextHTML = pageTextHTML.replace(/\n/g, '<br>');

    const stats = h.textToCharStats(text);
    const b36 = lib.prettyBase36(number);
    const temp = lib.computeTemperature(z);
    const tempLabel = temp < 0.15 ? 'Язык' : temp < 0.35 ? 'Разговор' : temp < 0.55 ? 'Смешанный' : temp < 0.75 ? 'Шум' : 'Хаос';
    const tempPercent = Math.round((1 - temp) * 100);

    /* Temperature gauge color: green → yellow → red */
    const tempColor = temp < 0.25 ? 'var(--green)' : temp < 0.5 ? 'var(--yellow)' : 'var(--pink)';

    /* Reading stats */
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const readingTime = Math.max(1, Math.round(wordCount / 200));

    /* Temperature gauge HTML */
    const tempGaugeHTML = `
      <div class="temp-gauge">
        <div class="temp-gauge-bar">
          <div class="temp-gauge-fill" style="width:${tempPercent}%;background:${tempColor}"></div>
        </div>
        <span class="temp-gauge-label" style="color:${tempColor}">${tempLabel} ${tempPercent}%</span>
      </div>`;

    /* Reading stats HTML */
    const readingStatsHTML = `
      <div class="page-reading-stats">
        <span class="reading-stat"><span class="reading-stat-icon">📝</span> <span class="reading-stat-value">${wordCount}</span> слов</span>
        <span class="reading-stat"><span class="reading-stat-icon">⏱</span> <span class="reading-stat-value">${readingTime}</span> мин</span>
        <span class="reading-stat"><span class="reading-stat-icon">🌡</span> T = ${temp.toFixed(2)}</span>
      </div>`;

    /* Навигация по Z */
    const prevZ = z > 1n ? z - 1n : null;
    const nextZ = z + 1n;
    const prevUrl = prevZ ? lib.coordsToPageUrl({...coords, z: prevZ}) : null;
    const nextUrl = lib.coordsToPageUrl({...coords, z: nextZ});

    try { store.pushHistory({ url: location.hash, title: lib.pageTitle(coords) }); } catch {}

    /* Fingerprint */
    const fingerprintColors = [];
    for (let i = 0; i < 64; i++) {
      const idx = i < indices.length ? indices[i] : 0;
      const h2 = (idx * 29 + i * 7) % 360;
      const s = 50 + (idx % 40);
      const l = 30 + (idx % 30);
      fingerprintColors.push(`hsl(${h2},${s}%,${l}%)`);
    }
    const fpHTML = fingerprintColors.map(c => `<span class="fp-cell" style="background:${c}"></span>`).join('');

    return `
    <section class="${themeClass} page-view fade-in">
      <div class="page-breadcrumbs">
        <a href="#/">Вавилон</a><span class="sep">›</span>
        <a href="#/x/${h.fmtXY(xy.x)}/y/${h.fmtXY(xy.y)}">Зал X:${h.fmtXY(xy.x)} Y:${h.fmtXY(xy.y)}</a><span class="sep">›</span>
        <span>Страница Z:${z}</span>
      </div>

      <div class="page-header">
        <div>
          <h2>Страница Z:${z}</h2>
          <span class="page-header-sub">Зал X:${h.fmtXY(xy.x)} Y:${h.fmtXY(xy.y)}</span>
        </div>
        <div class="page-density">
          <span class="density-badge density-${stats.label === 'Читаемая' ? 'readable' : stats.label === 'Разреженная' ? 'sparse' : 'noise'}">${tempLabel}</span>
        </div>
      </div>

      ${tempGaugeHTML}
      ${readingStatsHTML}

      <div class="page-nav">
        ${prevUrl ? `<a class="btn-outline" href="${prevUrl}">← Z:${prevZ}</a>` : '<span></span>'}
        <span class="page-num">Z:${z} · ${tempLabel} <span class="kbd-hint">← →</span></span>
        ${nextUrl ? `<a class="btn-outline" href="${nextUrl}">Z:${nextZ} →</a>` : '<span></span>'}
      </div>

      <div class="page-fingerprint">${fpHTML}</div>

      <div class="page-text-box">
        <div class="page-text">${pageTextHTML}</div>
      </div>

      <div class="page-stats">
        <div class="stat-row"><span class="stat-label">Буквы</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round(stats.letters/stats.total*100)}%;background:var(--accent);"></div></div><span class="stat-value">${stats.letters}</span></div>
        <div class="stat-row"><span class="stat-label">Пробелы</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round(stats.spaces/stats.total*100)}%;background:var(--accent2);"></div></div><span class="stat-value">${stats.spaces}</span></div>
        <div class="stat-row"><span class="stat-label">Знаки</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round((stats.punctuation+stats.emoji)/stats.total*100)}%;background:var(--accent);"></div></div><span class="stat-value">${stats.punctuation + stats.emoji}</span></div>
      </div>

      <div class="page-actions">
        <button class="btn-neon" id="favBtn">★ В избранное</button>
        <button class="btn-outline" id="copyTextBtn">Копировать</button>
        <button class="btn-outline" id="copyLinkBtn">Ссылка</button>
      </div>

      <div class="page-explore-bar" id="pageExploreBar">
        <button class="explore-back-btn" id="exploreBackBtn" style="display:none">← Назад</button>
        <button class="explore-next-btn" id="exploreNextBtn">🔍 Следующая обитаемая</button>
      </div>
      <div class="page-distance-map" id="pageDistanceMap">
        <canvas class="page-distance-canvas" id="pageDistanceCanvas" width="600" height="140"></canvas>
      </div>
    </section>`;
  }

  function bindSharedPage(route) {
    if (!route.pageNumber) return;
    let number;
    try { number = route.pageNumber; } catch { return; }
    const coords = lib.numberToCoordinates(number);

    /* Track journey step for this page view — use x,y from URL if available */
    try {
      let jx, jy;
      if (route.pageXY && route.pageXY.x != null) {
        jx = route.pageXY.x;
        jy = route.pageXY.y;
      } else {
        const pageXY = lib.coordinatesToXY(coords);
        jx = pageXY.x;
        jy = pageXY.y;
      }
      store.pushJourneyStep(jx, jy, lib.classifyRegion(h.safeNum(jx), h.safeNum(jy)).kind);
    } catch {}

    const favBtn = u.$('#favBtn');
    if (favBtn) favBtn.addEventListener('click', () => {
      store.addFavorite({ url: location.hash, title: lib.pageTitle(coords) });
      favBtn.textContent = '★ Сохранено';
      favBtn.disabled = true;
    });
    const copyBtn = u.$('#copyTextBtn');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const coords2 = lib.numberToCoordinates(number);
      const xy2 = lib.coordinatesToXY(coords2);
      const z2 = typeof coords2.z === 'bigint' ? coords2.z : BigInt(coords2.z || 1);
      const pageData = lib.getPageByXY(xy2.x, xy2.y, z2);
      u.copyText(pageData.text, 'Текст скопирован');
    });
    const linkBtn = u.$('#copyLinkBtn');
    if (linkBtn) linkBtn.addEventListener('click', () => {
      u.copyText(location.href, 'Ссылка скопирована');
    });

    /* ---- Explore navigation ---- */
    const backBtn = u.$('#exploreBackBtn');
    const nextBtn = u.$('#exploreNextBtn');

    /* Back button: show if there's navigation history */
    if (backBtn) {
      try {
        const history = store.readStore('babelHistory');
        if (history.length >= 2) {
          backBtn.style.display = '';
          backBtn.addEventListener('click', () => {
            const history2 = store.readStore('babelHistory');
            /* Удаляем текущую запись и переходим к предыдущей */
            if (history2.length >= 2) {
              history2.shift(); // убрать текущую (самую новую)
              store.writeStore('babelHistory', history2, 100);
              const prev = history2[0];
              if (prev && prev.url) {
                location.hash = prev.url;
              }
            }
          });
        }
      } catch {}
    }

    /* Next Inhabited button: odometer animation + chunked scan */
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextBtn.disabled = true;
        nextBtn.textContent = '⏳ сканирую…';

        /* Collect text nodes from page text for odometer */
        const pageTextEl = u.$('.page-text');
        const textNodes = [];
        if (pageTextEl) {
          const walker = document.createTreeWalker(pageTextEl, NodeFilter.SHOW_TEXT, null);
          let n;
          while (n = walker.nextNode()) textNodes.push(n);
        }

        /* Start odometer animation (runs until scan completes) */
        const anim = textNodes.length > 0
          ? h.startOdometerAnimation(textNodes, ALG.alphabet)
          : null;

        /* Start chunked scan — yields to UI between chunks */
        h.findNextInhabitedChunked(coords).then(dest => {
          if (anim) anim.cancel();
          if (!dest) { nextBtn.disabled = false; nextBtn.textContent = '🔍 Следующая обитаемая'; return; }
          const destUrl = dest.range
            ? lib.coordsToPageUrl(dest.coordinates, { hl: `${dest.range.start}:${dest.range.length}` })
            : lib.coordsToPageUrl(dest.coordinates);
          location.hash = destUrl;
        }).catch(() => {
          if (anim) anim.cancel();
          nextBtn.disabled = false;
          nextBtn.textContent = '🔍 Следующая обитаемая';
        });
      });
    }

    /* Journey map: show where you've been */
    const jmCanvas = document.getElementById('pageDistanceCanvas');
    if (jmCanvas) h.drawJourneyMap(jmCanvas);
  }

  /* ═══════════════════════════════════════════════════════════
     ATLAS VIEW (moved from app.js — fixes themes.renderAtlas)
     ═══════════════════════════════════════════════════════════ */

  const GENRE_DESCRIPTIONS = {
    dialogue: 'Район переписок — здесь страницы полны диалогами. Таймстемпы, имена, реплики собеседников. Как будто ты подслушиваешь чужой чат.',
    diary: 'Район дневников — личные записи с датами и настроением. Кто-то описывает свои дни, кто-то — свои сны. Интимная территория библиотеки.',
    post: 'Район постов — лента коротких сообщений с авторами и тегами. Мысли, наблюдения, афоризмы — как бесконечная соцсеть.',
    log: 'Серверный кластер — машинные записи, таймстемпы, уровни ошибок. Здесь обитает техническая душа библиотеки.',
    text: 'Книжные полки — поток осмысленных слов. Классический текст, как в настоящей книге. Самый читаемый район.',
    noise: 'Пустые залы — случайный шум, бессмысленные символы. Большинство залов библиотеки именно такие. Тишина и хаос.',
  };

  function renderAtlas() {
    const genres = lib.REGION_GENRES;
    const visitedCount = store.getVisitedCount();
    const genreCards = genres.map(g => {
      const pct = Math.round(g.weight * 100);
      const desc = GENRE_DESCRIPTIONS[g.kind] || g.label;
      const color = lib.GENRE_COLORS[g.kind] || '#4e5c6e';
      /* For noise, link to wander; for others, link to genre browsing */
      const targetUrl = g.kind === 'noise'
        ? null
        : `#/genre/${g.kind}/step/1`;
      const actionBtn = targetUrl
        ? `<a class="atlas-go-btn" href="${targetUrl}" style="background:${color}">Обитаемые страницы</a>`
        : `<button class="atlas-go-btn" data-kind="${g.kind}" style="background:${color}">Перейти в ${g.label.toLowerCase()}</button>`;
      return `
      <div class="atlas-card" data-genre="${g.kind}">
        <div class="atlas-card-header">
          <span class="atlas-icon" style="background:${color}20;color:${color}">${g.icon}</span>
          <div class="atlas-card-info">
            <h3 class="atlas-card-title">${g.label}</h3>
            <span class="atlas-card-pct" style="color:${color}">${pct}% библиотеки</span>
          </div>
        </div>
        <p class="atlas-card-desc">${desc}</p>
        <div class="atlas-card-bar">
          <div class="atlas-card-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="atlas-card-actions">
          ${actionBtn}
        </div>
      </div>`;
    }).join('');

    /* Mini wanderings map */
    const mapSection = `
    <div class="atlas-map-section">
      <h2 class="atlas-section-title">🗺️ Карта блужданий</h2>
      <p class="atlas-section-desc">Вы посетили <strong>${visitedCount}</strong> ${visitedCount === 1 ? 'зал' : visitedCount < 5 ? 'зала' : 'залов'}. Каждый зал на карте окрашен по жанру региона.</p>
      <div class="atlas-map-container">
        <canvas class="atlas-map-canvas" id="atlasMapCanvas" width="600" height="400"></canvas>
      </div>
      <div class="atlas-map-legend">
        ${genres.map(g => `<span class="atlas-legend-item"><span class="atlas-legend-dot" style="background:${lib.GENRE_COLORS[g.kind]}"></span>${g.icon} ${g.label}</span>`).join('')}
      </div>
      ${visitedCount > 0 ? '<button class="atlas-clear-btn" id="atlasClearBtn">Очистить карту</button>' : ''}
    </div>`;

    return `
    <section class="atlas-view fade-in">
      <div class="atlas-header">
        <h1 class="atlas-title">🗺️ Обитаемый атлас</h1>
        <p class="atlas-subtitle">Библиотека разделена на регионы по жанрам. Каждый зал принадлежит определённому району — выбери, куда хочешь попасть.</p>
      </div>
      <div class="atlas-grid">${genreCards}</div>
      ${mapSection}
    </section>`;
  }

  function bindAtlas() {
    /* Noise go button (still uses wander) */
    u.$$('.atlas-go-btn[data-kind]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.kind;
        const { x, y } = lib.findRandomHallOfGenre(kind);
        store.pushWanderVisit(x, y);
        location.hash = `#/x/${x}/y/${y}`;
      });
    });

    /* Clear map button */
    const clearBtn = u.$('#atlasClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (confirm('Очистить карту блужданий? Это действие нельзя отменить.')) {
        store.clearWanderMap();
        window.dispatchEvent(new Event('hashchange'));
      }
    });

    /* Draw mini wanderings map */
    const canvas = document.getElementById('atlasMapCanvas');
    if (canvas) drawWanderMap(canvas);
  }

  /* Draw hex-based wander map on canvas — 2D trail with real coordinates */
  function drawWanderMap(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h2 = rect.height;

    const visited = store.getVisitedCoords();
    if (visited.length === 0) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#4e5c6e';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пока нет посещённых залов', w / 2, h2 / 2);
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Начните блуждать по залам, чтобы они появились на карте', w / 2, h2 / 2 + 24);
      return;
    }

    /* Filter out entries with invalid coords and convert to numbers */
    const pts = visited
      .map(v => ({ x: h.safeNum(v.x), y: h.safeNum(v.y) }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length === 0) {
      ctx.fillStyle = '#4e5c6e';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Нет валидных координат', w / 2, h2 / 2);
      return;
    }

    /* Calculate bounds */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    /* Add padding */
    const pad = Math.max(1, Math.round(Math.max(maxX - minX, maxY - minY) * 0.1));
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;

    const rangeX = (maxX - minX) || 1;
    const rangeY = (maxY - minY) || 1;

    /* Hex cell size — adaptive */
    const hexSize = Math.min(w / (rangeX * 1.5 + 1), h2 / (rangeY * 1.73 + 1), 28);
    const hexW = hexSize * 2;
    const hexH = hexSize * 1.73;

    /* Offset to center */
    const totalW = rangeX * hexW * 0.75 + hexW * 0.25;
    const totalH = rangeY * hexH + hexH * 0.5;
    const offsetX = (w - totalW) / 2;
    const offsetY = (h2 - totalH) / 2;

    /* Convert point to canvas coords */
    function toCanvas(px, py) {
      const gx = px - minX + pad; /* account for pad offset */
      return {
        cx: offsetX + gx * hexW * 0.75 + hexW * 0.5,
        cy: offsetY + (maxY - py) * hexH + hexH * 0.5, /* flip Y */
      };
    }

    /* Draw unvisited cells (dim) — only if range is small enough */
    if (rangeX <= 60 && rangeY <= 60) {
      ctx.globalAlpha = 0.08;
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          const pos = toCanvas(gx, gy);
          drawHex(ctx, pos.cx, pos.cy, hexSize * 0.9, '#333');
        }
      }
    }

    /* Draw visited cells */
    ctx.globalAlpha = 1;
    for (const p of pts) {
      const region = lib.classifyRegion(p.x, p.y);
      const color = lib.GENRE_COLORS[region.kind] || '#4e5c6e';
      const pos = toCanvas(p.x, p.y);
      drawHex(ctx, pos.cx, pos.cy, hexSize * 0.9, color);
    }
  }

  function drawHex(ctx, cx, cy, size, color) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i - Math.PI / 6;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  /* ═══════════════════════════════════════════════════════════
     GENRE BROWSING VIEW — page-by-page inhabited navigation
     ═══════════════════════════════════════════════════════════ */

  const GENRE_INFO = {
    dialogue: { icon: '💬', label: 'Район переписок', name: 'Переписка' },
    diary:    { icon: '📔', label: 'Район дневников', name: 'Дневник' },
    post:     { icon: '📱', label: 'Район постов', name: 'Пост' },
    log:      { icon: '⌨️', label: 'Серверный кластер', name: 'Лог' },
    text:     { icon: '📖', label: 'Книжные полки', name: 'Текст' },
    noise:    { icon: '🌫️', label: 'Пустые залы', name: 'Шум' },
  };

  function renderGenre(route) {
    const kind = route.parts[1] || 'dialogue';
    const step = parseInt(route.parts[3]) || 1;
    const gi = GENRE_INFO[kind] || GENRE_INFO.dialogue;
    const color = lib.GENRE_COLORS[kind] || '#4e5c6e';

    /* Generate the inhabited page for this step */
    let pageData = null;
    let pageError = null;
    try {
      pageData = lib.generateInhabitedPage(kind, step);
    } catch (err) {
      pageError = err.message;
    }

    /* Build page content */
    let contentHTML = '';
    if (pageError) {
      contentHTML = `<div class="notice">Ошибка: ${u.esc(pageError)}</div>`;
    } else if (pageData) {
      /* Render page text similar to messenger theme */
      const fullText = pageData.text || '';
      const MAX_BUBBLE = 2000;
      const bubbleChunks = [];
      if (fullText.length <= MAX_BUBBLE) {
        bubbleChunks.push(fullText);
      } else {
        let remaining = fullText;
        while (remaining.length > 0) {
          if (remaining.length <= MAX_BUBBLE) {
            bubbleChunks.push(remaining);
            break;
          }
          let splitAt = -1;
          for (const sep of ['\n\n', '\n', ' ']) {
            const idx = remaining.lastIndexOf(sep, MAX_BUBBLE);
            if (idx > MAX_BUBBLE * 0.3) { splitAt = idx + sep.length; break; }
          }
          if (splitAt < 0) splitAt = MAX_BUBBLE;
          bubbleChunks.push(remaining.slice(0, splitAt));
          remaining = remaining.slice(splitAt);
        }
      }

      const bubblesHTML = bubbleChunks.map((b, i) => `
        <div class="msg msg-them">
          <div class="msg-avatar">${i === 0 ? gi.icon : '📜'}</div>
          <div class="msg-bubble msg-bubble-page">
            <div class="msg-text">${h.escWithBR(b)}</div>
            <span class="msg-time">${h.timeStr()}</span>
          </div>
        </div>
      `).join('');

      /* Coordinates info */
      const vCoords = {
        sector: BigInt(pageData.coordinates.sector),
        hall: BigInt(pageData.coordinates.hall),
        wall: BigInt(pageData.coordinates.wall),
        shelf: BigInt(pageData.coordinates.shelf),
        volume: BigInt(pageData.coordinates.volume),
        page: BigInt(pageData.coordinates.page),
      };
      const vXY = { x: BigInt(pageData.xy.x), y: BigInt(pageData.xy.y) };
      const pageUrl = lib.coordsToPageUrl(vCoords, { hl: `${pageData.range.start}:${pageData.range.length}` });
      const wanderUrl = `#/x/${h.fmtXY(vXY.x)}/y/${h.fmtXY(vXY.y)}`;

      contentHTML = `
      <div class="msg msg-them">
        <div class="msg-avatar">📚</div>
        <div class="msg-bubble">
          <div class="msg-name">Библиотекарь</div>
          <p>Вот обитаемая страница шага ${step}. Фраза: «${u.esc(pageData.phrase)}»</p>
          <div class="genre-coords">
            <span class="coord-pill">X: ${h.fmtXY(vXY.x)}</span>
            <span class="coord-pill">Y: ${h.fmtXY(vXY.y)}</span>
            <span class="coord-pill">Том ${vCoords.volume}</span>
            <span class="coord-pill">Лист ${vCoords.page}</span>
          </div>
          <div class="genre-page-actions">
            <a class="msg-qa" href="${pageUrl}">📖 Телепортироваться</a>
            <a class="msg-qa" href="${wanderUrl}">🏛 Перейти в зал</a>
          </div>
          <span class="msg-time">${h.timeStr()}</span>
        </div>
      </div>
      ${bubblesHTML}`;
    }

    const prevUrl = step > 1 ? `#/genre/${kind}/step/${step - 1}` : null;
    const nextUrl = `#/genre/${kind}/step/${step + 1}`;

    return `
    <section class="t-messenger genre-view fade-in">
      <div class="msg-room-header">
        <a class="msg-back" href="#/atlas">← Атлас</a>
        <div>
          <span class="msg-room-title" style="color:${color}">${gi.icon} ${gi.name}</span>
          <span class="msg-room-sub">Шаг ${step}</span>
        </div>
        <span class="msg-density genre-step-badge" style="color:${color};border-color:${color}40;background:${color}15">Шаг ${step}</span>
      </div>
      <div class="msg-chat" id="msgChat">
        ${contentHTML}
        <div class="msg msg-them">
          <div class="msg-avatar">📚</div>
          <div class="msg-bubble">
            <div class="msg-name">Навигация</div>
            <div class="genre-nav-row">
              ${prevUrl ? `<a class="genre-nav-btn" href="${prevUrl}">← Пред. обитаемая</a>` : '<span class="genre-nav-btn genre-nav-disabled">← Пред. обитаемая</span>'}
              <span class="genre-nav-step">Шаг ${step}</span>
              <a class="genre-nav-btn" href="${nextUrl}">След. обитаемая →</a>
            </div>
            <div class="genre-scan-row">
              <button class="genre-scan-btn" id="genreScanBtn" data-kind="${kind}" data-number="${pageData ? pageData.number : '0'}">🔍 Сканировать честно (медленно)</button>
            </div>
            <span class="msg-time">${h.timeStr()}</span>
          </div>
        </div>
      </div>
    </section>`;
  }

  function bindGenre(route) {
    const kind = route.parts[1] || 'dialogue';
    const step = parseInt(route.parts[3]) || 1;

    /* Scroll chat to bottom */
    const chat = u.$('#msgChat');
    if (chat) chat.scrollTop = chat.scrollHeight;

    /* Scan button */
    const scanBtn = u.$('#genreScanBtn');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => {
        const startNumber = scanBtn.dataset.number;
        const genreKind = scanBtn.dataset.kind;

        scanBtn.disabled = true;
        scanBtn.textContent = '🔍 Сканирую…';

        /* Run scan asynchronously (setTimeout to allow UI update) */
        setTimeout(() => {
          try {
            const result = lib.scanNextInhabitedPage(BigInt(startNumber), genreKind, 100);
            if (result) {
              /* Navigate to the real page found by scan */
              const coords = {
                sector: result.coords.sector,
                hall: result.coords.hall,
                wall: result.coords.wall,
                shelf: result.coords.shelf,
                volume: result.coords.volume,
                page: result.coords.page,
              };
              const pageUrl = lib.coordsToPageUrl(coords);
              location.hash = pageUrl;
            } else {
              scanBtn.disabled = false;
              scanBtn.textContent = '🔍 Не найдено (попробуйте снова)';
              setTimeout(() => {
                scanBtn.textContent = '🔍 Сканировать честно (медленно)';
              }, 2000);
            }
          } catch (err) {
            scanBtn.disabled = false;
            scanBtn.textContent = '🔍 Ошибка сканирования';
            setTimeout(() => {
              scanBtn.textContent = '🔍 Сканировать честно (медленно)';
            }, 2000);
          }
        }, 50);
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     THEME REGISTRY — public API
     ═══════════════════════════════════════════════════════════ */

  const themeRegistry = {
    bookshelf: bookshelfTheme,
    cosmos: cosmosTheme,
    messenger: messengerTheme,
    feed: feedTheme,
    terminal: terminalTheme,
  };

  /* Diagnostic: log which themes registered successfully */
  const missingThemes = Object.entries(themeRegistry)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  if (missingThemes.length > 0) {
    console.error('[babel] Missing themes:', missingThemes,
      '— theme IIFEs may have thrown errors. Check console above.');
  }

  function getThemeRenderer() {
    const id = h.getTheme();
    const renderer = themeRegistry[id] || themeRegistry[h.DEFAULT_THEME];
    if (!renderer) {
      /* Fallback: find first available theme in the registry */
      console.error('[babel] getThemeRenderer: theme', id, 'not found, default', h.DEFAULT_THEME, 'also missing');
      for (const key of Object.keys(themeRegistry)) {
        if (themeRegistry[key]) {
          console.warn('[babel] Falling back to theme:', key);
          return themeRegistry[key];
        }
      }
      /* No themes available at all — this means theme files failed to load */
      console.error('[babel] No themes available! Theme files may have failed to load.');
    }
    return renderer;
  }

  /* Theme picker HTML */
  function renderThemePicker() {
    const current = h.getTheme();
    const currentMode = h.getLibraryMode();
    const modeInfo = h.LIBRARY_MODES[currentMode];
    return `<div class="theme-picker" id="themePicker">
      <button class="theme-picker-toggle" id="themePickerToggle" title="Сменить тему">${h.THEMES[current].icon} ${h.THEMES[current].name}</button>
      <div class="theme-picker-dropdown" id="themePickerDropdown">
        ${Object.values(h.THEMES).map(t => `
          <button class="theme-picker-option ${t.id === current ? 'active' : ''}" data-theme="${t.id}">
            <span class="tp-icon">${t.icon}</span>
            <span class="tp-name">${t.name}</span>
            <span class="tp-desc">${t.desc}</span>
          </button>
        `).join('')}
        <div class="theme-picker-divider"></div>
        <div class="theme-picker-section-label">Режим библиотеки</div>
        ${Object.values(h.LIBRARY_MODES).map(m => `
          <button class="theme-picker-option ${m.id === currentMode ? 'active' : ''}" data-library-mode="${m.id}">
            <span class="tp-icon">${m.icon}</span>
            <span class="tp-name">${m.name}</span>
            <span class="tp-desc">${m.desc}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
  }

  function bindThemePicker() {
    const toggle = u.$('#themePickerToggle');
    const dropdown = u.$('#themePickerDropdown');
    if (!toggle || !dropdown) return;

    toggle.addEventListener('click', () => {
      dropdown.classList.toggle('open');
    });

    /* Close on outside click — remove previous listener first */
    if (!window._themePickerOutsideClick) {
      window._themePickerOutsideClick = (e) => {
        if (!e.target.closest('.theme-picker')) {
          const dd = document.getElementById('themePickerDropdown');
          if (dd) dd.classList.remove('open');
        }
      };
    } else {
      document.removeEventListener('click', window._themePickerOutsideClick);
    }
    document.addEventListener('click', window._themePickerOutsideClick);

    u.$$('.theme-picker-option[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        h.setTheme(btn.dataset.theme);
        dropdown.classList.remove('open');
        /* Re-render current view */
        window.dispatchEvent(new Event('hashchange'));
      });
    });

    /* Library mode buttons */
    u.$$('.theme-picker-option[data-library-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        h.setLibraryMode(btn.dataset.libraryMode);
        dropdown.classList.remove('open');
        /* Re-render current view to apply new mode */
        window.dispatchEvent(new Event('hashchange'));
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     INJECT sharedPageRender/bindSharedPage into _helpers
     so that themes that captured h = app.themes._helpers
     (bookshelf, cosmos, feed) can call h.sharedPageRender()
     at runtime. The `h` variable holds a reference to the
     same object, so adding properties here is visible.
     ═══════════════════════════════════════════════════════════ */

  app.themes._helpers.sharedPageRender = sharedPageRender;
  app.themes._helpers.bindSharedPage = bindSharedPage;

  /* ═══════════════════════════════════════════════════════════
     ASSEMBLE FINAL app.themes OBJECT
     ═══════════════════════════════════════════════════════════ */

  app.themes = {
    THEMES: h.THEMES,
    DEFAULT_THEME: h.DEFAULT_THEME,
    LIBRARY_MODES: h.LIBRARY_MODES,
    getTheme: h.getTheme,
    setTheme: h.setTheme,
    getLibraryMode: h.getLibraryMode,
    setLibraryMode: h.setLibraryMode,
    getThemeRenderer,
    renderThemePicker,
    bindThemePicker,
    fmtBigNum: h.fmtBigNum,
    fmtXY: h.fmtXY,
    fmtCoord: h.fmtCoord,
    charStats: h.charStats,
    textToCharStats: h.textToCharStats,
    pageSnippet: h.pageSnippet,
    sharedPageRender,
    bindSharedPage,
    timeStr: h.timeStr,
    /* Reusable mini-map hex drawing for wander views */
    drawMiniHex: h.drawMiniHex,
    /* Journey map timeline visualization */
    drawJourneyMap: h.drawJourneyMap,
    /* Atlas view (moved from app.js) */
    renderAtlas,
    bindAtlas,
    drawWanderMap,
    drawHex,
    GENRE_DESCRIPTIONS,
    /* Genre browsing view */
    renderGenre,
    bindGenre,
  };

  /* ═══════════════════════════════════════════════════════════
     CLEAN UP temporary namespaces
     ═══════════════════════════════════════════════════════════ */

  delete app.themes._helpers;
  delete app.themes._bookshelf;
  delete app.themes._cosmos;
  delete app.themes._messenger;
  delete app.themes._feed;
  delete app.themes._terminal;

  } catch(e) {
    console.error('[babel] theme-views.js failed:', e);
    /* CRITICAL: provide a minimal fallback app.themes so app.js doesn't crash.
       Without this, app.themes would be the intermediate object (with _helpers
       but without getThemeRenderer), causing "Cannot read properties of
       undefined (reading 'renderHome')" downstream. */
    const app = window.BabelApp = window.BabelApp || {};
    const fallbackHelpers = app.themes && app.themes._helpers
      ? app.themes._helpers
      : { getTheme: () => 'bookshelf', setTheme: () => {}, DEFAULT_THEME: 'bookshelf', THEMES: {}, LIBRARY_MODES: {}, getLibraryMode: () => 'human', setLibraryMode: () => {}, fmtXY: v => String(v), fmtBigNum: v => String(v) };

    /* Try to find any registered theme to use as fallback renderer */
    const fallbackRenderer = (app.themes && (app.themes._bookshelf || app.themes._cosmos || app.themes._messenger || app.themes._feed || app.themes._terminal)) || null;

    app.themes = {
      THEMES: fallbackHelpers.THEMES || {},
      DEFAULT_THEME: fallbackHelpers.DEFAULT_THEME || 'bookshelf',
      LIBRARY_MODES: fallbackHelpers.LIBRARY_MODES || {},
      getTheme: fallbackHelpers.getTheme || (() => 'bookshelf'),
      setTheme: fallbackHelpers.setTheme || (() => {}),
      getLibraryMode: fallbackHelpers.getLibraryMode || (() => 'human'),
      setLibraryMode: fallbackHelpers.setLibraryMode || (() => {}),
      getThemeRenderer: () => fallbackRenderer,
      renderThemePicker: () => '<div id="themePicker"></div>',
      bindThemePicker: () => {},
      fmtXY: fallbackHelpers.fmtXY || (v => String(v)),
      fmtBigNum: fallbackHelpers.fmtBigNum || (v => String(v)),
      sharedPageRender: () => '<div class="notice">Ошибка загрузки темы. Попробуйте Ctrl+Shift+R.</div>',
      bindSharedPage: () => {},
      renderAtlas: () => '<div class="notice">Атлас недоступен. Попробуйте обновить страницу.</div>',
      bindAtlas: () => {},
      renderGenre: () => '<div class="notice">Жанры недоступны. Попробуйте обновить страницу.</div>',
      bindGenre: () => {},
    };
  }
})();
