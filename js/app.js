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

    /* UNIFIED format: #/x/{x}/y/{y}[/z/{z}]
       Depth determines view:
         - If /z/{z} present → page view
         - If only x,y → wander view
       Старый формат #/x/{x}/y/{y}/w/.../p/... тоже поддерживается */

    if (parts[0] === 'x') {
      pageXY = {};
      for (let i = 0; i < parts.length - 1; i += 2) {
        switch (parts[i]) {
          case 'x': pageXY.x = parts[i + 1]; break;
          case 'y': pageXY.y = parts[i + 1]; break;
          case 'z': pageXY.z = parts[i + 1]; break;
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
    updateFooter(route.name);

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
      <h1 class="search-title">Каталог Мира</h1>
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
        const genreOrder = ['empty', 'dialogue', 'post', 'diary', 'log', 'words'];
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
      <h2>Пространство как Хэш</h2>
      <p>Вавилон использует криптографический принцип не для того, чтобы прятать текст от пользователя, а чтобы <em>сшить пространство и текст</em>. Каждая страница библиотеки определяется своими координатами — и эти координаты математически связаны с содержимым страницы через обратимое преобразование. Пространство Вавилона имеет топологию: это бесконечный двумерный лабиринт, где координаты комнаты являются ключами к генерации её содержимого. Это алгоритмическая вселенная, по которой можно гулять.</p>

      <h2>Алфавит: 256 символов = 1 байт</h2>
      <p>Алфавит библиотеки состоит ровно из 256 символов = 2<sup>8</sup>. Каждый символ кодируется ровно 1 байтом — это максимально простая и элегантная архитектура. Алфавит включает: пробел, символ переноса строки, 33 буквы кириллицы (а–я + ё), 26 букв латиницы (a–z), 10 цифр, 36 знаков препинания и 149 эмодзи. Восемь английских букв, визуально совпадающих с русскими (A/А, E/Е, K/К, M/М, O/О, C/С, T/Т, X/Х), хранятся как отдельные записи — для них достаточно места.</p>
      <p>Перенос строки — полноценный символ алфавита. Это означает, что страница хранит не только текст, но и его форму: абзацы, структуру, визуальное расположение. Любой Telegram-пост (до 4096 символов) сохраняется в библиотеке целиком, включая разбиение на строки и эмодзи.</p>

      <h2>Страница = Telegram-пост</h2>
      <p>Длина страницы — 4096 символов, что совпадает с максимальной длиной сообщения в Telegram. Это не случайное совпадение, а осознанный выбор: библиотека XXI века, где единицей текста является не бумажная страница, а цифровой пост. Борхес работал с книгой; мы работаем с сообщением. Каждая мысль, каждый диалог, каждая заметка, когда-либо отправленная в Telegram, существует здесь — и получает собственный адрес в бесконечности.</p>
      <p>Геометрия библиотеки: 410 страниц в томе, 32 тома на полке, 5 полок на стене, 6 стен в шестигранном зале, 20 залов в секторе. Секторы нумеруются от 1 до бесконечности. Полное пространство: 256<sup>4096</sup> = 2<sup>32768</sup> возможных страниц.</p>

      <h2>Аффинная перестановка</h2>
      <p>Чтобы соседние координаты не давали похожие тексты, применяется аффинный шифр над Z/(2<sup>32768</sup>):</p>
      <pre><code>contentNumber = (bookIndex × C + OFFSET)  mod 2^32768
bookIndex     = (contentNumber − OFFSET) × I  mod 2^32768</code></pre>
      <p>Где C — нечётная константа, построенная повторением 64-битного паттерна по всей ширине 32768 бит, I — её мультипликативно обратный элемент (лемма Гензеля для 2-адических чисел), OFFSET — высокоэнтропийная константа. Это гарантирует C × I ≡ 1 (mod 2<sup>32768</sup>), обеспечивая идеальную биекцию. OFFSET решает проблему пустой страницы (0,0): при чисто мультипликативной перестановке 0 × C = 0, аффинное смещение гарантирует, что даже индекс 0 отображается в плотное число.</p>

      <h2>Обитаемый атлас</h2>
      <p>Абсолютная библиотека остаётся математически честной: любое число ↔ любая страница. Но поверх неё надстроен <em>обитаемый слой</em> — вероятностная карта заселённых районов. Каждая координата (x, y) на гекс-карте определяет стабильный жанр региона: район переписок, район дневников, серверный кластер, книжные полки или пустые залы. Путешественник попадает в районы с разным характером.</p>
      <p>Диалог генерирует переписку в формате Telegram с таймстемпами и именами. Дневник — датированные записи от первого лица. Пост — лента соцсети с авторами и тегами. Лог — серверные журналы с ISO-таймстемпами.</p>
      <p>Каждая страница автоматически классифицируется: Переписка, Лог, Пост, Дневник, Текст или Шум — с оценкой уверенности. Это не меняет содержимое страницы, но помогает навигации в бесконечности.</p>

      <h2>Фраза — не адрес, а дверь</h2>
      <p>Когда вы ищете фразу в библиотеке, результат — не одна-единственная страница. Это целое облако страниц. Фраза может стоять в начале листа или в конце; вокруг неё может быть пустота, случайный шум, переписка, дневник, код или любой другой текст. Каждый вариант — настоящая страница с собственным адресом.</p>
      <p>Поиск показывает не «результат», а несколько входов в это множество: на пустом листе, в переписке, в дневнике, среди слов. Чем короче фраза — тем больше страниц её содержат, и тем шире это облако.</p>
      <p>Поиск в Вавилоне не отвечает «где эта фраза?». Он отвечает: <em>в каких мирах эта фраза может находиться?</em></p>

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

    /* Offline-first: word bank is embedded in words.js, no fetch needed */
    app.config.ensureWordBank();

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
