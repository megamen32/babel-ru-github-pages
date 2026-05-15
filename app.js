
const ALGORITHMS = {
  v1: {
    label: "v1 строгий",
    alphabet: " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789",
    pageLength: 900,
    description: "Полная библиотека строк фиксированной длины на русском алфавите.",
  },
  v1s: {
    label: "v1s короткий",
    alphabet: " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789",
    pageLength: 300,
    description: "Тот же принцип, но короче страница и компактнее ссылка.",
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
  const base = BigInt(a.alphabet.length);
  let x = BigInt(n);
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

function encodeAddressFromText(text, version) {
  return textToNumber(text, version).toString(36);
}

function decodeTextFromAddress(address, version) {
  return numberToText(base36ToBigInt(address), version);
}

function canonicalAddress(address) {
  return base36ToBigInt(address).toString(36);
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

function pageUrl(version, address, highlightRange = null) {
  const pretty = prettyAddress(address);
  const q = highlightRange ? `?hl=${highlightRange.start}:${highlightRange.length}` : "";
  return `#/${version}/a/${pretty}${q}`;
}

function addressMeta(address) {
  const clean = canonicalAddress(address);
  const h = fnv1a(clean);
  const sector = (h % 9999) + 1;
  const hall = (Math.floor(h / 9999) % 9999) + 1;
  const wall = (Math.floor(h / 104729) % 6) + 1;
  const shelf = (Math.floor(h / 99991) % 12) + 1;
  const volume = clean.slice(0, 18) || "0";
  const leaf = (clean.length % 410) + 1;
  return { clean, sector, hall, wall, shelf, volume, leaf };
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

function makePageWithPhrase(phraseRaw, version, variant, strategy) {
  const a = alg(version);
  const phrase = normalizeText(phraseRaw, version);
  if (!phrase) throw new Error("После нормализации фраза пустая.");
  if (phrase.length > a.pageLength) {
    throw new Error(`Фраза длиннее страницы: ${phrase.length} символов при лимите ${a.pageLength}.`);
  }

  const rng = rngFrom(`${version}:phrase:${phrase}:variant:${variant}:strategy:${strategy}`);
  const chars = new Array(a.pageLength);

  const spaceIdx = a.alphabet.indexOf(" ");
  for (let i = 0; i < a.pageLength; i++) {
    chars[i] = a.alphabet[Math.floor(rng() * a.alphabet.length)];
  }

  // Немного более читаемое окружение: иногда ставим пробелы.
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

  if (position > 0 && spaceIdx >= 0) chars[position - 1] = " ";
  for (let i = 0; i < phrase.length; i++) {
    chars[position + i] = phrase[i];
  }
  if (position + phrase.length < chars.length && spaceIdx >= 0) chars[position + phrase.length] = " ";

  return {
    phrase,
    variant,
    position,
    text: chars.join(""),
  };
}

function paragraphize(text, width = 90) {
  const clean = String(text).replace(/\s+$/g, "");
  const parts = [];
  for (let i = 0; i < clean.length; i += width) {
    parts.push(clean.slice(i, i + width));
  }
  return parts.join("\n");
}

function highlightByRange(text, range) {
  const safeStart = Math.max(0, Math.min(text.length, range.start));
  const safeEnd = Math.max(safeStart, Math.min(text.length, range.start + range.length));
  const before = paragraphize(text.slice(0, safeStart));
  const mid = paragraphize(text.slice(safeStart, safeEnd));
  const after = paragraphize(text.slice(safeEnd));
  return `${esc(before)}<mark>${esc(mid)}</mark>${esc(after)}`;
}

function highlightByPhrase(text, phrase, version) {
  const p = normalizeText(phrase, version);
  const safe = esc(paragraphize(text));
  if (!p) return safe;
  const pEsc = esc(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(pEsc, "g"), `<mark>${esc(p)}</mark>`);
}

function renderText(text, highlightRange, phrase, version) {
  if (highlightRange) return highlightByRange(text, highlightRange);
  if (phrase) return highlightByPhrase(text, phrase, version);
  return esc(paragraphize(text));
}

function parseHighlight(params) {
  const raw = params.get("hl") || "";
  const m = raw.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { start: Number(m[1]), length: Number(m[2]) };
}

function snippetByRange(text, range, pad = 80) {
  const start = Math.max(0, range.start - pad);
  const end = Math.min(text.length, range.start + range.length + pad);
  const prefix = start > 0 ? "… " : "";
  const suffix = end < text.length ? " …" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

function renderHome() {
  $("#app").innerHTML = `
    <section class="grid">
      <div class="card">
        <div class="tabs">
          <a class="button tab active" href="#/">Поиск адресов</a>
          <a class="button tab" href="#/about">Как работает</a>
        </div>

        <h1>Найти адреса страниц, содержащих фразу</h1>
        <p>
          Это не поиск по базе. Это вычисление адресов в пространстве всех возможных страниц.
          Мы строим несколько полных страниц с твоей фразой, кодируем каждую страницу в число,
          а число превращаем в красивый вавилонский адрес.
        </p>

        <div class="notice good">
          Ссылка не содержит фразу как payload. Ссылка содержит адрес всей страницы.
          Подсветка хранит только позицию и длину фрагмента.
        </div>

        <form id="phraseForm">
          <textarea id="phraseInput" placeholder="Например: каждая страница имеет свою ссылку"></textarea>

          <div class="form-grid" style="margin-top:10px">
            <div class="field">
              <label>Версия / размер страницы</label>
              <select id="versionInput">
                ${Object.entries(ALGORITHMS).map(([v, a]) => `<option value="${v}">${a.label} · ${a.pageLength} символов</option>`).join("")}
              </select>
            </div>

            <div class="field">
              <label>Вариантов</label>
              <input id="variantCountInput" inputmode="numeric" value="${DEFAULT_VARIANTS}">
            </div>

            <div class="field">
              <label>Расположение</label>
              <select id="strategyInput">
                <option value="random">разные места</option>
                <option value="center">по центру</option>
                <option value="start">в начале</option>
                <option value="end">в конце</option>
                <option value="quiet">тихое окружение</option>
              </select>
            </div>
          </div>

          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Показать варианты</button>
            <button id="clearBtn" type="button">Очистить</button>
          </div>
        </form>

        <div id="results" class="variants"></div>
      </div>

      <aside class="card">
        <h2>Математика</h2>
        <p>
          Если алфавит содержит <code>N</code> символов, а страница имеет длину <code>L</code>,
          то возможных страниц <code>N^L</code>.
        </p>

        <div class="notice">
          <strong>v1:</strong> ${ALGORITHMS.v1.alphabet.length}<sup>${ALGORITHMS.v1.pageLength}</sup> страниц.<br>
          <strong>v1s:</strong> ${ALGORITHMS.v1s.alphabet.length}<sup>${ALGORITHMS.v1s.pageLength}</sup> страниц.
        </div>

        <h3>Открыть адрес вручную</h3>
        <form id="addressForm">
          <select id="addressVersionInput">
            ${Object.entries(ALGORITHMS).map(([v, a]) => `<option value="${v}">${a.label}</option>`).join("")}
          </select>
          <input id="addressInput" class="mono" style="margin-top:10px" placeholder="base36-адрес или адрес с дефисами">
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Открыть</button>
          </div>
        </form>

        <h3 style="margin-top:20px">Главное правило</h3>
        <p>
          Нельзя менять <code>v1</code>: алфавит, длину страницы, порядок кодирования.
          Для новой логики добавляется новая версия.
        </p>
      </aside>
    </section>
  `;

  $("#phraseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    renderVariants({
      phraseRaw: $("#phraseInput").value,
      version: $("#versionInput").value,
      countRaw: $("#variantCountInput").value,
      strategy: $("#strategyInput").value,
    });
  });

  $("#clearBtn").addEventListener("click", () => {
    $("#phraseInput").value = "";
    $("#results").innerHTML = "";
  });

  $("#addressForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const version = $("#addressVersionInput").value;
    const raw = $("#addressInput").value.trim();
    if (!raw) return;
    location.hash = pageUrl(version, compactAddress(raw));
  });
}

function renderVariants({ phraseRaw, version, countRaw, strategy }) {
  const results = $("#results");
  results.innerHTML = "";

  let count = Number(countRaw);
  if (!Number.isFinite(count)) count = DEFAULT_VARIANTS;
  count = Math.max(1, Math.min(MAX_VARIANTS, Math.floor(count)));

  try {
    const normalized = normalizeText(phraseRaw, version);
    if (!normalized) throw new Error("После нормализации фраза пустая.");
    if (normalized.length > alg(version).pageLength) {
      throw new Error(`Фраза слишком длинная: ${normalized.length} символов при лимите ${alg(version).pageLength}.`);
    }

    const items = [];
    for (let i = 1; i <= count; i++) {
      const page = makePageWithPhrase(normalized, version, i, strategy);
      const address = encodeAddressFromText(page.text, version);
      const meta = addressMeta(address);
      const range = { start: page.position, length: normalized.length };
      const url = pageUrl(version, address, range);
      const preview = snippetByRange(page.text, range);

      items.push(`
        <div class="variant">
          <strong>Вариант ${i} · позиция ${page.position + 1} · сектор ${meta.sector} · зал ${meta.hall}</strong>
          <small>${highlightByRange(preview, {
            start: Math.max(0, preview.indexOf(normalized)),
            length: normalized.length
          })}</small>
          <div class="pretty-address">
            <small>Вавилонский адрес</small>
            <div class="address-line">
              ${prettyAddress(address).split("-").slice(0, 12).map(ch => `<span class="chunk">${esc(ch)}</span>`).join("")}
              ${prettyAddress(address).split("-").length > 12 ? `<span class="chunk">…</span>` : ""}
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

function renderPage(version, addressRaw, params) {
  const address = canonicalAddress(addressRaw);
  const text = decodeTextFromAddress(address, version);
  const highlightRange = parseHighlight(params);
  const meta = addressMeta(address);
  const title = `Сектор ${meta.sector} · Зал ${meta.hall} · Стена ${meta.wall} · Полка ${meta.shelf} · Том ${meta.volume} · Лист ${meta.leaf}`;

  $("#app").innerHTML = `
    <article class="card">
      <h1>${esc(title)}</h1>

      <div class="address">
        <span class="badge">${esc(alg(version).label)}</span>
        <span class="badge">адрес обратим</span>
        <span class="badge">${alg(version).pageLength} символов</span>
        <span class="badge">алфавит ${alg(version).alphabet.length}</span>
      </div>

      <div class="controls">
        <button id="favoriteBtn" type="button">★ В избранное</button>
        <button id="copyTextBtn" type="button">Скопировать текст</button>
        <button id="copyAddressBtn" type="button">Скопировать ссылку</button>
        <button id="roundtripBtn" type="button">Проверить обратимость</button>
        <button id="downloadBtn" type="button">Скачать .txt</button>
        <button id="cardBtn" type="button">Скачать карточку PNG</button>
      </div>

      <div class="notice good">
        Страница восстановлена из адреса. Адрес — это число страницы в системе всех возможных страниц.
      </div>

      <div class="pretty-address">
        <small>Полный адрес</small>
        <div class="address-line">
          ${prettyAddress(address).split("-").map(ch => `<span class="chunk">${esc(ch)}</span>`).join("")}
        </div>
      </div>

      <div class="page-text" style="margin-top:18px">${renderText(text, highlightRange, "", version)}</div>
    </article>
  `;

  $("#favoriteBtn").addEventListener("click", () => {
    addFavorite({ version, address, title, url: location.href });
    alert("Добавлено в избранное.");
  });

  $("#copyTextBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    alert("Текст скопирован.");
  });

  $("#copyAddressBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    alert("Ссылка скопирована.");
  });

  $("#roundtripBtn").addEventListener("click", () => {
    const again = encodeAddressFromText(text, version);
    if (again === address) {
      alert("Проверка пройдена: текст кодируется обратно в тот же адрес.");
    } else {
      alert("Ошибка: обратное кодирование дало другой адрес.");
      console.error({ address, again });
    }
  });

  $("#downloadBtn").addEventListener("click", () => {
    const blob = new Blob([`${title}\n\n${text}\n\nАдрес:\n${location.href}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "babel-page.txt";
    link.click();
    URL.revokeObjectURL(url);
  });

  $("#cardBtn").addEventListener("click", () => {
    downloadCard({ title, text, address, version, highlightRange });
  });
}

function favorites() {
  try {
    return JSON.parse(localStorage.getItem("babelFavorites") || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(items) {
  localStorage.setItem("babelFavorites", JSON.stringify(items.slice(0, 100)));
}

function addFavorite(item) {
  const items = favorites();
  const key = `${item.version}:${canonicalAddress(item.address)}`;
  const filtered = items.filter(x => `${x.version}:${canonicalAddress(x.address)}` !== key);
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
      <p>Это локальное избранное в браузере. Оно не нужно для восстановления страниц: ссылка сама всё восстанавливает.</p>

      <div class="row">
        <button id="clearFavBtn" type="button">Очистить избранное</button>
      </div>

      <div class="favorites">
        ${items.length ? items.map((item, idx) => `
          <div class="favorite">
            <strong>${esc(item.title || "Страница")}</strong>
            <small>${esc(item.version)} · ${esc(new Date(item.createdAt).toLocaleString())}</small>
            <div class="row">
              <a class="button primary" href="${pageUrl(item.version, item.address)}">Открыть</a>
              <button type="button" data-remove="${idx}">Удалить</button>
            </div>
          </div>
        `).join("") : `<div class="notice">Пока пусто.</div>`}
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
        <a class="button tab" href="#/favorites">Избранное</a>
        <a class="button tab active" href="#/about">Как работает</a>
      </div>

      <h1>Как работает реальная алгоритмическая библиотека</h1>

      <h2>1. Фиксируем алфавит</h2>
      <p>
        У каждой буквы есть номер. Например, пробел — 0, «а» — 1, «б» — 2.
        Это превращает текст в последовательность цифр.
      </p>

      <h2>2. Фиксируем длину страницы</h2>
      <p>
        В версии <code>v1</code> страница содержит ${ALGORITHMS.v1.pageLength} символов.
        Если текст короче, он дополняется пробелами. Если длиннее — обрезается.
      </p>

      <h2>3. Страница становится числом</h2>
      <p>
        Страница читается как число в системе счисления с основанием, равным размеру алфавита.
        Это обратимая операция.
      </p>

      <p class="mono">текст → цифры → BigInt → base36-адрес</p>

      <h2>4. Адрес восстанавливает страницу</h2>
      <p>
        При открытии ссылки адрес переводится обратно в <code>BigInt</code>,
        число раскладывается на цифры алфавита, цифры превращаются в символы.
      </p>

      <p class="mono">base36-адрес → BigInt → цифры → текст</p>

      <h2>5. Как находятся фразы</h2>
      <p>
        Мы не ищем по базе. Мы строим страницу, где эта фраза уже стоит в конкретной позиции,
        а затем кодируем всю страницу в адрес. Можно построить сколько угодно вариантов:
        с разным окружением, разной позицией и разным номером варианта.
      </p>

      <div class="notice good">
        Это и есть честная логика: не хранить страницы, но однозначно восстанавливать их из адреса.
      </div>

      <h2>6. Почему нельзя менять v1</h2>
      <p>
        Если изменить алфавит, длину страницы или порядок кодирования, старые ссылки начнут открывать другой текст.
        Поэтому <code>v1</code> замораживается, а новые версии добавляются отдельно: <code>v2</code>, <code>v3</code>.
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
  if (parts[0] === "about") return { name: "about", params };
  if (parts[0] === "favorites") return { name: "favorites", params };
  if (ALGORITHMS[parts[0]] && parts[1] === "a") {
    return { name: "page", version: parts[0], address: parts.slice(2).join(""), params };
  }
  return { name: "home", params };
}

function router() {
  try {
    const route = parseRoute();
    if (route.name === "page") renderPage(route.version, route.address, route.params);
    else if (route.name === "about") renderAbout();
    else if (route.name === "favorites") renderFavorites();
    else renderHome();
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<section class="card"><h1>Ошибка</h1><p>${esc(err.message)}</p></section>`;
  }
}

async function copyCurrentLink() {
  await navigator.clipboard.writeText(location.href);
  alert("Ссылка скопирована.");
}

function downloadCard({ title, text, address, version, highlightRange }) {
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
  ctx.fillText(`${alg(version).label} · страница ⇄ адрес`, 70, 145);

  ctx.fillStyle = "#f7efe2";
  ctx.font = "30px Georgia";

  let fragment = text;
  if (highlightRange) {
    fragment = snippetByRange(text, highlightRange, 120);
  } else {
    fragment = text.slice(0, 280);
  }

  const lines = wrapCanvasText(ctx, fragment.replace(/\s+/g, " "), 70, 230, 1040, 40, 6);
  ctx.fillStyle = "#f7efe2";
  lines.forEach((line, i) => ctx.fillText(line, 70, 230 + i * 42));

  ctx.fillStyle = "#dec07d";
  ctx.font = "18px ui-monospace, monospace";
  const p = prettyAddress(address).slice(0, 110) + "…";
  ctx.fillText(p, 70, 565);

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
    const address = encodeAddressFromText(text, version);
    location.hash = pageUrl(version, address);
  });

  $("#favoritesBtn").addEventListener("click", () => {
    location.hash = "#/favorites";
  });

  $("#copyLinkBtn").addEventListener("click", copyCurrentLink);
  router();
});
