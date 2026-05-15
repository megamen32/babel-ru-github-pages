'use strict';

const LIMITS = Object.freeze({
  rooms: 1000000,
  walls: 4,
  shelves: 5,
  books: 999,
  pages: 410,
});

const PAGE_CHARS = 3600;
const LINE_LENGTH = 76;
const FAVORITES_KEY = 'babel.ru.favorites.v1';
const MODE_KEY = 'babel.ru.mode.v1';

const CHAOS_ALPHABET = ' абвгдеёжзийклмнопрстуфхцчшщъыьэюя.,!?;:—«»()';

const WORDS = [
  'бездна', 'вечность', 'зеркало', 'зал', 'том', 'страница', 'полка', 'память', 'тишина', 'шёпот',
  'город', 'ночь', 'окно', 'рукопись', 'пыль', 'лампа', 'читатель', 'лабиринт', 'порог', 'след',
  'слово', 'время', 'голос', 'архив', 'сон', 'пепел', 'север', 'сад', 'камень', 'река', 'тень',
  'ключ', 'карта', 'море', 'письмо', 'смысл', 'ошибка', 'судьба', 'страх', 'радость', 'книга',
  'молчание', 'ветер', 'переход', 'комната', 'знак', 'снег', 'часы', 'дверь', 'линия', 'имя',
  'звезда', 'пламя', 'путь', 'голубь', 'свет', 'угол', 'бумага', 'чернила', 'звук', 'символ'
];

const TEMPLATES = [
  'В зале {a} читатель {b} нашёл {c}, но не понял, была ли это ошибка или знак.',
  'Каждая {a} помнит {b}; каждое {c} скрывает другое имя.',
  'Когда {a} открывает {b}, из глубины выходит {c}.',
  'Никто не знает, почему {a} повторяет {b}, пока {c} молчит.',
  'В этой книге {a} становится {b}, а {c} — последней дверью.',
  'Если {a} исчезнет, останется только {b} и едва заметный {c}.',
  'Библиотекарь записал: {a} есть форма {b}, а {c} есть её тень.',
  'На полке лежали {a}, {b} и {c}; порядок казался случайным, но был неизбежен.',
];

const $ = (selector) => document.querySelector(selector);
const app = $('#app');
const hero = $('#hero');
const modeSelect = $('#modeSelect');
const addressInput = $('#addressInput');
const phraseInput = $('#phraseInput');
const saveFavoriteButton = $('#saveFavorite');

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seed() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(text) {
  return mulberry32(xmur3(text)());
}

function intFromRng(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function encodeText(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeText(encoded) {
  const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeMode(mode) {
  return ['chaos', 'words', 'prophecy'].includes(mode) ? mode : 'chaos';
}

function parseHash() {
  const raw = window.location.hash || '#/';
  const withoutHash = raw.startsWith('#') ? raw.slice(1) : raw;
  const [pathPart, queryPart = ''] = withoutHash.split('?');
  const params = new URLSearchParams(queryPart);
  const parts = pathPart.split('/').filter(Boolean);
  const mode = normalizeMode(params.get('mode') || localStorage.getItem(MODE_KEY) || 'chaos');
  return { raw, path: pathPart || '/', parts, params, mode };
}

function addressToSeed(address, mode) {
  return `mode:${mode}|room:${address.room}|wall:${address.wall}|shelf:${address.shelf}|book:${address.book}|page:${address.page}`;
}

function addressToPath(address, options = {}) {
  const params = new URLSearchParams();
  const mode = normalizeMode(options.mode || modeSelect.value || 'chaos');
  params.set('mode', mode);
  if (options.phrase) params.set('q', encodeText(options.phrase));
  return `#/room/${address.room}/wall/${address.wall}/shelf/${address.shelf}/book/${address.book}/page/${address.page}?${params.toString()}`;
}

function addressLabel(address) {
  return `Зал ${address.room} · Стена ${address.wall} · Полка ${address.shelf} · Том ${address.book} · Страница ${address.page}`;
}

function parseAddress(parts) {
  const map = {};
  for (let i = 0; i < parts.length; i += 2) {
    map[parts[i]] = parts[i + 1];
  }
  if (!map.room || !map.wall || !map.shelf || !map.book || !map.page) return null;
  return {
    room: clampInt(map.room, 0, LIMITS.rooms - 1),
    wall: clampInt(map.wall, 1, LIMITS.walls),
    shelf: clampInt(map.shelf, 1, LIMITS.shelves),
    book: clampInt(map.book, 1, LIMITS.books),
    page: clampInt(map.page, 1, LIMITS.pages),
  };
}

function randomAddress(seedText = String(Date.now())) {
  const rng = rngFrom(seedText);
  return {
    room: intFromRng(rng, 0, LIMITS.rooms - 1),
    wall: intFromRng(rng, 1, LIMITS.walls),
    shelf: intFromRng(rng, 1, LIMITS.shelves),
    book: intFromRng(rng, 1, LIMITS.books),
    page: intFromRng(rng, 1, LIMITS.pages),
  };
}

function addressFromPhrase(phrase) {
  return randomAddress(`phrase:${phrase}`);
}

function nextAddress(address, direction) {
  const next = { ...address };
  next.page += direction;

  if (next.page > LIMITS.pages) {
    next.page = 1;
    next.book += 1;
  }
  if (next.page < 1) {
    next.page = LIMITS.pages;
    next.book -= 1;
  }
  if (next.book > LIMITS.books) {
    next.book = 1;
    next.shelf += 1;
  }
  if (next.book < 1) {
    next.book = LIMITS.books;
    next.shelf -= 1;
  }
  if (next.shelf > LIMITS.shelves) {
    next.shelf = 1;
    next.wall += 1;
  }
  if (next.shelf < 1) {
    next.shelf = LIMITS.shelves;
    next.wall -= 1;
  }
  if (next.wall > LIMITS.walls) {
    next.wall = 1;
    next.room += 1;
  }
  if (next.wall < 1) {
    next.wall = LIMITS.walls;
    next.room -= 1;
  }
  if (next.room >= LIMITS.rooms) next.room = 0;
  if (next.room < 0) next.room = LIMITS.rooms - 1;

  return next;
}

function wrapText(text, width = LINE_LENGTH) {
  const words = text.split(/(\s+)/);
  const lines = [];
  let line = '';
  for (const chunk of words) {
    if (chunk.includes('\n')) {
      const subparts = chunk.split('\n');
      line += subparts[0];
      lines.push(line.trimEnd());
      line = subparts.slice(1).join(' ');
      continue;
    }
    if ((line + chunk).length > width && line.trim()) {
      lines.push(line.trimEnd());
      line = chunk.trimStart();
    } else {
      line += chunk;
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join('\n');
}

function generateChaos(seed, length = PAGE_CHARS) {
  const rng = rngFrom(seed);
  const chars = [];
  for (let i = 0; i < length; i += 1) {
    if (i > 0 && i % LINE_LENGTH === 0) chars.push('\n');
    chars.push(CHAOS_ALPHABET[intFromRng(rng, 0, CHAOS_ALPHABET.length - 1)]);
  }
  return chars.join('');
}

function generateWordNoise(seed, length = PAGE_CHARS) {
  const rng = rngFrom(seed);
  const punctuation = ['.', '.', '.', '?', '!', ';', ' —'];
  const sentences = [];
  let total = 0;
  while (total < length) {
    const count = intFromRng(rng, 4, 13);
    const words = [];
    for (let i = 0; i < count; i += 1) {
      const word = WORDS[intFromRng(rng, 0, WORDS.length - 1)];
      words.push(i === 0 ? word[0].toUpperCase() + word.slice(1) : word);
    }
    const sentence = words.join(' ') + punctuation[intFromRng(rng, 0, punctuation.length - 1)];
    sentences.push(sentence);
    total += sentence.length + 1;
  }
  return wrapText(sentences.join(' ')).slice(0, length + 200);
}

function generateProphecy(seed, length = PAGE_CHARS) {
  const rng = rngFrom(seed);
  const sentences = [];
  let total = 0;
  while (total < length) {
    const template = TEMPLATES[intFromRng(rng, 0, TEMPLATES.length - 1)];
    const sentence = template
      .replace('{a}', WORDS[intFromRng(rng, 0, WORDS.length - 1)])
      .replace('{b}', WORDS[intFromRng(rng, 0, WORDS.length - 1)])
      .replace('{c}', WORDS[intFromRng(rng, 0, WORDS.length - 1)]);
    sentences.push(sentence);
    total += sentence.length + 1;
  }
  return wrapText(sentences.join(' ')).slice(0, length + 200);
}

function generatePageText(address, mode) {
  const seed = addressToSeed(address, mode);
  if (mode === 'words') return generateWordNoise(seed);
  if (mode === 'prophecy') return generateProphecy(seed);
  return generateChaos(seed);
}

function injectPhrase(text, phrase, seed) {
  if (!phrase) return { text, index: -1 };
  const normalizedPhrase = phrase.trim();
  if (!normalizedPhrase) return { text, index: -1 };

  const rng = rngFrom(`inject:${seed}|${normalizedPhrase}`);
  const cleanText = text.replaceAll(normalizedPhrase, ' '.repeat(Math.min(normalizedPhrase.length, 80)));
  const maxIndex = Math.max(0, cleanText.length - normalizedPhrase.length - 1);
  const index = intFromRng(rng, 0, maxIndex);
  const injected = cleanText.slice(0, index) + normalizedPhrase + cleanText.slice(index + normalizedPhrase.length);
  return { text: injected, index };
}

function pageHtml(text, phrase) {
  if (!phrase) return escapeHtml(text);
  const trimmed = phrase.trim();
  const index = text.indexOf(trimmed);
  if (index === -1) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<span class="highlight">${escapeHtml(trimmed)}</span>${escapeHtml(text.slice(index + trimmed.length))}`;
}

function currentAbsoluteUrl(hash = window.location.hash) {
  const url = new URL(window.location.href);
  url.hash = hash;
  return url.toString();
}

function getFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setFavorites(items) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items.slice(0, 100)));
}

function isCurrentFavorite() {
  const url = currentAbsoluteUrl();
  return getFavorites().some((item) => item.url === url);
}

function updateFavoriteButton() {
  saveFavoriteButton.textContent = isCurrentFavorite() ? '★ В избранном' : '★ В избранное';
}

function toggleFavorite(address, phrase, text) {
  const url = currentAbsoluteUrl();
  const favorites = getFavorites();
  const existingIndex = favorites.findIndex((item) => item.url === url);
  if (existingIndex >= 0) {
    favorites.splice(existingIndex, 1);
    setFavorites(favorites);
    showToast('Страница удалена из избранного');
    updateFavoriteButton();
    return;
  }

  favorites.unshift({
    url,
    hash: window.location.hash,
    address: addressLabel(address),
    phrase: phrase || '',
    snippet: (phrase || text.slice(0, 160)).replace(/\s+/g, ' ').trim(),
    createdAt: new Date().toISOString(),
  });
  setFavorites(favorites);
  showToast('Страница сохранена в избранном');
  updateFavoriteButton();
}

async function copyText(text, message = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    showToast(message);
  }
}

function showToast(message) {
  document.querySelectorAll('.toast').forEach((node) => node.remove());
  const template = $('#toastTemplate');
  const node = template.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 2200);
}

function setHash(hash) {
  window.location.hash = hash.startsWith('#') ? hash.slice(1) : hash;
}

function renderHome() {
  hero.hidden = false;
  const favorites = getFavorites();
  app.innerHTML = `
    <section class="panel">
      <div class="grid">
        <article class="feature">
          <h3>Постоянные ссылки</h3>
          <p>Маршрут вида <code>#/room/17/wall/2/shelf/4/book/119/page/36</code> полностью задаёт страницу.</p>
        </article>
        <article class="feature">
          <h3>Без backend</h3>
          <p>Весь проект — обычные статические файлы. Его можно положить прямо в репозиторий GitHub Pages.</p>
        </article>
        <article class="feature">
          <h3>Поиск фразы</h3>
          <p>Фраза кодируется в URL результата и подсвечивается на найденной странице.</p>
        </article>
      </div>
    </section>
    <section class="panel favorites">
      <h2>Избранные страницы</h2>
      ${favorites.length ? `
        <div class="favorites-list">
          ${favorites.map((item) => `
            <article class="favorite-item">
              <a href="${escapeHtml(item.hash)}">${escapeHtml(item.address)}</a>
              <small>${escapeHtml(item.phrase ? `Фраза: ${item.phrase}` : item.snippet)}</small>
            </article>
          `).join('')}
        </div>
      ` : '<p class="empty">Пока пусто. Открой страницу и нажми «В избранное».</p>'}
    </section>
  `;
  addressInput.value = '';
  updateFavoriteButton();
}

function renderPage(address, mode, phrase = '') {
  hero.hidden = true;
  modeSelect.value = mode;
  localStorage.setItem(MODE_KEY, mode);
  addressInput.value = `${address.room}/${address.wall}/${address.shelf}/${address.book}/${address.page}`;

  const seed = addressToSeed(address, mode);
  const baseText = generatePageText(address, mode);
  const result = injectPhrase(baseText, phrase, seed);
  const text = result.text;
  const prev = addressToPath(nextAddress(address, -1), { mode });
  const next = addressToPath(nextAddress(address, 1), { mode });
  const canonical = addressToPath(address, { mode });

  app.innerHTML = `
    <article class="page-card">
      <header class="page-header">
        <div class="page-title">
          <h2>${escapeHtml(addressLabel(address))}</h2>
          <p>${phrase ? 'Фраза найдена и подсвечена внутри страницы.' : 'Детерминированная страница библиотеки.'}</p>
        </div>
        <div class="badges">
          <span class="badge">${escapeHtml(modeLabel(mode))}</span>
          <span class="badge">${PAGE_CHARS.toLocaleString('ru-RU')} знаков</span>
        </div>
      </header>

      <div class="page-actions">
        <a href="${prev}"><button type="button">← Предыдущая</button></a>
        <a href="${next}"><button type="button">Следующая →</button></a>
        <button id="copyPageLink" type="button">Скопировать ссылку</button>
        <button id="copyPageText" type="button">Скопировать текст</button>
        <button id="downloadPage" type="button">Скачать .txt</button>
        ${phrase ? `<a href="${canonical}"><button type="button">Каноническая страница без фразы</button></a>` : ''}
      </div>

      <pre class="book-page">${pageHtml(text, phrase)}</pre>

      <footer class="meta-row">
        <div class="meta-item"><small>Зал</small><strong>${address.room}</strong></div>
        <div class="meta-item"><small>Стена</small><strong>${address.wall}</strong></div>
        <div class="meta-item"><small>Полка</small><strong>${address.shelf}</strong></div>
        <div class="meta-item"><small>Том</small><strong>${address.book}</strong></div>
        <div class="meta-item"><small>Страница</small><strong>${address.page}</strong></div>
      </footer>
    </article>
  `;

  $('#copyPageLink').addEventListener('click', () => copyText(currentAbsoluteUrl(), 'Ссылка на страницу скопирована'));
  $('#copyPageText').addEventListener('click', () => copyText(text, 'Текст страницы скопирован'));
  $('#downloadPage').addEventListener('click', () => downloadText(`${address.room}-${address.wall}-${address.shelf}-${address.book}-${address.page}.txt`, text));
  saveFavoriteButton.onclick = () => toggleFavorite(address, phrase, text);
  updateFavoriteButton();
}

function modeLabel(mode) {
  return {
    chaos: 'Кириллический хаос',
    words: 'Словесный шум',
    prophecy: 'Псевдопророчество',
  }[mode] || 'Кириллический хаос';
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

function rerender() {
  const route = parseHash();
  modeSelect.value = route.mode;

  if (route.parts[0] === 'room') {
    const address = parseAddress(route.parts);
    if (!address) {
      renderNotFound();
      return;
    }
    let phrase = '';
    const encodedPhrase = route.params.get('q');
    if (encodedPhrase) {
      try {
        phrase = decodeText(encodedPhrase);
      } catch {
        phrase = '';
      }
    }
    renderPage(address, route.mode, phrase);
    return;
  }

  renderHome();
}

function renderNotFound() {
  hero.hidden = false;
  app.innerHTML = `
    <section class="panel">
      <h2>Такой полки нет</h2>
      <p class="empty">Адрес не похож на страницу библиотеки. Открой случайную страницу или вернись на главную.</p>
      <button id="notFoundRandom" type="button">Случайная страница</button>
    </section>
  `;
  $('#notFoundRandom').addEventListener('click', openRandomPage);
}

function openRandomPage() {
  const address = randomAddress(`random:${Date.now()}:${Math.random()}`);
  setHash(addressToPath(address, { mode: modeSelect.value }));
}

function openSearchResult(phrase) {
  const trimmed = phrase.trim();
  if (!trimmed) {
    showToast('Сначала введи фразу');
    return;
  }
  const address = addressFromPhrase(trimmed);
  setHash(addressToPath(address, { mode: modeSelect.value, phrase: trimmed }));
}

function changeMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  const route = parseHash();
  if (route.parts[0] !== 'room') return;
  const address = parseAddress(route.parts);
  if (!address) return;
  const phrase = route.params.get('q') ? decodeText(route.params.get('q')) : '';
  setHash(addressToPath(address, { mode, phrase }));
}

function parseManualAddress(value) {
  const numbers = String(value).match(/\d+/g);
  if (!numbers || numbers.length < 5) return null;
  return {
    room: clampInt(numbers[0], 0, LIMITS.rooms - 1),
    wall: clampInt(numbers[1], 1, LIMITS.walls),
    shelf: clampInt(numbers[2], 1, LIMITS.shelves),
    book: clampInt(numbers[3], 1, LIMITS.books),
    page: clampInt(numbers[4], 1, LIMITS.pages),
  };
}

$('#searchForm').addEventListener('submit', (event) => {
  event.preventDefault();
  openSearchResult(phraseInput.value);
});

$('#clearPhrase').addEventListener('click', () => {
  phraseInput.value = '';
  phraseInput.focus();
});

$('#randomPageTop').addEventListener('click', openRandomPage);

$('#copyLinkTop').addEventListener('click', () => copyText(currentAbsoluteUrl(), 'Ссылка скопирована'));

modeSelect.addEventListener('change', (event) => changeMode(event.target.value));

$('#goAddress').addEventListener('click', () => {
  const address = parseManualAddress(addressInput.value);
  if (!address) {
    showToast('Формат: зал/стена/полка/том/страница');
    return;
  }
  setHash(addressToPath(address, { mode: modeSelect.value }));
});

addressInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('#goAddress').click();
});

window.addEventListener('hashchange', rerender);

if (!window.location.hash) {
  window.location.hash = '#/';
} else {
  rerender();
}
