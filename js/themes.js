(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;

  /* ═══════════════════════════════════════════════════════════
     5 VISUAL THEMES FOR THE LIBRARY OF BABEL
     ═══════════════════════════════════════════════════════════
     Each theme reimagines how the infinite library looks & feels.
     CSS custom properties handle colors/fonts; JS handles layout. */

  const THEMES = {
    bookshelf: {
      id: 'bookshelf',
      name: 'Книжная полка',
      icon: '📖',
      desc: 'Уютный читатель — тёплые тона, деревянные полки',
    },
    cosmos: {
      id: 'cosmos',
      name: 'Космос',
      icon: '🌌',
      desc: 'Звёздный атлас — глубокий космос, голограммы',
    },
    messenger: {
      id: 'messenger',
      name: 'Мессенджер',
      icon: '💬',
      desc: 'Библиотека как чат — страницы-сообщения от Библиотекаря',
    },
    feed: {
      id: 'feed',
      name: 'Лента',
      icon: '📱',
      desc: 'Социальная лента — бесконечный скролл постов',
    },
    terminal: {
      id: 'terminal',
      name: 'Терминал',
      icon: '⌨️',
      desc: 'Хакерский интерфейс — зелёный текст, команды',
    },
  };

  const DEFAULT_THEME = 'messenger';

  function getTheme() {
    try { return localStorage.getItem('babelTheme') || DEFAULT_THEME; }
    catch { return DEFAULT_THEME; }
  }

  function setTheme(id) {
    if (!THEMES[id]) return;
    try { localStorage.setItem('babelTheme', id); } catch {}
    document.documentElement.setAttribute('data-theme', id);
  }

  /* ---- Shared helpers ---- */

  function fmtXY(v) {
    if (typeof v === 'bigint') {
      const s = String(v);
      return s.length > 20 ? s.slice(0, 8) + '…' + s.slice(-8) : s;
    }
    return String(v);
  }

  function fmtCoord(v) {
    if (typeof v === 'bigint') {
      const s = String(v);
      return s.length > 10 ? s.slice(0, 5) + '…' + s.slice(-4) : s;
    }
    return String(v);
  }

  /* Escape HTML + convert \n to <br> (for messenger bubble text) */
  function escWithBR(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  /* Format timestamp for chat messages */
  function timeStr() {
    const d = new Date();
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  const TELEGRAM_NAME_COLORS = ['#6ec6ff', '#ff7ab6', '#73e0ff', '#9cff8b', '#ffd166', '#c8a1ff'];

  function telegramAvatarLetter(name) {
    const normalized = String(name || '').trim();
    return normalized ? normalized[0].toUpperCase() : '•';
  }

  function telegramNameColor(name) {
    return TELEGRAM_NAME_COLORS[u.fnv1a(String(name || 'telegram')) % TELEGRAM_NAME_COLORS.length];
  }

  /* ═══════════════════════════════════════════════════════════
     ODOMETER ANIMATION — page text flips like a base-256 counter
     ═══════════════════════════════════════════════════════════
     When scanning for the next inhabited page, the visible page
     text changes character by character from right to left,
     exactly like a real counter incrementing in base-256:
     last char cycles through alphabet, wraps → second-to-last
     advances, and so on.  No fixed duration — runs as long as
     the scan takes.  Uses setTimeout for reliable scheduling. */

  function startOdometerAnimation(textNodes, alphabet) {
    let cancelled = false;
    let resolveDone;
    const done = new Promise(r => { resolveDone = r; });

    /* Build a flat char array over all text nodes.
       Each entry: { node, charIdx, codePoints } — which text node,
       which character position, and the full code-point array of that
       node (for efficient re-join). */
    const chars = [];
    for (const node of textNodes) {
      const codePoints = Array.from(node.textContent);
      for (let i = 0; i < codePoints.length; i++) {
        chars.push({ node, charIdx: i, codePoints });
      }
    }
    if (chars.length === 0) { resolveDone(); return { cancel() {}, done }; }

    /* Each character has a current alphabet index.
       If the current char isn't in the alphabet, default to 0 (space). */
    const charIndices = new Int16Array(chars.length);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i].codePoints[chars[i].charIdx];
      const idx = alphabet.indexOf(ch);
      charIndices[i] = idx >= 0 ? idx : 0;
    }

    /* The odometer counter state: an array of "digits" in base-ALPHABET.
       counter[0] = least significant (rightmost visible char),
       counter[1] = next, etc.
       We only track the last N characters for the visible odometer
       effect — advancing the counter flips characters right-to-left. */
    const DIGITS = Math.min(chars.length, 60); /* visible odometer depth */
    const counter = new Int16Array(DIGITS);
    /* Initialise counter from the last DIGITS characters */
    for (let d = 0; d < DIGITS; d++) {
      const ci = chars.length - 1 - d;
      counter[d] = charIndices[ci];
    }

    /* Advance the odometer counter by 1.
       Returns the highest digit position that changed. */
    function advanceCounter() {
      let d = 0;
      while (d < DIGITS) {
        counter[d] = (counter[d] + 1) % alphabet.length;
        if (counter[d] !== 0) break; /* no carry */
        d++; /* carry to next digit */
      }
      return d;
    }

    /* Apply current counter state to the DOM — only update the
       characters that changed since last apply.  We track
       `appliedCounter` to diff efficiently. */
    const appliedCounter = new Int16Array(DIGITS);
    appliedCounter.set(counter);

    function applyCounter() {
      for (let d = 0; d < DIGITS; d++) {
        if (counter[d] === appliedCounter[d]) continue;
        appliedCounter[d] = counter[d];
        const ci = chars.length - 1 - d;
        if (ci < 0) continue;
        const entry = chars[ci];
        entry.codePoints[entry.charIdx] = alphabet[counter[d]];
        entry.node.textContent = entry.codePoints.join('');
      }
    }

    /* Steps per tick — advance the counter several positions
       per animation frame so the visual flip is dramatic. */
    const STEPS_PER_TICK = 15;
    const TICK_MS = 16; /* ~60fps */

    function tick() {
      if (cancelled) { resolveDone(); return; }

      for (let s = 0; s < STEPS_PER_TICK; s++) {
        advanceCounter();
      }
      applyCounter();

      /* Use setTimeout (not requestIdleCallback) so the animation
         reliably ticks between scan chunks.  requestIdleCallback
         may starve when the scan blocks the main thread. */
      setTimeout(tick, TICK_MS);
    }

    /* Start immediately */
    tick();

    return {
      cancel() { cancelled = true; resolveDone(); },
      done,
    };
  }

  /* Chunked scan for next inhabited page.
     Scans a few pages at a time, yielding to the UI between
     chunks so the odometer animation can run.  Resolves with
     the best result found (same shape as findNextInhabitedFromCoords). */
  function findNextInhabitedChunked(coords) {
    return new Promise((resolve, reject) => {
      try {
        const number = lib.coordinatesToNumber(coords);
        const CHUNK = 5;        /* pages per chunk */
        const MAX_SCAN = 100;
        const THRESHOLD = 0.35;
        const start = BigInt(number);
        const maxNum = lib.maxPageNumber();

        let bestResult = null;
        let bestScore = 0;
        let i = 1;

        function scanChunk() {
          const limit = Math.min(i + CHUNK - 1, MAX_SCAN);

          for (; i <= limit; i++) {
            const offsets = [BigInt(i), -BigInt(i)];
            for (const offset of offsets) {
              const candidateNumber = start + offset;
              if (candidateNumber < 0n || candidateNumber >= maxNum) continue;

              try {
                const indices = lib.numberToIndices(candidateNumber);
                const text = u.indicesToString(indices);
                const detection = lib.detectRussianText(text);

                if (detection.score > bestScore) {
                  bestScore = detection.score;
                  const rawIdx = lib.unpermuteIndex(candidateNumber);
                  const c = lib.rawIndexToCoordinates(rawIdx);
                  let xy = { x: 0n, y: 0n };
                  try { xy = lib.coordinatesToXY(c); } catch {}

                  bestResult = {
                    number: candidateNumber,
                    coords: c,
                    coordinates: c,
                    xy,
                    text,
                    detection,
                    scanned: i,
                    offset: Number(offset),
                    regionGenre: {
                      kind: detection.kind,
                      label: detection.label,
                      icon: detection.kind === 'russian' ? '📖'
                          : detection.kind === 'sparse' ? '🌫️' : '🔇',
                    },
                    scanDistance: Math.abs(Number(offset)),
                  };
                }

                if (detection.score >= THRESHOLD) {
                  resolve(bestResult);
                  return;
                }
              } catch { continue; }
            }
          }

          if (i > MAX_SCAN) {
            if (bestResult) {
              bestResult.belowThreshold = true;
              resolve(bestResult);
            } else {
              resolve(null);
            }
            return;
          }

          /* Yield to UI then scan next chunk */
          setTimeout(scanChunk, 0);
        }

        /* Delay first chunk so the odometer animation can start
           before the scan begins blocking the main thread */
        setTimeout(scanChunk, 10);
      } catch (err) { reject(err); }
    });
  }

  function highlightSearchText(text, phrase) {
    const source = String(text || '');
    const target = String(phrase || '').trim();
    if (!target) return u.esc(source);
    const lowerSource = source.toLowerCase();
    const lowerTarget = target.toLowerCase();
    const index = lowerSource.indexOf(lowerTarget);
    if (index < 0) return u.esc(source);
    const end = index + target.length;
    return `${u.esc(source.slice(0, index))}<mark>${u.esc(source.slice(index, end))}</mark>${u.esc(source.slice(end))}`;
  }

  function parseTelegramDialogue(text, phrase) {
    const rawLines = String(text || '').split('\n');
    const parsed = [];
    let offset = 0;

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      const start = offset;
      offset += rawLine.length + 1;
      if (!line) continue;

      const match = line.match(/^\[(.+?)\]\s*([^:]+):\s*(.*)$/);
      if (match) {
        const meta = match[1];
        const name = match[2].trim();
        const body = match[3].trim();
        const timeMatch = meta.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
        parsed.push({
          name,
          body,
          time: timeMatch ? timeMatch[1].toUpperCase() : meta,
          lineStart: start,
        });
      } else if (parsed.length) {
        parsed[parsed.length - 1].body += `\n${line}`;
      }
    }

    const phraseLower = String(phrase || '').toLowerCase();
    const focusIndex = parsed.findIndex((message) => message.body.toLowerCase().includes(phraseLower));
    const startIndex = focusIndex <= 1 ? 0 : Math.max(0, focusIndex - 2);
    const visible = parsed.slice(startIndex, startIndex + 5);

    return visible.map((message) => ({
      ...message,
      avatar: telegramAvatarLetter(message.name),
      color: telegramNameColor(message.name),
      bodyHTML: highlightSearchText(message.body, phrase).replace(/\n/g, '<br>'),
    }));
  }

  function renderDialogueSearchPreview(variant, pageUrl) {
    const messages = parseTelegramDialogue(variant.text, variant.phrase);
    if (!messages.length) return null;

    const previewHTML = messages.map((message) => `
      <div class="tg-preview-msg">
        <div class="tg-preview-avatar" style="--tg-avatar-color:${message.color}">${u.esc(message.avatar)}</div>
        <div class="tg-preview-bubble">
          <div class="tg-preview-name" style="color:${message.color}">${u.esc(message.name)}</div>
          <div class="tg-preview-text">${message.bodyHTML}</div>
          <div class="tg-preview-meta">
            <span class="tg-preview-time">${u.esc(message.time)}</span>
          </div>
        </div>
      </div>`).join('');

    return `
      <div class="msg msg-them msg-dialogue-card">
        <div class="msg-avatar">💬</div>
        <div class="msg-bubble msg-bubble-telegram-search">
          <div class="msg-name">В переписке</div>
          <p class="msg-genre-desc">Фраза внутри настоящей чатовой сцены — как в Telegram.</p>
          <div class="tg-preview-thread">
            ${previewHTML}
          </div>
          <div class="msg-search-actions">
            <a class="msg-qa" href="${pageUrl}">📖 Открыть</a>
            <a class="msg-qa" href="#/x/${fmtXY(BigInt(variant.xy.x))}/y/${fmtXY(BigInt(variant.xy.y))}">🏛 Зал</a>
          </div>
          <span class="msg-time">${timeStr()}</span>
        </div>
      </div>`;
  }

  function renderDialoguePageThread(text, phrase) {
    const messages = parseTelegramDialogue(text, phrase);
    if (!messages.length) return '';

    const previewHTML = messages.map((message) => `
      <div class="tg-preview-msg">
        <div class="tg-preview-avatar" style="--tg-avatar-color:${message.color}">${u.esc(message.avatar)}</div>
        <div class="tg-preview-bubble">
          <div class="tg-preview-name" style="color:${message.color}">${u.esc(message.name)}</div>
          <div class="tg-preview-text">${message.bodyHTML}</div>
          <div class="tg-preview-meta">
            <span class="tg-preview-time">${u.esc(message.time)}</span>
          </div>
        </div>
      </div>`).join('');

    return `
      <div class="msg msg-them msg-dialogue-card msg-dialogue-page">
        <div class="msg-avatar">💬</div>
        <div class="msg-bubble msg-bubble-telegram-search">
          <div class="msg-name">Переписка на листе</div>
          <p class="msg-genre-desc">Открытый лист показан как цепочка сообщений, а не как сплошной текстовый блок.</p>
          <div class="tg-preview-thread tg-page-thread">
            ${previewHTML}
          </div>
          <span class="msg-time">${timeStr()}</span>
        </div>
      </div>`;
  }

  /* Character stats from indices */
  function charStats(indices) {
    let s = { cyrillic: 0, latin: 0, spaces: 0, digits: 0, punctuation: 0, emoji: 0 };
    for (const idx of indices) {
      if (idx === 0) s.spaces++;
      else if (idx <= 33) s.cyrillic++;
      else if (idx <= 51) s.latin++;
      else if (idx <= 61) s.digits++;
      else if (idx <= 77) s.punctuation++;
      else s.emoji++;
    }
    const total = indices.length;
    const letters = s.cyrillic + s.latin;
    const readability = Math.round(letters / total * 100);
    const label = readability > 60 ? 'Читаемая' : readability > 30 ? 'Разреженная' : 'Шум';
    return { ...s, total, letters, readability, label };
  }

  /* Snippet: first N non-space characters */
  function pageSnippet(indices, maxLen) {
    let result = '';
    for (let i = 0; i < indices.length && result.length < maxLen; i++) {
      const ch = ALG.alphabet[indices[i]];
      if (ch === ' ' && result.length > 0 && result[result.length - 1] !== ' ') result += ' ';
      else if (ch !== ' ' && ch !== '\n') result += ch;
    }
    return result.trim() || 'пустая страница';
  }

  /* Draw a hexagon on canvas (for mini wander map) */
  function drawMiniHex(ctx, cx, cy, size, color) {
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
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  /* ═══════════════════════════════════════════════════════════
     JOURNEY MAP — 2D wandering trail with real coordinates
     ═══════════════════════════════════════════════════════════
     Shows WHERE YOU'VE BEEN in 2D space.
     Points positioned by real x,y coordinates (scaled to fit).
     Lines show trajectory. Current position highlighted.
     For large jumps, distance is compressed (log scale) but
     direction is preserved. */

  function safeNum(v) {
    /* Convert BigInt or string to a finite Number, or 0 */
    if (v == null) return 0;
    if (typeof v === 'bigint') {
      const s = String(v);
      /* For very large BigInt, use a hash-like approach: take first and last digits */
      if (s.length > 15) {
        /* Fallback: use modular arithmetic for a stable numeric representation */
        const prefix = s.slice(0, 10);
        const suffix = s.slice(-5);
        return Number(prefix) * 1e5 + Number(suffix);
      }
      return Number(v);
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function drawJourneyMap(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const journey = store.getJourney();
    if (journey.length === 0) {
      ctx.fillStyle = '#4e5c6e';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Начните блуждать, чтобы увидеть свой путь...', w / 2, h / 2);
      return;
    }

    /* Convert journey points to numeric x,y */
    const points = journey.map(step => ({
      x: safeNum(step.x),
      y: safeNum(step.y),
      genre: step.genre || '',
      dist: safeNum(step.dist),
      labelX: step.x,
      labelY: step.y,
    }));

    /* Filter out points with same position as previous */
    const filtered = [points[0]];
    for (let i = 1; i < points.length; i++) {
      if (points[i].x !== filtered[filtered.length - 1].x || points[i].y !== filtered[filtered.length - 1].y) {
        filtered.push(points[i]);
      }
    }

    if (filtered.length < 1) return;

    /* Calculate bounding box */
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of filtered) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    /* Handle single point */
    if (minX === maxX && minY === maxY) {
      /* Single point — just draw it centered */
      const cx = w / 2, cy = h / 2;
      const color = lib.GENRE_COLORS[filtered[0].genre] || '#4e5c6e';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText('X:' + filtered[0].labelX + ' Y:' + filtered[0].labelY, cx, cy + 18);
      return;
    }

    /* Add margin and handle degenerate cases */
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const padding = 40;
    const usableW = w - padding * 2;
    const usableH = h - padding * 2;

    /* Scale to fit, preserving aspect ratio */
    const scaleX = usableW / rangeX;
    const scaleY = usableH / rangeY;
    const scale = Math.min(scaleX, scaleY);

    /* Center the map */
    const mapW = rangeX * scale;
    const mapH = rangeY * scale;
    const offsetX = (w - mapW) / 2;
    const offsetY = (h - mapH) / 2;

    /* Convert coordinates to canvas positions */
    function toCanvas(px, py) {
      return {
        cx: offsetX + (px - minX) * scale,
        cy: offsetY + (maxY - py) * scale, /* flip Y so north is up */
      };
    }

    /* Draw trajectory lines */
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    for (let i = 1; i < filtered.length; i++) {
      const from = toCanvas(filtered[i - 1].x, filtered[i - 1].y);
      const to = toCanvas(filtered[i].x, filtered[i].y);
      /* For big jumps, draw dashed line */
      const d = filtered[i].dist;
      if (d > 5) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      }
      ctx.beginPath();
      ctx.moveTo(from.cx, from.cy);
      ctx.lineTo(to.cx, to.cy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /* Draw nodes */
    const totalSteps = filtered.length;
    for (let i = 0; i < totalSteps; i++) {
      const step = filtered[i];
      const pos = toCanvas(step.x, step.y);
      const age = totalSteps - 1 - i; /* 0 = current */
      const focus = Math.max(0.2, 1 - age * 0.06);
      const radius = age === 0 ? 6 : Math.max(2, 5 - age * 0.4);
      const color = lib.GENRE_COLORS[step.genre] || '#4e5c6e';

      /* Draw node */
      ctx.globalAlpha = focus;
      ctx.beginPath();
      ctx.arc(pos.cx, pos.cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      /* Step number */
      if (age === 0 || (age < 5 && totalSteps < 20)) {
        ctx.font = age === 0 ? 'bold 9px Inter, sans-serif' : '7px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255,255,255,${focus * 0.7})`;
        ctx.fillText(String(i + 1), pos.cx, pos.cy + radius + 10);
      }
    }
    ctx.globalAlpha = 1;

    /* Draw "current" indicator — pulsing ring around last point */
    if (filtered.length > 0) {
      const last = filtered[filtered.length - 1];
      const pos = toCanvas(last.x, last.y);
      ctx.beginPath();
      ctx.arc(pos.cx, pos.cy, 9, 0, Math.PI * 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      /* Label current position */
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      const label = 'X:' + last.labelX + ' Y:' + last.labelY;
      ctx.fillText(label, pos.cx, pos.cy - 14);
    }

    /* Draw distance label for big jumps */
    for (let i = 1; i < filtered.length; i++) {
      const d = filtered[i].dist;
      if (d > 2) {
        const from = toCanvas(filtered[i - 1].x, filtered[i - 1].y);
        const to = toCanvas(filtered[i].x, filtered[i].y);
        const midX = (from.cx + to.cx) / 2;
        const midY = (from.cy + to.cy) / 2;
        ctx.font = '7px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('d' + Math.round(d), midX, midY - 6);
      }
    }
  }

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
      let x = 0, y = 0, wall = 1;
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'w') wall = parseInt(parts[i + 1]) || 1;
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
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
      }
      /* Track visit on wander map */
      store.pushWanderVisit(x, y);
      store.pushJourneyStep(x, y, lib.classifyRegion(x, y).kind);
      u.$$('.bk-nav-btn[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/x/${x + dq}/y/${y + dr}`;
        });
      });
      u.$$('.bk-wall-tab[data-wall]').forEach(btn => {
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

    renderPage(route) { return sharedPageRender(route, 't-bookshelf'); },
  };

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
          <a class="cosmos-card" href="#/x/0/y/0">
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
          <a class="cosmos-card" href="#/random">
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
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'w') wall = parseInt(parts[i + 1]) || 1;
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
        const preview = u.esc(pageSnippet(lib.numberToIndices(lib.coordinatesToNumber(lib.xyToCoordinates(nx, ny, 1, 1, 1, 1))), 30));
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
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
      }
      /* Track visit on wander map */
      store.pushWanderVisit(x, y);
      store.pushJourneyStep(x, y, lib.classifyRegion(x, y).kind);
      u.$$('.cosmos-hex-cell[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/x/${x + dq}/y/${y + dr}`;
        });
      });
      u.$$('.cosmos-wall-tab[data-wall]').forEach(btn => {
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

    renderPage(route) { return sharedPageRender(route, 't-cosmos'); },
  };

  /* ═══════════════════════════════════════════════════════════
     THEME 3: MESSENGER — Библиотека как чат (DEFAULT)
     ═══════════════════════════════════════════════════════════ */

  const messengerTheme = {
    renderHome() {
      return `
      <section class="t-messenger home fade-in">
        <div class="msg-chat" id="msgChat">
          <div class="msg-date-divider">сегодня</div>
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Добро пожаловать в Вавилон. Здесь хранится <strong>всё</strong>, что когда-либо было или будет написано.</p>
              <p>Дневник твоей смерти. Рецепт борща мамы. Или просто шум.</p>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Выбери, что хочешь:</p>
              <div class="msg-quick-actions">
                <a class="msg-qa" href="#/x/0/y/0">🏛 Блуждать по залам</a>
                <a class="msg-qa" href="#/search">🔍 Искать текст</a>
                <a class="msg-qa" href="#/atlas">🗺️ Атлас жанров</a>
                <a class="msg-qa" href="#/random">🎲 Случайная страница</a>
              </div>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
        </div>
      </section>`;
    },

    renderWander(route) {
      const parts = route.parts;
      let x = 0, y = 0, wall = 1;
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'w') wall = parseInt(parts[i + 1]) || 1;
      }
      const hallInfo = lib.xyToHallXY(x, y);

      /* Build chat messages showing the room content */
      const messages = [];

      /* Librarian greets you */
      messages.push({
        type: 'them',
        name: 'Библиотекарь',
        avatar: '📚',
        text: `Ты в зале <strong>X:${x} Y:${y}</strong>. Сектор ${hallInfo.sector}, зал ${hallInfo.hall}. На стене ${wall} из 6 — 5 полок по 32 тома.`,
        time: timeStr(),
      });

      /* Show book spines as message */
      for (let s = 1; s <= Number(ALG.shelvesPerWall); s++) {
        const spines = [];
        for (let v = 1; v <= Number(ALG.volumesPerShelf); v++) {
          const spineText = lib.getBookSpine(x, y, wall, s, v);
          const cls = lib.classifySpine(spineText);
          const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(x, y, wall, s, v, 1));
          if (cls === 'text') {
            spines.push(`<a class="msg-book-link" href="${pageUrl}">📖 Том ${v}: ${u.esc(spineText.slice(0, 30))}</a>`);
          } else if (cls === 'noise') {
            spines.push(`<a class="msg-book-link msg-book-noise" href="${pageUrl}">📕 Том ${v}: шум</a>`);
          } else {
            spines.push(`<a class="msg-book-link msg-book-empty" href="${pageUrl}">📄 Том ${v}: пусто</a>`);
          }
        }
        messages.push({
          type: 'them',
          name: 'Библиотекарь',
          avatar: '📚',
          text: `<strong>Полка ${s}</strong><br>${spines.join('<br>')}`,
          time: timeStr(),
        });
      }

      /* Navigation hints */
      const navBtns = [
        { label: '↖ СЗ', dq: 0, dr: -1 },
        { label: '↗ СВ', dq: 1, dr: -1 },
        { label: '← З',  dq: -1, dr: 0 },
        { label: '→ В',  dq: 1, dr: 0 },
        { label: '↙ ЮЗ', dq: -1, dr: 1 },
        { label: '↘ ЮВ', dq: 0, dr: 1 },
      ];

      const navHTML = navBtns.map(d =>
        `<button class="msg-nav-btn" data-dq="${d.dq}" data-dr="${d.dr}">${d.label}</button>`
      ).join('');

      const wallTabsHTML = [1,2,3,4,5,6].map(w =>
        `<button class="msg-wall-btn ${wall === w ? 'active' : ''}" data-wall="${w}">С${w}</button>`
      ).join('');

      /* Render messages */
      const chatHTML = messages.map(m => `
        <div class="msg msg-${m.type}">
          <div class="msg-avatar">${m.avatar}</div>
          <div class="msg-bubble">
            <div class="msg-name">${m.name}</div>
            <div class="msg-text">${m.text}</div>
            <span class="msg-time">${m.time}</span>
          </div>
        </div>
      `).join('');

      return `
      <section class="t-messenger wander fade-in">
        <div class="msg-room-header">
          <span class="msg-room-title">📚 Зал X:${x} Y:${y}</span>
          <a class="genre-badge" href="#/atlas" style="color:${lib.GENRE_COLORS[lib.classifyRegion(x, y).kind]};border-color:${lib.GENRE_COLORS[lib.classifyRegion(x, y).kind]}40;background:${lib.GENRE_COLORS[lib.classifyRegion(x, y).kind]}15">${lib.classifyRegion(x, y).icon} ${lib.classifyRegion(x, y).label}</a>
          <span class="msg-room-sub">Сектор ${hallInfo.sector}</span>
        </div>
        <div class="msg-chat" id="msgChat">
          ${chatHTML}
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Куда идём? Выбери стену или направление:</p>
              <div class="msg-wall-row">${wallTabsHTML}</div>
              <div class="msg-nav-row">${navHTML}</div>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
          <div class="msg msg-them">
            <div class="msg-avatar">🗺️</div>
            <div class="msg-bubble">
              <div class="msg-name">Карта блужданий</div>
              <p>Вы посетили <strong>${store.getVisitedCount()}</strong> ${store.getVisitedCount() === 1 ? 'зал' : store.getVisitedCount() < 5 ? 'зала' : 'залов'}. <a href="#/atlas" style="color:var(--accent)">Открыть атлас →</a></p>
              <div class="wander-minimap">
                <canvas class="wander-minimap-canvas" id="wanderMiniMap" width="400" height="200"></canvas>
              </div>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
        </div>
        <div class="msg-input-bar">
          <button class="msg-input-btn" id="randomHallBtn" title="Случайный зал">🎲</button>
          <input type="text" class="msg-input" id="msgInput" placeholder="Набери координаты или /random…">
          <button class="msg-send-btn" id="msgSendBtn">→</button>
        </div>
      </section>`;
    },

    bindWander(route) {
      const parts = route.parts;
      let x = 0, y = 0;
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
      }
      /* Track visit on wander map */
      store.pushWanderVisit(x, y);
      store.pushJourneyStep(x, y, lib.classifyRegion(x, y).kind);
      /* Navigation buttons */
      u.$$('.msg-nav-btn[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/x/${x + dq}/y/${y + dr}`;
        });
      });
      /* Wall tabs */
      u.$$('.msg-wall-btn[data-wall]').forEach(btn => {
        btn.addEventListener('click', () => {
          location.hash = `#/x/${x}/y/${y}/w/${btn.dataset.wall}`;
        });
      });
      /* Random */
      const rb = u.$('#randomHallBtn');
      if (rb) rb.addEventListener('click', () => {
        const { x: rx, y: ry } = lib.randomHallXY();
        location.hash = `#/x/${rx}/y/${ry}`;
      });
      /* Chat input */
      const input = u.$('#msgInput');
      const sendBtn = u.$('#msgSendBtn');
      function handleSend() {
        const val = (input.value || '').trim();
        if (!val) return;
        if (val === '/random' || val === '/r') {
          const { x: rx, y: ry } = lib.randomHallXY();
          location.hash = `#/x/${rx}/y/${ry}`;
          return;
        }
        /* Try to parse "x N y M" */
        const match = val.match(/x\s*(-?\d+)\s*y\s*(-?\d+)/i);
        if (match) {
          location.hash = `#/x/${match[1]}/y/${match[2]}`;
          return;
        }
        /* Otherwise search */
        location.hash = `#/search?q=${encodeURIComponent(val)}`;
      }
      if (sendBtn) sendBtn.addEventListener('click', handleSend);
      if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') handleSend(); });

      /* Scroll chat to bottom */
      const chat = u.$('#msgChat');
      if (chat) chat.scrollTop = chat.scrollHeight;

      /* Draw mini wander map — 2D trail with real coordinates */
      const miniMapCanvas = document.getElementById('wanderMiniMap');
      if (miniMapCanvas) {
        drawJourneyMap(miniMapCanvas);
      }
    },

    renderPage(route) {
      if (!route.pageNumber) return `<div class="msg-chat"><div class="msg msg-them"><div class="msg-bubble"><p>Страница не указана</p></div></div></div>`;

      const number = route.pageNumber;
      const coords = lib.numberToCoordinates(number);
      const xy = lib.coordinatesToXY(coords);

      /* Save history */
      try { store.pushHistory({ url: location.hash, title: lib.pageTitle(coords) }); } catch {}

      const pageNum = Number(coords.page);
      const totalPages = Number(ALG.pagesPerVolume);
      const prevPage = pageNum > 1
        ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum - 1)})
        : null;
      const nextPage = pageNum < totalPages
        ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum + 1)})
        : null;

      return `
      <section class="t-messenger page-view fade-in">
        <div class="msg-room-header">
          <a class="msg-back" href="#/x/${fmtXY(xy.x)}/y/${fmtXY(xy.y)}/w/${coords.wall}">← Зал</a>
          <div>
            <span class="msg-room-title">📖 Том ${coords.volume} · Лист ${pageNum}</span>
            <span class="msg-room-sub">Стена ${coords.wall} · Полка ${coords.shelf}</span>
          </div>
          <span class="msg-density" id="pageDensity"></span>
        </div>
        <div class="msg-chat" id="msgChat">
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Открываю том ${coords.volume}, лист ${pageNum} из ${totalPages}…</p>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
          <div id="pageContentSlot">
            <div class="msg msg-them">
              <div class="msg-avatar">📚</div>
              <div class="msg-bubble">
                <div class="babel-typing-dots"><span></span><span></span><span></span></div>
              </div>
            </div>
          </div>
          <div class="msg msg-them" id="pageNavMsg" style="display:none">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <div class="msg-page-nav">
                ${prevPage ? `<a class="msg-nav-link" href="${prevPage}">← Лист ${pageNum - 1}</a>` : ''}
                <span>Лист ${pageNum}/${totalPages}</span>
                ${nextPage ? `<a class="msg-nav-link" href="${nextPage}">Лист ${pageNum + 1} →</a>` : ''}
              </div>
              <div class="msg-page-actions">
                <button class="msg-act-btn" id="favBtn">★</button>
                <button class="msg-act-btn" id="copyTextBtn">📋</button>
                <button class="msg-act-btn" id="copyLinkBtn">🔗</button>
              </div>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
          <div class="msg msg-them" id="msgExploreMsg">
            <div class="msg-avatar">🧭</div>
            <div class="msg-bubble">
              <div class="msg-name">Навигатор</div>
              <div class="page-explore-bar" id="pageExploreBar">
                <button class="explore-back-btn" id="exploreBackBtn" style="display:none">← Назад</button>
                <button class="explore-next-btn" id="exploreNextBtn">🔍 Следующая обитаемая</button>
              </div>
              <div class="page-distance-map" id="pageDistanceMap">
                <canvas class="page-distance-canvas" id="pageDistanceCanvas" width="600" height="140"></canvas>
              </div>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
        </div>
      </section>`;
    },

    bindPage(route) {
      if (!route.pageNumber) return;
      const number = route.pageNumber;
      const coords = lib.numberToCoordinates(number);
      const highlight = lib.parseHighlight(route.params);

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
        store.pushJourneyStep(jx, jy, lib.classifyRegion(safeNum(jx), safeNum(jy)).kind);
      } catch {}

      const contentSlot = u.$('#pageContentSlot');
      const navMsg = u.$('#pageNavMsg');
      const densityEl = u.$('#pageDensity');
      const chat = u.$('#msgChat');

      /* Async page load via Worker */
      app.workerBridge.getPageData(String(number)).then(data => {
        const indices = data.indices;
        const pageCoords = { sector: BigInt(data.coords.sector), hall: BigInt(data.coords.hall), wall: BigInt(data.coords.wall), shelf: BigInt(data.coords.shelf), volume: BigInt(data.coords.volume), page: BigInt(data.coords.page) };
        const stats = charStats(indices);
        const fullText = u.indicesToString(indices);
        const highlightPhrase = highlight
          ? fullText.slice(highlight.start, highlight.start + highlight.length).trim()
          : '';
        const classification = lib.classifyPageText(fullText);

        /* Update density badge — show genre classification */
        if (densityEl) {
          densityEl.className = `msg-density ${stats.label === 'Читаемая' ? 'msg-d-read' : stats.label === 'Разреженная' ? 'msg-d-sparse' : 'msg-d-noise'}`;
          densityEl.textContent = `${classification.label} ${Math.round(classification.score * 100)}%`;
        }

        if (classification.kind === 'dialogue') {
          if (contentSlot) {
            contentSlot.innerHTML = renderDialoguePageThread(fullText, highlightPhrase);
          }
          if (navMsg) navMsg.style.display = '';
          if (chat) chat.scrollTop = 0;
          return;
        }

        /* Render page text as chat messages — \n is a line break
           INSIDE the bubble (like a real messenger), NOT a new post.
           Only split into separate bubbles if text exceeds ~2000 chars. */
        const MAX_BUBBLE = 2000;
        const bubbleChunks = [];
        if (fullText.length <= MAX_BUBBLE) {
          bubbleChunks.push(fullText);
        } else {
          /* Split at paragraph boundaries (\n\n) when possible */
          let remaining = fullText;
          while (remaining.length > 0) {
            if (remaining.length <= MAX_BUBBLE) {
              bubbleChunks.push(remaining);
              break;
            }
            /* Find a good split point near MAX_BUBBLE — prefer \n\n, then \n, then space */
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
            <div class="msg-avatar">${i === 0 ? '📖' : '📜'}</div>
            <div class="msg-bubble msg-bubble-page">
              <div class="msg-text">${escWithBR(b)}</div>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
        `).join('');

        if (contentSlot) contentSlot.innerHTML = bubblesHTML;
        if (navMsg) navMsg.style.display = '';
        if (chat) chat.scrollTop = chat.scrollHeight;
      }).catch(err => {
        if (contentSlot) contentSlot.innerHTML = `<div class="msg msg-them"><div class="msg-bubble"><p>Ошибка: ${u.esc(err.message)}</p></div></div>`;
      });

      const favBtn = u.$('#favBtn');
      if (favBtn) favBtn.addEventListener('click', () => {
        store.addFavorite({ url: location.hash, title: lib.pageTitle(coords) });
        favBtn.textContent = '★';
        favBtn.classList.add('msg-act-saved');
      });

      const copyBtn = u.$('#copyTextBtn');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        u.copyText(lib.numberToText(number), 'Скопировано');
      });

      const linkBtn = u.$('#copyLinkBtn');
      if (linkBtn) linkBtn.addEventListener('click', () => {
        u.copyText(location.href, 'Ссылка скопирована');
      });

      /* ---- Explore navigation (messenger style) ---- */
      const backBtn = u.$('#exploreBackBtn');
      const nextBtn = u.$('#exploreNextBtn');

      if (backBtn) {
        try {
          const history = store.readStore('babelHistory');
          if (history.length >= 2) {
            backBtn.style.display = '';
            backBtn.addEventListener('click', () => {
              const history2 = store.readStore('babelHistory');
              if (history2.length >= 2) {
                location.hash = history2[1].url;
              }
            });
          }
        } catch {}
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          nextBtn.disabled = true;
          nextBtn.textContent = '⏳ сканирую…';

          /* Collect text nodes from messenger bubble text for odometer */
          const bubbleTexts = u.$$('.msg-bubble-page .msg-text');
          const allTextNodes = [];
          bubbleTexts.forEach(el => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
            let n;
            while (n = walker.nextNode()) allTextNodes.push(n);
          });

          /* Start odometer animation on page text (runs until scan completes) */
          const anim = allTextNodes.length > 0
            ? startOdometerAnimation(allTextNodes, ALG.alphabet)
            : null;

          /* Start chunked scan — yields to UI between chunks */
          findNextInhabitedChunked(coords).then(dest => {
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

      /* Journey map for messenger page */
      const jmCanvas = document.getElementById('pageDistanceCanvas');
      if (jmCanvas) drawJourneyMap(jmCanvas);

      if (chat) chat.scrollTop = chat.scrollHeight;
    },

    renderSearch(route) {
      const q = route.params.get('q') || '';
      const normalizedQuery = q ? u.normalizeText(q) : '';
      const userMessageHTML = normalizedQuery ? `
          <div class="msg msg-us" id="searchUserMessage">
            <div class="msg-avatar">🙂</div>
            <div class="msg-bubble">
              <div class="msg-name">Ты</div>
              <p class="msg-text">${escWithBR(normalizedQuery)}</p>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>` : '';

      return `
      <section class="t-messenger search-view fade-in">
        <div class="msg-room-header">
          <a class="msg-back" href="#/">← Назад</a>
          <span class="msg-room-title">🔍 Каталог Мира</span>
        </div>
        <div class="msg-chat" id="msgChat">
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Любой текст уже существует в Вавилоне. Напиши фразу — и я покажу, в каких мирах она может находиться.</p>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>
          ${userMessageHTML}
          <div id="searchResultsSlot"></div>
        </div>
        <div class="msg-input-bar">
          <div class="msg-input-row">
            <textarea class="msg-input" id="msgSearchInput" placeholder="Что ищешь в бесконечности? Можно вставить emoji и абзацы." rows="4">${u.esc(q)}</textarea>
            <button class="msg-send-btn" id="msgSearchBtn">🔍</button>
          </div>
        </div>
      </section>`;
    },

    bindSearch(route) {
      const input = u.$('#msgSearchInput');
      const sendBtn = u.$('#msgSearchBtn');
      const resultsSlot = u.$('#searchResultsSlot');
      const chat = u.$('#msgChat');
      const q = route.params.get('q') || '';
      let isActive = true;
      let typingEl = null;
      let jokeTicker = null;
      const userMessage = u.$('#searchUserMessage');

      /* Genre definitions for multi-mode results */
      const GENRE_INFO = {
        empty:    { icon: '📄', label: 'На пустом листе',   desc: 'Фраза сама по себе, в тишине пустой страницы' },
        dialogue: { icon: '💬', label: 'В переписке',       desc: 'Фраза внутри чата — между репликами собеседников' },
        post:     { icon: '📱', label: 'В посте',           desc: 'Фраза в ленте — среди мыслей и тегов' },
        diary:    { icon: '📔', label: 'В дневнике',        desc: 'Фраза в личной записи — с датой и настроением' },
        log:      { icon: '⌨️', label: 'В логе',            desc: 'Фраза среди серверных записей и таймстемпов' },
        words:    { icon: '📖', label: 'Среди слов',        desc: 'Фраза в потоке слов — как на книжной полке' },
      };

      function doSearch() {
        const val = (input.value || '').trim();
        if (val) location.hash = `#/search?q=${encodeURIComponent(val)}`;
      }
      function keepUserMessageInView() {
        if (userMessage) {
          userMessage.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      }
      if (sendBtn) sendBtn.addEventListener('click', doSearch);
      if (input) {
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            doSearch();
          }
        });
      }

      /* Async search: if query exists, search across ALL modes */
      if (q && resultsSlot) {
        const cloud = u.describeSearchCloud(q);
        /* Show typing indicator */
        typingEl = app.workerBridge.showTyping(chat, 'Библиотекарь');
        /* Show jokes while waiting */
        jokeTicker = app.workerBridge.startJokeTicker(chat, { seedText: q });
        requestAnimationFrame(keepUserMessageInView);

        app.workerBridge.searchMultiMode(q).then(({ phrase, modes: resultsByMode }) => {
          if (!isActive) return;
          app.workerBridge.removeTyping(typingEl);
          jokeTicker.stop();

          const phraseEsc = u.esc(phrase);
          const countLine = cloud.exactCount
            ? `<p class="msg-search-count">Для этой фразы подходит ровно <strong>${u.esc(cloud.exactCount)}</strong> вариантов страниц.</p>`
            : `<p class="msg-search-count">Для этой фразы подходит <strong>${u.esc(cloud.formula)}</strong>, то есть <strong>${u.esc(cloud.binaryFormula)}</strong> вариантов. Это ${u.esc(cloud.scientific)} и примерно ${cloud.digits.toLocaleString('ru-RU')} цифр.</p>`;
          /* Librarian explains the multiplicity */
          let html = `
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Эта фраза — не адрес одной страницы. Это дверь в целое <strong>облако страниц</strong>.</p>
              <p>Она может быть в начале листа или в конце. Вокруг может быть пустота, случайный шум, переписка, дневник — и <em>каждый вариант</em> — это настоящая страница с собственным адресом в библиотеке.</p>
              ${countLine}
              <p>Я не могу показать их все — их слишком много. Но вот несколько входов в это множество:</p>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>`;

          /* Render one card per genre */
          const genreOrder = ['empty', 'dialogue', 'post', 'diary', 'log', 'words'];
          for (const mode of genreOrder) {
            const v = resultsByMode[mode];
            if (!v) continue;
            const gi = GENRE_INFO[mode];
            const vCoords = { sector: BigInt(v.coordinates.sector), hall: BigInt(v.coordinates.hall), wall: BigInt(v.coordinates.wall), shelf: BigInt(v.coordinates.shelf), volume: BigInt(v.coordinates.volume), page: BigInt(v.coordinates.page) };
            const vXY = { x: BigInt(v.xy.x), y: BigInt(v.xy.y) };
            const pageUrl = lib.coordsToPageUrl(vCoords, { hl: `${v.range.start}:${v.range.length}` });
            if (mode === 'dialogue') {
              const dialoguePreview = renderDialogueSearchPreview(v, pageUrl);
              if (dialoguePreview) {
                html += dialoguePreview;
                continue;
              }
            }
            const snippet = u.snippetByRange(v.text, v.range, 60);
            const snippetEsc = u.esc(snippet);
            const highlightedSnippet = snippetEsc.replace(phraseEsc, `<mark>${phraseEsc}</mark>`);
            html += `
            <div class="msg msg-them">
              <div class="msg-avatar">${gi.icon}</div>
              <div class="msg-bubble">
                <div class="msg-name">${gi.label}</div>
                <p class="msg-genre-desc">${gi.desc}</p>
                <div class="msg-search-snippet">${highlightedSnippet}</div>
                <div class="msg-search-coords">
                  <span>X:${fmtXY(vXY.x)}</span>
                  <span>Y:${fmtXY(vXY.y)}</span>
                  <span>Т.${vCoords.volume}</span>
                </div>
                <div class="msg-search-actions">
                  <a class="msg-qa" href="${pageUrl}">📖 Открыть</a>
                  <a class="msg-qa" href="#/x/${fmtXY(vXY.x)}/y/${fmtXY(vXY.y)}">🏛 Зал</a>
                </div>
                <span class="msg-time">${timeStr()}</span>
              </div>
            </div>`;
          }

          /* Closing message */
          html += `
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Каждый вариант — не подделка, а отдельная полная страница с собственным адресом. Одна фраза — множество страниц. Один результат — только один вход в это множество.</p>
              <details class="msg-details">
                <summary>Почему так много вариантов?</summary>
                <div class="msg-details-content">
                  <p>В библиотеке Вавилона любая фраза встречается не потому, что её кто-то написал, а потому что вокруг неё можно поставить огромное количество разных окружений.</p>
                  <p>Фраза может стоять в начале страницы, в середине или в конце. Вокруг неё может быть пустота, случайный шум, осмысленный текст, переписка, дневник или код.</p>
                  <p>Короткая фраза встречается не на одной странице, а в огромном облаке страниц. Чем фраза короче — тем больше это облако.</p>
                  <p>Поиск в этой библиотеке не отвечает «где эта фраза?». Он отвечает: <em>в каких мирах эта фраза может находиться?</em></p>
                </div>
              </details>
              <span class="msg-time">${timeStr()}</span>
            </div>
          </div>`;

          resultsSlot.innerHTML = html;
          keepUserMessageInView();
        }).catch(err => {
          if (!isActive) return;
          app.workerBridge.removeTyping(typingEl);
          jokeTicker.stop();
          resultsSlot.innerHTML = `<div class="msg msg-them"><div class="msg-bubble"><p>Ошибка: ${u.esc(err.message)}</p></div></div>`;
          keepUserMessageInView();
        });
      } else if (resultsSlot) {
        resultsSlot.innerHTML = `<div class="msg msg-them">
          <div class="msg-avatar">📚</div>
          <div class="msg-bubble">
            <div class="msg-name">Библиотекарь</div>
            <p>Напиши что-нибудь в поле ниже…</p>
            <span class="msg-time">${timeStr()}</span>
          </div>
        </div>`;
      }

      return function cleanupMessengerSearch() {
        isActive = false;
        if (typingEl) app.workerBridge.removeTyping(typingEl);
        if (jokeTicker) jokeTicker.stop();
      };
    },
  };

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
        const stats = charStats(data.indices);
        const snippet = pageSnippet(data.indices, 120);
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
          <a class="feed-story" href="#/random">
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
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'w') wall = parseInt(parts[i + 1]) || 1;
      }
      const hallInfo = lib.xyToHallXY(x, y);

      /* All books on current wall as feed posts */
      let posts = '';
      for (let v = 1; v <= Math.min(Number(ALG.volumesPerShelf), 16); v++) {
        const data = lib.getPageByXY(x, y, wall, 1, v, 1);
        const stats = charStats(data.indices);
        const snippet = pageSnippet(data.indices, 150);
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
      for (let i = 0; i < parts.length - 1; i += 2) {
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

    renderPage(route) { return sharedPageRender(route, 't-feed'); },
  };

  /* ═══════════════════════════════════════════════════════════
     THEME 5: TERMINAL
     ═══════════════════════════════════════════════════════════ */

  const terminalTheme = {
    renderHome() {
      return `
      <section class="t-terminal home fade-in">
        <div class="term-screen">
          <div class="term-titlebar">Вавилон v8.0 — Гексагональная Бесконечность</div>
          <div class="term-output" id="termOutput">
            <div class="term-line term-prompt">babel:// ~$ cat welcome.txt</div>
            <div class="term-line term-output-text">
              ╔══════════════════════════════════════════════════╗
              ║     В А В И Л О Н — Бесконечная Библиотека     ║
              ║     256 символов · 4096 на страницу            ║
              ║     2^32768 страниц во вселенной               ║
              ╚══════════════════════════════════════════════════╝
            </div>
            <div class="term-line term-output-text">
              Всё что когда-либо было или будет написано уже хранится здесь.<br>
              Дневник твоей смерти. Рецепт борща. Или просто шум.
            </div>
            <div class="term-line term-prompt">babel:// ~$ ls /залы/</div>
            <div class="term-line term-output-text">
              <a class="term-link" href="#/x/0/y/0">drwxr-x---  залы/</a>&nbsp;&nbsp;&nbsp;
              <a class="term-link" href="#/search">-rwxr-x---  каталог</a>&nbsp;&nbsp;&nbsp;
              <a class="term-link" href="#/about">-r--r-----  алгоритм</a>
            </div>
            <div class="term-line term-output-text">
              <br>Доступные команды:<br>
              &nbsp;&nbsp;<span class="term-cmd">help</span> — справка<br>
              &nbsp;&nbsp;<span class="term-cmd">go [направление]</span> — перейти в зал (сз/св/з/в/юз/юв)<br>
              &nbsp;&nbsp;<span class="term-cmd">search [текст]</span> — найти текст<br>
              &nbsp;&nbsp;<span class="term-cmd">random</span> — случайный зал<br>
              &nbsp;&nbsp;<span class="term-cmd">read [том]</span> — прочитать том (1-32)<br>
              &nbsp;&nbsp;<span class="term-cmd">wall [1-6]</span> — переключить стену
            </div>
          </div>
          <div class="term-input-row">
            <span class="term-prompt-label">babel:// ~$</span>
            <input type="text" class="term-input" id="termInput" autofocus autocomplete="off" spellcheck="false">
          </div>
        </div>
      </section>`;
    },

    bindHome() {
      const input = u.$('#termInput');
      const output = u.$('#termOutput');
      if (!input || !output) return;

      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const val = input.value.trim();
        input.value = '';
        if (!val) return;

        /* Echo command */
        output.innerHTML += `<div class="term-line term-prompt">babel:// ~$ ${u.esc(val)}</div>`;

        /* Parse */
        const cmd = val.toLowerCase().split(/\s+/);
        let response = '';

        if (cmd[0] === 'help') {
          response = 'go [сз/св/з/в/юз/юв] · search [текст] · random · read [1-32] · wall [1-6]';
        } else if (cmd[0] === 'random') {
          const { x, y } = lib.randomHallXY();
          location.hash = `#/x/${x}/y/${y}`;
          return;
        } else if (cmd[0] === 'search' && cmd[1]) {
          location.hash = `#/search?q=${encodeURIComponent(val.slice(val.indexOf(' ') + 1))}`;
          return;
        } else if (cmd[0] === 'go') {
          const dirMap = { 'сз': [0,-1], 'св': [1,-1], 'з': [-1,0], 'в': [1,0], 'юз': [-1,1], 'юв': [0,1] };
          const d = dirMap[cmd[1]];
          if (d) { location.hash = `#/x/${d[0]}/y/${d[1]}`; return; }
          response = 'Неизвестное направление. Используй: сз св з в юз юв';
        } else {
          response = `Команда не найдена: ${u.esc(cmd[0])}. Набери help для справки.`;
        }

        output.innerHTML += `<div class="term-line term-output-text">${response}</div>`;
        output.scrollTop = output.scrollHeight;
      });
    },

    renderWander(route) {
      const parts = route.parts;
      let x = 0, y = 0, wall = 1;
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'w') wall = parseInt(parts[i + 1]) || 1;
      }
      const hallInfo = lib.xyToHallXY(x, y);

      /* ASCII hex map */
      const mapLines = [];
      const dirs = [
        { dq: 0, dr: -1, label: 'СЗ' },
        { dq: 1, dr: -1, label: 'СВ' },
        { dq: -1, dr: 0, label: 'З' },
        { dq: 1, dr: 0, label: 'В' },
        { dq: -1, dr: 1, label: 'ЮЗ' },
        { dq: 0, dr: 1, label: 'ЮВ' },
      ];

      mapLines.push('       ┌───┐');
      mapLines.push('      / СЗ \\');
      mapLines.push('  ┌───┐     ┌───┐');
      mapLines.push(' / З  \\ ⬡  / СВ \\');
      mapLines.push('│     │ X:'+x+' │     │');
      mapLines.push(' \\ ЮЗ /  Y:'+y+' \\  В /');
      mapLines.push('  └───┘     └───┘');
      mapLines.push('      \\ ЮВ /');
      mapLines.push('       └───┘');

      /* Book listing */
      let bookList = '';
      for (let v = 1; v <= Math.min(Number(ALG.volumesPerShelf), 10); v++) {
        const spineText = lib.getBookSpine(x, y, wall, 1, v);
        const stats = charStats(lib.numberToIndices(lib.coordinatesToNumber(lib.xyToCoordinates(x, y, wall, 1, v, 1))));
        const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(x, y, wall, 1, v, 1));
        const label = spineText ? u.esc(spineText.slice(0, 30)) : '(пусто)';
        bookList += `<a class="term-link" href="${pageUrl}">Том ${v}</a> [${stats.label}] ${label}<br>`;
      }

      return `
      <section class="t-terminal wander fade-in">
        <div class="term-screen">
          <div class="term-titlebar">babel:// залы/x:${x}/y:${y}/стена:${wall}</div>
          <div class="term-output" id="termOutput">
            <div class="term-line term-output-text">
<pre class="term-ascii-map">${mapLines.join('\n')}</pre>
            </div>
            <div class="term-line term-output-text">
Сектор ${hallInfo.sector} · Зал ${hallInfo.hall} · Стена ${wall}<br>
${lib.classifyRegion(x, y).icon} ${lib.classifyRegion(x, y).label}<br>
Полка 1 — ${Math.min(Number(ALG.volumesPerShelf), 10)} из ${ALG.volumesPerShelf} томов:<br><br>
${bookList}
            </div>
            <div class="term-line term-output-text">
Направления: ${dirs.map(d => `<span class="term-cmd term-dir" data-dq="${d.dq}" data-dr="${d.dr}">${d.label}</span>`).join(' · ')}
            </div>
          </div>
          <div class="term-input-row">
            <span class="term-prompt-label">babel:// з:${x},${y} $</span>
            <input type="text" class="term-input" id="termInput" autofocus autocomplete="off" spellcheck="false">
          </div>
        </div>
      </section>`;
    },

    bindWander(route) {
      const parts = route.parts;
      let x = 0, y = 0, wall = 1;
      for (let i = 0; i < parts.length - 1; i += 2) {
        if (parts[i] === 'x') x = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'y') y = parseInt(parts[i + 1]) || 0;
        if (parts[i] === 'w') wall = parseInt(parts[i + 1]) || 1;
      }
      store.pushJourneyStep(x, y, lib.classifyRegion(x, y).kind);

      /* Direction links */
      u.$$('.term-dir[data-dq]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const dq = parseInt(el.dataset.dq), dr = parseInt(el.dataset.dr);
          location.hash = `#/x/${x + dq}/y/${y + dr}`;
        });
      });

      /* Terminal input */
      const input = u.$('#termInput');
      const output = u.$('#termOutput');
      if (!input || !output) return;

      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const val = input.value.trim();
        input.value = '';
        if (!val) return;

        output.innerHTML += `<div class="term-line term-prompt">babel:// з:${x},${y} $ ${u.esc(val)}</div>`;

        const cmd = val.toLowerCase().split(/\s+/);
        if (cmd[0] === 'random') {
          const { x: rx, y: ry } = lib.randomHallXY();
          location.hash = `#/x/${rx}/y/${ry}`;
          return;
        }
        if (cmd[0] === 'go') {
          const dirMap = { 'сз': [0,-1], 'св': [1,-1], 'з': [-1,0], 'в': [1,0], 'юз': [-1,1], 'юв': [0,1] };
          const d = dirMap[cmd[1]];
          if (d) { location.hash = `#/x/${x + d[0]}/y/${y + d[1]}`; return; }
        }
        if (cmd[0] === 'wall' && cmd[1]) {
          const w = parseInt(cmd[1]);
          if (w >= 1 && w <= 6) { location.hash = `#/x/${x}/y/${y}/w/${w}`; return; }
        }
        if (cmd[0] === 'search') {
          location.hash = `#/search?q=${encodeURIComponent(val.slice(val.indexOf(' ') + 1))}`;
          return;
        }
        output.innerHTML += `<div class="term-line term-output-text">Неизвестная команда. Набери: go [направление] · wall [1-6] · random · search [текст]</div>`;
        output.scrollTop = output.scrollHeight;
      });
    },

    renderPage(route) {
      if (!route.pageNumber) return `<div class="term-screen"><div class="term-output"><div class="term-line term-output-text">Страница не указана</div></div></div>`;
      let number;
      try { number = route.pageNumber; } catch {
        return `<div class="term-screen"><div class="term-output"><div class="term-line term-output-text">Неверный адрес</div></div></div>`;
      }
      const indices = lib.numberToIndices(number);
      const text = u.indicesToString(indices);
      const coords = lib.numberToCoordinates(number);
      const stats = charStats(indices);
      const xy = lib.coordinatesToXY(coords);

      try { store.pushHistory({ url: location.hash, title: lib.pageTitle(coords) }); } catch {}

      const pageNum = Number(coords.page);
      const totalPages = Number(ALG.pagesPerVolume);
      const prevUrl = pageNum > 1 ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum - 1)}) : null;
      const nextUrl = pageNum < totalPages ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum + 1)}) : null;

      /* Show text in terminal style */
      const lines = text.split('\n');
      const lineHTML = lines.map(l => u.esc(l) || '&nbsp;').join('<br>');

      return `
      <section class="t-terminal page-view fade-in">
        <div class="term-screen">
          <div class="term-titlebar">babel:// том:${coords.volume}/лист:${pageNum}</div>
          <div class="term-output" id="termOutput">
            <div class="term-line term-output-text">
Зал X:${fmtXY(xy.x)} Y:${fmtXY(xy.y)} · Стена ${coords.wall} · Полка ${coords.shelf} · Том ${coords.volume} · Лист ${pageNum}/${totalPages} · ${stats.label} ${stats.readability}%
            </div>
            <div class="term-line term-separator">────────────────────────────────────────</div>
            <div class="term-line term-page-text">${lineHTML}</div>
            <div class="term-line term-separator">────────────────────────────────────────</div>
            <div class="term-line term-output-text">
              ${prevUrl ? `<a class="term-link" href="${prevUrl}">← Лист ${pageNum - 1}</a> · ` : ''}
              Лист ${pageNum}/${totalPages}
              ${nextUrl ? ` · <a class="term-link" href="${nextUrl}">Лист ${pageNum + 1} →</a>` : ''}
            </div>
            <div class="term-line term-output-text">
              <span class="term-cmd" id="termFav">★</span> избранное ·
              <span class="term-cmd" id="termCopy">📋</span> копировать ·
              <span class="term-cmd" id="termLink">🔗</span> ссылка ·
              <a class="term-link" href="#/x/${fmtXY(xy.x)}/y/${fmtXY(xy.y)}/w/${coords.wall}">зал</a>
            </div>
            <div class="term-line term-separator">────────────────────────────────────────</div>
            <div class="term-line term-output-text">
              <span class="term-cmd" id="termExploreBack" style="display:none">← назад</span>
              <span class="term-cmd" id="termExploreNext">🔍 следующая обитаемая</span>
            </div>
            <div class="page-distance-map" id="pageDistanceMap">
              <canvas class="page-distance-canvas" id="pageDistanceCanvas" width="600" height="140"></canvas>
            </div>
          </div>
        </div>
      </section>`;
    },

    bindPage(route) {
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
        store.pushJourneyStep(jx, jy, lib.classifyRegion(safeNum(jx), safeNum(jy)).kind);
      } catch {}

      const favBtn = u.$('#termFav');
      if (favBtn) favBtn.addEventListener('click', () => {
        store.addFavorite({ url: location.hash, title: lib.pageTitle(coords) });
        favBtn.textContent = '★ (сохранено)';
      });
      const copyBtn = u.$('#termCopy');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        u.copyText(lib.numberToText(number), 'Скопировано');
      });
      const linkBtn = u.$('#termLink');
      if (linkBtn) linkBtn.addEventListener('click', () => {
        u.copyText(location.href, 'Ссылка скопирована');
      });

      /* ---- Explore navigation (terminal style) ---- */
      const backCmd = u.$('#termExploreBack');
      const nextCmd = u.$('#termExploreNext');

      if (backCmd) {
        try {
          const history = store.readStore('babelHistory');
          if (history.length >= 2) {
            backCmd.style.display = '';
            backCmd.addEventListener('click', () => {
              const history2 = store.readStore('babelHistory');
              if (history2.length >= 2) location.hash = history2[1].url;
            });
          }
        } catch {}
      }

      if (nextCmd) {
        nextCmd.addEventListener('click', () => {
          nextCmd.style.pointerEvents = 'none';
          nextCmd.textContent = '⏳ сканирую…';

          /* Collect text nodes from terminal page text for odometer */
          const pageTextEl = u.$('.term-page-text');
          const textNodes = [];
          if (pageTextEl) {
            const walker = document.createTreeWalker(pageTextEl, NodeFilter.SHOW_TEXT, null);
            let n;
            while (n = walker.nextNode()) textNodes.push(n);
          }

          /* Start odometer animation (runs until scan completes) */
          const anim = textNodes.length > 0
            ? startOdometerAnimation(textNodes, ALG.alphabet)
            : null;

          /* Start chunked scan — yields to UI between chunks */
          findNextInhabitedChunked(coords).then(dest => {
            if (anim) anim.cancel();
            if (!dest) { nextCmd.style.pointerEvents = ''; nextCmd.textContent = '🔍 next inhabited'; return; }
            const destUrl = dest.range
              ? lib.coordsToPageUrl(dest.coordinates, { hl: `${dest.range.start}:${dest.range.length}` })
              : lib.coordsToPageUrl(dest.coordinates);
            location.hash = destUrl;
          }).catch(() => {
            if (anim) anim.cancel();
            nextCmd.style.pointerEvents = '';
            nextCmd.textContent = '🔍 next inhabited';
          });
        });
      }

      /* Journey map for terminal page */
      const jmCanvas = document.getElementById('pageDistanceCanvas');
      if (jmCanvas) drawJourneyMap(jmCanvas);
    },

    renderSearch(route) {
      const q = route.params.get('q') || '';
      const mode = route.params.get('mode') || 'empty';

      let resultsHTML = '';
      if (q) {
        try {
          const variants = lib.createSearchVariants(q, mode, 6);
          resultsHTML = variants.map(v => {
            const snippet = u.snippetByRange(v.text, v.range, 50);
            const highlighted = u.esc(snippet).replace(u.esc(v.phrase), `<mark>${u.esc(v.phrase)}</mark>`);
            const pageUrl = lib.coordsToPageUrl(v.coordinates, { hl: `${v.range.start}:${v.range.length}` });
            return `<div class="term-line term-output-text">
[${v.variant}] <a class="term-link" href="${pageUrl}">X:${fmtXY(v.xy.x)} Y:${fmtXY(v.xy.y)} Т.${v.coordinates.volume}</a>
${highlighted}
</div>`;
          }).join('');
        } catch (err) {
          resultsHTML = `<div class="term-line term-output-text">ОШИБКА: ${u.esc(err.message)}</div>`;
        }
      }

      return `
      <section class="t-terminal search-view fade-in">
        <div class="term-screen">
          <div class="term-titlebar">babel:// каталог</div>
          <div class="term-output" id="termOutput">
            <div class="term-line term-output-text">Поиск по всем 2^32768 страницам…</div>
            ${resultsHTML}
            ${!q ? `<div class="term-line term-output-text">Набери: search [текст]</div>` : ''}
          </div>
          <div class="term-input-row">
            <span class="term-prompt-label">babel:// search$</span>
            <input type="text" class="term-input" id="termInput" value="${u.esc(q)}" autofocus autocomplete="off" spellcheck="false">
          </div>
        </div>
      </section>`;
    },

    bindSearch(route) {
      const input = u.$('#termInput');
      if (!input) return;
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const val = input.value.trim();
        if (val) location.hash = `#/search?q=${encodeURIComponent(val)}`;
      });
    },
  };

  /* ═══════════════════════════════════════════════════════════
     SHARED PAGE RENDER (for themes that don't override)
     ═══════════════════════════════════════════════════════════ */

  function sharedPageRender(route, themeClass) {
    if (!route.pageNumber) return `<div class="${themeClass}"><div class="notice">Страница не указана</div></div>`;

    let number;
    try { number = route.pageNumber; } catch {
      return `<div class="${themeClass}"><div class="notice">Неверный адрес страницы</div></div>`;
    }

    const indices = lib.numberToIndices(number);
    const coords = lib.numberToCoordinates(number);
    const xy = lib.coordinatesToXY(coords);
    const highlight = lib.parseHighlight(route.params);
    const pageTextHTML = u.renderPageFromIndices(indices, highlight);
    const stats = charStats(indices);
    const b36 = lib.prettyBase36(number);

    const pageNum = Number(coords.page);
    const totalPages = Number(ALG.pagesPerVolume);
    const prevPage = pageNum > 1
      ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum - 1)})
      : null;
    const nextPage = pageNum < totalPages
      ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum + 1)})
      : null;

    try { store.pushHistory({ url: location.hash, title: lib.pageTitle(coords) }); } catch {}

    /* Fingerprint */
    const fingerprintColors = [];
    for (let i = 0; i < 64; i++) {
      const idx = indices[i] || 0;
      const h = (idx * 29 + i * 7) % 360;
      const s = 50 + (idx % 40);
      const l = 30 + (idx % 30);
      fingerprintColors.push(`hsl(${h},${s}%,${l}%)`);
    }
    const fpHTML = fingerprintColors.map(c => `<span class="fp-cell" style="background:${c}"></span>`).join('');

    return `
    <section class="${themeClass} page-view fade-in">
      <div class="page-breadcrumbs">
        <a href="#/">Вавилон</a><span class="sep">›</span>
        <a href="#/x/${fmtXY(xy.x)}/y/${fmtXY(xy.y)}/w/${coords.wall}">Зал X:${fmtXY(xy.x)} Y:${fmtXY(xy.y)}</a><span class="sep">›</span>
        <span>Том ${coords.volume} · Лист ${pageNum}</span>
      </div>

      <div class="page-header">
        <div>
          <h2>Том ${coords.volume} · Лист ${pageNum}</h2>
          <span class="page-header-sub">Полка ${coords.shelf} · Стена ${coords.wall} из 6</span>
        </div>
        <div class="page-density">
          <span class="density-badge density-${stats.label === 'Читаемая' ? 'readable' : stats.label === 'Разреженная' ? 'sparse' : 'noise'}">${stats.label}</span>
          <span class="density-pct">${stats.readability}%</span>
        </div>
      </div>

      <div class="page-nav">
        ${prevPage ? `<a class="btn-outline" href="${prevPage}">← Лист ${pageNum - 1}</a>` : '<span></span>'}
        <span class="page-num">Лист ${pageNum} из ${totalPages}</span>
        ${nextPage ? `<a class="btn-outline" href="${nextPage}">Лист ${pageNum + 1} →</a>` : '<span></span>'}
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
      store.pushJourneyStep(jx, jy, lib.classifyRegion(safeNum(jx), safeNum(jy)).kind);
    } catch {}

    const favBtn = u.$('#favBtn');
    if (favBtn) favBtn.addEventListener('click', () => {
      store.addFavorite({ url: location.hash, title: lib.pageTitle(coords) });
      favBtn.textContent = '★ Сохранено';
      favBtn.disabled = true;
    });
    const copyBtn = u.$('#copyTextBtn');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      u.copyText(lib.numberToText(number), 'Текст скопирован');
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
            /* second-to-last = the page before current */
            if (history2.length >= 2) {
              location.hash = history2[1].url;
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
          ? startOdometerAnimation(textNodes, ALG.alphabet)
          : null;

        /* Start chunked scan — yields to UI between chunks */
        findNextInhabitedChunked(coords).then(dest => {
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
    if (jmCanvas) drawJourneyMap(jmCanvas);
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
    const h = rect.height;

    const visited = store.getVisitedCoords();
    if (visited.length === 0) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#4e5c6e';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Пока нет посещённых залов', w / 2, h / 2);
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Начните блуждать по залам, чтобы они появились на карте', w / 2, h / 2 + 24);
      return;
    }

    /* Filter out entries with invalid coords and convert to numbers */
    const pts = visited
      .map(v => ({ x: safeNum(v.x), y: safeNum(v.y) }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (pts.length === 0) {
      ctx.fillStyle = '#4e5c6e';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Нет валидных координат', w / 2, h / 2);
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
    const hexSize = Math.min(w / (rangeX * 1.5 + 1), h / (rangeY * 1.73 + 1), 28);
    const hexW = hexSize * 2;
    const hexH = hexSize * 1.73;

    /* Offset to center */
    const totalW = rangeX * hexW * 0.75 + hexW * 0.25;
    const totalH = rangeY * hexH + hexH * 0.5;
    const offsetX = (w - totalW) / 2;
    const offsetY = (h - totalH) / 2;

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
            <div class="msg-text">${escWithBR(b)}</div>
            <span class="msg-time">${timeStr()}</span>
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
      const wanderUrl = `#/x/${fmtXY(vXY.x)}/y/${fmtXY(vXY.y)}`;

      contentHTML = `
      <div class="msg msg-them">
        <div class="msg-avatar">📚</div>
        <div class="msg-bubble">
          <div class="msg-name">Библиотекарь</div>
          <p>Вот обитаемая страница шага ${step}. Фраза: «${u.esc(pageData.phrase)}»</p>
          <div class="genre-coords">
            <span class="coord-pill">X: ${fmtXY(vXY.x)}</span>
            <span class="coord-pill">Y: ${fmtXY(vXY.y)}</span>
            <span class="coord-pill">Том ${vCoords.volume}</span>
            <span class="coord-pill">Лист ${vCoords.page}</span>
          </div>
          <div class="genre-page-actions">
            <a class="msg-qa" href="${pageUrl}">📖 Телепортироваться</a>
            <a class="msg-qa" href="${wanderUrl}">🏛 Перейти в зал</a>
          </div>
          <span class="msg-time">${timeStr()}</span>
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
            <span class="msg-time">${timeStr()}</span>
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

  function getThemeRenderer() {
    const id = getTheme();
    return themeRegistry[id] || themeRegistry[DEFAULT_THEME];
  }

  /* Theme picker HTML */
  function renderThemePicker() {
    const current = getTheme();
    return `<div class="theme-picker" id="themePicker">
      <button class="theme-picker-toggle" id="themePickerToggle" title="Сменить тему">${THEMES[current].icon} ${THEMES[current].name}</button>
      <div class="theme-picker-dropdown" id="themePickerDropdown">
        ${Object.values(THEMES).map(t => `
          <button class="theme-picker-option ${t.id === current ? 'active' : ''}" data-theme="${t.id}">
            <span class="tp-icon">${t.icon}</span>
            <span class="tp-name">${t.name}</span>
            <span class="tp-desc">${t.desc}</span>
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

    /* Close on outside click */
    document.addEventListener('click', e => {
      if (!e.target.closest('.theme-picker')) {
        dropdown.classList.remove('open');
      }
    });

    u.$$('.theme-picker-option[data-theme]').forEach(btn => {
      btn.addEventListener('click', () => {
        setTheme(btn.dataset.theme);
        dropdown.classList.remove('open');
        /* Re-render current view */
        window.dispatchEvent(new Event('hashchange'));
      });
    });
  }

  app.themes = {
    THEMES,
    DEFAULT_THEME,
    getTheme,
    setTheme,
    getThemeRenderer,
    renderThemePicker,
    bindThemePicker,
    fmtXY,
    fmtCoord,
    charStats,
    pageSnippet,
    sharedPageRender,
    bindSharedPage,
    timeStr,
    /* Reusable mini-map hex drawing for wander views */
    drawMiniHex,
    /* Journey map timeline visualization */
    drawJourneyMap,
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
})();
