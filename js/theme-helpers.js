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

  /* ─── Library mode: "human" (prefix codec) vs "random" (byte-level) ─── */
  const LIBRARY_MODES = {
    human: {
      id: 'human',
      name: 'Человечная',
      icon: '📖',
      desc: 'Язык искажает пространство шума — страницы у начала координат читаемые',
    },
    random: {
      id: 'random',
      name: 'Случайная',
      icon: '🎲',
      desc: 'Чистый хаос — каждая страница равномерно случайна',
    },
  };
  const DEFAULT_LIBRARY_MODE = 'human';

  function getLibraryMode() {
    try { return localStorage.getItem('babelLibraryMode') || DEFAULT_LIBRARY_MODE; }
    catch { return DEFAULT_LIBRARY_MODE; }
  }

  function setLibraryMode(mode) {
    if (!LIBRARY_MODES[mode]) return;
    try { localStorage.setItem('babelLibraryMode', mode); } catch {}
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
     Uses the PREFIX CODEC to find a real page with readable content.
     The page the user sees is the SAME page that was found — no mismatch.

     Strategy:
       1. Pick a genre based on nearby hex regions
       2. Use generateInhabitedPage() which encodes a random phrase
          through the prefix codec, guaranteeing the phrase exists
          on the decoded page
       3. Navigate to the resulting coordinates — the prefix codec
          will decode the same content that was verified */
  function findNextInhabitedChunked(coords) {
    return new Promise((resolve, reject) => {
      try {
        const currentX = Number(coords.x || 0);
        const currentY = Number(coords.y || 0);

        /* Step 1: determine genre from nearby region */
        const nearby = lib.scanInhabitedNearby(currentX, currentY, 3);
        let genre;

        if (nearby.length > 0) {
          const pick = nearby[Math.floor(Math.random() * nearby.length)];
          genre = pick.genre.kind;
        } else {
          /* Fallback: pick a random non-noise genre */
          const nonNoise = lib.REGION_GENRES.filter(g => g.kind !== 'noise');
          genre = nonNoise[Math.floor(Math.random() * nonNoise.length)].kind;
        }

        /* Step 2: use generateInhabitedPage() which goes through
           the prefix codec. This guarantees the resulting page
           actually contains readable text when decoded. */
        const step = Date.now();
        const result = lib.generateInhabitedPage(genre, step);

        if (!result) {
          reject(new Error('Не удалось найти обитаемую страницу'));
          return;
        }

        /* Classify the ACTUAL decoded text for accurate genre label */
        const detection = lib.classifyPageByText(result.text);

        resolve({
          number: result.number,
          coords: result.coordinates,
          coordinates: result.coordinates,
          xy: result.xy,
          text: result.text,
          phrase: result.phrase,
          range: result.range,
          detection: { score: detection.score || 0.7, kind: detection.kind || genre, label: detection.label || genre },
          scanned: 1,
          offset: 1,
          regionGenre: { kind: detection.kind || genre, label: detection.label || genre, icon: detection.icon || '📖' },
          scanDistance: 1,
        });
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

  /* Character stats from text string (for token-decoded pages) */
  function textToCharStats(text) {
    let s = { cyrillic: 0, latin: 0, spaces: 0, digits: 0, punctuation: 0, emoji: 0 };
    for (const ch of String(text)) {
      if (ch === ' ') s.spaces++;
      else if (ch === '\n') s.spaces++;
      else if (/[а-яё]/i.test(ch)) s.cyrillic++;
      else if (/[a-z]/i.test(ch)) s.latin++;
      else if (/[0-9]/.test(ch)) s.digits++;
      else if (/[.,!?;:—\-""()…@#_/*=+\[\]{}<>~`^|\\&%$']/.test(ch)) s.punctuation++;
      else s.emoji++;
    }
    const total = String(text).length;
    const letters = s.cyrillic + s.latin;
    const readability = total > 0 ? Math.round(letters / total * 100) : 0;
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
     EXPORT HELPERS TO app.themes._helpers
     ═══════════════════════════════════════════════════════════ */

  app.themes = app.themes || {};
  app.themes._helpers = {
    THEMES,
    DEFAULT_THEME,
    getTheme,
    setTheme,
    LIBRARY_MODES,
    getLibraryMode,
    setLibraryMode,
    fmtXY,
    fmtCoord,
    escWithBR,
    timeStr,
    TELEGRAM_NAME_COLORS,
    telegramAvatarLetter,
    telegramNameColor,
    startOdometerAnimation,
    findNextInhabitedChunked,
    highlightSearchText,
    parseTelegramDialogue,
    renderDialogueSearchPreview,
    renderDialoguePageThread,
    charStats,
    textToCharStats,
    pageSnippet,
    drawMiniHex,
    safeNum,
    drawJourneyMap,
  };
})();
