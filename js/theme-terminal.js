(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;
  const u = app.utils;
  const h = app.themes._helpers;

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
              <a class="term-link" href="#/wander">drwxr-x---  залы/</a>&nbsp;&nbsp;&nbsp;
              <a class="term-link" href="#/search">-rwxr-x---  каталог</a>&nbsp;&nbsp;&nbsp;
              <a class="term-link" href="#/about">-r--r-----  алгоритм</a>
            </div>
            <div class="term-line term-output-text">
              <br>Доступные команды:<br>
              &nbsp;&nbsp;<span class="term-cmd">help</span> — справка<br>
              &nbsp;&nbsp;<span class="term-cmd">go [направление]</span> — перейти в зал (сз/св/з/в/юз/юв)<br>
              &nbsp;&nbsp;<span class="term-cmd">search [текст]</span> — найти текст<br>
              &nbsp;&nbsp;<span class="term-cmd">random</span> — случайный зал<br>
              &nbsp;&nbsp;<span class="term-cmd">read [том]</span> — прочитать том (1-10)
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
          response = 'go [сз/св/з/в/юз/юв] · search [текст] · random · read [1-10]';
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
      let x = '0', y = '0';
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parts[i + 1];
        if (parts[i] === 'y') y = parts[i + 1];
      }
      const nx = Number(x) || 0, ny = Number(y) || 0;
      const hallInfo = lib.xyToHallXY(nx, ny);

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
      for (let z = 1; z <= 10; z++) {
        const spineText = lib.getBookSpine(nx, ny, z);
        const stats = h.charStats(lib.numberToIndices(lib.coordinatesToNumber(lib.xyToCoordinates(nx, ny, z))));
        const pageUrl = lib.coordsToPageUrl(lib.xyToCoordinates(nx, ny, z));
        const label = spineText ? u.esc(spineText.slice(0, 30)) : '(пусто)';
        bookList += `<a class="term-link" href="${pageUrl}">Том ${z}</a> [${stats.label}] ${label}<br>`;
      }

      return `
      <section class="t-terminal wander fade-in">
        <div class="term-screen">
          <div class="term-titlebar">babel:// залы/x:${x}/y:${y}</div>
          <div class="term-output" id="termOutput">
            <div class="term-line term-output-text">
<pre class="term-ascii-map">${mapLines.join('\n')}</pre>
            </div>
            <div class="term-line term-output-text">
Сектор ${hallInfo.sector} · Зал ${hallInfo.hall}<br>
${lib.classifyRegion(nx, ny).icon} ${lib.classifyRegion(nx, ny).label}<br>
10 книг:<br><br>
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
      let x = '0', y = '0';
      for (let i = 1; i < parts.length; i += 2) {
        if (parts[i] === 'x') x = parts[i + 1];
        if (parts[i] === 'y') y = parts[i + 1];
      }
      const nx = Number(x) || 0, ny = Number(y) || 0;
      store.pushJourneyStep(nx, ny, lib.classifyRegion(nx, ny).kind);

      /* Direction links */
      u.$$('.term-dir[data-dq]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const dq = parseInt(el.dataset.dq), dr = parseInt(el.dataset.dr);
          location.hash = `#/x/${nx + dq}/y/${ny + dr}`;
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
          if (d) { location.hash = `#/x/${nx + d[0]}/y/${ny + d[1]}`; return; }
        }
        if (cmd[0] === 'search') {
          location.hash = `#/search?q=${encodeURIComponent(val.slice(val.indexOf(' ') + 1))}`;
          return;
        }
        output.innerHTML += `<div class="term-line term-output-text">Неизвестная команда. Набери: go [направление] · random · search [текст]</div>`;
        output.scrollTop = output.scrollHeight;
      });
    },

    renderPage(route) {
      if (!route.pageNumber) return `<div class="term-screen"><div class="term-output"><div class="term-line term-output-text">Страница не указана</div></div></div>`;
      let number;
      try { number = route.pageNumber; } catch {
        return `<div class="term-screen"><div class="term-output"><div class="term-line term-output-text">Неверный адрес</div></div></div>`;
      }
      const coords = lib.numberToCoordinates(number);
      const xy = lib.coordinatesToXY(coords);

      try { store.pushHistory({ url: location.hash, title: lib.pageTitle(coords) }); } catch {}

      const pageNum = Number(coords.page);
      const totalPages = Number(ALG.pagesPerVolume);
      const prevUrl = pageNum > 1 ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum - 1)}) : null;
      const nextUrl = pageNum < totalPages ? lib.coordsToPageUrl({...coords, page: BigInt(pageNum + 1)}) : null;

      /* Show loading placeholder — text will be loaded async via prefix codec */
      return `
      <section class="t-terminal page-view fade-in">
        <div class="term-screen">
          <div class="term-titlebar">babel:// том:${coords.volume}/лист:${pageNum}</div>
          <div class="term-output" id="termOutput">
            <div class="term-line term-output-text">
Зал X:${h.fmtXY(xy.x)} Y:${h.fmtXY(xy.y)} · Стена ${coords.wall} · Полка ${coords.shelf} · Том ${coords.volume} · Лист ${pageNum}/${totalPages} · <span id="termStats">…</span>
            </div>
            <div class="term-line term-separator">────────────────────────────────────────</div>
            <div class="term-line term-page-text" id="termPageText"><span class="term-loading">декодирую…</span></div>
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
              <a class="term-link" href="#/x/${h.fmtXY(xy.x)}/y/${h.fmtXY(xy.y)}/w/${coords.wall}">зал</a>
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
      const xy = lib.coordinatesToXY(coords);

      /* Track journey step for this page view — use x,y from URL if available */
      try {
        let jx, jy;
        if (route.pageXY && route.pageXY.x != null) {
          jx = route.pageXY.x;
          jy = route.pageXY.y;
        } else {
          jx = xy.x;
          jy = xy.y;
        }
        store.pushJourneyStep(jx, jy, lib.classifyRegion(h.safeNum(jx), h.safeNum(jy)).kind);
      } catch {}

      /* Async load page text via prefix codec */
      const pageTextEl = u.$('#termPageText');
      const statsEl = u.$('#termStats');
      const libraryMode = h.getLibraryMode();
      app.workerBridge.getPrefixPageData(
        String(xy.x), String(xy.y), String(coords.z), libraryMode
      ).then(data => {
        const text = data.text;
        const classification = data.classification || lib.classifyPageText(text);

        /* Update stats */
        if (statsEl) {
          statsEl.textContent = `${classification.label} ${Math.round((classification.score || 0) * 100)}%`;
        }

        /* Show text in terminal style */
        if (pageTextEl) {
          const lines = text.split('\n');
          pageTextEl.innerHTML = lines.map(l => u.esc(l) || '&nbsp;').join('<br>');
        }
      }).catch(err => {
        /* Fallback to old byte-level decode */
        const indices = lib.numberToIndices(number);
        const text = u.indicesToString(indices);
        const stats = h.charStats(indices);
        if (statsEl) statsEl.textContent = `${stats.label} ${stats.readability}%`;
        if (pageTextEl) {
          const lines = text.split('\n');
          pageTextEl.innerHTML = lines.map(l => u.esc(l) || '&nbsp;').join('<br>');
        }
      });

      const favBtn = u.$('#termFav');
      if (favBtn) favBtn.addEventListener('click', () => {
        store.addFavorite({ url: location.hash, title: lib.pageTitle(coords) });
        favBtn.textContent = '★ (сохранено)';
      });
      const copyBtn = u.$('#termCopy');
      if (copyBtn) copyBtn.addEventListener('click', () => {
        /* Copy prefix-decoded text if available, fallback to byte-level */
        const textContent = pageTextEl ? pageTextEl.textContent : lib.numberToText(number);
        u.copyText(textContent, 'Скопировано');
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
            ? h.startOdometerAnimation(textNodes, ALG.alphabet)
            : null;

          /* Start chunked scan — yields to UI between chunks */
          h.findNextInhabitedChunked(coords).then(dest => {
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
      if (jmCanvas) h.drawJourneyMap(jmCanvas);
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
[${v.variant}] <a class="term-link" href="${pageUrl}">X:${h.fmtXY(v.xy.x)} Y:${h.fmtXY(v.xy.y)} Т.${v.coordinates.volume}</a>
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

  app.themes._terminal = terminalTheme;
})();
