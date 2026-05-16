(() => {
  'use strict';
  const app = window.BabelApp;
  const { $, $$, esc } = app.utils;
  const lib = app.library;
  const store = app.storage;
  const themes = app.themes;

  /* ═══════════════════════════════════════════════════════════
     ROUTER — Theme-Aware
     ═══════════════════════════════════════════════════════════ */

  let currentCleanup = null;

  function parseRoute() {
    const hash = location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    let name = 'home';
    if (parts[0] === 'wander') name = 'wander';
    else if (parts[0] === 'search') name = 'search';
    else if (parts[0] === 'page') name = 'page';
    else if (parts[0] === 'about') name = 'about';
    else if (parts[0] === 'favorites') name = 'favorites';
    return { name, parts, params };
  }

  function navigate() {
    const route = parseRoute();
    const view = document.getElementById('view');
    if (!view) return;

    /* Run cleanup from previous view */
    if (currentCleanup) { currentCleanup(); currentCleanup = null; }

    /* Also clean up any canvas animations from previous view */
    document.querySelectorAll('canvas[_cleanup]').forEach(c => {
      if (typeof c._cleanup === 'function') c._cleanup();
    });

    /* Apply theme */
    themes.setTheme(themes.getTheme());

    /* Update theme picker */
    const pickerContainer = $('#themePickerSlot');
    if (pickerContainer) pickerContainer.innerHTML = themes.renderThemePicker();
    themes.bindThemePicker();

    /* Update nav active state */
    updateNav(route.name);

    try {
      const renderer = themes.getThemeRenderer();

      switch (route.name) {
        case 'home': {
          view.innerHTML = renderer.renderHome();
          if (renderer.bindHome) renderer.bindHome();
          break;
        }
        case 'wander': {
          view.innerHTML = renderer.renderWander(route);
          if (renderer.bindWander) renderer.bindWander(route);
          break;
        }
        case 'search': {
          if (renderer.renderSearch) {
            view.innerHTML = renderer.renderSearch(route);
            if (renderer.bindSearch) renderer.bindSearch(route);
          } else {
            view.innerHTML = renderSearchShared(route);
            bindSearchShared(route);
          }
          break;
        }
        case 'page': {
          /* Handle /page/random → redirect to random page */
          if (route.parts[1] === 'random') {
            const randNum = lib.randomPageNumber();
            location.hash = `#/page/${lib.numberToB64(randNum)}`;
            return;
          }
          view.innerHTML = renderer.renderPage(route);
          if (renderer.bindPage) renderer.bindPage(route);
          else themes.bindSharedPage(route);
          break;
        }
        case 'about': {
          view.innerHTML = renderAbout();
          break;
        }
        case 'favorites': {
          view.innerHTML = renderFavorites();
          bindFavorites();
          break;
        }
        default: {
          const r = themes.getThemeRenderer();
          view.innerHTML = r.renderHome();
          if (r.bindHome) r.bindHome();
        }
      }
    } catch (err) {
      view.innerHTML = `<div class="section-shell"><div class="notice">Ошибка: ${esc(err.message)}</div></div>`;
      console.error(err);
    }
  }

  function updateNav(name) {
    $$('nav.top-nav a').forEach(a => {
      const href = a.getAttribute('href') || '';
      a.classList.toggle('active',
        (name === 'home' && href === '#/') ||
        (name === 'wander' && href.includes('wander')) ||
        (name === 'search' && href.includes('search')) ||
        (name === 'about' && href.includes('about')) ||
        (name === 'favorites' && href.includes('favorites'))
      );
    });
  }

  /* ═══════════════════════════════════════════════════════════
     SHARED SEARCH VIEW (fallback for themes without custom search)
     ═══════════════════════════════════════════════════════════ */

  function renderSearchShared(route) {
    const q = route.params.get('q') || '';
    const mode = route.params.get('mode') || 'empty';
    const count = route.params.get('count') || '6';

    const modeLabel = { empty: 'Пустота', noise: 'Шум', words: 'Слова' };
    return `
    <section class="search-view fade-in">
      <h1 class="search-title">Каталог Мира</h1>
      <p class="search-subtitle">Любой текст из ${esc(String(lib.maxPageNumber()).length)} цифр существует в Вавилоне.</p>
      <form class="search-form" id="searchForm">
        <div class="search-input-wrap">
          <input type="text" class="search-input" id="searchInput" placeholder="Введите любой текст..." value="${esc(q)}" autofocus>
        </div>
        <div class="filler-selector">
          <span class="filler-label">Окружение:</span>
          ${['empty', 'noise', 'words'].map(m =>
            `<button type="button" class="filler-btn ${mode === m ? 'active' : ''}" data-mode="${m}">${modeLabel[m]}</button>`
          ).join('')}
        </div>
        <button type="submit" class="search-submit">Искать в бесконечности</button>
      </form>
      <div class="search-results" id="searchResults">
        <div id="searchResultsSlot">
          ${q ? `<div class="empty-state"><div class="icon babel-spinner-inline">⬡</div><p style="margin-top:0.5rem;animation:babelPulse 1.5s ease-in-out infinite">Вавилон вычисляет…</p></div>` : `<div class="empty-state"><div class="icon">◈</div><p>Введите фразу, чтобы найти её в бесконечной библиотеке</p></div>`}
        </div>
      </div>
    </section>`;
  }

  function bindSearchShared(route) {
    const form = $('#searchForm');
    const input = $('#searchInput');
    const resultsSlot = $('#searchResultsSlot');
    let currentMode = route.params.get('mode') || 'empty';
    const q = route.params.get('q') || '';
    const count = route.params.get('count') || '6';

    $$('.filler-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.filler-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
      });
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) location.hash = `#/search?q=${encodeURIComponent(q)}&mode=${currentMode}`;
    });

    /* Async search via Worker */
    if (q && resultsSlot) {
      const bridge = app.workerBridge;
      bridge.search(q, currentMode, count).then(variants => {
        const resultsHTML = variants.map(v => {
          const vNumber = BigInt(v.number);
          const vCoords = { sector: BigInt(v.coordinates.sector), hall: BigInt(v.coordinates.hall), wall: BigInt(v.coordinates.wall), shelf: BigInt(v.coordinates.shelf), volume: BigInt(v.coordinates.volume), page: BigInt(v.coordinates.page) };
          const vXY = { x: BigInt(v.xy.x), y: BigInt(v.xy.y) };
          const snippet = app.utils.snippetByRange(v.text, v.range, 80);
          const phraseEscaped = esc(v.phrase);
          const snippetEscaped = esc(snippet);
          const highlightedSnippet = snippetEscaped.replace(phraseEscaped, `<mark>${phraseEscaped}</mark>`);
          const pageUrl = app.utils.routeFor(`/page/${lib.numberToB64(vNumber)}`, { hl: `${v.range.start}:${v.range.length}` });
          const wanderUrl = `#/wander/x/${themes.fmtXY(vXY.x)}/y/${themes.fmtXY(vXY.y)}`;
          const modeLabels = { empty: 'Пустота', noise: 'Шум', words: 'Слова' };
          return `
          <div class="catalog-card">
            <div class="catalog-variant">Вариант ${v.variant} · ${modeLabels[v.mode]}</div>
            <div class="catalog-snippet">${highlightedSnippet}</div>
            <div class="catalog-coords">
              <span class="coord-pill">X: ${themes.fmtXY(vXY.x)}</span>
              <span class="coord-pill">Y: ${themes.fmtXY(vXY.y)}</span>
              <span class="coord-pill">Том ${vCoords.volume}</span>
              <span class="coord-pill">Лист ${vCoords.page}</span>
            </div>
            <div class="catalog-actions">
              <a class="teleport-btn" href="${pageUrl}">Телепортироваться</a>
              <a class="btn-outline" href="${wanderUrl}">Перейти в зал</a>
            </div>
          </div>`;
        }).join('');
        resultsSlot.innerHTML = resultsHTML;
      }).catch(err => {
        resultsSlot.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ABOUT VIEW (shared)
     ═══════════════════════════════════════════════════════════ */

  function renderAbout() {
    return `
    <section class="about fade-in">
      <h1>Алгоритм Вавилона</h1>
      <h2>Пространство как Хэш</h2>
      <p>Вавилон использует криптографический принцип не для того, чтобы прятать текст от пользователя, а чтобы <em>сшить пространство и текст</em>. Каждая страница библиотеки определяется своими координатами — и эти координаты математически связаны с содержимым страницы через обратимое преобразование. Пространство Вавилона имеет топологию: это бесконечный двумерный лабиринт, где координаты комнаты являются ключами к генерации её содержимого. Это алгоритмическая вселенная, по которой можно гулять.</p>

      <h2>Алфавит: 256 символов = 1 байт</h2>
      <p>Алфавит библиотеки состоит ровно из 256 символов = 2<sup>8</sup>. Каждый символ кодируется ровно 1 байтом — это максимально простая и элегантная архитектура. Алфавит включает: пробел, символ переноса строки, 33 буквы кириллицы (а–я + ё), 26 букв латиницы (a–z), 10 цифр, 36 знаков препинания и 149 эмодзи. Восемь английских букв, визуально совпадающих с русскими (A/А, E/Е, K/К, M/М, O/О, C/С, T/Т, X/Х), хранятся как отдельные записи — для них достаточно места.</p>
      <p>Перенос строки — полноценный символ алфавита. Это означает, что страница хранит не только текст, но и его форму: абзацы, структуру, визуальное расположение. Любой Telegram-пост (до 4096 символов) сохраняется в библиотеке целиком, включая разбиение на строки и эмодзи.</p>

      <h2>Страница = Telegram-пост</h2>
      <p>Длина страницы — 4096 символов, что совпадает с максимальной длиной сообщения в Telegram. Это не случайное совпадение, а осознанный выбор: библиотека XXI века, где единицей текста является не бумажная страница, а цифровой пост. Борхес работал с книгой; мы работаем с сообщением. Каждая мысль, каждый диалог, каждая заметка, когда-либо отправленная в Telegram, существует здесь — и получает собственный адрес в бесконечности.</p>
      <p>Геометрия библиотеки: 410 страниц в томе, 32 тома на полке, 5 полок на стене, 4 стены в зале, 20 залов в секторе. Секторы нумеруются от 1 до бесконечности. Полное пространство: 256<sup>4096</sup> = 2<sup>32768</sup> возможных страниц.</p>

      <h2>Аффинная перестановка</h2>
      <p>Чтобы соседние координаты не давали похожие тексты, применяется аффинный шифр над Z/(2<sup>32768</sup>):</p>
      <pre><code>contentNumber = (bookIndex × C + OFFSET)  mod 2^32768
bookIndex     = (contentNumber − OFFSET) × I  mod 2^32768</code></pre>
      <p>Где C — нечётная константа, построенная повторением 64-битного паттерна по всей ширине 32768 бит, I — её мультипликативно обратный элемент (лемма Гензеля для 2-адических чисел), OFFSET — высокоэнтропийная константа. Это гарантирует C × I ≡ 1 (mod 2<sup>32768</sup>), обеспечивая идеальную биекцию. OFFSET решает проблему пустой страницы (0,0): при чисто мультипликативной перестановке 0 × C = 0, аффинное смещение гарантирует, что даже индекс 0 отображается в плотное число.</p>

      <h2>5 визуальных тем</h2>
      <p>Вавилон можно смотреть по-разному. Пять тем меняют не только цвета, но и способ взаимодействия с бесконечной библиотекой:</p>
      <p><strong>📖 Книжная полка</strong> — уютный читатель: деревянные полки, тёплые тона, классический книжный вид.</p>
      <p><strong>🌌 Космос</strong> — звёздный атлас: глубокий космос, голограммы, навигация между звёздными залами.</p>
      <p><strong>💬 Мессенджер</strong> — библиотека как чат: страницы появляются как сообщения от Библиотекаря, поиск — как переписка.</p>
      <p><strong>📱 Лента</strong> — социальная лента: бесконечный скролл постов-страниц, как в соцсетях.</p>
      <p><strong>⌨️ Терминал</strong> — хакерский интерфейс: зелёный текст, команды, ASCII-карта залов.</p>
    </section>`;
  }

  /* ═══════════════════════════════════════════════════════════
     FAVORITES VIEW (shared)
     ═══════════════════════════════════════════════════════════ */

  function renderFavorites() {
    const favs = store.readStore('babelFavorites');
    if (favs.length === 0) {
      return `
      <section class="favorites fade-in">
        <h1>Избранное</h1>
        <div class="empty-state"><div class="icon">★</div><p>Пока ничего не сохранено. Откройте страницу и нажмите «В избранное».</p></div>
      </section>`;
    }
    const items = favs.map((f, i) => `
      <div class="fav-item">
        <div class="fav-info">
          <div class="fav-title"><a href="${esc(f.url)}">${esc(f.title)}</a></div>
          <div class="fav-date">${new Date(f.createdAt).toLocaleString('ru-RU')}</div>
        </div>
        <div class="fav-actions">
          <a class="btn-outline" href="${esc(f.url)}">Открыть</a>
          <button class="fav-remove" data-index="${i}">Удалить</button>
        </div>
      </div>
    `).join('');
    return `
    <section class="favorites fade-in">
      <h1>Избранное</h1>
      <div class="fav-list">${items}</div>
    </section>`;
  }

  function bindFavorites() {
    $$('.fav-remove[data-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        const favs = store.readStore('babelFavorites');
        if (favs[idx]) { store.removeFavorite(favs[idx].url); navigate(); }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════ */

  function init() {
    /* Apply saved theme immediately */
    themes.setTheme(themes.getTheme());

    /* First render */
    navigate();

    /* Listen for route changes */
    window.addEventListener('hashchange', navigate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
