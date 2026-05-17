(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;
  const h = app.themes._helpers;

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
              <span class="msg-time">${h.timeStr()}</span>
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
              <span class="msg-time">${h.timeStr()}</span>
            </div>
          </div>
        </div>
      </section>`;
    },

    renderWander(route) {
      const parts = route.parts;
      let x = '0', y = '0';
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parts[i + 1];
        if (parts[i] === 'y') y = parts[i + 1];
      }
      const nx = Number(x) || 0, ny = Number(y) || 0;
      const hallInfo = lib.xyToHallXY(nx, ny);

      /* Build chat messages showing the room content */
      const messages = [];

      /* Librarian greets you */
      messages.push({
        type: 'them',
        name: 'Библиотекарь',
        avatar: '📚',
        text: `Ты в зале <strong>X:${x} Y:${y}</strong>. Сектор ${hallInfo.sector}, зал ${hallInfo.hall}. 10 книг на полке.`,
        time: h.timeStr(),
      });

      /* Show book spines as message */
      const spines = [];
      for (let z = 1; z <= 10; z++) {
        const spineText = lib.getBookSpine(nx, ny, z);
        const cls = lib.classifySpine(spineText);
        const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(nx, ny, z));
        if (cls === 'text') {
          spines.push(`<a class="msg-book-link" href="${pageUrl}">📖 Том ${z}: ${u.esc(spineText.slice(0, 30))}</a>`);
        } else if (cls === 'noise') {
          spines.push(`<a class="msg-book-link msg-book-noise" href="${pageUrl}">📕 Том ${z}: шум</a>`);
        } else {
          spines.push(`<a class="msg-book-link msg-book-empty" href="${pageUrl}">📄 Том ${z}: пусто</a>`);
        }
      }
      messages.push({
        type: 'them',
        name: 'Библиотекарь',
        avatar: '📚',
        text: spines.join('<br>'),
        time: h.timeStr(),
      });

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
          <a class="genre-badge" href="#/atlas" style="color:${lib.GENRE_COLORS[lib.classifyRegion(nx, ny).kind]};border-color:${lib.GENRE_COLORS[lib.classifyRegion(nx, ny).kind]}40;background:${lib.GENRE_COLORS[lib.classifyRegion(nx, ny).kind]}15">${lib.classifyRegion(nx, ny).icon} ${lib.classifyRegion(nx, ny).label}</a>
          <span class="msg-room-sub">Сектор ${hallInfo.sector}</span>
        </div>
        <div class="msg-chat" id="msgChat">
          ${chatHTML}
          <div class="msg msg-them">
            <div class="msg-avatar">📚</div>
            <div class="msg-bubble">
              <div class="msg-name">Библиотекарь</div>
              <p>Куда идём? Выбери направление:</p>
              <div class="msg-nav-row">${navHTML}</div>
              <span class="msg-time">${h.timeStr()}</span>
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
              <span class="msg-time">${h.timeStr()}</span>
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
      let x = '0', y = '0';
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parts[i + 1];
        if (parts[i] === 'y') y = parts[i + 1];
      }
      const nx = Number(x) || 0, ny = Number(y) || 0;
      /* Track visit on wander map */
      store.pushWanderVisit(nx, ny);
      store.pushJourneyStep(nx, ny, lib.classifyRegion(nx, ny).kind);
      /* Navigation buttons */
      u.$$('.msg-nav-btn[data-dq]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dq = parseInt(btn.dataset.dq), dr = parseInt(btn.dataset.dr);
          location.hash = `#/x/${nx + dq}/y/${ny + dr}`;
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
        h.drawJourneyMap(miniMapCanvas);
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
          <a class="msg-back" href="#/x/${h.fmtXY(xy.x)}/y/${h.fmtXY(xy.y)}/w/${coords.wall}">← Зал</a>
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
              <span class="msg-time">${h.timeStr()}</span>
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
              <span class="msg-time">${h.timeStr()}</span>
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
              <span class="msg-time">${h.timeStr()}</span>
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
        store.pushJourneyStep(jx, jy, lib.classifyRegion(h.safeNum(jx), h.safeNum(jy)).kind);
      } catch {}

      const xy = lib.coordinatesToXY(coords);

      const contentSlot = u.$('#pageContentSlot');
      const navMsg = u.$('#pageNavMsg');
      const densityEl = u.$('#pageDensity');
      const chat = u.$('#msgChat');

      /* Async page load via Prefix Codec Worker */
      /* Use engine from URL if specified (from search results), otherwise use current library mode */
      const urlEngine = lib.getEngineFromUrl(route.params);
      const libraryMode = urlEngine || h.getLibraryMode();
      app.workerBridge.getPrefixPageData(
        String(xy.x), String(xy.y), String(coords.z), libraryMode
      ).then(data => {
        const fullText = data.text;
        const classification = data.classification || lib.classifyPageText(fullText);
        const highlightPhrase = highlight
          ? fullText.slice(highlight.start, highlight.start + highlight.length).trim()
          : '';

        /* Update density badge — show genre classification */
        if (densityEl) {
          densityEl.className = `msg-density ${classification.kind === 'text' || classification.kind === 'dialogue' ? 'msg-d-read' : classification.kind === 'sparse' ? 'msg-d-sparse' : 'msg-d-noise'}`;
          densityEl.textContent = `${classification.label} ${Math.round((classification.score || 0) * 100)}%`;
        }

        if (classification.kind === 'dialogue') {
          if (contentSlot) {
            contentSlot.innerHTML = h.renderDialoguePageThread(fullText, highlightPhrase);
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
              <div class="msg-text">${h.escWithBR(b)}</div>
              <span class="msg-time">${h.timeStr()}</span>
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
        /* Copy prefix-decoded text if available */
        const bubbleTexts = u.$$('.msg-bubble-page .msg-text');
        const allText = bubbleTexts.length > 0
          ? Array.from(bubbleTexts).map(el => el.textContent).join('')
          : lib.numberToText(number);
        u.copyText(allText, 'Скопировано');
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
            ? h.startOdometerAnimation(allTextNodes, ALG.alphabet)
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

      /* Journey map for messenger page */
      const jmCanvas = document.getElementById('pageDistanceCanvas');
      if (jmCanvas) h.drawJourneyMap(jmCanvas);

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
              <p class="msg-text">${h.escWithBR(normalizedQuery)}</p>
              <span class="msg-time">${h.timeStr()}</span>
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
              <span class="msg-time">${h.timeStr()}</span>
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
        prefix:   { icon: '✅', label: 'Проверенная страница', desc: 'Фраза точно на этой странице — проверено через префиксный кодек' },
        empty:    { icon: '📄', label: 'На пустом листе',   desc: 'Фраза сама по себе, в тишине пустой страницы' },
        dialogue: { icon: '💬', label: 'В переписке',       desc: 'Фраза внутри чата — между репликами собеседников' },
        post:     { icon: '📱', label: 'В посте',           desc: 'Фраза в ленте — среди мыслей и тегов' },
        diary:    { icon: '📔', label: 'В дневнике',        desc: 'Фраза в личной записи — с датой и настроением' },
        log:      { icon: '⌨️', label: 'В логе',            desc: 'Фраза среди серверных записей и таймстемпов' },
        words:    { icon: '📖', label: 'Среди слов',        desc: 'Фраза в потоке слов — как на книжной полке' },
      };

      function doSearch() {
        const val = (input.value || '').trim();
        if (val) {
          store.pushSearchHistory(val);
          location.hash = `#/search?q=${encodeURIComponent(val)}`;
        }
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
              <span class="msg-time">${h.timeStr()}</span>
            </div>
          </div>`;

          /* Render one card per genre — order depends on library mode */
          const currentLibMode = h.getLibraryMode();
          const genreOrder = currentLibMode === 'random'
            ? ['empty', 'dialogue', 'post', 'diary', 'log', 'words', 'prefix']
            : ['prefix', 'empty', 'dialogue', 'post', 'diary', 'log', 'words'];
          for (const mode of genreOrder) {
            const v = resultsByMode[mode];
            if (!v) continue;
            const gi = GENRE_INFO[mode];
            const vCoords = { x: BigInt(v.coordinates.x || 0), y: BigInt(v.coordinates.y || 0), z: BigInt(v.coordinates.z || 1), sector: BigInt(v.coordinates.sector), hall: BigInt(v.coordinates.hall), wall: BigInt(v.coordinates.wall), shelf: BigInt(v.coordinates.shelf), volume: BigInt(v.coordinates.volume), page: BigInt(v.coordinates.page) };
            const vXY = { x: BigInt(v.xy.x), y: BigInt(v.xy.y) };
            const urlParams = { hl: `${v.range.start}:${v.range.length}` };
            /* Pass engine mode: prefix results use prefix codec, legacy use random */
            if (mode === 'prefix') urlParams.engine = 'prefix';
            else urlParams.engine = 'random';
            const pageUrl = lib.coordsToPageUrl(vCoords, urlParams);
            if (mode === 'dialogue') {
              const dialoguePreview = h.renderDialogueSearchPreview(v, pageUrl);
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
                  <span>X:${h.fmtXY(vXY.x)}</span>
                  <span>Y:${h.fmtXY(vXY.y)}</span>
                  <span>Т.${vCoords.volume}</span>
                </div>
                <div class="msg-search-actions">
                  <a class="msg-qa" href="${pageUrl}">📖 Открыть</a>
                  <a class="msg-qa" href="#/x/${h.fmtXY(vXY.x)}/y/${h.fmtXY(vXY.y)}">🏛 Зал</a>
                </div>
                <span class="msg-time">${h.timeStr()}</span>
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
              <span class="msg-time">${h.timeStr()}</span>
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
            <span class="msg-time">${h.timeStr()}</span>
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

  app.themes._messenger = messengerTheme;
})();
