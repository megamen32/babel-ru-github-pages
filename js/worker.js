/* ============================================
   ВАВИЛОН — Web Worker for async BigInt ops
   Self-contained computation engine
   ============================================ */

'use strict';

/* ═══════════════════════════════════════════════════════════
   ALPHABET — 256 characters = 2^8
   ═══════════════════════════════════════════════════════════ */

const ALPHABET = [
  /*  0 */ " ",
  /*  1 */ "\n",
  /*  2–34  Russian (33) */
  "а","б","в","г","д","е","ж","з","и","й",
  "к","л","м","н","о","п","р","с","т","у",
  "ф","х","ц","ч","ш","щ","ъ","ы","ь","э",
  "ю","я","ё",
  /* 35–60  English (26) */
  "a","b","c","d","e","f","g","h","i","j",
  "k","l","m","n","o","p","q","r","s","t",
  "u","v","w","x","y","z",
  /* 61–70  Digits (10) */
  "0","1","2","3","4","5","6","7","8","9",
  /* 71–106  Punctuation (36) */
  ".",",","!","?",";",":","-","—","«","»",
  "(",")","…","@","#","_","/","*","=","+",
  "[","]","{","}","<",">","~","`","^","|",
  "\\","&","%","$","'","\"",
  /* 107–255  Emoji (149) */
  "🔥","⭐","💯","❌","✅","🎉","💀","👻","🧠","❤",
  "👍","👎","👋","💪","🙏","😂","😭","😤","🥺","🤔",
  "💬","📱","💻","🌍","🎵","☕","🎯","⚡","💎","🔑",
  "🚀","🌙","🎮","🏆","🍺","🌸","🦋","🐱","🐶","🌈",
  "💡","📖","🔔","😎","🥳","💙","🖤","🤷","🤩","💢",
  "🤗","😴","🤮","🤑","🤠","😈","👿","👹","🤡","👀",
  "🫡","🫠","🫣","🤭","🤫","🤓","🧐","🙃","😬","🥴",
  "🤪","🤯","😱","😨","😰","😥","😢","🤬","😡","😠",
  "🥵","🥶","😳","😏","😌","🤤","🤢","🤧","😷","🤒",
  "🤕","✨","💫","🌊","🍀","🍂","🌻","🌺","🌲","🌳",
  "🌴","🌵","🍄","🦊","🐻","🐼","🐨","🐯","🦁","🐮",
  "🐷","🐸","🐵","🐔","🐧","🐦","🦅","🦉","🦇","🐺",
  "🐗","🐴","🦄","🐝","🐛","🐌","🐞","🐜","🐙","🦑",
  "🐠","🐟","🐡","🦈","🐋","🐳","🐬","🦭","🐉","🦕",
  "🦖","🐍","🦎","🐊","🐢","🦂","☑","🔘","🆗"
];

/* Char→index lookup */
const charToIndex = new Map();
for (let i = 0; i < ALPHABET.length; i++) {
  charToIndex.set(ALPHABET[i], i);
}

const VISUAL_OVERLAP = {
  "a": "а", "e": "е", "k": "к", "m": "м",
  "o": "о", "c": "с", "t": "т", "x": "х",
};

const ALG = {
  label: "ru5",
  alphabet: ALPHABET,
  pageLength: 4096,
  pagesPerVolume: 410n,
  volumesPerShelf: 32n,
  shelvesPerWall: 5n,
  wallsPerHall: 4n,
  hallsPerSector: 20n,
};

const WORD_BANK = [
  "архив", "книга", "сумрак", "пыль", "каталог", "лестница", "галерея", "полка",
  "переплет", "тишина", "страж", "лампа", "письмо", "зеркало", "индекс", "том",
  "лист", "коридор", "узор", "шёпот", "словарь", "лабиринт", "шестигранник",
  "предел", "слово", "рукопись", "описание", "число", "перестановка", "алфавит",
  "формула", "ночь", "свет", "порог", "перила", "символ", "строка", "координата",
];

const SEARCH_VARIANTS_DEFAULT = 6;
const SEARCH_VARIANTS_MAX = 18;

/* ═══════════════════════════════════════════════════════════
   CORE BigInt ENGINE
   ═══════════════════════════════════════════════════════════ */

const BITS_PER_CHAR = 8n;
const CHAR_MASK = 255n;
const TOTAL_BITS = BITS_PER_CHAR * BigInt(ALG.pageLength);
const BIT_MASK = (1n << TOTAL_BITS) - 1n;

function maxPageNumber() { return 1n << TOTAL_BITS; }

/* ---- Affine permutation ---- */
const SEED_C = 0x4CF3B209D871A5E7n;
const SEED_C_INV = SEED_C ^ 0xFFFFFFFFFFFFFFFFn;

let _c = 0n;
for (let bitPos = 0; bitPos < Number(TOTAL_BITS); bitPos += 64) {
  const pattern = (bitPos / 64) % 2 === 0 ? SEED_C : SEED_C_INV;
  _c = (_c | (pattern << BigInt(bitPos))) & BIT_MASK;
}
const PERM_C = _c | 1n;

let _offset = 0n;
const PATTERN = 0x5BD1E9A3F7C20658n;
for (let bitPos = 0; bitPos < Number(TOTAL_BITS); bitPos += 64) {
  _offset = (_offset | (PATTERN << BigInt(bitPos))) & BIT_MASK;
}
const PERM_OFFSET = _offset;

function modInvPow2(a, n) {
  let inv = a;
  const iterations = Math.ceil(Math.log2(Number(n))) + 1;
  const mod = 1n << n;
  for (let i = 0; i < iterations; i++) {
    inv = (inv * (2n - a * inv % mod) % mod + mod) % mod;
  }
  return inv;
}
const PERM_I = modInvPow2(PERM_C, TOTAL_BITS);

/* ---- Conversion ---- */
function indicesToNumber(indices) {
  let output = 0n;
  for (const idx of indices) output = (output << BITS_PER_CHAR) | BigInt(idx);
  return output;
}

function numberToIndices(number) {
  const max = maxPageNumber();
  let value = BigInt(number);
  if (value < 0n || value >= max) throw new Error("Адрес вне пространства библиотеки.");
  const result = new Array(ALG.pageLength);
  for (let i = ALG.pageLength - 1; i >= 0; i--) {
    result[i] = Number(value & CHAR_MASK);
    value >>= BITS_PER_CHAR;
  }
  return result;
}

function tokenizeText(text) {
  const indices = [];
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (let len = 4; len >= 1; len--) {
      if (i + len > text.length) continue;
      const substr = text.slice(i, i + len);
      const idx = charToIndex.get(substr);
      if (idx !== undefined) { indices.push(idx); i += len; matched = true; break; }
    }
    if (!matched) { indices.push(0); i++; }
  }
  return indices;
}

function indicesToString(indices) {
  return indices.map(i => ALPHABET[i]).join("");
}

function normalizeText(raw) {
  let text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.toLowerCase().replace(/[ \t]+/g, " ").trim();
  text = text.replace(/[aekmoctx]/g, ch => VISUAL_OVERLAP[ch] || ch);
  const indices = tokenizeText(text);
  return indicesToString(indices).replace(/ +/g, " ").trim();
}

function textToNumber(text) {
  const indices = tokenizeText(text);
  while (indices.length < ALG.pageLength) indices.push(0);
  if (indices.length > ALG.pageLength) indices.length = ALG.pageLength;
  return indicesToNumber(indices);
}

function numberToText(number) {
  return indicesToString(numberToIndices(number));
}

/* ---- Coordinate system ---- */
function permuteIndex(index) {
  return ((BigInt(index) * PERM_C + PERM_OFFSET) & BIT_MASK);
}

function unpermuteIndex(index) {
  return (((BigInt(index) - PERM_OFFSET + (1n << (TOTAL_BITS + 8n))) * PERM_I) & BIT_MASK);
}

function rawIndexToCoordinates(rawIndex) {
  let value = BigInt(rawIndex);
  const page = (value % ALG.pagesPerVolume) + 1n;
  value /= ALG.pagesPerVolume;
  const volume = (value % ALG.volumesPerShelf) + 1n;
  value /= ALG.volumesPerShelf;
  const shelf = (value % ALG.shelvesPerWall) + 1n;
  value /= ALG.shelvesPerWall;
  const wall = (value % ALG.wallsPerHall) + 1n;
  value /= ALG.wallsPerHall;
  const hall = (value % ALG.hallsPerSector) + 1n;
  value /= ALG.hallsPerSector;
  const sector = value + 1n;
  return { sector, hall, wall, shelf, volume, page };
}

function coordinatesToRawIndex(coordinates) {
  const c = {
    sector: BigInt(coordinates.sector || 1),
    hall: BigInt(coordinates.hall || 1),
    wall: BigInt(coordinates.wall || 1),
    shelf: BigInt(coordinates.shelf || 1),
    volume: BigInt(coordinates.volume || 1),
    page: BigInt(coordinates.page || 1),
  };
  let value = c.sector - 1n;
  value = value * ALG.hallsPerSector + (c.hall - 1n);
  value = value * ALG.wallsPerHall + (c.wall - 1n);
  value = value * ALG.shelvesPerWall + (c.shelf - 1n);
  value = value * ALG.volumesPerShelf + (c.volume - 1n);
  value = value * ALG.pagesPerVolume + (c.page - 1n);
  return value;
}

function coordinatesToNumber(coordinates) {
  return permuteIndex(coordinatesToRawIndex(coordinates));
}

function numberToCoordinates(number) {
  return rawIndexToCoordinates(unpermuteIndex(number));
}

/* ---- Szudzik pairing ---- */
function bigSqrt(n) {
  if (n < 0n) throw new Error("sqrt of negative");
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

function szudzikPair(x, y) {
  const a = x >= 0 ? 2 * x : -2 * x - 1;
  const b = y >= 0 ? 2 * y : -2 * y - 1;
  return a >= b ? a * a + a + b : b * b + a;
}

function szudzikUnpair(n) {
  const bn = BigInt(n);
  const m = bigSqrt(bn);
  let a, b;
  if (bn - m * m < m) { a = bn - m * m; b = m; }
  else { a = m; b = bn - m * m - m; }
  const x = a % 2n === 0n ? a / 2n : -(a + 1n) / 2n;
  const y = b % 2n === 0n ? b / 2n : -(b + 1n) / 2n;
  return { x, y };
}

function xyToHallXY(x, y) {
  const linear = szudzikPair(x, y);
  return { sector: BigInt(Math.floor(linear / 20)) + 1n, hall: BigInt(linear % 20) + 1n };
}

function hallToXY(sector, hall) {
  return szudzikUnpair((BigInt(sector) - 1n) * 20n + (BigInt(hall) - 1n));
}

function xyToCoordinates(x, y, wall, shelf, volume, page) {
  const { sector, hall } = xyToHallXY(x, y);
  return { sector, hall, wall: BigInt(wall || 1), shelf: BigInt(shelf || 1), volume: BigInt(volume || 1), page: BigInt(page || 1) };
}

function coordinatesToXY(coords) { return hallToXY(coords.sector, coords.hall); }

/* ---- Filler generation ---- */
function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let word = Math.imul(state ^ (state >>> 15), 1 | state);
    word = (word + Math.imul(word ^ (word >>> 7), 61 | word)) ^ word;
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFrom(text) { return mulberry32(fnv1a(text)); }

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function createWordFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  const indices = [];
  while (indices.length < length + 16) {
    const word = WORD_BANK[Math.floor(rng() * WORD_BANK.length)];
    indices.push(...tokenizeText(word));
    indices.push(rng() < 0.14 ? tokenizeText(",")[0] : 0);
  }
  while (indices.length < length) indices.push(0);
  return indices.slice(0, length);
}

function createNoiseFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  return Array.from({ length }, () => Math.floor(rng() * ALPHABET.length));
}

function createFillerIndices(mode, seed, length) {
  if (mode === "empty") return new Array(length).fill(0);
  if (mode === "words") return createWordFillerIndices(seed, length);
  return createNoiseFillerIndices(seed, length);
}

function choosePosition(mode, phraseLength, rng) {
  const maxPosition = ALG.pageLength - phraseLength;
  if (mode === "empty") return Math.max(0, Math.floor((ALG.pageLength - phraseLength) / 2));
  return clamp(Math.floor(rng() * Math.max(1, maxPosition + 1)), 0, maxPosition);
}

/* ---- Search variants ---- */
function createSearchVariants(phraseRaw, mode, countRaw) {
  const phrase = normalizeText(phraseRaw);
  if (!phrase) throw new Error("После нормализации фраза пуста.");
  const phraseIndices = tokenizeText(phrase);
  if (phraseIndices.length > ALG.pageLength) throw new Error("Фраза длиннее страницы.");
  const count = clamp(Math.floor(Number(countRaw) || SEARCH_VARIANTS_DEFAULT), 1, SEARCH_VARIANTS_MAX);
  const variants = [];
  for (let variant = 1; variant <= count; variant++) {
    const seed = `${ALG.label}:mode:${mode}:phrase:${phrase}:variant:${variant}`;
    const rng = rngFrom(seed);
    const position = choosePosition(mode, phraseIndices.length, rng);
    const fillerIndices = createFillerIndices(mode, seed, ALG.pageLength);
    for (let i = 0; i < phraseIndices.length; i++) fillerIndices[position + i] = phraseIndices[i];
    if (position > 0) fillerIndices[position - 1] = 0;
    if (position + phraseIndices.length < ALG.pageLength) fillerIndices[position + phraseIndices.length] = 0;
    const number = indicesToNumber(fillerIndices);
    const coords = rawIndexToCoordinates(unpermuteIndex(number));
    const xy = coordinatesToXY(coords);
    variants.push({ mode, number: number.toString(), coordinates: {
      sector: coords.sector.toString(), hall: coords.hall.toString(),
      wall: coords.wall.toString(), shelf: coords.shelf.toString(),
      volume: coords.volume.toString(), page: coords.page.toString(),
    }, xy: { x: xy.x.toString(), y: xy.y.toString() }, phrase, position, text: indicesToString(fillerIndices), variant, range: { start: position, length: phraseIndices.length } });
  }
  return variants;
}

/* ---- Book spine ---- */
function classifySpine(spineText) {
  if (!spineText) return "empty";
  if (spineText.replace(/[\s\n]/g, "").length === 0) return "empty";
  const wordPattern = /[абвгдеёжзийклмнопрстуфхцчшщъыьэюяa-z]{3,}/gi;
  const words = spineText.match(wordPattern);
  if (words && words.length >= 1 && words.some(w => w.length >= 4)) return "text";
  if (words && words.length >= 2) return "text";
  return "noise";
}

function getBookSpine(x, y, wall, shelf, volume) {
  try {
    const coords = xyToCoordinates(x, y, wall, shelf, volume, 1);
    const number = coordinatesToNumber(coords);
    const indices = numberToIndices(number);
    let start = 0;
    while (start < indices.length && indices[start] === 0) start++;
    return indicesToString(indices.slice(start, start + 25));
  } catch { return ""; }
}

/* ---- Batch book spines for wander view ---- */
function getBookSpines(x, y, wall) {
  const results = [];
  for (let s = 1; s <= Number(ALG.shelvesPerWall); s++) {
    const shelf = [];
    for (let v = 1; v <= Number(ALG.volumesPerShelf); v++) {
      const spineText = getBookSpine(x, y, wall, s, v);
      const cls = classifySpine(spineText);
      const coords = xyToCoordinates(x, y, wall, s, v, 1);
      const number = coordinatesToNumber(coords);
      shelf.push({
        volume: v, shelf: s, spineText, cls,
        number: number.toString(),
        coords: {
          sector: coords.sector.toString(), hall: coords.hall.toString(),
          wall: coords.wall.toString(), shelf: coords.shelf.toString(),
          volume: coords.volume.toString(), page: coords.page.toString(),
        },
      });
    }
    results.push({ shelf: s, books: shelf });
  }
  return results;
}

/* ---- Encoding helpers ---- */
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - base.length % 4) % 4);
  return Uint8Array.from([...atob(padded)].map(c => c.charCodeAt(0)));
}

function bigIntToBytes(number) {
  let value = BigInt(number);
  if (value === 0n) return new Uint8Array([0]);
  const bytes = [];
  while (value > 0n) { bytes.push(Number(value & 255n)); value >>= 8n; }
  return Uint8Array.from(bytes.reverse());
}

function bytesToBigInt(bytes) {
  let output = 0n;
  for (const byte of bytes) output = (output << 8n) + BigInt(byte);
  return output;
}

function numberToB64(number) { return bytesToBase64Url(bigIntToBytes(number)); }

function b64ToNumber(value) { return bytesToBigInt(base64UrlToBytes(value)); }

function randomPageNumber() {
  return indicesToNumber(createNoiseFillerIndices(`${Date.now()}:${Math.random()}`, ALG.pageLength));
}

function pageTitle(coordinates) {
  return `Сектор ${coordinates.sector} · Зал ${coordinates.hall} · Стена ${coordinates.wall} · Полка ${coordinates.shelf} · Том ${coordinates.volume} · Лист ${coordinates.page}`;
}

/* ---- Page data ---- */
function getPageData(numberStr) {
  const number = BigInt(numberStr);
  const indices = numberToIndices(number);
  const coords = numberToCoordinates(number);
  const xy = coordinatesToXY(coords);
  const text = indicesToString(indices);
  return {
    indices, text,
    coords: {
      sector: coords.sector.toString(), hall: coords.hall.toString(),
      wall: coords.wall.toString(), shelf: coords.shelf.toString(),
      volume: coords.volume.toString(), page: coords.page.toString(),
    },
    xy: { x: xy.x.toString(), y: xy.y.toString() },
    number: number.toString(),
    title: pageTitle(coords),
  };
}

/* ═══════════════════════════════════════════════════════════
   MESSAGE HANDLER
   ═══════════════════════════════════════════════════════════ */

self.onmessage = function(e) {
  const { id, type, payload } = e.data;

  try {
    let result;
    switch (type) {
      case 'search': {
        const { phrase, mode, count } = payload;
        result = createSearchVariants(phrase, mode, count);
        break;
      }
      case 'pageData': {
        const { number } = payload;
        result = getPageData(number);
        break;
      }
      case 'bookSpines': {
        const { x, y, wall } = payload;
        result = getBookSpines(x, y, wall);
        break;
      }
      case 'bookSpine': {
        const { x, y, wall, shelf, volume } = payload;
        const spineText = getBookSpine(x, y, wall, shelf, volume);
        const cls = classifySpine(spineText);
        result = { spineText, cls };
        break;
      }
      case 'numberToIndices': {
        const { number } = payload;
        result = numberToIndices(BigInt(number));
        break;
      }
      case 'coordinatesToNumber': {
        const c = payload.coordinates;
        const coords = {
          sector: BigInt(c.sector || 1), hall: BigInt(c.hall || 1),
          wall: BigInt(c.wall || 1), shelf: BigInt(c.shelf || 1),
          volume: BigInt(c.volume || 1), page: BigInt(c.page || 1),
        };
        result = coordinatesToNumber(coords).toString();
        break;
      }
      case 'numberToB64': {
        result = numberToB64(BigInt(payload.number));
        break;
      }
      case 'xyToHallXY': {
        const { x, y } = payload;
        const hi = xyToHallXY(x, y);
        result = { sector: hi.sector.toString(), hall: hi.hall.toString() };
        break;
      }
      case 'hallToXY': {
        const { sector, hall } = payload;
        const xy = hallToXY(sector, hall);
        result = { x: xy.x.toString(), y: xy.y.toString() };
        break;
      }
      default:
        throw new Error(`Unknown worker operation: ${type}`);
    }
    self.postMessage({ id, result, error: null });
  } catch (err) {
    self.postMessage({ id, result: null, error: err.message });
  }
};
