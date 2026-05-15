
const VERSION = "v1";

const LIMITS = {
  room: 999999,
  wall: 6,
  shelf: 12,
  book: 999999,
  page: 410,
};

const WORDS = `
абсолютный абсурд автор адрес алфавит архив башня бездна белый библиотека близкий
буква бумага быть вечность вечер вещь видеть воздух возвращение время вход выбирать
главный глухой город граница дверь движение дневник доказательство дом другой душа
единственный желать ждать зал записка зеркало знак знать искать книга ключ комната
конец коридор красный круг лабиринт лист молчание мысль найти начало небо неверный
невозможный ночь образ окно память первый письмо порядок потерянный правда предел
призрак пространство прочитать пыль рукопись ряд свет слово случай смысл смотреть
страница стена странный тень текст тишина точный том узнать фраза холод человек
читать шаг шёпот шум язык

если когда потому что однако словно будто где-то рядом внутри между после перед
каждый всякий этот тот один два три снова уже ещё там здесь никто кто-то что-то
никогда всегда почти вдруг медленно странно тихо точно поздно

я ты он она мы вы они мне тебе ему ей нас вас их мой твой свой наш ваш
`.trim().split(/\s+/);

const ALPHABET = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя     .,!?;:—«»()";

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

function rngFrom(seedText) {
  return mulberry32(fnv1a(seedText));
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function intFromHash(text, min, max) {
  const h = fnv1a(text);
  return min + (h % (max - min + 1));
}

function normalizeAddress(a) {
  return {
    room: clampInt(a.room, 1, LIMITS.room),
    wall: clampInt(a.wall, 1, LIMITS.wall),
    shelf: clampInt(a.shelf, 1, LIMITS.shelf),
    book: clampInt(a.book, 1, LIMITS.book),
    page: clampInt(a.page, 1, LIMITS.page),
  };
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function addressSeed(a) {
  return `${VERSION}:${a.room}:${a.wall}:${a.shelf}:${a.book}:${a.page}`;
}

function addressTitle(a) {
  return `Зал ${a.room} · Стена ${a.wall} · Полка ${a.shelf} · Том ${a.book} · Страница ${a.page}`;
}

function addressUrl(a) {
  return `#/${VERSION}/room/${a.room}/wall/${a.wall}/shelf/${a.shelf}/book/${a.book}/page/${a.page}`;
}

function phraseAddress(phrase) {
  const n = (salt, min, max) => intFromHash(`${VERSION}:phrase:${salt}:${phrase}`, min, max);
  return {
    room: n("room", 1, LIMITS.room),
    wall: n("wall", 1, LIMITS.wall),
    shelf: n("shelf", 1, LIMITS.shelf),
    book: n("book", 1, LIMITS.book),
    page: n("page", 1, LIMITS.page),
  };
}

function encodePayload(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(payload) {
  const base = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - base.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array([...binary].map(ch => ch.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function phraseUrl(phrase) {
  const a = phraseAddress(phrase);
  const payload = encodePayload({
    v: VERSION,
    kind: "phrase-page",
    phrase,
    address: a,
  });
  return `#/${VERSION}/phrase/${payload}`;
}

function generateWordText(a, opts = {}) {
  const phrase = opts.phrase || "";
  const seed = opts.phrase ? `${addressSeed(a)}:phrase:${phrase}` : addressSeed(a);
  const rng = rngFrom(seed);
  const targetWords = opts.phrase ? 210 : 190;
  const phraseWords = phrase.trim() ? phrase.trim().split(/\s+/) : [];
  const insertAt = phraseWords.length ? 38 + Math.floor(rng() * 95) : -1;
  const out = [];

  for (let i = 0; i < targetWords; i++) {
    if (i === insertAt) {
      out.push(...phraseWords);
      i += phraseWords.length - 1;
      continue;
    }

    const r = rng();
    if (r < 0.11) {
      out.push(pick(rng, WORDS) + pick(rng, [",", ";", ":", ""]));
    } else if (r < 0.145) {
      out.push(pick(rng, ["—", "«" + pick(rng, WORDS) + "»"]));
    } else {
      out.push(pick(rng, WORDS));
    }
  }

  const words = out;
  const paragraphs = [];
  let pos = 0;
  while (pos < words.length) {
    const step = 38 + Math.floor(rng() * 19);
    const part = words.slice(pos, pos + step);
    if (part.length) {
      let s = part.join(" ");
      s = s.slice(0, 1).toUpperCase() + s.slice(1);
      if (!/[.!?…]$/.test(s)) s += pick(rng, [".", ".", ".", "?", "…"]);
      paragraphs.push(s);
    }
    pos += step;
  }

  return paragraphs.join("\n\n");
}

function generateChaosText(a) {
  const rng = rngFrom(addressSeed(a) + ":chaos");
  const paragraphs = [];
  for (let p = 0; p < 5; p++) {
    const len = 360 + Math.floor(rng() * 160);
    let s = "";
    for (let i = 0; i < len; i++) {
      s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    }
    s = s.replace(/\s+/g, " ").trim();
    s = s.slice(0, 1).toUpperCase() + s.slice(1);
    paragraphs.push(s);
  }
  return paragraphs.join("\n\n");
}

function generatePage(a, mode = "words", phrase = "") {
  if (mode === "chaos" && !phrase) return generateChaosText(a);
  return generateWordText(a, { phrase });
}

function parseRoute() {
  const raw = location.hash || "#/";
  const hash = raw.slice(1);
  const [path, qs] = hash.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(qs || "");

  if (parts.length === 0) return { name: "home", params };
  if (parts[0] === VERSION && parts[1] === "room") {
    return {
      name: "page",
      params,
      address: normalizeAddress({
        room: parts[2],
        wall: parts[4],
        shelf: parts[6],
        book: parts[8],
        page: parts[10],
      }),
    };
  }
  if (parts[0] === VERSION && parts[1] === "phrase") {
    return {
      name: "phrase",
      params,
      payload: parts[2] || "",
    };
  }
  if (parts[0] === "about") return { name: "about", params };
  return { name: "home", params };
}

function highlightPhrase(text, phrase) {
  if (!phrase.trim()) return esc(text);
  const escapedText = esc(text);
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return escapedText;

  // Exact phrase can be split by HTML escaping, so highlight by escaped exact string first.
  const phraseEsc = esc(phrase.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const exactRe = new RegExp(`(${phraseEsc})`, "giu");
  const exact = escapedText.replace(exactRe, "<mark>$1</mark>");
  if (exact !== escapedText) return exact;

  const wordRe = new RegExp(`(${words.slice(0, 10).map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu");
  return escapedText.replace(wordRe, "<mark>$1</mark>");
}

function renderHome() {
  $("#app").innerHTML = `
    <section class="grid">
      <div class="card">
        <div class="tabs">
          <a class="button tab active" href="#/">Главная</a>
          <a class="button tab" href="#/about">Архитектура</a>
        </div>

        <h1>Страница восстанавливается из адреса</h1>
        <p>
          Здесь не хранятся страницы и не строится индекс. Ссылка сама является полным адресом.
          Один и тот же URL всегда даёт один и тот же текст, потому что генератор получает seed из координат.
        </p>

        <div class="notice">
          Это честная модель для GitHub Pages: нет backend, нет базы, нет заранее сохранённых страниц.
          Но есть строгое правило: <code>URL → seed → тот же самый текст</code>.
        </div>

        <h2>Открыть страницу по адресу</h2>
        <form id="addrForm" class="form-grid">
          ${[
            ["room", "Зал", 17],
            ["wall", "Стена", 2],
            ["shelf", "Полка", 4],
            ["book", "Том", 119],
            ["page", "Страница", 36],
          ].map(([key, label, value]) => `
            <div class="field">
              <label>${label}</label>
              <input id="${key}Input" inputmode="numeric" value="${value}">
            </div>
          `).join("")}
          <button class="primary" type="submit" style="grid-column:1/-1">Открыть страницу</button>
        </form>

        <h2 style="margin-top:24px">Страница с фразой</h2>
        <p>
          Без хранения и индекса нельзя честно «найти» произвольную фразу. Поэтому фразовый режим работает иначе:
          фраза кодируется прямо в ссылке, а страница восстанавливается из этой ссылки.
        </p>
        <form id="phraseForm">
          <textarea id="phraseInput" placeholder="Например: каждая страница имеет свою ссылку"></textarea>
          <div class="row" style="margin-top:10px">
            <button class="primary" type="submit">Создать восстанавливаемую ссылку</button>
          </div>
        </form>
      </div>

      <aside class="card">
        <h2>Почему так лучше</h2>
        <p>
          Если не хранить страницы, то нельзя обещать настоящий поиск по корпусу. Зато можно дать другое:
          стабильную, математически воспроизводимую библиотеку.
        </p>
        <div class="notice warning">
          Если фраза не записана в URL и нигде не хранится, восстановить её из одного хеша нельзя.
          Поэтому фразовый адрес содержит payload.
        </div>
        <h3>Формат ссылки</h3>
        <p class="mono">#/${VERSION}/room/17/wall/2/shelf/4/book/119/page/36</p>
        <p>
          Версия <code>v1</code> нужна, чтобы будущие изменения алгоритма не ломали старые ссылки.
        </p>
      </aside>
    </section>
  `;

  $("#addrForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = normalizeAddress({
      room: $("#roomInput").value,
      wall: $("#wallInput").value,
      shelf: $("#shelfInput").value,
      book: $("#bookInput").value,
      page: $("#pageInput").value,
    });
    location.hash = addressUrl(a);
  });

  $("#phraseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const phrase = $("#phraseInput").value.trim();
    if (!phrase) {
      alert("Введи фразу.");
      return;
    }
    location.hash = phraseUrl(phrase);
  });
}

function renderPage(address, params = new URLSearchParams()) {
  const mode = params.get("mode") || "words";
  const text = generatePage(address, mode);
  const title = addressTitle(address);

  $("#app").innerHTML = `
    <article class="card">
      <h1>${esc(title)}</h1>
      ${renderBadges(address, mode, "обычная страница")}
      <div class="controls">
        <a class="button" href="${addressUrl(prevAddress(address))}?mode=${encodeURIComponent(mode)}">← предыдущая</a>
        <a class="button" href="${addressUrl(nextAddress(address))}?mode=${encodeURIComponent(mode)}">следующая →</a>
        <button id="toggleModeBtn" type="button">${mode === "chaos" ? "Словесный режим" : "Кириллический хаос"}</button>
        <button id="copyTextBtn" type="button">Скопировать текст</button>
        <button id="downloadBtn" type="button">Скачать .txt</button>
      </div>
      <div class="notice">
        Эта страница не лежит в файле. Она восстановлена из адреса <code>${esc(addressSeed(address))}</code>.
      </div>
      <div class="page-text">${esc(text)}</div>
    </article>
  `;

  $("#toggleModeBtn").addEventListener("click", () => {
    const next = mode === "chaos" ? "words" : "chaos";
    location.hash = `${addressUrl(address)}?mode=${next}`;
  });

  wirePageButtons(title, text);
}

function renderPhrasePage(payload) {
  let data;
  try {
    data = decodePayload(payload);
  } catch (err) {
    $("#app").innerHTML = `
      <section class="card">
        <h1>Ссылка повреждена</h1>
        <p>Payload фразовой страницы не удалось прочитать.</p>
      </section>
    `;
    return;
  }

  const phrase = String(data.phrase || "").trim();
  const address = normalizeAddress(data.address || phraseAddress(phrase));
  const text = generatePage(address, "words", phrase);
  const title = `${addressTitle(address)} · фразовая страница`;

  $("#app").innerHTML = `
    <article class="card">
      <h1>${esc(title)}</h1>
      ${renderBadges(address, "phrase", "фразовая страница")}
      <div class="controls">
        <a class="button" href="${addressUrl(address)}">Открыть обычную страницу этого адреса</a>
        <button id="copyTextBtn" type="button">Скопировать текст</button>
        <button id="downloadBtn" type="button">Скачать .txt</button>
      </div>
      <div class="notice">
        Фраза не была найдена по индексу. Она восстановлена из самой ссылки и встроена в страницу
        детерминированно. Поэтому этой ссылкой можно поделиться, и другой человек увидит тот же текст.
      </div>
      <p class="mono">${esc(location.href)}</p>
      <div class="page-text">${highlightPhrase(text, phrase)}</div>
    </article>
  `;

  wirePageButtons(title, text);
}

function renderBadges(a, mode, kind) {
  return `
    <div class="address">
      <span class="badge">${esc(kind)}</span>
      <span class="badge">версия ${VERSION}</span>
      <span class="badge">режим ${esc(mode)}</span>
      <span class="badge">зал ${a.room}</span>
      <span class="badge">стена ${a.wall}</span>
      <span class="badge">полка ${a.shelf}</span>
      <span class="badge">том ${a.book}</span>
      <span class="badge">страница ${a.page}</span>
    </div>
  `;
}

function wirePageButtons(title, text) {
  $("#copyTextBtn").addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    alert("Текст скопирован.");
  });

  $("#downloadBtn").addEventListener("click", () => {
    const blob = new Blob([`${title}\n\n${text}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "babel-page.txt";
    link.click();
    URL.revokeObjectURL(url);
  });
}

function prevAddress(a) {
  const x = { ...a };
  x.page -= 1;
  if (x.page < 1) {
    x.page = LIMITS.page;
    x.book -= 1;
    if (x.book < 1) x.book = LIMITS.book;
  }
  return x;
}

function nextAddress(a) {
  const x = { ...a };
  x.page += 1;
  if (x.page > LIMITS.page) {
    x.page = 1;
    x.book += 1;
    if (x.book > LIMITS.book) x.book = 1;
  }
  return x;
}

function renderAbout() {
  $("#app").innerHTML = `
    <section class="card">
      <div class="tabs">
        <a class="button tab" href="#/">Главная</a>
        <a class="button tab active" href="#/about">Архитектура</a>
      </div>

      <h1>Архитектура без хранения страниц</h1>
      <p>
        Здесь нет заранее построенного корпуса. Страницы не лежат в JSON, не лежат в базе и не скачиваются
        с сервера. GitHub Pages отдаёт только статический фронтенд.
      </p>

      <h2>Обычная страница</h2>
      <p>
        Адрес страницы содержит координаты: зал, стена, полка, том, страница. Из координат собирается seed:
      </p>
      <p class="mono">v1:17:2:4:119:36</p>
      <p>
        Затем стабильный генератор псевдослучайных чисел строит текст. Пока алгоритм <code>v1</code> не меняется,
        ссылка всегда восстанавливает тот же самый лист.
      </p>

      <h2>Фразовая страница</h2>
      <p>
        Произвольную фразу нельзя восстановить из пустоты. Если нет ни индекса, ни сохранённой страницы,
        то единственный честный способ поделиться страницей с фразой — включить фразу в ссылку.
      </p>
      <p>
        Поэтому фразовый URL содержит payload: версию алгоритма, фразу и адрес. Это не поиск по библиотеке,
        а самодостаточная восстанавливаемая страница.
      </p>

      <h2>Правило совместимости</h2>
      <p>
        Нельзя менять поведение генератора <code>v1</code> после публикации. Если понадобится новый стиль текста,
        нужно добавить <code>v2</code>, но старые ссылки <code>v1</code> должны продолжать открываться как раньше.
      </p>
    </section>
  `;
}

function randomAddress() {
  return {
    room: 1 + Math.floor(Math.random() * LIMITS.room),
    wall: 1 + Math.floor(Math.random() * LIMITS.wall),
    shelf: 1 + Math.floor(Math.random() * LIMITS.shelf),
    book: 1 + Math.floor(Math.random() * LIMITS.book),
    page: 1 + Math.floor(Math.random() * LIMITS.page),
  };
}

async function copyCurrentLink() {
  await navigator.clipboard.writeText(location.href);
  alert("Ссылка скопирована.");
}

function router() {
  try {
    const route = parseRoute();
    if (route.name === "home") renderHome();
    else if (route.name === "page") renderPage(route.address, route.params);
    else if (route.name === "phrase") renderPhrasePage(route.payload);
    else if (route.name === "about") renderAbout();
    else renderHome();
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<section class="card"><h1>Ошибка</h1><p>${esc(err.message)}</p></section>`;
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", () => {
  $("#randomBtn").addEventListener("click", () => {
    location.hash = addressUrl(randomAddress());
  });
  $("#copyLinkBtn").addEventListener("click", copyCurrentLink);
  router();
});
