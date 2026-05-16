(() => {
  const app = window.BabelApp;
  const { esc, $, $$, highlightByRange, snippetByRange, renderPageSpans, copyText, downloadText, routeFor } = app.utils;
  const ALG = app.config.ALG;
  const lib = app.library;
  const store = app.storage;

  /* Format XY coordinates (may be BigInt for distant halls) */
  function fmtXY(v) {
    if (typeof v === "bigint") {
      const s = String(v);
      return s.length > 20 ? s.slice(0, 8) + "…" + s.slice(-8) : s;
    }
    return String(v);
  }

  /* Format any BigInt/Number for compact display */
  function fmtCoord(v) {
    if (typeof v === "bigint") {
      const s = String(v);
      return s.length > 10 ? s.slice(0, 5) + "…" + s.slice(-4) : s;
    }
    return String(v);
  }

  /* ============================================
     ROUTER
     ============================================ */

  function parseRoute() {
    const hash = location.hash.slice(1) || "/";
    const [path, query] = hash.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = new URLSearchParams(query || "");
    let name = "home";
    if (parts[0] === "wander") name = "wander";
    else if (parts[0] === "search") name = "search";
    else if (parts[0] === "page") name = "page";
    else if (parts[0] === "about") name = "about";
    else if (parts[0] === "favorites") name = "favorites";
    return { name, parts, params };
  }

  function navigate() {
    const route = parseRoute();
    const view = document.getElementById("view");
    if (!view) return;

    updateNav(route.name);

    try {
      switch (route.name) {
        case "wander":   view.innerHTML = renderWander(route); bindWander(route); break;
        case "search":   view.innerHTML = renderSearch(route); bindSearch(route); break;
        case "page":     view.innerHTML = renderPage(route); bindPage(route); break;
        case "about":    view.innerHTML = renderAbout(); break;
        case "favorites":view.innerHTML = renderFavorites(); bindFavorites(); break;
        default:         view.innerHTML = renderHome(); bindHome(); break;
      }
    } catch (err) {
      view.innerHTML = `<div class="section-shell"><div class="notice">Ошибка: ${esc(err.message)}</div></div>`;
    }
  }

  function updateNav(name) {
    $$("nav.top-nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active",
        (name === "home" && href === "#/") ||
        (name === "wander" && href.includes("wander")) ||
        (name === "search" && href.includes("search")) ||
        (name === "about" && href.includes("about")) ||
        (name === "favorites" && href.includes("favorites"))
      );
    });
  }

  /* ============================================
     HOME VIEW
     ============================================ */

  function renderHome() {
    const hexPositions = [
      { left: "8%",  top: "20%", delay: "0s",   size: "50px" },
      { left: "85%", top: "15%", delay: "2s",   size: "40px" },
      { left: "15%", top: "65%", delay: "4s",   size: "35px" },
      { left: "75%", top: "55%", delay: "1s",   size: "55px" },
      { left: "45%", top: "80%", delay: "3s",   size: "45px" },
      { left: "92%", top: "70%", delay: "5s",   size: "30px" },
    ];
    const hexes = hexPositions.map((h, i) =>
      `<div class="hex-float" style="left:${h.left};top:${h.top};animation-delay:${h.delay};width:${h.size};height:${h.size}"></div>`
    ).join("");

    const flowers = [
      { left: "5%",  top: "35%", size: "1.5rem", delay: "0s" },
      { left: "90%", top: "40%", size: "2rem",   delay: "2s" },
      { left: "50%", top: "75%", size: "1.8rem", delay: "1s" },
      { left: "25%", top: "85%", size: "1.3rem", delay: "3s" },
    ];
    const flowerEls = flowers.map(f =>
      `<span class="flower" style="left:${f.left};top:${f.top};font-size:${f.size};animation-delay:${f.delay}">✿</span>`
    ).join("");

    return `
    <section class="home fade-in">
      <div class="home-hex-grid">
        ${hexes}
        ${flowerEls}
      </div>

      <div class="home-hero">
        <h1 class="home-title">Вавилон</h1>
        <p class="home-version">Гексагональная Бесконечность · v8.0</p>
      </div>

      <div class="home-ctas">
        <a class="cta-card cta-wander" href="#/wander/x/0/y/0">
          <span class="cta-icon">⬡</span>
          <h2>Блуждание</h2>
          <p>Войди в шестигранный зал. Тяни книги с полок. Блуждай по бесконечности.</p>
        </a>
        <a class="cta-card cta-search" href="#/search">
          <span class="cta-icon">◈</span>
          <h2>Каталог Мира</h2>
          <p>Найди любой текст во вселенной и телепортируйся к нему.</p>
        </a>
      </div>

      <blockquote class="intro-quote">
        Всё что когда-либо было или будет написано уже хранится здесь.
        Здесь — <span class="highlight">дневник твоей смерти</span>, все твои мысли,
        изобретения, и даже <span class="highlight">рецепт борща мамы</span>.
        Или просто шум. Нет разницы изобретать или открывать.
      </blockquote>

      <div class="retro-grid"></div>
    </section>`;
  }

  function bindHome() {
    // Home is static — no bindings needed
  }

  /* ============================================
     WANDER VIEW
     ============================================ */

  let wanderState = { x: 0, y: 0, wall: 1 };

  function renderWander(route) {
    const parts = route.parts;
    let x = 0, y = 0, wall = 1;

    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i] === "x") x = parseInt(parts[i + 1]) || 0;
      if (parts[i] === "y") y = parseInt(parts[i + 1]) || 0;
      if (parts[i] === "wall") wall = parseInt(parts[i + 1]) || 1;
    }

    wanderState = { x, y, wall };
    const hallInfo = lib.xyToHallXY(x, y);

    // Adjacent walls for side panels
    const leftWall = wall > 1 ? wall - 1 : 4;
    const rightWall = wall < 4 ? wall + 1 : 1;

    // Build shelves for back wall (main)
    const backShelves = [];
    for (let s = 1; s <= 5; s++) backShelves.push(renderWallShelves(x, y, wall, s));

    // Build mini-shelves for side walls (just 3 visible)
    const leftShelves = [];
    for (let s = 1; s <= 3; s++) leftShelves.push(renderMiniShelves(x, y, leftWall, s));
    const rightShelves = [];
    for (let s = 1; s <= 3; s++) rightShelves.push(renderMiniShelves(x, y, rightWall, s));

    // Hall hue based on coordinates
    const hallHue = ((x * 73 + y * 137 + wall * 51) % 360 + 360) % 360;

    return `
    <section class="wander fade-in">
      <div class="wander-header">
        <div>
          <h1 class="wander-title">Шестигранный зал</h1>
          <span class="wander-coords">X: ${x} · Y: ${y} · Сектор ${hallInfo.sector} · Зал ${hallInfo.hall}</span>
        </div>
        <div class="wander-nav">
          <button class="nav-btn" data-dir="n" title="Север (Y-1)">▲ Север</button>
          <button class="nav-btn" data-dir="w" title="Запад (X-1)">◄ Запад</button>
          <button class="nav-btn" data-dir="e" title="Восток (X+1)">Восток ►</button>
          <button class="nav-btn" data-dir="s" title="Юг (Y+1)">Юг ▼</button>
        </div>
      </div>

      <!-- 3D Hexagonal Room -->
      <div class="hex-room" style="--room-hue: ${hallHue};">
        <!-- Ceiling -->
        <div class="hex-ceiling">
          <div class="ceiling-light"></div>
        </div>

        <!-- Left corridor -->
        <div class="hex-corridor hex-corridor-left">
          <div class="corridor-depth"></div>
          <div class="corridor-depth cd-2"></div>
        </div>

        <!-- Right corridor -->
        <div class="hex-corridor hex-corridor-right">
          <div class="corridor-depth"></div>
          <div class="corridor-depth cd-2"></div>
        </div>

        <!-- Left wall (angled) -->
        <div class="hex-wall hex-wall-left">
          <div class="wall-label">Стена ${leftWall}</div>
          ${leftShelves.join("")}
        </div>

        <!-- Back wall (main, flat) -->
        <div class="hex-wall hex-wall-back">
          <div class="wall-label wall-label-active">Стена ${wall}</div>
          ${backShelves.join("")}
        </div>

        <!-- Right wall (angled) -->
        <div class="hex-wall hex-wall-right">
          <div class="wall-label">Стена ${rightWall}</div>
          ${rightShelves.join("")}
        </div>

        <!-- Floor -->
        <div class="hex-floor">
          <div class="floor-grid"></div>
        </div>
      </div>

      <!-- Wall selector tabs -->
      <div class="wall-tabs">
        <button class="wall-tab ${wall === 1 ? 'active' : ''}" data-wall="1">Стена I</button>
        <button class="wall-tab ${wall === 2 ? 'active' : ''}" data-wall="2">Стена II</button>
        <button class="wall-tab ${wall === 3 ? 'active' : ''}" data-wall="3">Стена III</button>
        <button class="wall-tab ${wall === 4 ? 'active' : ''}" data-wall="4">Стена IV</button>
      </div>

      <!-- Full shelf list (below room) -->
      <div class="shelves" id="shelvesContainer">
        ${backShelves.join("")}
      </div>

      <div class="wander-actions">
        <button class="btn-neon" id="randomHallBtn">Случайный зал</button>
        <a class="btn-outline" href="#/search">Искать текст</a>
      </div>
    </section>`;
  }

  function renderWallShelves(x, y, wall, shelf) {
    let spines = "";
    for (let v = 1; v <= 32; v++) {
      const spineText = lib.getBookSpine(x, y, wall, shelf, v);
      const classification = lib.classifySpine(spineText);
      const displayText = esc(spineText || "пусто");
      const cls = classification === "noise" ? "noise" : (classification === "text" ? "has-text" : "");
      const pageUrl = `#/page/${lib.numberToB64(lib.coordinatesToNumber(lib.xyToCoordinates(x, y, wall, shelf, v, 1)))}`;
      spines += `<a class="book-spine ${cls}" href="${pageUrl}" title="Том ${v}: ${esc(spineText)}">${displayText}</a>`;
    }
    return `
    <div class="shelf-row">
      <div class="shelf-header">
        <span class="shelf-num">Полка ${shelf}</span>
        <span>· 32 тома</span>
      </div>
      <div class="book-spines">
        ${spines}
      </div>
    </div>`;
  }

  function renderMiniShelves(x, y, wall, shelf) {
    // Show only first 12 books for side walls (smaller)
    let spines = "";
    for (let v = 1; v <= 12; v++) {
      const spineText = lib.getBookSpine(x, y, wall, shelf, v);
      const classification = lib.classifySpine(spineText);
      const cls = classification === "noise" ? "noise" : (classification === "text" ? "has-text" : "");
      const pageUrl = `#/page/${lib.numberToB64(lib.coordinatesToNumber(lib.xyToCoordinates(x, y, wall, shelf, v, 1)))}`;
      spines += `<a class="mini-spine ${cls}" href="${pageUrl}" title="Том ${v}"></a>`;
    }
    return `<div class="mini-shelf">${spines}</div>`;
  }

  function bindWander(route) {
    const { x, y } = wanderState;

    // Navigation buttons
    $$(".nav-btn[data-dir]").forEach(btn => {
      btn.addEventListener("click", () => {
        const dir = btn.dataset.dir;
        let nx = x, ny = y;
        if (dir === "n") ny -= 1;
        if (dir === "s") ny += 1;
        if (dir === "w") nx -= 1;
        if (dir === "e") nx += 1;
        location.hash = `#/wander/x/${nx}/y/${ny}`;
      });
    });

    // Wall tabs
    $$(".wall-tab[data-wall]").forEach(btn => {
      btn.addEventListener("click", () => {
        const wall = parseInt(btn.dataset.wall);
        location.hash = `#/wander/x/${x}/y/${y}/wall/${wall}`;
      });
    });

    // Random hall
    const randomBtn = $("#randomHallBtn");
    if (randomBtn) {
      randomBtn.addEventListener("click", () => {
        const { x: rx, y: ry } = lib.randomHallXY();
        location.hash = `#/wander/x/${rx}/y/${ry}`;
      });
    }
  }

  /* ============================================
     SEARCH VIEW
     ============================================ */

  function renderSearch(route) {
    const q = route.params.get("q") || "";
    const mode = route.params.get("mode") || "empty";
    const count = route.params.get("count") || "6";

    let resultsHTML = "";
    if (q) {
      try {
        const variants = lib.createSearchVariants(q, mode, count);
        resultsHTML = variants.map(v => renderCatalogCard(v)).join("");
      } catch (err) {
        resultsHTML = `<div class="notice">${esc(err.message)}</div>`;
      }
    }

    const modeLabel = { empty: "Пустота", noise: "Шум", words: "Русские слова" };

    return `
    <section class="search-view fade-in">
      <h1 class="search-title">Каталог Мира</h1>
      <p class="search-subtitle">Любой текст из ${esc(String(lib.maxPageNumber()).length)} цифр существует в Вавилоне. Найди его.</p>

      <form class="search-form" id="searchForm">
        <div class="search-input-wrap">
          <input type="text" class="search-input" id="searchInput" placeholder="Введите любой текст..." value="${esc(q)}" autofocus>
        </div>

        <div class="filler-selector">
          <span class="filler-label">Окружение:</span>
          ${["empty", "noise", "words"].map(m =>
            `<button type="button" class="filler-btn ${mode === m ? 'active' : ''}" data-mode="${m}">${modeLabel[m]}</button>`
          ).join("")}
        </div>

        <button type="submit" class="search-submit">Искать в бесконечности</button>
      </form>

      <div class="search-results" id="searchResults">
        ${resultsHTML || (q ? "" : `<div class="empty-state"><div class="icon">◈</div><p>Введите фразу, чтобы найти её в бесконечной библиотеке</p></div>`)}
      </div>
    </section>`;
  }

  function renderCatalogCard(variant) {
    const snippet = snippetByRange(variant.text, variant.range, 80);
    const highlighted = highlightByRange(snippet.replace(/^… | …$/g, ""), { start: variant.range.start - Math.max(0, variant.range.start - 80), length: variant.range.length });
    // Simpler: just highlight the phrase in the snippet
    const phraseEscaped = esc(variant.phrase);
    const snippetEscaped = esc(snippet);
    const highlightedSnippet = snippetEscaped.replace(phraseEscaped, `<mark>${phraseEscaped}</mark>`);

    const coords = variant.coordinates;
    const xy = variant.xy;
    const pageUrl = routeFor(`/page/${lib.numberToB64(variant.number)}`, { hl: `${variant.range.start}:${variant.range.length}` });
    const wanderUrl = `#/wander/x/${fmtXY(xy.x)}/y/${fmtXY(xy.y)}`;

    const modeLabels = { empty: "Пустота", noise: "Шум", words: "Русские слова" };

    return `
    <div class="catalog-card">
      <div class="catalog-variant">Вариант ${variant.variant} · ${modeLabels[variant.mode]}</div>
      <div class="catalog-snippet">${highlightedSnippet}</div>
      <div class="catalog-coords">
        <span class="coord-pill">X: ${fmtXY(xy.x)}</span>
        <span class="coord-pill">Y: ${fmtXY(xy.y)}</span>
        <span class="coord-pill" title="Сектор ${coords.sector}">Сектор ${fmtCoord(coords.sector)}</span>
        <span class="coord-pill" title="Зал ${coords.hall}">Зал ${fmtCoord(coords.hall)}</span>
        <span class="coord-pill">Стена ${coords.wall}</span>
        <span class="coord-pill">Полка ${coords.shelf}</span>
        <span class="coord-pill">Том ${coords.volume}</span>
        <span class="coord-pill">Лист ${coords.page}</span>
      </div>
      <div class="catalog-actions">
        <a class="teleport-btn" href="${pageUrl}">Телепортироваться</a>
        <a class="btn-outline" href="${wanderUrl}">Перейти в зал</a>
        <button class="btn-outline copy-link-btn" data-url="${location.origin}${location.pathname}${pageUrl}">Копировать ссылку</button>
      </div>
    </div>`;
  }

  function bindSearch(route) {
    const form = $("#searchForm");
    const input = $("#searchInput");
    if (!form || !input) return;

    let currentMode = route.params.get("mode") || "empty";

    // Filler mode buttons
    $$(".filler-btn[data-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        $$(".filler-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
      });
    });

    // Form submit
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (q) {
        location.hash = `#/search?q=${encodeURIComponent(q)}&mode=${currentMode}`;
      }
    });

    // Copy link buttons
    $$(".copy-link-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        copyText(btn.dataset.url, "Ссылка скопирована");
      });
    });
  }

  /* ============================================
     PAGE VIEW
     ============================================ */

  function renderPage(route) {
    const b64 = route.parts[1];
    if (!b64) return `<div class="section-shell"><div class="notice">Страница не указана</div></div>`;

    let number;
    try {
      number = lib.b64ToNumber(b64);
    } catch {
      return `<div class="section-shell"><div class="notice">Неверный адрес страницы</div></div>`;
    }

    const text = lib.numberToText(number);
    const coords = lib.numberToCoordinates(number);
    const xy = lib.coordinatesToXY(coords);
    const highlight = lib.parseHighlight(route.params);
    const pageTextHTML = renderPageSpans(text, highlight);
    const b36 = lib.prettyBase36(number);

    // Unique hue per page — based on coordinates for visual variety
    const hueBase = (Number(coords.volume) * 37 + Number(coords.shelf) * 73 + Number(coords.wall) * 113 + Number(coords.hall) * 51) % 360;
    const accentColor = `hsl(${hueBase}, 80%, 65%)`;
    const accentGlow = `0 0 20px hsla(${hueBase}, 80%, 65%, 0.35), 0 0 60px hsla(${hueBase}, 80%, 65%, 0.1)`;
    const accentBorder = `hsla(${hueBase}, 80%, 65%, 0.25)`;

    // Page fingerprint — visual hash from first 80 characters
    const fingerprintColors = [];
    for (let i = 0; i < 60; i++) {
      const ch = text.charCodeAt(i) || 0;
      const h = (ch * 29 + i * 7) % 360;
      const s = 50 + (ch % 40);
      const l = 30 + (ch % 30);
      fingerprintColors.push(`hsl(${h},${s}%,${l}%)`);
    }
    const fingerprintHTML = fingerprintColors.map(c => `<span class="fp-cell" style="background:${c}"></span>`).join("");

    // Character statistics
    let stats = { letters: 0, spaces: 0, digits: 0, punctuation: 0 };
    for (const ch of text) {
      if (ch === " ") stats.spaces++;
      else if (/[а-яё]/i.test(ch)) stats.letters++;
      else if (/[0-9]/.test(ch)) stats.digits++;
      else stats.punctuation++;
    }
    const total = text.length;
    const readability = Math.round(stats.letters / total * 100);
    const densityLabel = readability > 60 ? "Читаемая" : readability > 30 ? "Разреженная" : "Шум";

    // Stats bars
    const barLetters = Math.round(stats.letters / total * 100);
    const barSpaces = Math.round(stats.spaces / total * 100);
    const barDigits = Math.round(stats.digits / total * 100);
    const barPunct = Math.round(stats.punctuation / total * 100);

    // Build breadcrumbs
    const crumbs = [
      { label: "Вавилон", href: "#/" },
      { label: `Зал X:${fmtXY(xy.x)} Y:${fmtXY(xy.y)}`, href: `#/wander/x/${fmtXY(xy.x)}/y/${fmtXY(xy.y)}/wall/${coords.wall}` },
      { label: `Стена ${coords.wall} · Полка ${coords.shelf}`, href: `#/wander/x/${fmtXY(xy.x)}/y/${fmtXY(xy.y)}/wall/${coords.wall}` },
      { label: `Том ${coords.volume} · Лист ${coords.page}` },
    ];
    const breadcrumbsHTML = crumbs.map((c, i) =>
      c.href
        ? `<a href="${c.href}">${esc(c.label)}</a>${i < crumbs.length - 1 ? '<span class="sep">›</span>' : ''}`
        : `<span>${esc(c.label)}</span>`
    ).join("");

    // Page navigation
    const pageNum = Number(coords.page);
    const totalPages = Number(ALG.pagesPerVolume);
    // Next/prev pages should NOT carry over highlight from search — it's a different page
    const prevPage = pageNum > 1
      ? routeFor(`/page/${lib.numberToB64(lib.coordinatesToNumber({...coords, page: BigInt(pageNum - 1)}))}`)
      : null;
    const nextPage = pageNum < totalPages
      ? routeFor(`/page/${lib.numberToB64(lib.coordinatesToNumber({...coords, page: BigInt(pageNum + 1)}))}`)
      : null;

    // Save to history
    try {
      store.pushHistory({
        url: location.hash,
        title: lib.pageTitle(coords),
      });
    } catch {}

    return `
    <section class="page-view fade-in">
      <div class="page-breadcrumbs">
        ${breadcrumbsHTML}
      </div>

      <div class="page-header" style="border-color:${accentBorder};">
        <div>
          <h2 style="color:${accentColor}; text-shadow:${accentGlow};">Том ${coords.volume} · Лист ${pageNum}</h2>
          <span style="color:var(--text-dim); font-family:var(--font-mono); font-size:0.8rem;">Полка ${coords.shelf} · Стена ${coords.wall}</span>
        </div>
        <div class="page-density">
          <span class="density-badge density-${densityLabel === 'Читаемая' ? 'readable' : densityLabel === 'Разреженная' ? 'sparse' : 'noise'}">${densityLabel}</span>
          <span class="density-pct">${readability}% букв</span>
        </div>
      </div>

      <div class="page-fingerprint">${fingerprintHTML}</div>

      <div class="page-text-box" style="border-color:${accentBorder}; box-shadow:${accentGlow};">
        <div class="page-text">${pageTextHTML}</div>
      </div>

      <div class="page-stats">
        <div class="stat-row">
          <span class="stat-label">Буквы</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barLetters}%; background:var(--purple-neon);"></div></div>
          <span class="stat-value">${stats.letters}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Пробелы</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barSpaces}%; background:var(--cyan-neon);"></div></div>
          <span class="stat-value">${stats.spaces}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Знаки</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barPunct}%; background:var(--pink-neon);"></div></div>
          <span class="stat-value">${stats.punctuation}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Цифры</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barDigits}%; background:var(--purple-mid);"></div></div>
          <span class="stat-value">${stats.digits}</span>
        </div>
      </div>

      <div class="page-nav">
        ${prevPage ? `<a class="btn-outline" href="${prevPage}">← Лист ${pageNum - 1}</a>` : '<span></span>'}
        <span class="page-num" style="color:${accentColor};">Лист ${pageNum} из ${totalPages}</span>
        ${nextPage ? `<a class="btn-outline" href="${nextPage}">Лист ${pageNum + 1} →</a>` : '<span></span>'}
      </div>

      <div class="page-passport">
        <div class="passport-title" style="color:${accentColor};">Паспорт страницы</div>
        <div class="passport-grid">
          <div class="passport-item"><span class="label">Зал</span><span class="value">X: ${fmtXY(xy.x)}, Y: ${fmtXY(xy.y)}</span></div>
          <div class="passport-item"><span class="label">Сектор</span><span class="value" title="${coords.sector}">${fmtCoord(coords.sector)}</span></div>
          <div class="passport-item"><span class="label">Зал</span><span class="value">${coords.hall}</span></div>
          <div class="passport-item"><span class="label">Стена</span><span class="value">${coords.wall}</span></div>
          <div class="passport-item"><span class="label">Полка</span><span class="value">${coords.shelf}</span></div>
          <div class="passport-item"><span class="label">Том</span><span class="value">${coords.volume}</span></div>
          <div class="passport-item"><span class="label">Лист</span><span class="value">${coords.page}</span></div>
          <div class="passport-item"><span class="label">Base64</span><span class="value">${esc(b64.slice(0, 20))}${b64.length > 20 ? '…' : ''}</span></div>
        </div>
      </div>

      <div class="page-actions">
        <button class="btn-neon" id="favBtn">★ В избранное</button>
        <button class="btn-outline" id="copyTextBtn">Копировать текст</button>
        <button class="btn-outline" id="downloadBtn">Скачать .txt</button>
        <button class="btn-outline" id="copyLinkBtn">Копировать ссылку</button>
      </div>
    </section>`;
  }

  function bindPage(route) {
    const b64 = route.parts[1];
    if (!b64) return;

    let number;
    try { number = lib.b64ToNumber(b64); } catch { return; }
    const coords = lib.numberToCoordinates(number);

    // Favorite button
    const favBtn = $("#favBtn");
    if (favBtn) {
      favBtn.addEventListener("click", () => {
        store.addFavorite({
          url: location.hash,
          title: lib.pageTitle(coords),
        });
        favBtn.textContent = "★ Сохранено";
        favBtn.disabled = true;
      });
    }

    // Copy text
    const copyBtn = $("#copyTextBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = lib.numberToText(number);
        copyText(text, "Текст скопирован");
      });
    }

    // Download
    const dlBtn = $("#downloadBtn");
    if (dlBtn) {
      dlBtn.addEventListener("click", () => {
        const text = lib.numberToText(number);
        const filename = `babel-s${coords.sector}-h${coords.hall}-w${coords.wall}-sh${coords.shelf}-v${coords.volume}-p${coords.page}.txt`;
        downloadText(filename, text);
      });
    }

    // Copy link
    const linkBtn = $("#copyLinkBtn");
    if (linkBtn) {
      linkBtn.addEventListener("click", () => {
        copyText(location.href, "Ссылка скопирована");
      });
    }
  }

  /* ============================================
     ABOUT VIEW
     ============================================ */

  function renderAbout() {
    return `
    <section class="about fade-in">
      <h1>Алгоритм Вавилона</h1>

      <h2>Пространство как Хэш</h2>
      <p>
        Вавилон v8.0 использует криптографический принцип не для того, чтобы прятать текст от пользователя,
        а чтобы <em>сшить пространство и текст</em>. Каждая страница библиотеки определяется своими координатами —
        и эти координаты математически связаны с содержимым страницы через обратимое преобразование.
        Пространство Вавилона имеет топологию: это бесконечный двумерный лабиринт, где координаты комнаты
        являются ключами к генерации её содержимого. Это алгоритмическая вселенная, по которой можно гулять.
      </p>

      <h2>Алфавит и геометрия</h2>
      <p>
        Алфавит библиотеки состоит ровно из 64 символов: пробел, 33 буквы кириллицы (от «а» до «я» включая «ё»),
        10 цифр, 10 знаков препинания (точка, запятая, восклицательный и вопросительный знаки, точка с запятой,
        двоеточие, тире, дефис, кавычки «ёлочкой», скобки) и 10 дополнительных символов (многоточие,
        средняя точка, стрелки направлений). 64 = 2<sup>6</sup> — это ключевое решение: каждый символ
        кодируется ровно 6 битами, что делает конверсию текст ↔ число побитовой операцией вместо
        медленного деления BigInt.
      </p>
      <p>
        Каждая страница содержит ровно 900 символов, разбитых на 10 строк по 90 символов.
        Геометрия библиотеки: 410 страниц в томе, 32 тома на полке, 5 полок на стене, 4 стены в зале,
        20 залов в секторе. Секторы нумеруются от 1 до бесконечности. Это даёт полное пространство
        из 64<sup>900</sup> = 2<sup>5400</sup> возможных страниц — число, которое невозможно записать
        в наблюдаемой вселенной.
      </p>

      <h2>Текст ↔ Число (Base-64 Bitwise)</h2>
      <p>
        Каждая страница рассматривается как 5400-битное число. Поскольку алфавит содержит ровно
        64 = 2<sup>6</sup> символов, каждый символ кодируется ровно 6 битами. Конверсия из текста в число —
        это просто цепочка битовых сдвигов: <code>n = n &lt;&lt; 6 | charIndex</code>. Обратная конверсия —
        маскирование и сдвиг: <code>charIndex = n &amp; 63; n = n &gt;&gt; 6</code>. Это в сотни раз быстрее,
        чем конверсия с произвольным основанием через BigInt деление, и позволяет библиотеке работать
        мгновенно прямо в браузере, без серверов.
      </p>

      <h2>Аффинная перестановка</h2>
      <p>
        Чтобы соседние координаты не давали похожие тексты, применяется аффинный шифр над Z/(2<sup>5400</sup>):
      </p>
      <pre><code>contentNumber = (bookIndex × C + OFFSET)  mod 2^5400
bookIndex     = (contentNumber − OFFSET) × I  mod 2^5400</code></pre>
      <p>
        Где C = 9182736450192837465 — нечётная константа (любое нечётное число взаимно просто с 2<sup>5400</sup>),
        I — её мультипликативно обратный элемент по модулю 2<sup>5400</sup>, вычисленный через лемму Гензеля
        для 2-адических чисел, а OFFSET — константа с высокой энтропией, построенная повторением 64-битного
        паттерна 0x5BD1E9A3F7C20658 по всей ширине 5400 бит. Это гарантирует C × I ≡ 1 (mod 2<sup>5400</sup>),
        обеспечивая идеальную биекцию: каждая страница имеет уникальные координаты, и каждая координата
        определяет уникальную страницу.
      </p>
      <p>
        Ключевое преимущество OFFSET: даже индекс 0 (начало библиотеки, координаты 0,0) отображается
        в огромное число с плотным битовым паттерном, давая полностью заполненную страницу.
        При чисто мультипликативной перестановке <code>0 × C = 0</code>, и страница (0,0) оказывалась
        полностью пустой. Аффинное смещение решает эту проблему — каждый зал библиотеки,
        включая начало координат, содержит богатый, плотный текст.
      </p>
      <p>
        Поскольку модуль — степень двойки, операции <code>mod 2<sup>5400</sup></code> реализуются
        как простое побитовое И: <code>x &amp; ((1n &lt;&lt; 5400n) - 1n)</code>, что ещё быстрее.
      </p>

      <h2>Координаты XY</h2>
      <p>
        В версии 8.0 добавлена двумерная система координат для залов. Отображение между (X, Y) и
        (сектор, зал) осуществляется через функцию спаривания Сзудзика (Szudzik pairing function),
        которая взаимно однозначно отображает пары целых чисел в натуральные числа. Это позволяет
        бесконечно блуждать по библиотеке в любом направлении, не выходя за пределы пространства.
      </p>

      <h2>Поиск</h2>
      <p>
        Любой текст существует в библиотеке — по определению, поскольку пространство содержит все
        возможные страницы. Поиск конструирует страницу, содержащую введённую фразу, вычисляет её номер
        и определяет координаты. Три режима заполнения окружающего пространства:
      </p>
      <p>
        <strong>Пустота</strong> — страница заполнена пробелами, фраза расположена по центру.
        Минимализм и тишина, как в настоящей библиотеке, где большинство книг пусты.
      </p>
      <p>
        <strong>Шум</strong> — страница заполнена случайными символами алфавита.
        Классический облик Вавилона: бессмысленный шум, в котором затеряна единственная фраза.
      </p>
      <p>
        <strong>Русские слова</strong> — страница заполнена случайными русскими словами из словаря библиотеки.
        Создаёт иллюзию осмысленного текста вокруг найденной фразы.
      </p>

      <h2>Слепые корешки</h2>
      <p>
        При блуждании по залам на каждой полке отображаются 32 книги с «слепыми корешками» —
        первыми 25 символами первой страницы тома. Корешки, содержащие в основном буквы,
        выделяются визуально от корешков со случайными символами. Это позволяет интуитивно находить
        книги, которые могут содержать осмысленный текст, просто просматривая полки.
      </p>

      <h2>Почему base-64, а не base-29 или base-50?</h2>
      <p>
        Предыдущая версия использовала алфавит из 50 символов (base-50). Это означало, что конверсия
        текст ↔ число требовала деления BigInt на 50 для каждого из 900 символов — медленная операция.
        Переход на base-64 (2<sup>6</sup>) превращает каждую конверсию в 900 битовых сдвигов и масок,
        что принципиально быстрее. Кроме того, модуль перестановки становится степенью двойки (2<sup>5400</sup>),
        что позволяет заменять дорогой <code>mod</code> на дешёвый <code>&amp; mask</code> и вычислять
        обратный элемент через лемму Гензеля вместо расширенного алгоритма Евклида. Это делает всю
        библиотеку полностью статичной и мгновенной — никаких серверов, никаких баз данных,
        всё вычисляется на лету прямо в браузере за миллисекунды.
      </p>
    </section>`;
  }

  /* ============================================
     FAVORITES VIEW
     ============================================ */

  function renderFavorites() {
    const favs = store.readStore("babelFavorites");

    if (favs.length === 0) {
      return `
      <section class="favorites fade-in">
        <h1>Избранное</h1>
        <div class="empty-state">
          <div class="icon">★</div>
          <p>Пока ничего не сохранено. Откройте страницу и нажмите «В избранное».</p>
        </div>
      </section>`;
    }

    const items = favs.map((f, i) => `
      <div class="fav-item">
        <div class="fav-info">
          <div class="fav-title"><a href="${esc(f.url)}">${esc(f.title)}</a></div>
          <div class="fav-date">${new Date(f.createdAt).toLocaleString("ru-RU")}</div>
        </div>
        <div class="fav-actions">
          <a class="btn-outline" href="${esc(f.url)}">Открыть</a>
          <button class="fav-remove" data-index="${i}">Удалить</button>
        </div>
      </div>
    `).join("");

    return `
    <section class="favorites fade-in">
      <h1>Избранное</h1>
      <div class="fav-list">${items}</div>
    </section>`;
  }

  function bindFavorites() {
    $$(".fav-remove[data-index]").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index);
        const favs = store.readStore("babelFavorites");
        if (favs[idx]) {
          store.removeFavorite(favs[idx].url);
          navigate(); // Re-render
        }
      });
    });
  }

  /* ============================================
     PARTICLES
     ============================================ */

  function initParticles() {
    const container = document.getElementById("particles");
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.left = Math.random() * 100 + "%";
      p.style.animationDelay = Math.random() * 8 + "s";
      p.style.animationDuration = (6 + Math.random() * 6) + "s";
      p.style.width = (2 + Math.random() * 4) + "px";
      p.style.height = p.style.width;
      p.style.background = Math.random() > 0.5 ? "var(--purple-neon)" : "var(--pink-neon)";
      container.appendChild(p);
    }
  }

  /* ============================================
     INIT
     ============================================ */

  function init() {
    initParticles();
    navigate();
    window.addEventListener("hashchange", navigate);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
