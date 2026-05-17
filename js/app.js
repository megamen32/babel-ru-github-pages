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

  function keepCleanup(maybeCleanup) {
    currentCleanup = typeof maybeCleanup === 'function' ? maybeCleanup : null;
  }

  function parseRoute() {
    const hash = location.hash.slice(1) || '/';
    const [path, query] = hash.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query || '');
    let name = 'home';
    let pageCoords = null;
    let pageXY = null; // { x, y, z? } — x,y,z координаты бесконечной полки
    let pageB64 = null;
    let isOldCoordFormat = false; // for redirect to new format (h/ or s/ based)
    let needsRedirect = null; // URL to redirect to for old-format URLs

    /* Парсинг координаты: поддерживает decimal и base36 */
    function parseCoord(val) {
      if (val == null) return val;
      /* Проверяем, похоже ли на base36 (содержит буквы a-z) */
      if (/^[0-9a-z-]+$/i.test(val) && /[a-z]/i.test(val)) {
        try {
          const neg = val.startsWith('-');
          const abs = neg ? val.slice(1) : val;
          /* base36 → BigInt */
          let result = 0n;
          for (const ch of abs.toLowerCase()) {
            const code = ch.charCodeAt(0);
            const digit = code <= 57 ? code - 48 : code - 87;
            result = result * 36n + BigInt(digit);
          }
          return String(neg ? -result : result);
        } catch { /* fallback to decimal */ }
      }
      return val;
    }

    /* UNIFIED format: #/x/{x}/y/{y}[/z/{z}]
       Depth determines view:
         - If /z/{z} present → page view
         - If only x,y → wander view
       Старый формат #/x/{x}/y/{y}/w/.../p/... тоже поддерживается */

    if (parts[0] === 'x') {
      pageXY = {};
      for (let i = 0; i < parts.length - 1; i += 2) {
        switch (parts[i]) {
          case 'x': pageXY.x = parseCoord(parts[i + 1]); break;
          case 'y': pageXY.y = parseCoord(parts[i + 1]); break;
          case 'z': pageXY.z = parseCoord(parts[i + 1]); break;
          /* Старые поля — для редиректа */
          case 'w': pageXY.wall = parseInt(parts[i + 1]) || 1; break;
          case 'sh': pageXY.shelf = parseInt(parts[i + 1]) || 1; break;
          case 'v': pageXY.volume = parseInt(parts[i + 1]) || 1; break;
          case 'p': pageXY.page = parseInt(parts[i + 1]) || 1; break;
        }
      }
      /* Если есть старые w/sh/v/p но нет z — вычислим z и сделаем редирект */
      if (pageXY.wall && !pageXY.z) {
        pageXY.z = String(lib.borgesToZ(
          BigInt(pageXY.wall || 1), BigInt(pageXY.shelf || 1),
          BigInt(pageXY.volume || 1), BigInt(pageXY.page || 1)
        ));
        needsRedirect = `#/x/${pageXY.x}/y/${pageXY.y}/z/${pageXY.z}`;
      }
      /* Determine view based on depth */
      name = (pageXY.z != null) ? 'page' : 'wander';
    }
    /* OLD: #/wander → redirect to #/x/0/y/0 */
    else if (parts[0] === 'wander') {
      if (parts[1] === 'x') {
        /* OLD: #/wander/x/{x}/y/{y}[/wall/{w}] → redirect */
        let rx = 0, ry = 0;
        for (let i = 1; i < parts.length - 1; i += 2) {
          if (parts[i] === 'x') rx = parseInt(parts[i + 1]) || 0;
          if (parts[i] === 'y') ry = parseInt(parts[i + 1]) || 0;
        }
        needsRedirect = `#/x/${rx}/y/${ry}`;
        name = 'wander';
        pageXY = { x: rx, y: ry };
      } else {
        /* #/wander (no coords) → redirect to #/x/0/y/0 */
        needsRedirect = '#/x/0/y/0';
        name = 'wander';
        pageXY = { x: 0, y: 0 };
      }
    }
    /* OLD: #/page/... → redirect or parse */
    else if (parts[0] === 'page') {
      if (parts[1] === 'random') {
        /* OLD: #/page/random → redirect to #/random */
        needsRedirect = '#/random';
        name = 'page';
      }
      /* OLD format: #/page/x/{x}/y/{y}/... → redirect to #/x/.../z/... */
      else if (parts[1] === 'x') {
        const parsed = {};
        for (let i = 1; i < parts.length - 1; i += 2) {
          switch (parts[i]) {
            case 'x': parsed.x = parseInt(parts[i + 1]) || 0; break;
            case 'y': parsed.y = parseInt(parts[i + 1]) || 0; break;
            case 'z': parsed.z = parseInt(parts[i + 1]); break;
            case 'w': parsed.wall = parseInt(parts[i + 1]) || 1; break;
            case 'sh': parsed.shelf = parseInt(parts[i + 1]) || 1; break;
            case 'v': parsed.volume = parseInt(parts[i + 1]) || 1; break;
            case 'p': parsed.page = parseInt(parts[i + 1]) || 1; break;
          }
        }
        /* Вычисляем z если есть только старые w/sh/v/p */
        if (!parsed.z && parsed.wall) {
          parsed.z = Number(lib.borgesToZ(
            BigInt(parsed.wall), BigInt(parsed.shelf || 1),
            BigInt(parsed.volume || 1), BigInt(parsed.page || 1)
          ));
        }
        const newUrl = `#/x/${parsed.x}/y/${parsed.y}/z/${parsed.z || 1}`;
        needsRedirect = newUrl;
        name = 'page';
        pageXY = parsed;
      }
      /* ANCIENT format: #/page/h/{hall}/w/.../s/{seed_b64url}
         ANCIENT format: #/page/s/{sector_decimal}/h/{hall}/... */
      else {
        const coordKeys = new Set(['s', 'h', 'w', 'sh', 'v', 'p']);
        if (parts.length >= 3 && coordKeys.has(parts[1])) {
          pageCoords = {};
          isOldCoordFormat = true; // both old and ancient need redirect
          for (let i = 1; i < parts.length - 1; i += 2) {
            if (coordKeys.has(parts[i])) {
              switch (parts[i]) {
                case 's': pageCoords.sector = parts[i + 1]; break;
                case 'h': pageCoords.hall = parts[i + 1]; break;
                case 'w': pageCoords.wall = parts[i + 1]; break;
                case 'sh': pageCoords.shelf = parts[i + 1]; break;
                case 'v': pageCoords.volume = parts[i + 1]; break;
                case 'p': pageCoords.page = parts[i + 1]; break;
              }
            }
          }
        } else if (parts[1] && parts[1] !== 'random') {
          pageB64 = parts[1];
        }
        name = 'page';
      }
    }
    else if (parts[0] === 'random') name = 'random';
    else if (parts[0] === 'atlas') name = 'atlas';
    else if (parts[0] === 'genre') name = 'genre';
    else if (parts[0] === 'search') name = 'search';
    else if (parts[0] === 'about') name = 'about';
    else if (parts[0] === 'favorites') name = 'favorites';
    return { name, parts, params, pageCoords, pageXY, pageB64, isOldCoordFormat, needsRedirect };
  }

  function navigate() {
    const route = parseRoute();
    const view = document.getElementById('view');
    if (!view) return;

    /* Handle redirects for old URL formats */
    if (route.needsRedirect) {
      location.replace(route.needsRedirect);
      return;
    }

    /* Run cleanup from previous view */
    if (currentCleanup) { currentCleanup(); currentCleanup = null; }

    /* Also clean up any canvas animations from previous view */
    document.querySelectorAll('canvas').forEach(c => {
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
    updateFooter(route.name);

    /* Update library mode toggle button */
    updateModeToggle();

    try {
      const renderer = themes.getThemeRenderer();

      switch (route.name) {
        case 'home': {
          view.innerHTML = renderer.renderHome();
          keepCleanup(renderer.bindHome ? renderer.bindHome() : null);
          break;
        }
        case 'wander': {
          view.innerHTML = renderer.renderWander(route);
          keepCleanup(renderer.bindWander ? renderer.bindWander(route) : null);
          break;
        }
        case 'search': {
          if (renderer.renderSearch) {
            view.innerHTML = renderer.renderSearch(route);
            keepCleanup(renderer.bindSearch ? renderer.bindSearch(route) : null);
          } else {
            view.innerHTML = renderSearchShared(route);
            keepCleanup(bindSearchShared(route));
          }
          break;
        }
        case 'page': {
          /* Resolve page number from URL */
          try {
            if (route.pageXY) {
              /* Unified format: x,y,z */
              const xy = route.pageXY;
              const coords = lib.xyToCoordinates(xy.x, xy.y, xy.z || 1);
              route.pageNumber = lib.coordinatesToNumber(coords);
            } else if (route.pageCoords) {
              /* ANCIENT format: h/ or s/ based — decode sector, compute, then redirect */
              if (route.pageCoords.sector) {
                const sectorStr = String(route.pageCoords.sector);
                if (/^\d+$/.test(sectorStr)) {
                  /* Ancient format: sector is decimal number */
                  route.pageCoords.sector = BigInt(sectorStr);
                } else {
                  /* Old format: sector is base62-encoded seed */
                  route.pageCoords.sector = lib.b64ToNumber(sectorStr) + 1n;
                }
              }
              route.pageNumber = lib.coordinatesToNumber(route.pageCoords);

              /* Ancient coordinate format → redirect to new x,y format */
              if (route.isOldCoordFormat) {
                const coords = lib.numberToCoordinates(route.pageNumber);
                const hl = route.params.get('hl');
                const params = hl ? { hl } : undefined;
                location.replace(lib.coordsToPageUrl(coords, params));
                return;
              }
            } else if (route.pageB64) {
              /* Legacy raw base64 page number — resolve and redirect to x,y-based URL */
              const number = lib.b64ToNumber(route.pageB64);
              const coords = lib.numberToCoordinates(number);
              const hl = route.params.get('hl');
              const params = hl ? { hl } : undefined;
              location.replace(lib.coordsToPageUrl(coords, params));
              return;
            }
          } catch (err) {
            view.innerHTML = `<div class="section-shell"><div class="notice">Ошибка: ${esc(err.message)}</div></div>`;
            return;
          }

          view.innerHTML = renderer.renderPage(route);
          if (renderer.bindPage) keepCleanup(renderer.bindPage(route));
          else keepCleanup(themes.bindSharedPage(route));
          break;
        }
        case 'random': {
          /* #/random → redirect to a random page */
          const randCoords = lib.randomPageCoords();
          location.hash = lib.coordsToPageUrl(randCoords);
          return;
        }
        case 'atlas': {
          view.innerHTML = themes.renderAtlas();
          themes.bindAtlas();
          break;
        }
        case 'genre': {
          view.innerHTML = themes.renderGenre(route);
          themes.bindGenre(route);
          break;
        }
        case 'about': {
          view.innerHTML = renderAbout();
          break;
        }
        case 'favorites': {
          view.innerHTML = renderFavorites();
          keepCleanup(bindFavorites());
          break;
        }
        default: {
          const r = themes.getThemeRenderer();
          view.innerHTML = r.renderHome();
          keepCleanup(r.bindHome ? r.bindHome() : null);
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
        (name === 'wander' && (href.includes('/x/') || href === '#/x/0/y/0')) ||
        (name === 'search' && href.includes('search')) ||
        ((name === 'atlas' || name === 'genre') && href.includes('atlas')) ||
        (name === 'about' && href.includes('about')) ||
        (name === 'favorites' && href.includes('favorites'))
      );
    });
  }

  function updateModeToggle() {
    const btn = document.getElementById('modeToggle');
    if (!btn) return;
    const mode = themes.getLibraryMode();
    const modeInfo = themes.LIBRARY_MODES[mode];
    if (modeInfo) {
      btn.textContent = modeInfo.icon + ' ' + modeInfo.name;
    }
  }

  function initModeToggle() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('#modeToggle');
      if (!btn) return;
      const current = themes.getLibraryMode();
      const next = current === 'human' ? 'random' : 'human';
      themes.setLibraryMode(next);
      updateModeToggle();
      /* Re-render current view */
      window.dispatchEvent(new Event('hashchange'));
    });
  }

  function updateFooter(routeName) {
    const footer = document.querySelector('.site-footer');
    if (!footer) return;
    footer.hidden = routeName !== 'home';
  }

  /* ═══════════════════════════════════════════════════════════
     SHARED SEARCH VIEW (fallback for themes without custom search)
     ═══════════════════════════════════════════════════════════ */

  function renderSearchShared(route) {
    const q = route.params.get('q') || '';

    const genreLabel = { empty: '📄 На пустом листе', noise: '🌫️ Шум', words: '📖 Среди слов', dialogue: '💬 В переписке', post: '📱 В посте', diary: '📔 В дневнике', log: '⌨️ В логе' };
    return `
    <section class="search-view fade-in">
      <h1 class="search-title">Поиск в Библиотеке</h1>
      <p class="search-subtitle">Любая фраза — дверь в облако страниц. Не одна страница, а множество.</p>
      <form class="search-form" id="searchForm">
        <div class="search-input-wrap">
          <textarea class="search-input" id="searchInput" placeholder="Введите любой текст, включая emoji и абзацы..." rows="5" autofocus>${esc(q)}</textarea>
        </div>
        <button type="submit" class="search-submit">Искать в бесконечности</button>
      </form>
      <div class="search-results" id="searchResults">
        <div id="searchResultsSlot">
          ${q ? `` : `<div class="empty-state"><div class="icon">◈</div><p>Введите фразу, чтобы найти её в бесконечной библиотеке</p></div>`}
        </div>
      </div>
    </section>`;
  }

  function bindSearchShared(route) {
    const form = $('#searchForm');
    const input = $('#searchInput');
    const resultsSlot = $('#searchResultsSlot');
    const q = route.params.get('q') || '';

    /* Genre definitions */
    const GENRE_INFO = {
      prefix:   { icon: '✅', label: 'Проверенная страница', desc: 'Фраза точно на этой странице — проверено через префиксный кодек' },
      empty:    { icon: '📄', label: 'На пустом листе',   desc: 'Фраза сама по себе, в тишине пустой страницы' },
      dialogue: { icon: '💬', label: 'В переписке',       desc: 'Фраза внутри чата — между репликами собеседников' },
      post:     { icon: '📱', label: 'В посте',           desc: 'Фраза в ленте — среди мыслей и тегов' },
      diary:    { icon: '📔', label: 'В дневнике',        desc: 'Фраза в личной записи — с датой и настроением' },
      log:      { icon: '⌨️', label: 'В логе',            desc: 'Фраза среди серверных записей и таймстемпов' },
      words:    { icon: '📖', label: 'Среди слов',        desc: 'Фраза в потоке слов — как на книжной полке' },
    };

    form.addEventListener('submit', e => {
      e.preventDefault();
      const nextQuery = input.value.trim();
      if (nextQuery) {
        location.hash = `#/search?q=${encodeURIComponent(nextQuery)}`;
      }
    });

    /* Async search via Worker — multi-mode */
    let isActive = true;
    let jokeTicker = null;

    if (q && resultsSlot) {
      const bridge = app.workerBridge;
      const chatContainer = resultsSlot.closest('.msg-chat') || resultsSlot;
      jokeTicker = bridge.startJokeTicker(chatContainer, { seedText: q });

      bridge.searchMultiMode(q).then(({ phrase, modes: resultsByMode }) => {
        if (!isActive) return;
        jokeTicker.stop();

        const phraseEscaped = esc(phrase);

        /* Explanation header */
        let html = `
        <div class="search-explanation">
          <h2>Фраза: «${phraseEscaped}»</h2>
          <p>Эта фраза — не адрес одной страницы. Это дверь в целое <strong>облако страниц</strong>. Она может быть в начале листа или в конце; вокруг — пустота, шум, переписка, дневник. Каждый вариант — настоящая страница с собственным адресом.</p>
          <p>Вот несколько входов в это множество:</p>
        </div>`;

        /* Render one card per genre */
        const genreOrder = ['prefix', 'empty', 'dialogue', 'post', 'diary', 'log', 'words'];
        for (const mode of genreOrder) {
          const v = resultsByMode[mode];
          if (!v) continue;
          const gi = GENRE_INFO[mode];
          const vNumber = BigInt(v.number);
          const vCoords = { sector: BigInt(v.coordinates.sector), hall: BigInt(v.coordinates.hall), wall: BigInt(v.coordinates.wall), shelf: BigInt(v.coordinates.shelf), volume: BigInt(v.coordinates.volume), page: BigInt(v.coordinates.page) };
          const vXY = { x: BigInt(v.xy.x), y: BigInt(v.xy.y) };
          const snippet = app.utils.snippetByRange(v.text, v.range, 80);
          const snippetEscaped = esc(snippet);
          const highlightedSnippet = snippetEscaped.replace(phraseEscaped, `<mark>${phraseEscaped}</mark>`);
          const pageUrl = lib.coordsToPageUrl(vCoords, { hl: `${v.range.start}:${v.range.length}` });
          const wanderUrl = `#/x/${themes.fmtXY(vXY.x)}/y/${themes.fmtXY(vXY.y)}`;
          html += `
          <div class="catalog-card">
            <div class="catalog-variant">${gi.icon} ${gi.label}</div>
            <p class="catalog-genre-desc">${gi.desc}</p>
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
        }

        /* Closing explanation */
        html += `
        <div class="search-explanation search-explanation-after">
          <details class="search-details">
            <summary>Почему так много вариантов?</summary>
            <div class="search-details-content">
              <p>В библиотеке Вавилона любая фраза встречается не потому, что её кто-то написал, а потому что вокруг неё можно поставить огромное количество разных окружений.</p>
              <p>Фраза может стоять в начале страницы, в середине или в конце. Вокруг неё может быть пустота, случайный шум, осмысленный текст, переписка, дневник или код.</p>
              <p>Короткая фраза встречается не на одной странице, а в огромном облаке страниц. Чем фраза короче — тем больше это облако.</p>
              <p>Поиск в этой библиотеке не отвечает «где эта фраза?». Он отвечает: <em>в каких мирах эта фраза может находиться?</em></p>
            </div>
          </details>
        </div>`;

        resultsSlot.innerHTML = html;
      }).catch(err => {
        if (!isActive) return;
        jokeTicker.stop();
        resultsSlot.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
      });
    }

    return function cleanupSearchShared() {
      isActive = false;
      if (jokeTicker) jokeTicker.stop();
    };
  }

  /* ═══════════════════════════════════════════════════════════
     ABOUT VIEW (shared)
     ═══════════════════════════════════════════════════════════ */

  function renderAbout() {
    return `
    <section class="about fade-in">
      <h1>Алгоритм Вавилона</h1>
      <h2>Языковая система координат</h2>
      <p>Вавилон — это не генератор текста. Это детерминированная система координат, где каждая цифра адреса соответствует странице. Но пространство устроено так, что человекоподобные страницы лежат «ближе» к началу координат, а шум — «дальше». Правильная формула не «модель генерирует текст», а «число декодирует страницу». Декодер не равномерный по символам — он языково-искажённый.</p>

      <h2>Токенный декодер</h2>
      <p>Страница состоит не из отдельных букв, а из токенов: слов, фраз, знаков препинания, эмодзи. Каждому токену присвоен вес — частые токены (пробел, «и», «в», «не») получают приоритет, редкие — отодвигаются. Декодер использует конечный автомат с состояниями: после слова вероятнее пробел или пунктуация, после пробела — слово, после точки — новое предложение. Это не генерация смысла, а грамматический автомат — но он создаёт текст, который выглядит как язык.</p>

      <h2>Температура и гравитация языка</h2>
      <p>Координата Z определяет «температуру» страницы — её удалённость от человеческого текста. Z = 1 даёт температуру ≈ 0.1: частые токены, строгая грамматика, читаемый текст. Z = 10<sup>6</sup> даёт температуру ≈ 0.6: смешанный текст с редкими токенами. Z = 10<sup>10</sup> и выше — чистый шум, хаос, сырые символы. Это «гравитация языка»: человеческий текст притягивается к началу координат, а шум отталкивается на периферию.</p>

      <h2>Детерминированность</h2>
      <p>Каждый адрес (X, Y, Z) всегда производит одну и ту же страницу. Координаты преобразуются через Feistel-сеть в внутренний адрес, который декодируется префиксным кодеком. Выбор токенов полностью детерминированный — биты адреса определяют, какие именно токены будут выбраны, а не запускают случайность.</p>

      <h2>Бесконечная полка: X, Y, Z</h2>
      <p>Библиотека организована как бесконечная полка с тремя координатами. X и Y определяют позицию зала на бесконечной 2D-карте. Z — номер страницы в этом зале. Малые Z = человеческий текст, большие Z = шум. Это упрощает навигацию: чтобы найти читаемый текст, просто идите к началу (Z ≈ 1).</p>
      <p>Алфавит библиотеки: 256 символов = 1 байт. Русские буквы (33), английские (26), цифры, знаки препинания, эмодзи. Длина страницы — 4096 символов. Токенный словарь содержит 152 000+ токенов: 50K русских словоформ, 50K английских слов, 20K+ биграмм и триграмм каждого языка, 2000 эмодзи.</p>

      <h2>Обитаемый атлас</h2>
      <p>С токенным декодером «обитаемость» страницы определяется её температурой. Страницы с Z близким к 1 всегда читаемые — это не случайность, а архитектура пространства. Регионы карты (район переписок, дневников, постов) определяют жанровый контекст окружения.</p>

      <h2>Feistel-перестановка</h2>
      <p>Координаты преобразуются во внутренний адрес через 4-раундовую Feistel-сеть. Это биективное перемешивание: соседние координаты всегда отображаются в далёкие адреса, но обратное преобразование восстанавливает исходные координаты точно. Feistel обеспечивает ≈50% различие битов между соседними адресами — гораздо лучше аффинной перестановки.</p>

      <h2>5 визуальных тем</h2>
      <p>Вавилон можно смотреть по-разному. Пять тем меняют не только цвета, но и способ взаимодействия с бесконечной библиотекой:</p>
      <p><strong>📖 Книжная полка</strong> — уютный читатель: деревянные полки, тёплые тона, классический книжный вид.</p>
      <p><strong>🌌 Космос</strong> — звёздный атлас: глубокий космос, голограммы, навигация между звёздными залами.</p>
      <p><strong>💬 Мессенджер</strong> — библиотека как чат: страницы появляются как сообщения от Библиотекаря, поиск — как переписка.</p>
      <p><strong>📱 Лента</strong> — социальная лента: бесконечный скролл постов-страниц, как в соцсетях.</p>
      <p><strong>⌨️ Терминал</strong> — хакерский интерфейс: зелёный текст, команды, ASCII-карта залов.</p>

      <h2>Режим библиотеки</h2>
      <p>Вавилон предлагает два режима восприятия бесконечного пространства:</p>
      <p><strong>📖 Человечная библиотека</strong> — язык искажает пространство шума. У начала координат страницы читаемые, грамматически правильные, с узнаваемыми словами. Чем дальше от начала — тем больше текст распадается. Это не случайность, а архитектура: частые токены кодируются короткими битовыми последовательностями, и малые адреса естественно декодируются в человекоподобный текст.</p>
      <p><strong>🎲 Случайная библиотека</strong> — чистый хаос. Каждая страница — равномерно случайная последовательность 256 символов алфавита. Никакой гравитации языка, никаких зон читаемости. Классическая библиотека Борхеса, где осмысленный текст — статистическая неизбежность, но не архитектура.</p>
      <p>Переключатель режимов находится в верхней навигационной панели. Режим сохраняется между сессиями.</p>
    </section>`;
  }

  /* ═══════════════════════════════════════════════════════════
     FAVORITES VIEW (shared)
     ═══════════════════════════════════════════════════════════ */

  function renderFavorites() {
    const favs = store.readStore('babelFavorites');
    let favSection = '';
    if (favs.length === 0) {
      favSection = `
        <div class="empty-state"><div class="icon">★</div><p>Пока ничего не сохранено. Откройте страницу и нажмите «В избранное».</p></div>`;
    } else {
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
      favSection = `<div class="fav-list">${items}</div>`;
    }
    return `
    <section class="favorites fade-in">
      <h1>Избранное</h1>
      ${favSection}
      <div class="fav-map-section">
        <h2 class="fav-map-title">🗺️ Карта путешествий</h2>
        <p class="fav-map-desc">Ваш путь по бесконечной библиотеке</p>
        <div class="fav-map-container">
          <canvas class="fav-journey-canvas" id="favJourneyCanvas" width="600" height="280"></canvas>
        </div>
      </div>
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

    /* Draw journey map canvas */
    const jmCanvas = document.getElementById('favJourneyCanvas');
    if (jmCanvas) themes.drawJourneyMap(jmCanvas);
  }

  /* ═══════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════ */

  function init() {
    /* Apply saved theme immediately */
    themes.setTheme(themes.getTheme());

    /* Offline-first: word bank is embedded in words.js, no fetch needed */
    app.config.ensureWordBank();

    /* Load expanded token dictionary (async, non-blocking) */
    if (lib.loadTokenDictionary) {
      lib.loadTokenDictionary().then(dict => {
        if (dict) {
          console.log('[babel] Expanded token dictionary loaded:', dict.version);
        }
      }).catch(() => {
        console.log('[babel] Using inline token data (external dictionary not available)');
      });
    }

    /* Initialize mode toggle handler */
    initModeToggle();

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
