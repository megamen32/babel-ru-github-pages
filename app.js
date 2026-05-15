
const VERSION = "v1";

// Реальный принцип Библиотеки Вавилона:
// фиксированный алфавит + фиксированная длина страницы.
// Любая страница — это число в системе счисления с основанием ALPHABET.length.
// Это число кодируется в base36 и становится адресом.
const ALPHABET = " абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()0123456789";
const BASE = BigInt(ALPHABET.length);

// Размер можно увеличить, но URL станет длиннее.
// При 900 символах адрес обычно около 980-1050 символов. Для GitHub Pages hash-router это нормально.
const PAGE_LENGTH = 900;

// Сколько вариантов показывать при поиске фразы.
const DEFAULT_VARIANTS = 8;
const MAX_VARIANTS = 24;

const $ = (sel) => document.querySelector(sel);

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

function normalizeText(raw) {
  const lower = String(raw || "").toLowerCase().replace(/\s+/g, " ").trim();
  let out = "";
  for (const ch of lower) {
    out += ALPHABET.includes(ch) ? ch : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

function padPageText(text) {
  let s = normalizeText(text);
  if (s.length > PAGE_LENGTH) s = s.slice(0, PAGE_LENGTH);
  return s.padEnd(PAGE_LENGTH, " ");
}

function textToNumber(text) {
  const fixed = padPageText(text);
  let n = 0n;
  for (const ch of fixed) {
    const digit = ALPHABET.indexOf(ch);
    if (digit < 0) throw new Error(`Символ не входит в алфавит: ${ch}`);
    n = n * BASE + BigInt(digit);
  }
  return n;
}

function numberToText(n) {
  let x = BigInt(n);
  const chars = new Array(PAGE_LENGTH);
  for (let i = PAGE_LENGTH - 1; i >= 0; i--) {
    const digit = Number(x % BASE);
    chars[i] = ALPHABET[digit];
    x = x / BASE;
  }
  return chars.join("");
}

function base36ToBigInt(s) {
  const clean = String(s || "").toLowerCase().replace(/[^0-9a-z]/g, "");
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

function encodeAddressFromText(text) {
  return textToNumber(text).toString(36);
}

function decodeTextFromAddress(address) {
  return numberToText(base36ToBigInt(address));
}

function pageUrl(address, highlight = "") {
  const q = highlight ? `?q=${encodeURIComponent(highlight)}` : "";
  return `#/${VERSION}/page/${address}${q}`;
}

function makeCanonicalAddress(address) {
  return base36ToBigInt(address).toString(36);
}

function randomPageText() {
  const rng = rngFrom(`${Date.now()}:${Math.random()}`);
  let s = "";
  for (let i = 0; i < PAGE_LENGTH; i++) {
    s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return s;
}

function makePageWithPhrase(phraseRaw, variant) {
  const phrase = normalizeText(phraseRaw);
  if (!phrase) throw new Error("После нормализации фраза пустая.");
  if (phrase.length > PAGE_LENGTH) {
    throw new Error(`Фраза длиннее страницы: ${phrase.length} символов при лимите ${PAGE_LENGTH}.`);
  }

  const rng = rngFrom(`${VERSION}:phrase:${phrase}:variant:${variant}`);
  const chars = new Array(PAGE_LENGTH);

  for (let i = 0; i < PAGE_LENGTH; i++) {
    chars[i] = ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }

  const maxPos = PAGE_LENGTH - phrase.length;
  const position = Math.floor(rng() * (maxPos + 1));

  for (let i = 0; i < phrase.length; i++) {
    chars[position + i] = phrase[i];
  }

  return {
    phrase,
    variant,
    position,
    text: chars.join(""),
  };
}

function paragraphize(text) {
  const clean = String(text).replace(/\s+$/g, "");
  const parts = [];
  const width = 90;
  for (let i = 0; i < clean.length; i += width) {
    parts.push(clean.slice(i, i + width));
  }
  return parts.join("\n");
}

function snippet(text, phrase, pad = 80) {
  const p = normalizeText(phrase);
  const pos = text.indexOf(p);
  if (pos < 0) return text.slice(0, 180).trim();
  const start = Math.max(0, pos - pad);
  const end = Math.min(text.length, pos + p.length + pad);
  return `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${end < text.length ? " …" : ""}`;
}

function highlight(text, phrase) {
  const p = normalizeText(phrase);
  const safe = esc(paragraphize(text));
  if (!p) return safe;

  const pEsc = esc(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(pEsc, "g"), `<mark>${esc(p)}</mark>`);
}

function addressMeta(address) {
  const clean = makeCanonicalAddress(address);
  const h = fnv1a(clean);
  const sector = (h % 9999) + 1;
  const hall = (Math.floor(h / 9999) % 9999) + 1;
  const wall = (Math.floor(h / 104729) % 6) + 1;
  const shelf = (Math.floor(h / 99991) % 12) + 1;
  const volume = clean.slice(0, 16) || "0";
  const leaf = (clean.length % 410) + 1;
  return { clean, sector, hall, wall, shelf, volume, leaf };
}

function renderHome() {
  $("#app").innerHTML = `
    <section class="grid">
      <div class="card">
        <h1>Без обмана: адрес — это страница</h1>
        <p>
          Здесь нет базы, индекса и заранее сохранённых страниц. Алгоритм обратимый:
          текст фиксированной длины превращается в огромное число, а число превращается в адрес.
          При открытии адрес разворачивается обратно в тот же самый текст.
        </p>

        <div class="notice good">
          Количество страниц: <code>${ALPHABET.length}<sup>${PAGE_LENGTH}</sup></code>.
          Это не список файлов, а пространство всех возможных страниц заданной длины.
        </div>

        <h2>Найти страницы с фразой</h2>
        <p>
          Мы создаём несколько разных страниц, содержащих фразу, кодируем каждую страницу в адрес
          и показываем варианты. Это не payload с фразой: ссылка содержит число всей страницы.
        </p>

        <form id="phraseForm">
          <textarea id="phraseInput" placeholder="Например: каждая страница имеет свою ссылку"></textarea>
          <div class="form-grid" style="margin-top:10px">
            <div class="field">
              <label>Сколько вариантов показать</label>
              <input id="variantCountInput" inputmode="numeric" value="${DEFAULT_VARIANTS}">
            </div>
            <button class="primary" type="submit">Показать варианты</button>
            <button id="clearBtn" type="button">Очистить</button>
          </div>
        </form>

        <div id="results" class="variants"></div>
      </div>

      <aside class="card">
        <h2>Параметры библиотеки</h2>
        <div class="address">
          <span class="badge">версия ${VERSION}</span>
          <span class="badge">алфавит: ${ALPHABET.length} символов</span>
          <span class="badge">страница: ${PAGE_LENGTH} символов</span>
          <span class="badge">base36-адрес</span>
        </div>

        <div class="notice warning">
          Математически страниц с одной фразой огромное количество. Показать «все» невозможно,
          но можно показать несколько выбранных вариантов: вариант 1, 2, 3 и так далее.
        </div>

        <h3>Открыть адрес вручную</h3>
        <form id="addressForm">
          <input id="addressInput" class="mono" placeholder="base36-адрес страницы">
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Открыть</button>
          </div>
        </form>

        <h3 style="margin-top:20px">Проверка обратимости</h3>
        <p>
          На странице можно нажать «Закодировать обратно»:
          если алгоритм честный, восстановленный адрес совпадёт с текущим.
        </p>
      </aside>
    </section>
  `;

  $("#phraseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    renderVariants($("#phraseInput").value, $("#variantCountInput").value);
  });

  $("#clearBtn").addEventListener("click", () => {
    $("#phraseInput").value = "";
    $("#results").innerHTML = "";
  });

  $("#addressForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = $("#addressInput").value.trim();
    if (!raw) return;
    location.hash = pageUrl(makeCanonicalAddress(raw));
  });
}

function renderVariants(phraseRaw, countRaw) {
  const results = $("#results");
  results.innerHTML = "";

  let count = Number(countRaw);
  if (!Number.isFinite(count)) count = DEFAULT_VARIANTS;
  count = Math.max(1, Math.min(MAX_VARIANTS, Math.floor(count)));

  try {
    const normalized = normalizeText(phraseRaw);
    if (!normalized) throw new Error("После нормализации фраза пустая.");
    if (normalized.length > PAGE_LENGTH) {
      throw new Error(`Фраза слишком длинная: ${normalized.length} символов при лимите ${PAGE_LENGTH}.`);
    }

    const items = [];
    for (let i = 1; i <= count; i++) {
      const page = makePageWithPhrase(normalized, i);
      const address = encodeAddressFromText(page.text);
      const meta = addressMeta(address);
      items.push(`
        <div class="variant">
          <strong>Вариант ${i} · позиция ${page.position + 1} · лист ${meta.leaf}</strong>
          <small>${highlight(snippet(page.text, normalized), normalized)}</small>
          <div class="row">
            <a class="button primary" href="${pageUrl(address, normalized)}">Открыть страницу</a>
            <button type="button" data-copy="${esc(pageUrl(address, normalized))}">Скопировать ссылку</button>
          </div>
          <small class="mono">${esc(address.slice(0, 160))}${address.length > 160 ? "…" : ""}</small>
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

function renderPage(addressRaw, phrase = "") {
  const address = makeCanonicalAddress(addressRaw);
  const text = decodeTextFromAddress(address);
  const meta = addressMeta(address);
  const title = `Сектор ${meta.sector} · Зал ${meta.hall} · Стена ${meta.wall} · Полка ${meta.shelf} · Том ${meta.volume} · Лист ${meta.leaf}`;

  $("#app").innerHTML = `
    <article class="card">
      <h1>${esc(title)}</h1>

      <div class="address">
        <span class="badge">версия ${VERSION}</span>
        <span class="badge">адрес обратим</span>
        <span class="badge">${PAGE_LENGTH} символов</span>
        <span class="badge">алфавит ${ALPHABET.length}</span>
      </div>

      <div class="controls">
        <button id="copyTextBtn" type="button">Скопировать текст</button>
        <button id="copyAddressBtn" type="button">Скопировать адрес</button>
        <button id="roundtripBtn" type="button">Закодировать обратно</button>
        <button id="downloadBtn" type="button">Скачать .txt</button>
      </div>

      <div class="notice">
        Эта страница восстановлена из адреса. Адрес — это число страницы в системе всех возможных страниц.
      </div>

      <p class="mono">${esc(address)}</p>

      <div class="page-text">${highlight(text, phrase)}</div>
    </article>
  `;

  $("#copyTextBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    alert("Текст скопирован.");
  });

  $("#copyAddressBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    alert("Ссылка скопирована.");
  });

  $("#roundtripBtn").addEventListener("click", () => {
    const again = encodeAddressFromText(text);
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
}

function parseRoute() {
  const raw = location.hash || "#/";
  const hash = raw.slice(1);
  const [path, qs] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs || "");

  if (parts.length === 0) return { name: "home", params };
  if (parts[0] === VERSION && parts[1] === "page") {
    return { name: "page", address: parts.slice(2).join(""), params };
  }
  return { name: "home", params };
}

function router() {
  try {
    const route = parseRoute();
    if (route.name === "page") renderPage(route.address, route.params.get("q") || "");
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

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  $("#randomBtn").addEventListener("click", () => {
    const text = randomPageText();
    const address = encodeAddressFromText(text);
    location.hash = pageUrl(address);
  });

  $("#copyLinkBtn").addEventListener("click", copyCurrentLink);
  router();
});
