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

    // Cleanup previous 3D scene
    if (app.hexweb) app.hexweb.destroy();

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
          <p>Паутина шестигранных залов в 3D. Крути, приближай, кликай соседние залы.</p>
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
     WANDER VIEW — 3D Hexagonal Web
     ============================================ */

  let wanderState = { x: 0, y: 0, wall: 1 };

  /* Hex-grid 6-direction navigation (flat-top axial coords)
     NW=(0,-1)  NE=(+1,-1)
     W =(-1,0)  E =( +1,0)
     SW=(-1,+1) SE=( 0,+1)  */
  const HEX_DIRS = [
    { key: "nw", label: "⬡ СЗ", dq: 0,  dr: -1 },
    { key: "ne", label: "⬡ СВ", dq: 1,  dr: -1 },
    { key: "w",  label: "◄ З",  dq: -1, dr: 0  },
    { key: "e",  label: "В ►",  dq: 1,  dr: 0  },
    { key: "sw", label: "⬡ ЮЗ", dq: -1, dr: 1  },
    { key: "se", label: "⬡ ЮВ", dq: 0,  dr: 1  },
  ];

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

    // Build shelves for current wall
    const wallShelves = [];
    for (let s = 1; s <= 5; s++) wallShelves.push(renderWallShelves(x, y, wall, s));

    // Hex nav buttons — arranged in a hex pattern
    const hexNavHTML = HEX_DIRS.map(d =>
      `<button class="hex-nav-btn hex-nav-${d.key}" data-dq="${d.dq}" data-dr="${d.dr}" title="${d.label}">${d.label}</button>`
    ).join("");

    return `
    <section class="wander fade-in">
      <div class="wander-header">
        <div>
          <h1 class="wander-title">Шестигранный зал</h1>
          <span class="wander-coords">X: ${x} · Y: ${y} · Сектор ${hallInfo.sector} · Зал ${hallInfo.hall}</span>
        </div>
      </div>

      <!-- 3D Hexagonal Web -->
      <div class="hex-web-container" id="hexWebContainer"></div>

      <!-- Hex navigation overlay -->
      <div class="hex-nav-ring">
        ${hexNavHTML}
        <div class="hex-nav-center" title="Вы здесь">⬡</div>
      </div>

      <!-- Wall selector tabs -->
      <div class="wall-tabs">
        <button class="wall-tab ${wall === 1 ? 'active' : ''}" data-wall="1">Стена I</button>
        <button class="wall-tab ${wall === 2 ? 'active' : ''}" data-wall="2">Стена II</button>
        <button class="wall-tab ${wall === 3 ? 'active' : ''}" data-wall="3">Стена III</button>
        <button class="wall-tab ${wall === 4 ? 'active' : ''}" data-wall="4">Стена IV</button>
      </div>

      <!-- Shelf list -->
      <div class="shelves" id="shelvesContainer">
        ${wallShelves.join("")}
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

  function bindWander(route) {
    const { x, y } = wanderState;

    // Initialize 3D hexagonal web
    const hexContainer = document.getElementById("hexWebContainer");
    if (hexContainer && app.hexweb) {
      app.hexweb.init(hexContainer, {
        onHexClick: (dq, dr) => {
          // Navigate to clicked adjacent hex
          const nx = x + dq;
          const ny = y + dr;
          location.hash = `#/wander/x/${nx}/y/${ny}`;
        }
      });
      app.hexweb.navigateTo(x, y);
    }

    // Hex navigation buttons (6-direction)
    $$(".hex-nav-btn[data-dq]").forEach(btn => {
      btn.addEventListener("click", () => {
        const dq = parseInt(btn.dataset.dq);
        const dr = parseInt(btn.dataset.dr);
        const nx = x + dq;
        const ny = y + dr;
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

    const indices = lib.numberToIndices(number);
    const text = app.utils.indicesToString(indices);
    const coords = lib.numberToCoordinates(number);
    const xy = lib.coordinatesToXY(coords);
    const highlight = lib.parseHighlight(route.params);
    const pageTextHTML = app.utils.renderPageFromIndices(indices, highlight);
    const b36 = lib.prettyBase36(number);

    // Unique hue per page — based on coordinates for visual variety
    const hueBase = (Number(coords.volume) * 37 + Number(coords.shelf) * 73 + Number(coords.wall) * 113 + Number(coords.hall) * 51) % 360;
    const accentColor = `hsl(${hueBase}, 80%, 65%)`;
    const accentGlow = `0 0 20px hsla(${hueBase}, 80%, 65%, 0.35), 0 0 60px hsla(${hueBase}, 80%, 65%, 0.1)`;
    const accentBorder = `hsla(${hueBase}, 80%, 65%, 0.25)`;

    // Page fingerprint — visual hash from first 128 alphabet entries
    const fingerprintColors = [];
    for (let i = 0; i < 128; i++) {
      const idx = indices[i] || 0;
      const h = (idx * 29 + i * 7) % 360;
      const s = 50 + (idx % 40);
      const l = 30 + (idx % 30);
      fingerprintColors.push(`hsl(${h},${s}%,${l}%)`);
    }
    const fingerprintHTML = fingerprintColors.map(c => `<span class="fp-cell" style="background:${c}"></span>`).join("");

    // Character statistics (index-based: 0=space, 1-33=RU, 34-51=EN, 52-61=digits, 62-77=punct, 78+=emoji)
    let stats = { cyrillic: 0, latin: 0, spaces: 0, digits: 0, punctuation: 0, emoji: 0 };
    for (const idx of indices) {
      if (idx === 0) stats.spaces++;
      else if (idx <= 33) stats.cyrillic++;
      else if (idx <= 51) stats.latin++;
      else if (idx <= 61) stats.digits++;
      else if (idx <= 77) stats.punctuation++;
      else stats.emoji++;
    }
    const total = indices.length;
    const letters = stats.cyrillic + stats.latin;
    const readability = Math.round(letters / total * 100);
    const densityLabel = readability > 60 ? "Читаемая" : readability > 30 ? "Разреженная" : "Шум";

    // Stats bars
    const barLetters = Math.round(letters / total * 100);
    const barSpaces = Math.round(stats.spaces / total * 100);
    const barDigits = Math.round(stats.digits / total * 100);
    const barPunct = Math.round((stats.punctuation + stats.emoji) / total * 100);

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
          <span class="stat-value">${letters}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Пробелы</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barSpaces}%; background:var(--cyan-neon);"></div></div>
          <span class="stat-value">${stats.spaces}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Знаки</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barPunct}%; background:var(--pink-neon);"></div></div>
          <span class="stat-value">${stats.punctuation + stats.emoji}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Цифры</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${barDigits}%; background:var(--purple-mid);"></div></div>
          <span class="stat-value">${stats.digits}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Эмодзи</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.round(stats.emoji / total * 100)}%; background:linear-gradient(90deg,var(--purple-neon),var(--pink-neon));"></div></div>
          <span class="stat-value">${stats.emoji}</span>
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
        Вавилон использует криптографический принцип не для того, чтобы прятать текст от пользователя,
        а чтобы <em>сшить пространство и текст</em>. Каждая страница библиотеки определяется своими координатами —
        и эти координаты математически связаны с содержимым страницы через обратимое преобразование.
        Пространство Вавилона имеет топологию: это бесконечный двумерный лабиринт, где координаты комнаты
        являются ключами к генерации её содержимого. Это алгоритмическая вселенная, по которой можно гулять.
      </p>

      <h2>Алфавит: 256 символов = 1 байт</h2>
      <p>
        Алфавит библиотеки состоит ровно из 256 символов = 2<sup>8</sup>. Каждый символ кодируется
        ровно 1 байтом — это максимально простая и элегантная архитектура. Алфавит включает: пробел,
        символ переноса строки, 33 буквы кириллицы (а–я + ё), 26 букв латиницы (a–z), 10 цифр,
        36 знаков препинания и 149 эмодзи. Восемь английских букв, визуально совпадающих с русскими
        (A/А, E/Е, K/К, M/М, O/О, C/С, T/Т, X/Х), хранятся как отдельные записи — для них
        достаточно места. Поиск автоматически отображает их в русские аналоги.
      </p>
      <p>
        Перенос строки — полноценный символ алфавита. Это означает, что страница хранит не только текст,
        но и его форму: абзацы, структуру, визуальное расположение. Любой Telegram-пост (до 4096 символов)
        сохраняется в библиотеке целиком, включая разбиение на строки и эмодзи.
      </p>

      <h2>Страница = Telegram-пост</h2>
      <p>
        Длина страницы — 4096 символов, что совпадает с максимальной длиной сообщения в Telegram.
        Это не случайное совпадение, а осознанный выбор: библиотека XXI века, где единицей текста
        является не бумажная страница, а цифровой пост. Борхес работал с книгой; мы работаем с сообщением.
        Каждая мысль, каждый диалог, каждая заметка, когда-либо отправленная в Telegram, существует здесь —
        и получает собственный адрес в бесконечности.
      </p>
      <p>
        Геометрия библиотеки: 410 страниц в томе, 32 тома на полке, 5 полок на стене, 4 стены в зале,
        20 залов в секторе. Секторы нумеруются от 1 до бесконечности. Полное пространство:
        256<sup>4096</sup> = 2<sup>32768</sup> возможных страниц.
      </p>

      <h2>Текст ↔ Число (Base-256, 1 байт на символ)</h2>
      <p>
        Каждая страница рассматривается как 32768-битное число (4096 × 8 = 2<sup>15</sup>).
        Поскольку алфавит содержит ровно 256 = 2<sup>8</sup> символов, каждый символ — это ровно 1 байт.
        Конверсия из текста в число: <code>n = n &lt;&lt; 8 | charIndex</code>. Обратная:
        <code>charIndex = n &amp; 255; n = n &gt;&gt; 8</code>. Это не просто «быстро» — это
        <em>максимально простая</em> операция. Один символ = один сдвиг = одно маскирование.
        Вся конверсия страницы — 4096 байтовых операций.
      </p>

      <h2>Аффинная перестановка</h2>
      <p>
        Чтобы соседние координаты не давали похожие тексты, применяется аффинный шифр над Z/(2<sup>32768</sup>):
      </p>
      <pre><code>contentNumber = (bookIndex × C + OFFSET)  mod 2^32768
bookIndex     = (contentNumber − OFFSET) × I  mod 2^32768</code></pre>
      <p>
        Где C = 9182736450192837465 — нечётная константа, I — её мультипликативно обратный элемент
        (лемма Гензеля для 2-адических чисел), OFFSET — высокоэнтропийная константа, построенная
        повторением 64-битного паттерна по всей ширине 32768 бит. Это гарантирует C × I ≡ 1 (mod 2<sup>32768</sup>),
        обеспечивая идеальную биекцию.
      </p>
      <p>
        OFFSET решает ключевую проблему: при чисто мультипликативной перестановке <code>0 × C = 0</code>,
        и страница (0,0) оказывалась полностью пустой. Аффинное смещение гарантирует, что даже индекс 0
        отображается в плотное, насыщенное число — каждый зал содержит богатый текст.
      </p>

      <h2>Координаты XY</h2>
      <p>
        Двумерная система координат для залов реализована через функцию спаривания Сзудзика
        (Szudzik pairing function), которая взаимно однозначно отображает пары целых чисел
        в натуральные числа. Это позволяет бесконечно блуждать по библиотеке в любом направлении.
      </p>

      <h2>Поиск</h2>
      <p>
        Любой текст существует в библиотеке — по определению, поскольку пространство содержит все
        возможные страницы. Поиск конструирует страницу, содержащую введённую фразу, вычисляет её номер
        и определяет координаты. Три режима заполнения окружающего пространства:
      </p>
      <p>
        <strong>Пустота</strong> — страница заполнена пробелами, фраза расположена по центру.
      </p>
      <p>
        <strong>Шум</strong> — страница заполнена случайными символами алфавита (включая эмодзи).
      </p>
      <p>
        <strong>Русские слова</strong> — страница заполнена случайными русскими словами из словаря.
      </p>
      <p>
        Поиск поддерживает русский и английский текст, а также эмодзи. Визуально совпадающие буквы
        (a/а, e/е и т.д.) автоматически нормализуются — набирайте на любой раскладке.
      </p>

      <h2>Слепые корешки</h2>
      <p>
        При блуждании по залам на каждой полке отображаются 32 книги с «слепыми корешками» —
        первыми 25 символами первой страницы тома. Корешки, содержащие в основном буквы,
        выделяются визуально от корешков со случайными символами.
      </p>

      <h2>Почему 256, а не 29 или 50?</h2>
      <p>
        256 = 2<sup>8</sup> = 1 байт. Это не просто «быстрая конверсия» — это <em>совпадение
        математики и архитектуры</em>. Один символ = один байт = одна байтовая операция.
        Модуль перестановки — 2<sup>32768</sup>, что позволяет заменять <code>mod</code>
        на <code>&amp; mask</code> и вычислять обратный элемент через лемму Гензеля.
        Никаких серверов, никаких баз данных — всё вычисляется на лету в браузере за миллисекунды.
        Библиотека Борхеса для XXI века: вместо 25 символов и бумажных страниц — 256 символов
        и цифровые посты.
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
