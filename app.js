
const ALGORITHMS = {
  v1: {
    label: "v1 стандартный",
    alphabet: " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789",
    pageLength: 900,
    lineWidth: 90,
    pagesPerVolume: 410n,
    volumesPerShelf: 32n,
    shelvesPerWall: 5n,
    wallsPerHall: 4n,
    hallsPerSector: 20n,
    description: "Полная библиотека строк фиксированной длины на русском алфавите.",
  },
  v1s: {
    label: "v1s короткий",
    alphabet: " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789",
    pageLength: 300,
    lineWidth: 75,
    pagesPerVolume: 100n,
    volumesPerShelf: 16n,
    shelvesPerWall: 5n,
    wallsPerHall: 4n,
    hallsPerSector: 20n,
    description: "Короткая версия: тот же принцип, но компактнее ссылки.",
  },
  v1c: {
    label: "v1c классический",
    alphabet: " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789",
    pageLength: 3200,
    lineWidth: 80,
    pagesPerVolume: 410n,
    volumesPerShelf: 32n,
    shelvesPerWall: 5n,
    wallsPerHall: 4n,
    hallsPerSector: 20n,
    description: "40 строк × 80 символов. Ближе к классической странице, но адреса очень длинные.",
  },
};

const DEFAULT_VERSION = "v1";
const DEFAULT_VARIANTS = 8;
const MAX_VARIANTS = 48;
const ADDRESS_GROUP = 8;

const $ = (sel) => document.querySelector(sel);

function alg(version) {
  return ALGORITHMS[version] || ALGORITHMS[DEFAULT_VERSION];
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(text) {
  return mulberry32(fnv1a(text));
}

function normalizeText(raw, version) {
  const a = alg(version);
  const lower = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  let out = "";
  for (const ch of lower) {
    out += a.alphabet.includes(ch) ? ch : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

function fixedPageText(text, version) {
  const a = alg(version);
  let s = normalizeText(text, version);
  if (s.length > a.pageLength) s = s.slice(0, a.pageLength);
  return s.padEnd(a.pageLength, " ");
}

function maxPageNumber(version) {
  const a = alg(version);
  return BigInt(a.alphabet.length) ** BigInt(a.pageLength);
}

function textToNumber(text, version) {
  const a = alg(version);
  const base = BigInt(a.alphabet.length);
  const fixed = fixedPageText(text, version);

  let n = 0n;
  for (const ch of fixed) {
    const digit = a.alphabet.indexOf(ch);
    if (digit < 0) throw new Error(`Символ не входит в алфавит: ${ch}`);
    n = n * base + BigInt(digit);
  }
  return n;
}

function numberToText(n, version) {
  const a = alg(version);
  const max = maxPageNumber(version);
  let x = BigInt(n);
  if (x < 0n || x >= max) {
    throw new Error("Адрес вне пространства этой версии библиотеки.");
  }

  const base = BigInt(a.alphabet.length);
  const chars = new Array(a.pageLength);

  for (let i = a.pageLength - 1; i >= 0; i--) {
    const digit = Number(x % base);
    chars[i] = a.alphabet[digit];
    x = x / base;
  }

  return chars.join("");
}

function base36ToBigInt(s) {
  const clean = cleanAddress(s);
  if (!clean) return 0n;

  let n = 0n;
  for (const ch of clean) {
    const code = ch.charCodeAt(0);
    let d;
    if (code >= 48 && code <= 57) d = code - 48;
    else if (code >= 97 && code <= 122) d = code - 87;
    else continue;
    n = n * 36n + BigInt(d);
  }
  return n;
}

function cleanAddress(s) {
  return String(s || "").toLowerCase().replace(/[^0-9a-z]/g, "");
}

function bigintToBase36(n) {
  return BigInt(n).toString(36);
}

function encodeAddressFromText(text, version) {
  return bigintToBase36(textToNumber(text, version));
}

function decodeTextFromAddress(address, version) {
  return numberToText(base36ToBigInt(address), version);
}

function canonicalAddress(address) {
  return bigintToBase36(base36ToBigInt(address));
}

function prettyAddress(address) {
  const clean = canonicalAddress(address);
  const chunks = [];
  for (let i = 0; i < clean.length; i += ADDRESS_GROUP) {
    chunks.push(clean.slice(i, i + ADDRESS_GROUP));
  }
  return chunks.join("-");
}

function compactAddress(pretty) {
  return cleanAddress(pretty);
}

function numberToCoordinates(n, version) {
  const a = alg(version);
  let x = BigInt(n);

  const page = (x % a.pagesPerVolume) + 1n;
  x = x / a.pagesPerVolume;

  const volume = (x % a.volumesPerShelf) + 1n;
  x = x / a.volumesPerShelf;

  const shelf = (x % a.shelvesPerWall) + 1n;
  x = x / a.shelvesPerWall;

  const wall = (x % a.wallsPerHall) + 1n;
  x = x / a.wallsPerHall;

  const hall = (x % a.hallsPerSector) + 1n;
  x = x / a.hallsPerSector;

  const sector = x + 1n;

  return { sector, hall, wall, shelf, volume, page };
}

function coordinatesToNumber(c, version) {
  const a = alg(version);

  const sector = BigInt(c.sector || 1);
  const hall = BigInt(c.hall || 1);
  const wall = BigInt(c.wall || 1);
  const shelf = BigInt(c.shelf || 1);
  const volume = BigInt(c.volume || 1);
  const page = BigInt(c.page || 1);

  if (sector < 1n || hall < 1n || hall > a.hallsPerSector || wall < 1n || wall > a.wallsPerHall ||
      shelf < 1n || shelf > a.shelvesPerWall || volume < 1n || volume > a.volumesPerShelf ||
      page < 1n || page > a.pagesPerVolume) {
    throw new Error("Координаты вне геометрии этой версии.");
  }

  let x = sector - 1n;
  x = x * a.hallsPerSector + (hall - 1n);
  x = x * a.wallsPerHall + (wall - 1n);
  x = x * a.shelvesPerWall + (shelf - 1n);
  x = x * a.volumesPerShelf + (volume - 1n);
  x = x * a.pagesPerVolume + (page - 1n);

  if (x >= maxPageNumber(version)) {
    throw new Error("Координаты дают число вне пространства страниц этой версии.");
  }

  return x;
}

function coordinateUrl(version, c, highlightRange = null) {
  const q = highlightRange ? `?hl=${highlightRange.start}:${highlightRange.length}` : "";
  return `#/${version}/sector/${c.sector}/hall/${c.hall}/wall/${c.wall}/shelf/${c.shelf}/volume/${c.volume}/page/${c.page}${q}`;
}

function pageUrl(version, address, highlightRange = null) {
  const n = base36ToBigInt(address);
  const c = numberToCoordinates(n, version);
  return coordinateUrl(version, c, highlightRange);
}

function rawAddressUrl(version, address, highlightRange = null) {
  const pretty = prettyAddress(address);
  const q = highlightRange ? `?hl=${highlightRange.start}:${highlightRange.length}` : "";
  return `#/${version}/a/${pretty}${q}`;
}

function coordinateTitle(c) {
  return `Сектор ${c.sector} · Зал ${c.hall} · Стена ${c.wall} · Полка ${c.shelf} · Том ${c.volume} · Лист ${c.page}`;
}

function randomPageText(version) {
  const a = alg(version);
  const rng = rngFrom(`${Date.now()}:${Math.random()}:${version}`);
  let s = "";
  for (let i = 0; i < a.pageLength; i++) {
    s += a.alphabet[Math.floor(rng() * a.alphabet.length)];
  }
  return s;
}

function makePageWithPhrase(phraseRaw, version, variant, strategy, offset = 0) {
  const a = alg(version);
  const phrase = normalizeText(phraseRaw, version);
  if (!phrase) throw new Error("После нормализации фраза пустая.");
  if (phrase.length > a.pageLength) {
    throw new Error(`Фраза длиннее страницы: ${phrase.length} символов при лимите ${a.pageLength}.`);
  }

  const variantNumber = offset + variant;
  const rng = rngFrom(`${version}:phrase:${phrase}:variant:${variantNumber}:strategy:${strategy}`);
  const chars = new Array(a.pageLength);

  for (let i = 0; i < a.pageLength; i++) {
    chars[i] = a.alphabet[Math.floor(rng() * a.alphabet.length)];
  }

  if (strategy === "quiet" || strategy === "center") {
    for (let i = 0; i < a.pageLength; i++) {
      if (rng() < 0.18) chars[i] = " ";
    }
  }

  let position;
  const maxPos = a.pageLength - phrase.length;
  if (strategy === "start") position = Math.min(24, maxPos);
  else if (strategy === "end") position = Math.max(0, maxPos - 24);
  else if (strategy === "center") position = Math.max(0, Math.floor((a.pageLength - phrase.length) / 2));
  else position = Math.floor(rng() * (maxPos + 1));

  if (position > 0) chars[position - 1] = " ";
  for (let i = 0; i < phrase.length; i++) {
    chars[position + i] = phrase[i];
  }
  if (position + phrase.length < chars.length) chars[position + phrase.length] = " ";

  return {
    phrase,
    variant: variantNumber,
    position,
    text: chars.join(""),
  };
}

function paragraphize(text, version) {
  const a = alg(version);
  const clean = String(text).replace(/\s+$/g, "");
  const width = a.lineWidth;
  const parts = [];
  for (let i = 0; i < clean.length; i += width) {
    parts.push(clean.slice(i, i + width));
  }
  return parts.join("\n");
}

function highlightByRange(text, range, version) {
  const safeStart = Math.max(0, Math.min(text.length, range.start));
  const safeEnd = Math.max(safeStart, Math.min(text.length, range.start + range.length));
  const before = paragraphize(text.slice(0, safeStart), version);
  const mid = paragraphize(text.slice(safeStart, safeEnd), version);
  const after = paragraphize(text.slice(safeEnd), version);
  return `${esc(before)}<mark>${esc(mid)}</mark>${esc(after)}`;
}

function renderText(text, highlightRange, version) {
  if (highlightRange) return highlightByRange(text, highlightRange, version);
  return esc(paragraphize(text, version));
}

function parseHighlight(params) {
  const raw = params.get("hl") || "";
  const m = raw.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { start: Number(m[1]), length: Number(m[2]) };
}

function snippetByRange(text, range, version, pad = 80) {
  const start = Math.max(0, range.start - pad);
  const end = Math.min(text.length, range.start + range.length + pad);
  const prefix = start > 0 ? "… " : "";
  const suffix = end < text.length ? " …" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function renderHome() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const q = params.get("q") || "";
  const version = params.get("version") || DEFAULT_VERSION;
  const offset = Number(params.get("offset") || "0");
  const count = Number(params.get("count") || DEFAULT_VARIANTS);
  const strategy = params.get("strategy") || "random";

  $("#app").innerHTML = `
    <section class="grid">
      <div class="card">
        <div class="tabs">
          <a class="button tab active" href="#/">Поиск адресов</a>
          <a class="button tab" href="#/encode">Кодировать текст</a>
          <a class="button tab" href="#/about">Как работает</a>
        </div>

        <h1>Найти адреса страниц, содержащих фразу</h1>
        <p>
          Это не поиск по базе. Это вычисление координат в пространстве всех возможных страниц.
          Каждая карточка — настоящая страница: фраза встроена в полный лист, лист превращён в число,
          число разложено на сектор, зал, стену, полку, том и страницу.
        </p>

        <div class="notice good">
          URL страницы библиотеки содержит настоящие координаты, а не декоративный хеш.
          Подсветка хранит только диапазон: позицию и длину фрагмента.
        </div>

        <form id="phraseForm">
          <textarea id="phraseInput" placeholder="Например: каждая страница имеет свою ссылку">${esc(q)}</textarea>

          <div class="form-grid" style="margin-top:10px">
            <div class="field">
              <label>Версия / размер страницы</label>
              <select id="versionInput">
                ${Object.entries(ALGORITHMS).map(([v, a]) => `<option value="${v}" ${v === version ? "selected" : ""}>${a.label} · ${a.pageLength} символов</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label>Вариантов</label>
              <input id="variantCountInput" inputmode="numeric" value="${Number.isFinite(count) ? count : DEFAULT_VARIANTS}">
            </div>

            <div class="field">
              <label>Смещение</label>
              <input id="offsetInput" inputmode="numeric" value="${Number.isFinite(offset) ? offset : 0}">
            </div>

            <div class="field">
              <label>Расположение</label>
              <select id="strategyInput">
                ${[
                  ["random", "разные места"],
                  ["center", "по центру"],
                  ["start", "в начале"],
                  ["end", "в конце"],
                  ["quiet", "тихое окружение"],
                ].map(([k, label]) => `<option value="${k}" ${k === strategy ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Показать варианты</button>
            <button id="nextBatchBtn" type="button">Следующие варианты</button>
            <button id="shareFindBtn" type="button">Скопировать ссылку на результаты</button>
          </div>
        </form>

        <div id="results" class="variants"></div>
      </div>

      <aside class="card">
        <h2>Открыть координаты</h2>
        <form id="coordForm">
          <div class="field">
            <label>Версия</label>
            <select id="coordVersionInput">
              ${Object.entries(ALGORITHMS).map(([v, a]) => `<option value="${v}">${a.label}</option>`).join("")}
            </select>
          </div>
          <div class="coord-grid" style="margin-top:10px">
            ${[
              ["sector", "Сектор", "1"],
              ["hall", "Зал", "1"],
              ["wall", "Стена", "1"],
              ["shelf", "Полка", "1"],
              ["volume", "Том", "1"],
              ["page", "Лист", "1"],
            ].map(([id, label, value]) => `
              <div class="field">
                <label>${label}</label>
                <input id="${id}Input" value="${value}" inputmode="numeric">
              </div>
            `).join("")}
          </div>
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Открыть</button>
          </div>
        </form>

        <h2 style="margin-top:22px">Открыть raw-адрес</h2>
        <form id="addressForm">
          <select id="addressVersionInput">
            ${Object.entries(ALGORITHMS).map(([v, a]) => `<option value="${v}">${a.label}</option>`).join("")}
          </select>
          <input id="addressInput" class="mono" style="margin-top:10px" placeholder="base36-адрес или адрес с дефисами">
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Открыть</button>
          </div>
        </form>

        <div class="notice">
          В v1 один том содержит ${ALGORITHMS.v1.pagesPerVolume} страниц, на полке ${ALGORITHMS.v1.volumesPerShelf} тома,
          на стене ${ALGORITHMS.v1.shelvesPerWall} полок, в зале ${ALGORITHMS.v1.wallsPerHall} стены,
          в секторе ${ALGORITHMS.v1.hallsPerSector} залов.
        </div>
      </aside>
    </section>
  `;

  $("#phraseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = $("#phraseInput").value.trim();
    const v = $("#versionInput").value;
    const c = $("#variantCountInput").value;
    const off = $("#offsetInput").value || "0";
    const st = $("#strategyInput").value;
    location.hash = `#/find?version=${encodeURIComponent(v)}&q=${encodeURIComponent(q)}&offset=${encodeURIComponent(off)}&count=${encodeURIComponent(c)}&strategy=${encodeURIComponent(st)}`;
  });

  $("#nextBatchBtn").addEventListener("click", () => {
    const q = $("#phraseInput").value.trim();
    const v = $("#versionInput").value;
    const c = Math.max(1, Math.min(MAX_VARIANTS, Number($("#variantCountInput").value) || DEFAULT_VARIANTS));
    const off = Number($("#offsetInput").value) || 0;
    const st = $("#strategyInput").value;
    location.hash = `#/find?version=${encodeURIComponent(v)}&q=${encodeURIComponent(q)}&offset=${off + c}&count=${c}&strategy=${encodeURIComponent(st)}`;
  });

  $("#shareFindBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    alert("Ссылка на результаты скопирована.");
  });

  $("#coordForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#coordVersionInput").value;
    const c = {
      sector: $("#sectorInput").value,
      hall: $("#hallInput").value,
      wall: $("#wallInput").value,
      shelf: $("#shelfInput").value,
      volume: $("#volumeInput").value,
      page: $("#pageInput").value,
    };
    try {
      coordinatesToNumber(c, v);
      location.hash = coordinateUrl(v, c);
    } catch (err) {
      alert(err.message);
    }
  });

  $("#addressForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#addressVersionInput").value;
    const raw = $("#addressInput").value.trim();
    if (!raw) return;
    try {
      const n = base36ToBigInt(raw);
      if (n >= maxPageNumber(v)) throw new Error("Адрес вне пространства этой версии.");
      location.hash = pageUrl(v, compactAddress(raw));
    } catch (err) {
      alert(err.message);
    }
  });

  if (q) renderVariants({ phraseRaw: q, version, countRaw: count, strategy, offsetRaw: offset });
}

function renderVariants({ phraseRaw, version, countRaw, strategy, offsetRaw }) {
  const results = $("#results");
  results.innerHTML = "";

  let count = Number(countRaw);
  if (!Number.isFinite(count)) count = DEFAULT_VARIANTS;
  count = Math.max(1, Math.min(MAX_VARIANTS, Math.floor(count)));

  let offset = Number(offsetRaw);
  if (!Number.isFinite(offset)) offset = 0;
  offset = Math.max(0, Math.floor(offset));

  try {
    const normalized = normalizeText(phraseRaw, version);
    if (!normalized) throw new Error("После нормализации фраза пустая.");
    if (normalized.length > alg(version).pageLength) {
      throw new Error(`Фраза слишком длинная: ${normalized.length} символов при лимите ${alg(version).pageLength}.`);
    }

    const items = [];
    for (let i = 1; i <= count; i++) {
      const page = makePageWithPhrase(normalized, version, i, strategy, offset);
      const address = encodeAddressFromText(page.text, version);
      const n = base36ToBigInt(address);
      const c = numberToCoordinates(n, version);
      const range = { start: page.position, length: normalized.length };
      const url = coordinateUrl(version, c, range);
      const preview = snippetByRange(page.text, range, version);

      items.push(`
        <div class="variant">
          <strong>Вариант ${page.variant} · позиция ${page.position + 1}</strong>
          <small>${highlightByRange(preview, {
            start: Math.max(0, preview.indexOf(normalized)),
            length: normalized.length
          }, version)}</small>

          <div class="pretty-address">
            <small>Настоящие координаты</small>
            <div class="address-line">
              <span class="chunk">sector ${c.sector}</span>
              <span class="chunk">hall ${c.hall}</span>
              <span class="chunk">wall ${c.wall}</span>
              <span class="chunk">shelf ${c.shelf}</span>
              <span class="chunk">volume ${c.volume}</span>
              <span class="chunk">page ${c.page}</span>
            </div>
          </div>

          <div class="row">
            <a class="button primary" href="${url}">Открыть страницу</a>
            <button type="button" data-copy="${esc(url)}">Скопировать ссылку</button>
          </div>
        </div>
      `);
    }

    results.innerHTML = items.join("");
    results.querySelectorAll("button[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const absolute = `${location.origin}${location.pathname}${btn.getAttribute("data-copy")}`;
        await navigator.clipboard.writeText(absolute);
        alert("Ссылка скопирована.");
      });
    });
  } catch (err) {
    results.innerHTML = `<div class="notice warning">${esc(err.message)}</div>`;
  }
}

function renderPage(version, n, params) {
  if (n < 0n || n >= maxPageNumber(version)) {
    throw new Error("Адрес вне пространства этой версии библиотеки.");
  }

  const text = numberToText(n, version);
  const c = numberToCoordinates(n, version);
  const address = bigintToBase36(n);
  const highlightRange = parseHighlight(params);
  const title = coordinateTitle(c);
  const strictClass = alg(version).pageLength >= 300 ? "strict" : "";

  $("#app").innerHTML = `
    <article class="card">
      <h1>${esc(title)}</h1>

      <div class="address">
        <span class="badge">${esc(alg(version).label)}</span>
        <span class="badge">координаты реальные</span>
        <span class="badge">${alg(version).pageLength} символов</span>
        <span class="badge">алфавит ${alg(version).alphabet.length}</span>
      </div>

      <div class="controls">
        <a class="button" href="${coordinateUrl(version, numberToCoordinates(n > 0n ? n - 1n : maxPageNumber(version) - 1n, version))}">← предыдущая страница</a>
        <a class="button" href="${coordinateUrl(version, numberToCoordinates((n + 1n) % maxPageNumber(version), version))}">следующая страница →</a>
        <a class="button" href="${coordinateUrl(version, numberToCoordinates(n >= alg(version).pagesPerVolume ? n - alg(version).pagesPerVolume : n, version))}">← том</a>
        <a class="button" href="${coordinateUrl(version, numberToCoordinates((n + alg(version).pagesPerVolume) % maxPageNumber(version), version))}">том →</a>
      </div>

      <div class="controls" style="margin-top:10px">
        <button id="favoriteBtn" type="button">★ В избранное</button>
        <button id="copyTextBtn" type="button">Скопировать текст</button>
        <button id="copyCoordBtn" type="button">Скопировать координаты</button>
        <button id="copyRawBtn" type="button">Скопировать raw-адрес</button>
        <button id="roundtripBtn" type="button">Проверить обратимость</button>
        <button id="downloadBtn" type="button">Скачать .txt</button>
        <button id="cardBtn" type="button">Скачать карточку PNG</button>
      </div>

      <div class="notice good">
        Эта страница восстановлена из координат. Координаты разложены из числа страницы, а не вычислены декоративным хешем.
      </div>

      <div class="pretty-address">
        <small>Координаты</small>
        <div class="address-line">
          <span class="chunk">sector ${c.sector}</span>
          <span class="chunk">hall ${c.hall}</span>
          <span class="chunk">wall ${c.wall}</span>
          <span class="chunk">shelf ${c.shelf}</span>
          <span class="chunk">volume ${c.volume}</span>
          <span class="chunk">page ${c.page}</span>
        </div>
        <small>Raw base36</small>
        <div class="address-line">
          ${prettyAddress(address).split("-").map(ch => `<span class="chunk">${esc(ch)}</span>`).join("")}
        </div>
      </div>

      <div class="page-text ${strictClass}" style="margin-top:18px">${renderText(text, highlightRange, version)}</div>
    </article>
  `;

  $("#favoriteBtn").addEventListener("click", () => {
    addFavorite({ version, n: n.toString(), title, url: location.href });
    alert("Добавлено в избранное.");
  });

  $("#copyTextBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    alert("Текст скопирован.");
  });

  $("#copyCoordBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    alert("Координатная ссылка скопирована.");
  });

  $("#copyRawBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}${rawAddressUrl(version, address, highlightRange)}`);
    alert("Raw-адрес скопирован.");
  });

  $("#roundtripBtn").addEventListener("click", () => showRoundtrip(version, n, text, address, c));

  $("#downloadBtn").addEventListener("click", () => {
    const blob = new Blob([`${title}\n\n${text}\n\nКоординаты:\n${location.href}\n\nRaw address:\n${address}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "babel-page.txt";
    link.click();
    URL.revokeObjectURL(url);
  });

  $("#cardBtn").addEventListener("click", () => {
    downloadCard({ title, text, address, version, highlightRange, coordinates: c });
  });
}

function showRoundtrip(version, n, text, address, c) {
  const againNumber = textToNumber(text, version);
  const againAddress = bigintToBase36(againNumber);
  const againCoords = numberToCoordinates(againNumber, version);
  const ok = againNumber === n && againAddress === address &&
    againCoords.sector === c.sector && againCoords.hall === c.hall &&
    againCoords.wall === c.wall && againCoords.shelf === c.shelf &&
    againCoords.volume === c.volume && againCoords.page === c.page;

  $("#app").insertAdjacentHTML("afterbegin", `
    <section class="card" style="margin-bottom:18px">
      <h2>Проверка обратимости</h2>
      <div class="steps">
        <div class="step"><strong>1. Координаты прочитаны</strong><small>${esc(coordinateTitle(c))}</small></div>
        <div class="step"><strong>2. Координаты переведены в BigInt</strong><small class="mono">${n.toString()}</small></div>
        <div class="step"><strong>3. BigInt развёрнут в страницу</strong><small>${alg(version).pageLength} символов</small></div>
        <div class="step"><strong>4. Страница снова закодирована в BigInt</strong><small class="mono">${againNumber.toString()}</small></div>
        <div class="step"><strong>5. BigInt снова разложен в координаты</strong><small>${esc(coordinateTitle(againCoords))}</small></div>
      </div>
      <div class="notice ${ok ? "good" : "warning"}">
        ${ok ? "Проверка пройдена. Координаты ⇄ страница совпадают." : "Проверка не пройдена. Адрес не совпал."}
      </div>
    </section>
  `);
}

function renderEncode() {
  $("#app").innerHTML = `
    <section class="grid">
      <div class="card">
        <div class="tabs">
          <a class="button tab" href="#/">Поиск адресов</a>
          <a class="button tab active" href="#/encode">Кодировать текст</a>
          <a class="button tab" href="#/about">Как работает</a>
        </div>

        <h1>Сделать текст страницей библиотеки</h1>
        <p>
          Вставь любой текст. Он будет нормализован под алфавит выбранной версии,
          дополнен пробелами до длины страницы и превращён в настоящие координаты.
        </p>

        <form id="encodeForm">
          <div class="field">
            <label>Версия</label>
            <select id="encodeVersionInput">
              ${Object.entries(ALGORITHMS).map(([v, a]) => `<option value="${v}">${a.label} · ${a.pageLength} символов</option>`).join("")}
            </select>
          </div>
          <textarea id="encodeTextInput" style="margin-top:10px" placeholder="Введите текст страницы"></textarea>
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Получить координаты</button>
          </div>
        </form>

        <div id="encodeResult"></div>
      </div>

      <aside class="card">
        <h2>Важно</h2>
        <p>
          Это не сохранение текста на сервере. Текст превращается в число, число — в координаты.
          Ссылка восстанавливает страницу без базы данных.
        </p>
      </aside>
    </section>
  `;

  $("#encodeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const version = $("#encodeVersionInput").value;
    const raw = $("#encodeTextInput").value;
    try {
      const n = textToNumber(raw, version);
      const c = numberToCoordinates(n, version);
      const url = coordinateUrl(version, c);
      $("#encodeResult").innerHTML = `
        <div class="notice good">Текст превращён в страницу библиотеки.</div>
        <div class="pretty-address">
          <small>Координаты</small>
          <div class="address-line">
            <span class="chunk">sector ${c.sector}</span>
            <span class="chunk">hall ${c.hall}</span>
            <span class="chunk">wall ${c.wall}</span>
            <span class="chunk">shelf ${c.shelf}</span>
            <span class="chunk">volume ${c.volume}</span>
            <span class="chunk">page ${c.page}</span>
          </div>
          <div class="row">
            <a class="button primary" href="${url}">Открыть страницу</a>
            <button id="copyEncodeUrlBtn" type="button">Скопировать ссылку</button>
          </div>
        </div>
      `;
      $("#copyEncodeUrlBtn").addEventListener("click", async () => {
        await navigator.clipboard.writeText(`${location.origin}${location.pathname}${url}`);
        alert("Ссылка скопирована.");
      });
    } catch (err) {
      $("#encodeResult").innerHTML = `<div class="notice warning">${esc(err.message)}</div>`;
    }
  });
}

function favorites() {
  try {
    return JSON.parse(localStorage.getItem("babelFavoritesV3") || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(items) {
  localStorage.setItem("babelFavoritesV3", JSON.stringify(items.slice(0, 100)));
}

function addFavorite(item) {
  const items = favorites();
  const key = `${item.version}:${item.n}`;
  const filtered = items.filter(x => `${x.version}:${x.n}` !== key);
  filtered.unshift({ ...item, createdAt: new Date().toISOString() });
  saveFavorites(filtered);
}

function renderFavorites() {
  const items = favorites();
  $("#app").innerHTML = `
    <section class="card">
      <div class="tabs">
        <a class="button tab" href="#/">Поиск адресов</a>
        <a class="button tab active" href="#/favorites">Избранное</a>
        <a class="button tab" href="#/about">Как работает</a>
      </div>

      <h1>Избранные страницы</h1>
      <p>Это локальное избранное в браузере. Координаты сами восстанавливают страницу.</p>

      <div class="row">
        <button id="clearFavBtn" type="button">Очистить избранное</button>
      </div>

      <div class="favorites">
        ${items.length ? items.map((item, idx) => {
          const c = numberToCoordinates(BigInt(item.n), item.version);
          return `
            <div class="favorite">
              <strong>${esc(item.title || coordinateTitle(c))}</strong>
              <small>${esc(item.version)} · ${esc(new Date(item.createdAt).toLocaleString())}</small>
              <div class="row">
                <a class="button primary" href="${coordinateUrl(item.version, c)}">Открыть</a>
                <button type="button" data-remove="${idx}">Удалить</button>
              </div>
            </div>
          `;
        }).join("") : `<div class="notice">Пока пусто.</div>`}
      </div>
    </section>
  `;

  $("#clearFavBtn").addEventListener("click", () => {
    saveFavorites([]);
    renderFavorites();
  });

  document.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-remove"));
      const items = favorites();
      items.splice(idx, 1);
      saveFavorites(items);
      renderFavorites();
    });
  });
}

function renderAbout() {
  $("#app").innerHTML = `
    <section class="card">
      <div class="tabs">
        <a class="button tab" href="#/">Поиск адресов</a>
        <a class="button tab" href="#/encode">Кодировать текст</a>
        <a class="button tab active" href="#/about">Как работает</a>
      </div>

      <h1>Как работает координатная Библиотека</h1>

      <h2>1. Страница — это число</h2>
      <p>
        У нас есть фиксированный алфавит и фиксированная длина страницы. Каждый символ — цифра.
        Значит, вся страница — число в системе счисления с основанием, равным размеру алфавита.
      </p>

      <h2>2. Число раскладывается в координаты</h2>
      <p>
        Координаты не декоративные. Они получаются обычным делением с остатком:
      </p>

      <p class="mono">
        число → лист → том → полка → стена → зал → сектор
      </p>

      <p>
        Например, сначала берётся остаток по числу страниц в томе — это номер листа.
        Потом число делится на число страниц в томе, берётся остаток по числу томов на полке — это номер тома.
        И так далее.
      </p>

      <h2>3. Координаты обратно дают число</h2>
      <p>
        Операция обратима:
      </p>

      <p class="mono">
        сектор / зал / стена / полка / том / лист → число → текст
      </p>

      <h2>4. Фраза “находится” без индекса</h2>
      <p>
        Для фразы строится полный лист фиксированной длины, где эта фраза находится в определённой позиции.
        Потом весь лист кодируется в число, а число раскладывается в координаты.
      </p>

      <div class="notice good">
        Поэтому не нужна база страниц. Координаты сами являются восстановимым адресом страницы.
      </div>

      <h2>5. Мини-пример</h2>
      <p>
        Алфавит: <code>[пробел, а, б, в]</code>. Текст: <code>аб в</code>.
        Его цифры: <code>1, 2, 0, 3</code>. Это число в системе с основанием 4.
        Если знать число, можно восстановить те же цифры и тот же текст.
      </p>

      <h2>6. Версии нельзя менять</h2>
      <p>
        Если изменить алфавит, длину страницы или геометрию библиотеки, старые ссылки начнут открывать другой текст.
        Поэтому <code>v1</code> не меняется. Новая логика должна стать <code>v2</code>.
      </p>
    </section>
  `;
}

function parseRoute() {
  const raw = location.hash || "#/";
  const hash = raw.slice(1);
  const [path, qs] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs || "");

  if (parts.length === 0) return { name: "home", params };
  if (parts[0] === "find") return { name: "home", params };
  if (parts[0] === "encode") return { name: "encode", params };
  if (parts[0] === "about") return { name: "about", params };
  if (parts[0] === "favorites") return { name: "favorites", params };

  if (ALGORITHMS[parts[0]] && parts[1] === "a") {
    return { name: "rawPage", version: parts[0], address: parts.slice(2).join(""), params };
  }

  if (ALGORITHMS[parts[0]] && parts[1] === "sector") {
    return {
      name: "coordPage",
      version: parts[0],
      coordinates: {
        sector: parts[2],
        hall: parts[4],
        wall: parts[6],
        shelf: parts[8],
        volume: parts[10],
        page: parts[12],
      },
      params,
    };
  }

  return { name: "home", params };
}

function router() {
  try {
    const route = parseRoute();
    if (route.name === "rawPage") {
      const n = base36ToBigInt(route.address);
      renderPage(route.version, n, route.params);
    } else if (route.name === "coordPage") {
      const n = coordinatesToNumber(route.coordinates, route.version);
      renderPage(route.version, n, route.params);
    } else if (route.name === "encode") {
      renderEncode();
    } else if (route.name === "about") {
      renderAbout();
    } else if (route.name === "favorites") {
      renderFavorites();
    } else {
      renderHome();
    }
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<section class="card"><h1>Ошибка</h1><p>${esc(err.message)}</p></section>`;
  }
}

async function copyCurrentLink() {
  await navigator.clipboard.writeText(location.href);
  alert("Ссылка скопирована.");
}

function downloadCard({ title, text, address, version, highlightRange, coordinates }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createRadialGradient(120, 80, 20, 120, 80, 600);
  grad.addColorStop(0, "rgba(222,192,125,0.28)");
  grad.addColorStop(1, "rgba(222,192,125,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(222,192,125,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);

  ctx.fillStyle = "#dec07d";
  ctx.font = "bold 42px Georgia";
  ctx.fillText("Русская Библиотека Вавилона", 70, 105);

  ctx.fillStyle = "#9aa5b3";
  ctx.font = "24px sans-serif";
  ctx.fillText(`${alg(version).label} · координаты ⇄ страница`, 70, 145);

  ctx.fillStyle = "#f7efe2";
  ctx.font = "30px Georgia";

  let fragment = text;
  if (highlightRange) {
    fragment = snippetByRange(text, highlightRange, version, 120);
  } else {
    fragment = text.slice(0, 280);
  }

  const lines = wrapCanvasText(ctx, fragment.replace(/\s+/g, " "), 70, 230, 1040, 40, 6);
  ctx.fillStyle = "#f7efe2";
  lines.forEach((line, i) => ctx.fillText(line, 70, 230 + i * 42));

  ctx.fillStyle = "#dec07d";
  ctx.font = "18px ui-monospace, monospace";
  const coord = `sector ${coordinates.sector} / hall ${coordinates.hall} / wall ${coordinates.wall} / shelf ${coordinates.shelf} / volume ${coordinates.volume} / page ${coordinates.page}`;
  ctx.fillText(coord.slice(0, 110), 70, 565);

  const link = document.createElement("a");
  link.download = "babel-card.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  $("#randomBtn").addEventListener("click", () => {
    const version = DEFAULT_VERSION;
    const text = randomPageText(version);
    const n = textToNumber(text, version);
    const c = numberToCoordinates(n, version);
    location.hash = coordinateUrl(version, c);
  });

  $("#favoritesBtn").addEventListener("click", () => {
    location.hash = "#/favorites";
  });

  $("#copyLinkBtn").addEventListener("click", copyCurrentLink);
  router();
});
