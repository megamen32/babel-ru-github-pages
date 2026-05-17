/* ============================================
   ВАВИЛОН — Web Worker for async BigInt ops
   Self-contained computation engine
   + Prefix codec (2-level canonical Huffman)
   + Feistel coordinate permutation
   ============================================ */

'use strict';

/* 10000 Russian words — embedded for offline use (inline copy) */
let WORD_BANK = [
  "и","в","не","на","я","что","быть","с","он","а","это","как","то","этот","по","к","но","они","мы","она",
  "который","из","у","свой","вы","весь","за","для","от","о","так","мочь","все","ты","же","год","человек","один","такой","тот",
  "или","если","только","его","бы","себя","время","когда","еще","уже","другой","сказать","до","мой","наш","чтобы","говорить","самый","знать","вот",
  "два","дело","есть","жизнь","новый","рука","может","этот","надо","хотеть","стать","первый","очень","тоже","сейчас","может","понимать","смотреть","работа","место",
  "книга","день","слово","ребенок","лицо","большой","дом","сторона","должен","писать","земля","имя","раз","глаз","город","вопрос","сидеть","стоять","начало","конец",
  "вода","ночь","мать","думать","помнить","мир","народ","дверь","друг","путь","да","нет","окно","свет","ждать","искать","верить","любить","видеть","слышать",
  "дорога","небо","огонь","сила","ветер","дерево","звезда","река","гора","лес","поле","море","зима","лето","весна","осень","утро","вечер","тишина","глубина",
  "архив","каталог","лестница","галерея","полка","переплет","страж","лампа","письмо","зеркало","индекс","коридор","узор","шёпот","словарь","лабиринт","шестигранник","предел","рукопись","описание",
  "число","перестановка","алфавит","формула","порог","перила","символ","строка","координата","сумрак","пыль","том","лист","сумрак","ночь","свет"
];
let wordBankLoaded = true;

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

const ALG = {
  label: "ru5",
  alphabet: ALPHABET,
  pageLength: 4096,
  pagesPerVolume: 410n,
  volumesPerShelf: 32n,
  shelvesPerWall: 5n,
  wallsPerHall: 6n,
  hallsPerSector: 20n,
};

const SEARCH_VARIANTS_DEFAULT = 6;
const SEARCH_VARIANTS_MAX = 100;

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
  // No VISUAL_OVERLAP mapping — kept as separate alphabet entries for speed.
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
  const z = (value % PAGES_PER_HALL) + 1n;
  const hallIndex = value / PAGES_PER_HALL;
  const x = (hallIndex % HALLS_PER_ROW) - HALF_ROW;
  const y = (hallIndex / HALLS_PER_ROW) - HALF_ROW;
  const sector = hallIndex / ALG.hallsPerSector + 1n;
  const hall = (hallIndex % ALG.hallsPerSector) + 1n;
  const borges = zToBorges(z);
  return { x, y, z, sector, hall, ...borges };
}

function zToBorges(z) {
  let v = z - 1n;
  const page = (v % ALG.pagesPerVolume) + 1n;
  v /= ALG.pagesPerVolume;
  const volume = (v % ALG.volumesPerShelf) + 1n;
  v /= ALG.volumesPerShelf;
  const shelf = (v % ALG.shelvesPerWall) + 1n;
  v /= ALG.shelvesPerWall;
  const wall = v + 1n;
  return { wall, shelf, volume, page };
}

function borgesToZ(wall, shelf, volume, page) {
  return ((wall - 1n) * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume
        + (shelf - 1n) * ALG.volumesPerShelf * ALG.pagesPerVolume
        + (volume - 1n) * ALG.pagesPerVolume
        + page);
}

function coordinatesToRawIndex(coordinates) {
  let hallIndex;
  if (coordinates.x != null || coordinates.y != null) {
    const bx = BigInt(coordinates.x || 0);
    const by = BigInt(coordinates.y || 0);
    hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
  } else {
    const sector = BigInt(coordinates.sector || 1);
    const hall = BigInt(coordinates.hall || 1);
    hallIndex = (sector - 1n) * ALG.hallsPerSector + (hall - 1n);
  }

  let z;
  if (coordinates.z != null) {
    z = BigInt(coordinates.z);
  } else {
    const wall = BigInt(coordinates.wall || 1);
    const shelf = BigInt(coordinates.shelf || 1);
    const volume = BigInt(coordinates.volume || 1);
    const page = BigInt(coordinates.page || 1);
    z = borgesToZ(wall, shelf, volume, page);
  }

  return hallIndex * PAGES_PER_HALL + (z - 1n);
}

function coordinatesToNumber(coordinates) {
  return permuteIndex(coordinatesToRawIndex(coordinates));
}

function numberToCoordinates(number) {
  return rawIndexToCoordinates(unpermuteIndex(number));
}

/* ---- XY helpers ---- */
const HALLS_PER_ROW = 1_000_000n;
const HALF_ROW = HALLS_PER_ROW / 2n;
const PAGES_PER_HALL = ALG.wallsPerHall * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume;

function xyToHallXY(x, y) {
  const bx = BigInt(x);
  const by = BigInt(y);
  const hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
  return { sector: hallIndex / ALG.hallsPerSector + 1n, hall: hallIndex % ALG.hallsPerSector + 1n };
}

function hallToXY(sector, hall) {
  const hallIndex = (BigInt(sector) - 1n) * ALG.hallsPerSector + (BigInt(hall) - 1n);
  return {
    x: (hallIndex % HALLS_PER_ROW) - HALF_ROW,
    y: (hallIndex / HALLS_PER_ROW) - HALF_ROW,
  };
}

function xyToCoordinates(x, y, z) {
  const { sector, hall } = xyToHallXY(x, y);
  const bz = BigInt(z || 1);
  const borges = zToBorges(bz);
  return { x: BigInt(x), y: BigInt(y), z: bz, sector, hall, ...borges };
}

function coordinatesToXY(coords) {
  return {
    x: typeof coords.x === 'bigint' ? coords.x : BigInt(coords.x || 0),
    y: typeof coords.y === 'bigint' ? coords.y : BigInt(coords.y || 0),
  };
}

/* ═══════════════════════════════════════════════════════════
   FEISTEL PERMUTATION — over Z/(2^32768)
   ═══════════════════════════════════════════════════════════
   Same as lib-coordinate-permutation.js.
   4-round Feistel network for bijective shuffling. */

const FEISTEL_HALF_BITS = TOTAL_BITS / 2n;  // 16384n
const FEISTEL_HALF_MASK = (1n << FEISTEL_HALF_BITS) - 1n;

function makeExpandedKey(pattern64) {
  let key = 0n;
  for (let bitPos = 0; bitPos < Number(FEISTEL_HALF_BITS); bitPos += 64) {
    key = (key | (pattern64 << BigInt(bitPos))) & FEISTEL_HALF_MASK;
  }
  return key;
}

const ROUND_KEYS = [
  makeExpandedKey(0x4CF3B209D871A5E7n),   // K0 — from SEED_C
  makeExpandedKey(0x5BD1E9A3F7C20658n),   // K1 — from PATTERN
  makeExpandedKey(0x9E3779B97F4A7C15n),   // K2 — golden ratio
  makeExpandedKey(0x8A5B6C7D9E0F1A2Bn),   // K3 — additional
];

function roundFunc(value, key) {
  let mixed = (value * key) & FEISTEL_HALF_MASK;     // multiply-scramble
  mixed = mixed ^ (mixed >> 3n);                      // shift-xor diffusion
  mixed = (mixed ^ key) & FEISTEL_HALF_MASK;          // XOR with round key
  return mixed;
}

function feistelPermute(index) {
  const value = BigInt(index) & BIT_MASK;
  let L = value >> FEISTEL_HALF_BITS;
  let R = value & FEISTEL_HALF_MASK;
  for (let round = 0; round < 4; round++) {
    const newL = R;
    const newR = L ^ roundFunc(R, ROUND_KEYS[round]);
    L = newL;
    R = newR;
  }
  return (L << FEISTEL_HALF_BITS) | R;
}

function feistelUnpermute(permuted) {
  let L = (BigInt(permuted) >> FEISTEL_HALF_BITS) & FEISTEL_HALF_MASK;
  let R = BigInt(permuted) & FEISTEL_HALF_MASK;
  for (let round = 3; round >= 0; round--) {
    const newR = L;
    const newL = R ^ roundFunc(L, ROUND_KEYS[round]);
    L = newL;
    R = newR;
  }
  return (L << FEISTEL_HALF_BITS) | R;
}

/* Coordinates → rawIndex → Feistel permute → internal address */
function coordToInternalAddress(x, y, z) {
  const bx = BigInt(x || 0);
  const by = BigInt(y || 0);
  const bz = BigInt(z || 1);
  const hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
  const rawIdx = hallIndex * PAGES_PER_HALL + (bz - 1n);
  return feistelPermute(rawIdx);
}

/* Internal address → Feistel unpermute → rawIndex → coordinates */
function internalAddressToCoord(address) {
  const rawIdx = feistelUnpermute(address);
  let value = BigInt(rawIdx);
  const z = (value % PAGES_PER_HALL) + 1n;
  const hallIndex = value / PAGES_PER_HALL;
  const x = (hallIndex % HALLS_PER_ROW) - HALF_ROW;
  const y = (hallIndex / HALLS_PER_ROW) - HALF_ROW;
  return { x, y, z };
}

/* ═══════════════════════════════════════════════════════════
   PREFIX CODEC — Canonical Huffman
   ═══════════════════════════════════════════════════════════
   Same as lib-prefix-codec.js.
   Frequent tokens → short codes → small addresses. */

function buildHuffmanLengths(weights) {
  const n = weights.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  /* Priority queue (simple array-based) */
  const heap = [];
  for (let i = 0; i < n; i++) {
    heap.push({ w: weights[i], i, left: null, right: null });
  }
  heap.sort((a, b) => a.w - b.w || a.i - b.i);

  while (heap.length > 1) {
    const left = heap.shift();
    const right = heap.shift();
    const parent = { w: left.w + right.w, i: -1, left, right };
    let pos = 0;
    while (pos < heap.length && (heap[pos].w < parent.w || (heap[pos].w === parent.w && heap[pos].i < parent.i))) pos++;
    heap.splice(pos, 0, parent);
  }

  const lengths = new Array(n).fill(0);
  (function walk(node, depth) {
    if (!node.left && !node.right) { lengths[node.i] = Math.max(1, depth); return; }
    if (node.left) walk(node.left, depth + 1);
    if (node.right) walk(node.right, depth + 1);
  })(heap[0], 0);

  /* Limit max code length */
  const MAX_LEN = 22;
  for (let iter = 0; iter < 50; iter++) {
    let maxL = 0;
    for (let i = 0; i < n; i++) if (lengths[i] > maxL) maxL = lengths[i];
    if (maxL <= MAX_LEN) break;
    for (let i = 0; i < n; i++) {
      if (lengths[i] > MAX_LEN) lengths[i] = MAX_LEN;
    }
  }

  return lengths;
}

function assignCanonicalCodes(lengths) {
  const n = lengths.length;
  if (n === 0) return [];

  const sorted = lengths.map((len, i) => ({ i, len })).sort((a, b) => a.len - b.len || a.i - b.i);
  const codes = new Array(n);
  let code = 0;
  let prevLen = 0;

  for (const { i, len } of sorted) {
    code <<= (len - prevLen);
    codes[i] = { code, len };
    prevLen = len;
    code++;
  }
  return codes;
}

function buildDecoder(weights) {
  const lengths = buildHuffmanLengths(weights);
  const codes = assignCanonicalCodes(lengths);
  const n = weights.length;
  const maxLen = Math.max(...lengths);

  /* Group by length for fast decoding */
  const byLen = new Map();
  for (let i = 0; i < n; i++) {
    const len = lengths[i];
    if (!byLen.has(len)) byLen.set(len, new Map());
    byLen.get(len).set(codes[i].code, i);
  }
  const sortedLens = [...byLen.keys()].sort((a, b) => a - b);

  return {
    codes,
    lengths,
    maxLen,
    count: n,

    decode(readBit) {
      let acc = 0;
      for (let bit = 0; bit < this.maxLen + 1; bit++) {
        acc = (acc << 1) | readBit();
        const m = byLen.get(bit + 1);
        if (m && m.has(acc)) return m.get(acc);
      }
      return 0; // fallback
    },

    encode(symbolIndex, writeBit) {
      const { code, len } = codes[symbolIndex];
      for (let i = len - 1; i >= 0; i--) {
        writeBit((code >> i) & 1);
      }
      return len;
    },

    getCode(symbolIndex) {
      return codes[symbolIndex];
    },
  };
}

/* ─── Bit streams ─── */

function createBitReader(address, totalBits) {
  const byteLen = Math.ceil(totalBits / 8);
  const bytes = new Uint8Array(byteLen);
  let v = BigInt(address);
  for (let i = byteLen - 1; i >= 0; i--) {
    bytes[i] = Number(v & 0xFFn);
    v >>= 8n;
  }

  let bitPos = 0;

  return {
    readBit() {
      if (bitPos >= totalBits) return 0;
      const byteIdx = bitPos >> 3;
      const bitIdx = 7 - (bitPos & 7);
      bitPos++;
      return (bytes[byteIdx] >> bitIdx) & 1;
    },
    get position() { return bitPos; },
    get remaining() { return Math.max(0, totalBits - bitPos); },
  };
}

function createBitWriter(totalBits) {
  const bits = [];
  const _totalBits = totalBits || 0;

  return {
    writeBit(b) { bits.push(b & 1); },
    writeCode(code, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((code >> i) & 1);
      }
    },
    toBigInt() {
      let result = 0n;
      for (const bit of bits) {
        result = (result << 1n) | BigInt(bit);
      }
      if (_totalBits > 0 && bits.length < _totalBits) {
        result = result << BigInt(_totalBits - bits.length);
      }
      return result;
    },
    get length() { return bits.length; },
    get bits() { return bits; },
  };
}

/* ═══════════════════════════════════════════════════════════
   TOKEN TABLE — types, states, transitions, inline data
   ═══════════════════════════════════════════════════════════
   Same as lib-token-table.js (inline fallback). */

/* ─── Token types ─── */
const T = {
  SPACE: 0, NEWLINE: 1, DOT: 2, PUNCT: 3,
  WORD_RU: 4, WORD_EN: 5, PHRASE_RU: 6, PHRASE_EN: 7,
  EMOJI: 8, RAW_CHAR: 9,
};
const TYPE_COUNT = 10;

/* ─── States ─── */
const S = {
  START: 0,
  AFTER_RU: 1,
  AFTER_EN: 2,
  AFTER_SPACE: 3,
  AFTER_DOT: 4,
  AFTER_PUNCT: 5,
  AFTER_NL: 6,
  AFTER_EMOJI: 7,
};
const STATE_COUNT = 8;

/* ─── State transitions ─── */
const STATE_TRANSITIONS = [
  /* S.START */ [
    { type: T.SPACE,     ns: S.AFTER_SPACE,  w: 15 },
    { type: T.WORD_RU,   ns: S.AFTER_RU,     w: 50 },
    { type: T.WORD_EN,   ns: S.AFTER_EN,     w: 12 },
    { type: T.PHRASE_RU, ns: S.AFTER_RU,     w: 10 },
    { type: T.PHRASE_EN, ns: S.AFTER_EN,     w: 3 },
    { type: T.DOT,       ns: S.AFTER_DOT,     w: 2 },
    { type: T.PUNCT,     ns: S.AFTER_PUNCT,   w: 3 },
    { type: T.NEWLINE,   ns: S.AFTER_NL,      w: 3 },
    { type: T.EMOJI,     ns: S.AFTER_EMOJI,   w: 2 },
  ],
  /* S.AFTER_RU */ [
    { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 65 },
    { type: T.PUNCT,   ns: S.AFTER_PUNCT,  w: 10 },
    { type: T.DOT,     ns: S.AFTER_DOT,     w: 5 },
    { type: T.NEWLINE, ns: S.AFTER_NL,      w: 5 },
    { type: T.WORD_RU, ns: S.AFTER_RU,      w: 8 },
    { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 4 },
    { type: T.RAW_CHAR,ns: S.START,         w: 3 },
  ],
  /* S.AFTER_EN */ [
    { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 65 },
    { type: T.PUNCT,   ns: S.AFTER_PUNCT,  w: 10 },
    { type: T.DOT,     ns: S.AFTER_DOT,     w: 5 },
    { type: T.NEWLINE, ns: S.AFTER_NL,      w: 5 },
    { type: T.WORD_EN, ns: S.AFTER_EN,      w: 8 },
    { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 4 },
    { type: T.RAW_CHAR,ns: S.START,         w: 3 },
  ],
  /* S.AFTER_SPACE */ [
    { type: T.WORD_RU,   ns: S.AFTER_RU,     w: 48 },
    { type: T.WORD_EN,   ns: S.AFTER_EN,     w: 18 },
    { type: T.PHRASE_RU, ns: S.AFTER_RU,     w: 10 },
    { type: T.PHRASE_EN, ns: S.AFTER_EN,     w: 4 },
    { type: T.PUNCT,     ns: S.AFTER_PUNCT,   w: 2 },
    { type: T.EMOJI,     ns: S.AFTER_EMOJI,   w: 5 },
    { type: T.NEWLINE,   ns: S.AFTER_NL,      w: 3 },
    { type: T.DOT,       ns: S.AFTER_DOT,     w: 2 },
    { type: T.RAW_CHAR,  ns: S.START,         w: 3 },
  ],
  /* S.AFTER_DOT */ [
    { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 80 },
    { type: T.NEWLINE, ns: S.AFTER_NL,      w: 8 },
    { type: T.WORD_RU, ns: S.AFTER_RU,      w: 5 },
    { type: T.WORD_EN, ns: S.AFTER_EN,      w: 3 },
    { type: T.PHRASE_RU,ns: S.AFTER_RU,     w: 3 },
    { type: T.RAW_CHAR,ns: S.START,         w: 1 },
  ],
  /* S.AFTER_PUNCT */ [
    { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 75 },
    { type: T.WORD_RU, ns: S.AFTER_RU,      w: 8 },
    { type: T.WORD_EN, ns: S.AFTER_EN,      w: 4 },
    { type: T.NEWLINE, ns: S.AFTER_NL,      w: 5 },
    { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 3 },
    { type: T.PUNCT,   ns: S.AFTER_PUNCT,   w: 2 },
    { type: T.RAW_CHAR,ns: S.START,         w: 3 },
  ],
  /* S.AFTER_NL */ [
    { type: T.WORD_RU,   ns: S.AFTER_RU,     w: 48 },
    { type: T.WORD_EN,   ns: S.AFTER_EN,     w: 15 },
    { type: T.PHRASE_RU, ns: S.AFTER_RU,     w: 8 },
    { type: T.PHRASE_EN, ns: S.AFTER_EN,     w: 3 },
    { type: T.PUNCT,     ns: S.AFTER_PUNCT,   w: 3 },
    { type: T.EMOJI,     ns: S.AFTER_EMOJI,   w: 5 },
    { type: T.NEWLINE,   ns: S.AFTER_NL,      w: 8 },
    { type: T.SPACE,     ns: S.AFTER_SPACE,   w: 10 },
    { type: T.RAW_CHAR,  ns: S.START,         w: 3 },
  ],
  /* S.AFTER_EMOJI */ [
    { type: T.SPACE,   ns: S.AFTER_SPACE,  w: 45 },
    { type: T.EMOJI,   ns: S.AFTER_EMOJI,   w: 12 },
    { type: T.NEWLINE, ns: S.AFTER_NL,      w: 8 },
    { type: T.WORD_RU, ns: S.AFTER_RU,      w: 20 },
    { type: T.WORD_EN, ns: S.AFTER_EN,      w: 10 },
    { type: T.DOT,     ns: S.AFTER_DOT,     w: 3 },
    { type: T.PUNCT,   ns: S.AFTER_PUNCT,   w: 2 },
    { type: T.RAW_CHAR,ns: S.START,         w: 3 },
  ],
];

/* ─── Punctuation tokens (inline) ─── */
const PUNCT_TOKENS = [
  ',', '!', '?', ';', ':', '—', '…', '«', '»',
  '(', ')', '#', '@', '-', '/', '*', '=', '+',
];

/* ─── Emoji tokens (inline) ─── */
const EMOJI_TOKENS = [
  '🔥','⭐','💯','❌','✅','🎉','💀','👻','🧠','❤',
  '👍','👎','👋','💪','🙏','😂','😭','😤','🥺','🤔',
  '💬','📱','💻','🌍','🎵','☕','🎯','⚡','💎','🔑',
  '🚀','🌙','🎮','🏆','🍺','🌸','🦋','🐱','🐶','🌈',
  '💡','📖','🔔','😎','🥳','💙','🖤','🤷','🤩','💢',
  '✨','💫','🌊','🍀','🍂','🌻','🌺','🌲','🌳','🌴',
  '🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵',
  '🐔','🐧','🐦','🦅','🦉','🐺','🐴','🦄','🐝','🐛',
];

/* ─── Russian phrases (inline) ─── */
const PHRASE_RU_TOKENS = [
  'я тебя','в том числе','с одной стороны','в общем','в конце концов',
  'в любом случае','по крайней мере','на самом деле','в первую очередь',
  'как правило','в частности','в связи с','в отличие от',
  'в соответствии с','на протяжении','по отношению к','в результате',
  'на основании','в целях','в области','в виде','в процессе','в случае',
  'на основе','по поводу','при этом','в ходе','в направлении',
  'в составе','в качестве','в отношении','за счёт','на уровне',
  'в течение','с точки зрения','до сих пор','так или иначе',
  'тем не менее','в то же время','в то время как','как бы то ни было',
  'несмотря на то','в силу того','в зависимости от','наряду с',
  'вместе с тем','исходя из','по сравнению с','в дополнение к',
  'помимо этого','сверх того','более того','кроме того','к тому же',
  'в свою очередь','в конечном счёте','в конечном итоге','в итоге',
  'в целом','например','а именно','то есть','иначе говоря',
  'иными словами','одним словом','короче говоря','проще говоря',
  'точнее говоря','скорее всего','может быть','должно быть',
  'вероятно','очевидно','безусловно','конечно','разумеется',
  'действительно','в самом деле','на практике','по сути',
  'по существу','в принципе','к счастью','к сожалению',
  'к удивлению','к слову','кстати','между прочим','вдобавок',
  'мало того','не только','для того чтобы','после того как',
  'перед тем как','до того как','с тех пор как','как только',
  'прежде чем','пока не','я не знаю','я думаю','я хочу',
  'я могу','я буду','мне кажется','не знаю','не могу',
  'не хочу','не буду','надо сказать','стоит отметить',
  'следует отметить','необходимо отметить','важно понимать',
  'остаётся только','ничего подобного','ничего страшного',
  'всё равно','всё ещё','всё нормально','всё хорошо',
  'всё отлично','всё понятно','не обязательно','вполне возможно',
  'самое главное','самое важное','самое интересное',
  'с другой стороны','и при этом','но при этом',
  'вот и всё','вот именно','вот это да','ну и что',
  'ну конечно','ладно давай','я тебя люблю','послушай меня',
  'подожди немного','иди сюда','не уходи','мы вместе',
  'где мы','зачем это нужно','почему так','как это работает',
  'что это значит','кто это сделал','сколько стоит',
  'очень много','очень мало','очень хорошо','очень плохо',
  'очень важно','очень интересно',
];

/* ─── English phrases (inline) ─── */
const PHRASE_EN_TOKENS = [
  'i love you','i want to','i need to','i have to','i am going to',
  'i would like','i think that','i know that','i believe that',
  'it was a','it is a','there is a','there are no','that is why',
  'in order to','as well as','at the same time','on the other hand',
  'in fact','in addition','in particular','in general','in other words',
  'for example','for instance','of course','as a result',
  'by the way','on the contrary','in contrast','nevertheless',
  'furthermore','moreover','therefore','consequently','meanwhile',
  'otherwise','regardless','instead','however','thus','hence',
  'to be honest','to tell the truth','to begin with','to sum up',
  'in conclusion','after all','above all','at last','at least',
  'the problem is','the question is','the point is','the fact is',
  'it seems that','it appears that','it turns out',
  'do you know','do you think','do you want','can you help',
  'how does it work','how do you know','how can i help',
  'why do you think','why is it so','what does it mean',
];

/* ─── English words (inline, ~500) ─── */
const WORD_EN_TOKENS = [
  'the','be','to','of','and','a','in','that','have','i','it','for','not',
  'on','with','he','as','you','do','at','this','but','his','by','from',
  'they','we','say','her','she','or','an','will','my','one','all','would',
  'there','their','what','so','up','out','if','about','who','get','which',
  'go','me','when','make','can','like','time','no','just','him','know',
  'take','people','into','year','your','good','some','could','them','see',
  'other','than','then','now','look','only','come','its','over','think',
  'also','back','after','use','two','how','our','work','first','well',
  'way','even','new','want','because','any','these','give','day','most',
  'us','great','between','need','large','under','never','same','last',
  'long','world','still','own','find','here','thing','many','right',
  'hand','high','keep','start','thought','might','head','tell','write',
  'become','while','begin','seem','help','show','house','both','play',
  'run','move','live','night','point','turn','few','group','such',
  'against','ask','late','hard','real','open','close','question',
  'always','end','city','child','often','enough','together','interest',
  'face','leave','learn','different','state','book','problem','food',
  'door','white','water','room','friend','began','idea','mountain',
  'north','once','base','hear','light','watch','follow','stop','second',
  'sing','fear','grow','art','game','clear','force','air','boy','girl',
  'class','term','yes','case','change','system','place','power','money',
  'side','form','rule','today','body','study','line','age','far','sure',
  'car','area','plan','example','kind','health','result','morning',
  'reason','research','feel','movie','story','computer','music','person',
  'paper','possible','word','eye','answer','voice','energy','level',
  'order','war','history','party','map','family','event','government',
  'table','court','return','road','program','field','job','mind',
  'member','market','sense','product','effect','stage','source','nature',
  'price','office','record','value','board','report','month','language',
  'view','society','activity','space','experience','industry','media',
  'control','service','condition','design','rate','team','position',
  'degree','culture','central','support','region','stock','building',
  'material','theory','weight','standard','model','practice','science',
  'college','action','pressure','performance','subject','issue',
  'analysis','range','training','union','administration','picture',
  'quality','resource','amount','audience','author','budget','candidate',
  'century','chapter','choice','citizen','claim','client','climate',
  'combination','command','comment','communication','community',
  'comparison','competition','complex','component','concept','concern',
  'conference','conflict','congress','connection','consequence',
  'construction','consumer','contact','content','context','contract',
  'contribution','conversation','corporation','coverage','creation',
  'crisis','criticism','currency','customer','database','daughter',
  'debate','decade','decision','decline','defense','definition','demand',
  'democracy','department','depression','description','desire',
  'destination','detail','device','dialogue','diet','dimension',
  'direction','director','discipline','discussion','disease',
  'distribution','diversity','division','document','domain','domestic',
  'dominant','driver','duration','dynamic','earth','economy','edition',
  'editor','education','efficiency','election','element','emergency',
  'emotion','emphasis','employee','employer','encounter','enemy',
  'enforcement','engineering','environment','episode','equipment',
  'establishment','evaluation','evidence','evolution','exchange',
  'excitement','executive','existence','expansion','expectation',
  'expense','experiment','expert','explosion','exposure','extension',
  'extent','extreme','facility','factor','failure','fashion','feature',
  'federal','fiction','finance','flag','flight','focus','football',
  'forecast','forest','formula','fortune','foundation','fraction',
  'framework','freedom','function','generation','genius','goal','god',
  'grain','grant','guarantee','guard','guidance','habit','harm',
  'headquarters','hearing','heart','heaven','height','hero','horizon',
  'horror','host','household','housing','human','humor','hunt','ideal',
  'image','impact','implementation','impression','improvement',
  'incident','individual','inflation','influence','infrastructure',
  'initiative','injury','innovation','instance','institution',
  'instruction','instrument','insurance','intelligence','intensity',
  'intention','interaction','internet','interpretation','intervention',
  'interview','introduction','invasion','investigation','investment',
  'involvement','isolation','journal','journey','judge','judgment',
  'justice','knife','labor','landscape','launch','layer','leadership',
  'league','legend','legislation','leisure','lesson','letter','liberal',
  'liberty','license','listener','literature','loan','location','logic',
  'loss','magazine','majority','management','manager','manufacturer',
  'margin','mass','master','match','meal','mechanism','membership',
  'memory','message','metal','method','middle','minister','minority',
  'mission','mistake','mixture','monitor','moral','motivation','motor',
  'mount','mouse','mouth','movement','murder','mystery','myth',
  'narrative','nation','negative','negotiation','network','news',
  'noise','novel','nurse','objective','obligation','observation',
  'occupation','officer','operation','opponent','opportunity',
  'opposition','option','orchestra','ordinary','organization','original',
  'outcome','output','oxygen','pace','panel','panic','paragraph',
  'partner','passage','passenger','passport','pattern','pause','penalty',
  'pension','percentage','perception','period','permission','personality',
  'perspective','phase','phenomenon','philosophy','photograph','phrase',
  'pilot','pitch','pocket','poetry','pole','policy','politics',
  'pollution','pool','portrait','possession','potential','pound',
  'poverty','prayer','presidency','pride','priest','principle','priority',
  'prison','privacy','prize','procedure','profile','profit','progress',
  'project','promise','proportion','proposal','protection','protest',
  'provision','publication','purpose','pursuit','quarter','queen',
  'quote','race','radiation','radical','rail','ratio','reaction',
  'reader','reality','recognition','recommendation','recovery',
  'regulation','relevance','relief','religion','remedy','replacement',
  'republic','resident','resistance','resolution','resource','response',
  'restaurant','revolution','rhythm','risk','rival','robot','rock',
  'romance','root','routine','royal','sacrifice','safety','salary',
  'sample','satellite','scandal','schedule','scholarship','scientist',
  'scope','screen','search','secretary','sector','security','seed',
  'segment','seminar','senior','sequence','session','setting',
  'settlement','shadow','shock','shot','silence','silver','singer',
  'sister','slave','slice','smoke','software','soil','soldier',
  'solution','soul','specialist','speech','speed','sphere','spirit',
  'split','sponsor','spread','spring','square','stable','staff',
  'stage','stake','standard','star','statement','status','steel',
  'stem','storm','stranger','strategy','strength','struggle','studio',
  'style','substance','suburb','successor','summit','supplier',
  'surface','surgery','surplus','surprise','survival','suspect',
  'symbol','sympathy','technique','television','temperature','tendency',
  'territory','terror','text','thanks','therapy','thought','threat',
  'threshold','timber','tissue','title','tone','tool','topic',
  'tourism','tower','track','tradition','tragedy','transfer',
  'transformation','transition','transportation','treaty','trend',
  'triangle','trigger','troop','tunnel','twin','type','uncle',
  'uniform','union','universe','update','upgrade','upper','utility',
  'vacation','valley','variable','variation','variety','vehicle',
  'venture','version','veteran','victim','victory','violation',
  'virtue','vision','visitor','vocabulary','volume','volunteer',
  'wage','weapon','welfare','wheel','whisper','winner','wisdom',
  'witness','wonder','wood','worker','workshop','wound','writer',
  'youth','zone',
];

/* ─── Type name to index mapping (for external dictionary) ─── */
const TYPE_NAME_TO_IDX = {
  space: T.SPACE, newline: T.NEWLINE, dot: T.DOT, punct: T.PUNCT,
  word_ru: T.WORD_RU, word_en: T.WORD_EN,
  phrase_ru: T.PHRASE_RU, phrase_en: T.PHRASE_EN,
  emoji: T.EMOJI, raw_char: T.RAW_CHAR,
};

function unescapeJsonToken(s) {
  if (s === '\\n') return '\n';
  if (s === '\\t') return '\t';
  if (s === '\\r') return '\r';
  return s;
}

function parseStatesFromJson(jsonStates) {
  if (!jsonStates || !Array.isArray(jsonStates)) return null;
  try {
    return jsonStates.map(state => {
      if (!state.transitions) return null;
      return state.transitions.map(([typeIdx, ns, w]) => ({
        type: typeIdx,
        ns,
        w,
      }));
    });
  } catch (_e) {
    return null;
  }
}

/* ─── Temperature ─── */

function applyTemperature(weights, temp) {
  if (temp === 1.0) return weights;
  if (temp <= 0) {
    const avg = weights.reduce((s, w) => s + w, 0) / weights.length;
    return weights.map(() => avg);
  }
  const exponent = 1.0 / temp;
  return weights.map(w => Math.pow(w, exponent));
}

function computeTemperature(z) {
  const absZ = z < 0n ? -z : z;
  if (absZ <= 1n) return 0.1;
  const logZ = Math.log10(Number(absZ));
  return Math.min(1.0, 0.1 + logZ * 0.09);
}

/* ─── Build token table ─── */

let _workerTokenTable = null;

function buildWorkerTokenTable(dict) {
  if (_workerTokenTable && !dict) return _workerTokenTable;

  const tokensByType = {};

  if (dict && dict.tokens && dict.weights) {
    /* ─── From external dictionary ─── */
    const types = dict.types || [];
    for (const typeName of types) {
      const typeIdx = TYPE_NAME_TO_IDX[typeName];
      if (typeIdx === undefined) continue;

      const rawTokens = (dict.tokens[typeName] || []).map(unescapeJsonToken);
      const rawWeights = dict.weights[typeName] || [];

      tokensByType[typeIdx] = rawTokens.map((t, i) => ({
        text: t,
        weight: i < rawWeights.length ? rawWeights[i] : (rawWeights.length > 0 ? rawWeights[rawWeights.length - 1] : 100),
      }));
    }

    if (!dict.tokens.raw_char || dict.tokens.raw_char.length === 0) {
      tokensByType[T.RAW_CHAR] = [{ text: '\x00', weight: 100 }];
    }
  } else {
    /* ─── Fallback: inline dictionary ─── */

    tokensByType[T.SPACE]   = [{ text: ' ', weight: 1000000 }];
    tokensByType[T.NEWLINE] = [{ text: '\n', weight: 80000 }];
    tokensByType[T.DOT]     = [{ text: '.', weight: 250000 }];

    tokensByType[T.PUNCT] = PUNCT_TOKENS.map((t, i) => ({
      text: t, weight: 100000 / (i + 1),
    }));

    tokensByType[T.WORD_RU] = WORD_BANK.map((t, i) => ({
      text: t, weight: 500000 / (i + 1),
    }));

    tokensByType[T.WORD_EN] = WORD_EN_TOKENS.map((t, i) => ({
      text: t, weight: 150000 / (i + 1),
    }));

    tokensByType[T.PHRASE_RU] = PHRASE_RU_TOKENS.map((t, i) => ({
      text: t, weight: 60000 / (i + 1),
    }));

    tokensByType[T.PHRASE_EN] = PHRASE_EN_TOKENS.map((t, i) => ({
      text: t, weight: 20000 / (i + 1),
    }));

    tokensByType[T.EMOJI] = EMOJI_TOKENS.map((t, i) => ({
      text: t, weight: 5000 / (i + 1),
    }));

    tokensByType[T.RAW_CHAR] = [{ text: '\x00', weight: 100 }];
  }

  /* ─── Determine state transitions ─── */
  let stateTransitions = STATE_TRANSITIONS;
  if (dict && dict.states) {
    const parsed = parseStatesFromJson(dict.states);
    if (parsed && parsed.length === STATE_COUNT) {
      stateTransitions = parsed;
    }
  }

  /* ─── Build global token index ─── */
  const allTokens = [];
  const typeOffsets = new Int32Array(TYPE_COUNT);
  const typeCounts = new Int32Array(TYPE_COUNT);

  for (let type = 0; type < TYPE_COUNT; type++) {
    typeOffsets[type] = allTokens.length;
    const list = tokensByType[type] || [];
    typeCounts[type] = list.length;
    for (let i = 0; i < list.length; i++) {
      allTokens.push({
        text: list[i].text,
        type,
        typeIndex: i,
        weight: list[i].weight,
      });
    }
  }

  /* ─── Build text→token lookup for encoding ─── */
  const textToToken = new Map();

  for (let i = 0; i < allTokens.length; i++) {
    const t = allTokens[i];
    if (t.type === T.RAW_CHAR) continue;

    if (!textToToken.has(t.text) || t.text.length > (textToToken.get(t.text)?.text?.length || 0)) {
      textToToken.set(t.text, i);
    }

    if (t.type === T.WORD_EN || t.type === T.PHRASE_EN) {
      const lower = t.text.toLowerCase();
      if (lower !== t.text) {
        if (!textToToken.has(lower) || t.text.length > (textToToken.get(lower)?.text?.length || 0)) {
          textToToken.set(lower, i);
        }
      }
    }
  }

  /* ─── Build Huffman decoders for each type (Level 2) ─── */
  const typeDecoders = new Array(TYPE_COUNT);

  for (let type = 0; type < TYPE_COUNT; type++) {
    const list = tokensByType[type] || [];
    if (list.length === 0) {
      typeDecoders[type] = null;
      continue;
    }
    const weights = list.map(t => t.weight);
    typeDecoders[type] = buildDecoder(weights);
  }

  /* ─── Build Huffman decoders for each state (Level 1) ─── */
  const stateDecoders = new Array(STATE_COUNT);

  for (let state = 0; state < STATE_COUNT; state++) {
    const trans = stateTransitions[state];
    const weights = trans.map(t => t.w);
    stateDecoders[state] = buildDecoder(weights);
  }

  _workerTokenTable = {
    allTokens,
    tokensByType,
    typeOffsets,
    typeCounts,
    textToToken,
    typeDecoders,
    stateDecoders,
    STATE_TRANSITIONS: stateTransitions,
  };

  return _workerTokenTable;
}

/* ─── External dictionary (lazy load) ─── */

let _externalDict = null;
let _dictLoadPromise = null;
let _dictLoadAttempted = false;

async function loadExternalDictionary() {
  if (_externalDict) return _externalDict;
  if (_dictLoadAttempted) return null;
  if (_dictLoadPromise) return _dictLoadPromise;

  _dictLoadAttempted = true;

  _dictLoadPromise = (async () => {
    try {
      const resp = await fetch('data/tokens.ru-en.v2.json');
      if (!resp.ok) {
        console.log('[worker] fetch failed: ' + resp.status);
        return null;
      }
      const dict = await resp.json();

      if (!dict.tokens || !dict.weights || !dict.types) {
        console.log('[worker] invalid dictionary format');
        return null;
      }

      _externalDict = dict;
      /* Reset table cache to rebuild with new dict */
      _workerTokenTable = null;

      console.log(
        '[worker] Loaded external token dictionary v' + (dict.version || '?') +
        ': word_ru=' + (dict.tokens.word_ru||[]).length +
        ' word_en=' + (dict.tokens.word_en||[]).length +
        ' phrase_ru=' + (dict.tokens.phrase_ru||[]).length +
        ' phrase_en=' + (dict.tokens.phrase_en||[]).length +
        ' emoji=' + (dict.tokens.emoji||[]).length +
        ' punct=' + (dict.tokens.punct||[]).length
      );
      return dict;
    } catch (e) {
      console.log('[worker] Using inline token data (' + e.message + ')');
      return null;
    }
  })();

  return _dictLoadPromise;
}

/* ═══════════════════════════════════════════════════════════
   ADDRESS CODEC — decode/encode with prefix codec
   ═══════════════════════════════════════════════════════════
   Same as lib-address-codec.js but self-contained. */

const PAGE_LEN = 4096;

/* Temperature-dependent decoder cache */
const _tempDecoderCache = new Map();

function buildTemperatureStateDecoders(temperature, table) {
  if (temperature === 1.0) return null;

  const cacheKey = temperature.toFixed(4);
  if (_tempDecoderCache.has(cacheKey)) return _tempDecoderCache.get(cacheKey);

  const stateDecoders = new Array(STATE_COUNT);

  for (let state = 0; state < STATE_COUNT; state++) {
    const trans = table.STATE_TRANSITIONS[state];
    const weights = trans.map(t => t.w);
    const adjusted = applyTemperature(weights, temperature);
    stateDecoders[state] = buildDecoder(adjusted);
  }

  _tempDecoderCache.set(cacheKey, stateDecoders);

  if (_tempDecoderCache.size > 32) {
    const firstKey = _tempDecoderCache.keys().next().value;
    _tempDecoderCache.delete(firstKey);
  }

  return stateDecoders;
}

/* ─── Decode: address → page text ─── */

function decodeAddressToPage(address, totalBits, temperature) {
  const table = buildWorkerTokenTable(_externalDict);
  const { typeDecoders, stateDecoders: baseStateDecoders, STATE_TRANSITIONS: stTrans, allTokens, typeOffsets } = table;

  const temp = (typeof temperature === 'number' && temperature > 0) ? temperature : 1.0;
  const stateDecoders = (temp === 1.0) ? baseStateDecoders : (buildTemperatureStateDecoders(temp, table) || baseStateDecoders);

  const reader = createBitReader(address, totalBits);
  const readBit = () => reader.readBit();

  let result = '';
  let state = S.START;

  while (result.length < PAGE_LEN) {
    /* Level 1: determine token type by current state */
    const stateDec = stateDecoders[state];
    const transIdx = stateDec.decode(readBit);
    const trans = stTrans[state][transIdx];
    if (!trans) {
      result += ' ';
      state = S.AFTER_SPACE;
      continue;
    }

    const tokenType = trans.type;
    state = trans.ns;

    /* Level 2: determine specific token */
    if (tokenType === T.SPACE) {
      result += ' ';
    } else if (tokenType === T.NEWLINE) {
      result += '\n';
    } else if (tokenType === T.DOT) {
      result += '.';
    } else if (tokenType === T.RAW_CHAR) {
      /* RAW_CHAR: read 17-bit Unicode code point */
      let cp = 0;
      for (let i = 0; i < 17; i++) {
        cp = (cp << 1) | readBit();
      }
      if (cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) {
        result += String.fromCodePoint(cp);
      } else {
        result += '?';
      }
    } else {
      const typeDec = typeDecoders[tokenType];
      if (!typeDec) {
        result += ' ';
        continue;
      }
      const tokenIdx = typeDec.decode(readBit);
      const globalIdx = typeOffsets[tokenType] + tokenIdx;
      if (globalIdx < allTokens.length) {
        result += allTokens[globalIdx].text;
      } else {
        result += ' ';
      }
    }
  }

  if (result.length > PAGE_LEN) {
    result = result.slice(0, PAGE_LEN);
  }
  while (result.length < PAGE_LEN) {
    result += ' ';
  }

  return result;
}

/* ─── Tokenize text for encoding ─── */

function tokenizeForEncoding(text, table) {
  const tokens = [];
  let pos = 0;
  const t2t = table.textToToken;
  const all = table.allTokens;

  const PHRASE_MAX_LEN = 60;

  while (pos < text.length) {
    let matched = false;

    /* 1. Try phrases (longest match) */
    for (let len = Math.min(PHRASE_MAX_LEN, text.length - pos); len >= 4 && !matched; len--) {
      const substr = text.slice(pos, pos + len);
      const lowerSubstr = substr.toLowerCase();

      let idx = t2t.get(substr);
      if (idx === undefined) idx = t2t.get(lowerSubstr);

      if (idx !== undefined) {
        const tok = all[idx];
        if (tok.type === T.PHRASE_RU || tok.type === T.PHRASE_EN) {
          tokens.push(idx);
          pos += len;
          matched = true;
        }
      }
    }
    if (matched) continue;

    /* 2. Try words (long to short) */
    for (let len = Math.min(40, text.length - pos); len >= 1 && !matched; len--) {
      const substr = text.slice(pos, pos + len);
      const lowerSubstr = substr.toLowerCase();

      let idx = t2t.get(substr);
      if (idx === undefined) idx = t2t.get(lowerSubstr);

      if (idx !== undefined) {
        const tok = all[idx];
        if (tok.type === T.WORD_RU || tok.type === T.WORD_EN) {
          tokens.push(idx);
          pos += len;
          matched = true;
        }
      }
    }
    if (matched) continue;

    /* 3. Single char tokens */
    const ch = text[pos];
    if (ch === ' ') {
      tokens.push(table.typeOffsets[T.SPACE]);
      pos++;
      continue;
    }
    if (ch === '\n') {
      tokens.push(table.typeOffsets[T.NEWLINE]);
      pos++;
      continue;
    }
    if (ch === '.') {
      tokens.push(table.typeOffsets[T.DOT]);
      pos++;
      continue;
    }

    /* 4. Punctuation and emoji */
    for (let len = Math.min(4, text.length - pos); len >= 1 && !matched; len--) {
      const substr = text.slice(pos, pos + len);
      const idx = t2t.get(substr);
      if (idx !== undefined) {
        const tok = all[idx];
        if (tok.type === T.PUNCT || tok.type === T.EMOJI) {
          tokens.push(idx);
          pos += len;
          matched = true;
        }
      }
    }
    if (matched) continue;

    /* 5. RAW_CHAR fallback */
    tokens.push({
      isRaw: true,
      codePoint: text.codePointAt(pos),
    });
    pos += (ch.codePointAt(0) > 0xFFFF) ? 2 : 1;
  }

  return tokens;
}

function getTokenType(tokenIdx, table) {
  if (tokenIdx && tokenIdx.isRaw) return T.RAW_CHAR;
  return table.allTokens[tokenIdx].type;
}

function getNextState(currentState, tokenType) {
  const trans = STATE_TRANSITIONS[currentState];
  for (const t of trans) {
    if (t.type === tokenType) return t.ns;
  }
  return S.START;
}

function getTransitionIndex(state, tokenType) {
  const trans = STATE_TRANSITIONS[state];
  for (let i = 0; i < trans.length; i++) {
    if (trans[i].type === tokenType) return i;
  }
  return -1;
}

/* ─── Encode: text → address ─── */

function encodePageToAddress(text) {
  const table = buildWorkerTokenTable(_externalDict);
  const { typeDecoders, stateDecoders, STATE_TRANSITIONS: stTrans, allTokens, typeOffsets } = table;

  const tokenList = tokenizeForEncoding(text, table);
  const TOTAL_BITS_NUM = Number(TOTAL_BITS);
  const writer = createBitWriter(TOTAL_BITS_NUM);

  let state = S.START;

  for (const token of tokenList) {
    const tokenType = getTokenType(token, table);

    /* Level 1: encode token type */
    const transIdx = getTransitionIndex(state, tokenType);
    if (transIdx < 0) {
      /* Incompatible token — insert space */
      const spaceTransIdx = getTransitionIndex(state, T.SPACE);
      if (spaceTransIdx >= 0) {
        stateDecoders[state].encode(spaceTransIdx, (b) => writer.writeBit(b));
        state = getNextState(state, T.SPACE);
      }
      const retryTransIdx = getTransitionIndex(state, tokenType);
      if (retryTransIdx < 0) continue;
      stateDecoders[state].encode(retryTransIdx, (b) => writer.writeBit(b));
    } else {
      stateDecoders[state].encode(transIdx, (b) => writer.writeBit(b));
    }

    state = getNextState(state, tokenType);

    /* Level 2: encode specific token */
    if (tokenType === T.SPACE || tokenType === T.NEWLINE || tokenType === T.DOT) {
      /* Single tokens — no Level 2 */
    } else if (tokenType === T.RAW_CHAR) {
      /* RAW_CHAR: 17-bit Unicode code point (BMP: 0..0x1FFFF) — matches decoder */
      const cp = token.codePoint;
      for (let i = 16; i >= 0; i--) {
        writer.writeBit((cp >> i) & 1);
      }
    } else {
      const typeIdx = (typeof token === 'object' && token.isRaw)
        ? 0
        : allTokens[token].typeIndex;
      typeDecoders[tokenType].encode(typeIdx, (b) => writer.writeBit(b));
    }
  }

  return writer.toBigInt();
}

/* ─── Search: phrase → address + coordinates ─── */

function searchPhraseToAddress(phrase) {
  const normalized = phrase.toLowerCase().trim();
  if (!normalized) return null;

  /* Strategy: encode phrase + natural context into a full page */
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  function seededChoice(arr, idx) {
    return arr[Math.abs(hash + idx * 7919) % arr.length];
  }

  let pageText = normalized + '. ';

  for (let sent = 0; sent < 20; sent++) {
    const words = [];
    const len = 3 + Math.abs((hash + sent * 31) % 10);
    for (let w = 0; w < len; w++) {
      words.push(seededChoice(WORD_BANK, sent * 10 + w));
    }
    pageText += words.join(' ') + '. ';
  }

  while (pageText.length < PAGE_LEN) {
    pageText += ' ';
  }
  pageText = pageText.slice(0, PAGE_LEN);

  /* Encode page to address */
  const address = encodePageToAddress(pageText);

  /* Decode back to find the phrase position */
  const TOTAL_BITS_NUM = Number(TOTAL_BITS);
  const decodedText = decodeAddressToPage(address, TOTAL_BITS_NUM);
  const lowerDecoded = decodedText.toLowerCase();
  const phrasePos = lowerDecoded.indexOf(normalized);

  return {
    address,
    text: decodedText,
    phrasePos: phrasePos >= 0 ? phrasePos : 0,
    phraseLen: normalized.length,
  };
}

/* ─── Classify decoded page ─── */

function classifyDecodedPage(text) {
  const len = text.length;
  if (len === 0) return { kind: 'empty', label: 'Пусто', score: 0, icon: '📭' };

  let humanChars = 0;
  let wordChars = 0;
  let wordCount = 0;
  let inWord = false;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const code = ch.codePointAt(0);

    if (
      (code >= 0x0430 && code <= 0x044F) ||
      (code >= 0x0410 && code <= 0x042F) ||
      code === 0x0451 || code === 0x0401 ||
      (code >= 0x0061 && code <= 0x007A) ||
      (code >= 0x0041 && code <= 0x005A) ||
      (code >= 0x0030 && code <= 0x0039) ||
      code === 0x0020 || code === 0x000A ||
      code === 0x002E || code === 0x002C ||
      code === 0x0021 || code === 0x003F ||
      code === 0x003B || code === 0x003A ||
      code === 0x2014 ||
      code === 0x2026
    ) {
      humanChars++;
    }

    const isLetter = (code >= 0x0430 && code <= 0x044F) ||
                      (code >= 0x0410 && code <= 0x042F) ||
                      code === 0x0451 || code === 0x0401 ||
                      (code >= 0x0061 && code <= 0x007A) ||
                      (code >= 0x0041 && code <= 0x005A);
    if (isLetter) {
      wordChars++;
      if (!inWord) { wordCount++; inWord = true; }
    } else {
      inWord = false;
    }
  }

  const humanRatio = humanChars / len;
  const wordRatio = wordChars / len;
  const avgWordLen = wordCount > 0 ? wordChars / wordCount : 0;

  if (humanRatio > 0.9 && wordRatio > 0.5 && avgWordLen > 2 && avgWordLen < 15) {
    return { kind: 'text', label: 'Читаемый текст', score: humanRatio, icon: '📖' };
  }
  if (humanRatio > 0.7 && wordRatio > 0.3 && avgWordLen > 2) {
    return { kind: 'dialogue', label: 'Разговорный', score: humanRatio * 0.8, icon: '💬' };
  }
  if (humanRatio > 0.5 && wordRatio > 0.15) {
    return { kind: 'sparse', label: 'Разреженный', score: humanRatio * 0.5, icon: '🌫️' };
  }
  if (humanRatio > 0.3) {
    return { kind: 'noise', label: 'Шум', score: humanRatio * 0.3, icon: '🔇' };
  }
  return { kind: 'raw', label: 'Хаос', score: 0.1, icon: '💀' };
}

/* ═══════════════════════════════════════════════════════════
   FILLER GENERATION (legacy — unchanged)
   ═══════════════════════════════════════════════════════════ */

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
  if (mode === "dialogue") return createDialogueFillerIndices(seed, length);
  if (mode === "post") return createPostFillerIndices(seed, length);
  if (mode === "diary") return createDiaryFillerIndices(seed, length);
  if (mode === "log") return createLogFillerIndices(seed, length);
  if (mode === "human") return createHumanFillerIndices(seed, length);
  return createNoiseFillerIndices(seed, length);
}

/* ═══════════════════════════════════════════════════════════
   ОБИТАЕМЫЙ СЛОЙ — генераторы человеческих текстов (worker copy)
   ═══════════════════════════════════════════════════════════ */

function randomChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function pad2(n) { return String(n).padStart(2, "0"); }

const CHAT_NAMES = [
  "Катя", "Никита", "Алина", "Егор", "Мама", "Папа",
  "Даня", "Лёха", "Настя", "Кирилл", "Влад", "Марина",
  "Саша", "Ира", "Олег", "Таня", "Серёга", "Лена",
];
const CHAT_MESSAGES = [
  "Я вообще не поняла что сейчас произошло",
  "Это выглядит как временное решение которое проживет лет пять",
  "Скинь ссылку ещё раз, я потерял",
  "Мне кажется тут проблема не в коде, а в логике",
  "Да оно работает, но как-то слишком магически",
  "Я бы не трогал, пока не сломалось",
  "Ты опять сделал систему которую потом сам будешь бояться выключить",
  "А можно человеческим языком?",
  "Я сейчас проверю и напишу",
  "Ну вот это уже похоже на нормальную версию",
  "Странно, у меня открывается",
  "Это надо сохранить, потом забудем",
  "Звучит подозрительно, но красиво",
  "Я зашла и ничего не поняла",
  "Кажется, оно само себя индексирует",
  "Это уже не баг, это архитектурная особенность",
  "Перезагрузи, обычно помогает",
  "Я видел такое на хабре, там было простое решение",
  "Подожди, а кто это вообще одобрил?",
  "Ок, давай тогда так и сделаем",
  "Нет, я серьёзно, это работает лучше чем я ожидал",
  "Слушай, а если переписать с нуля?",
  "Я уже три раза переписывал, хватит",
  "Короче, забей, работает и работает",
  "Отправил, проверь почту",
  "Это точно фича, а не баг",
  "У меня деплой упал, опять",
  "Слушай, а давай созвонимся?",
  "Я в зуме, подключайся",
  "Ок, скинул в чат, посмотри",
  "Не, ну это уже совсем другой уровень",
  "А ты уверен что это продакшн?",
  "Ладно, пока работает — не трогаем",
  "А где документация?",
  "Какая документация? Тут сам код — документация",
  "Ну вот, опять всё сломалось",
  "Может кэш почистить?",
  "Кэш тут ни при чём, это архитектурная проблема",
  "Ладно, я пошёл спать, завтра починим",
  "Спокойной ночи, не поломай ничего",
];

function createDialogueFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  const year = 2024 + Math.floor(rng() * 6);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  let hour = Math.floor(rng() * 24);
  let minute = Math.floor(rng() * 60);
  let out = "";
  while (out.length < length) {
    const name = randomChoice(rng, CHAT_NAMES);
    const msg = randomChoice(rng, CHAT_MESSAGES);
    minute += 1 + Math.floor(rng() * 23);
    if (minute >= 60) { hour += Math.floor(minute / 60); minute %= 60; }
    hour %= 24;
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    out += `[${month}/${day}/${String(year).slice(2)} ${h12}:${pad2(minute)} ${ampm}] ${name}: ${msg}\n`;
    if (rng() < 0.18) out += "\n";
  }
  const normalized = normalizeText(out.slice(0, length));
  const indices = tokenizeText(normalized);
  while (indices.length < length) indices.push(0);
  if (indices.length > length) indices.length = length;
  return indices;
}

const POST_AUTHORS = [
  "иван_мысли", "тёмный_архив", "книголюб", "философ_на_кануне",
  "кодер_от_бога", "белый_шум", "записки_наблюдателя", "тихий_голос",
  "простая_жизнь", "архитектор_снов", "ночной_читатель", "грани_мысли",
];
const POST_BODIES = [
  "Сегодня понял одну вещь. Мы всё время что-то строим, а потом боимся в это зайти. Потому что если зайдём — придётся признать что это не то что мы хотели.",
  "Прочитал страницу в Вавилоне. Там был мой номер телефона и текст \"перезвони когда будет время\". Я не буду звонить.",
  "3 правила которые я выучил:\n1. Не трогай работающее\n2. Не чини сломанное если никто не жалуется\n3. Никогда не объясняй как это работает",
  "В бесконечной библиотеке есть книга, которая описывает твой завтрашний день. И книга, которая описывает день, которого не будет. Проблема в том, что они стоят рядом.",
  "Код компилируется. Тесты проходят. Но что-то не так. Ты чувствуешь это. Это знание, которое нельзя выразить в тест-кейсе.",
  "Дорогой дневник. Сегодня я снова забыл зачем открыл этот файл. Но написал в него. Может завтра вспомню.",
  "Если сложить все часы, которые я потратил на отладку, получится примерно 3 года. Если вычесть те случаи, когда проблема была в опечатке — 2 года и 364 дня.",
  "Жизнь — это как git rebase. Ты думаешь что всё под контролем, а потом конфликты.",
  "Нельзя просто так взять и не переписать всё с нуля. Это закон природы.",
  "В каждом проекте есть момент, когда понимаешь: проще сжечь и начать заново. Этот момент наступил вчера.",
];
const POST_TAGS = [
  "#мысли", "#вавилон", "#код", "#жизнь", "#архив", "#тишина", "#бесконечность",
  "#дневник", "#философия", "#заметка", "#ночь", "#библиотека",
];

function createPostFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  let out = "";
  while (out.length < length) {
    const author = randomChoice(rng, POST_AUTHORS);
    const body = randomChoice(rng, POST_BODIES);
    const tag1 = randomChoice(rng, POST_TAGS);
    const tag2 = randomChoice(rng, POST_TAGS);
    const likes = Math.floor(rng() * 500);
    const comments = Math.floor(rng() * 50);
    out += `@${author}\n${body}\n${tag1} ${tag2}\n♡ ${likes} · 💬 ${comments}\n\n`;
  }
  const normalized = normalizeText(out.slice(0, length));
  const indices = tokenizeText(normalized);
  while (indices.length < length) indices.push(0);
  if (indices.length > length) indices.length = length;
  return indices;
}

const DIARY_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const DIARY_ENTRIES = [
  "Проснулся в 4 утра. Не от тревоги — от тишины. Она была слишком громкой.",
  "Прошёл по коридору до конца. Там стена. Всегда стена. Но сегодня показалось что за ней кто-то дышит.",
  "Нашёл в архиве документ без названия. 4096 символов. Одно слово повторяется 512 раз. Слово — \"подожди\".",
  "Я не уверен что этот дневник существует. Но пишу. Потому что если не я — то кто?",
  "Третий день не выхожу из зала. Книги не меняются, но мне кажется что меняется их порядок. Или это я меняюсь.",
  "Кто-то оставил записку на полке. Там было написано: \"Ты не один\". Я не знаю когда её написали. Может, до меня. Может, после.",
  "Система работает. Это пугает больше чем если бы она сломалась. Работающая система — это ненормально.",
  "Сегодня мне приснилось что я — индекс в бесконечной базе данных. Мне было тепло и спокойно. Проснулся — и понял что это не сон.",
  "Ходил по шестигранным залам. Каждый зал ведёт в шесть других. Я шёл час и вернулся туда же. Или в другой зал, похожий как брат.",
  "Запись номер 410. Я перестал считать дни. Теперь считаю тома. Сегодня том 7, полка 3, стена 2. Мой адрес в бесконечности.",
];

function createDiaryFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  let out = "";
  let day = 1 + Math.floor(rng() * 28);
  let month = Math.floor(rng() * 12);
  const year = 2024 + Math.floor(rng() * 6);
  while (out.length < length) {
    const entry = randomChoice(rng, DIARY_ENTRIES);
    out += `${day} ${DIARY_MONTHS[month]} ${year}\n${entry}\n\n`;
    day += 1 + Math.floor(rng() * 5);
    if (day > 28) { day = 1 + (day % 28); month = (month + 1) % 12; }
  }
  const normalized = normalizeText(out.slice(0, length));
  const indices = tokenizeText(normalized);
  while (indices.length < length) indices.push(0);
  if (indices.length > length) indices.length = length;
  return indices;
}

const LOG_LEVELS = ["INFO", "WARN", "ERROR", "DEBUG"];
const LOG_MESSAGES = [
  "Request completed in 42ms",
  "Cache miss for key: babel_sector_7_hall_3",
  "Connection pool exhausted, waiting...",
  "Index rebuild started for sector 7",
  "Timeout exceeded: 30000ms",
  "Auth token refreshed successfully",
  "Database connection restored",
  "Worker thread spawned: search_variant_12",
  "Memory usage: 847MB / 2048MB",
  "Page rendered in 3ms [sector:7 hall:3 wall:1]",
  "Unhandled exception in search pipeline",
  "Rate limit reached: 100 req/min",
  "Background job completed: index_maintenance",
  "Health check: OK",
  "Configuration reloaded from /etc/babel/config.yml",
];
const LOG_SERVICES = [
  "api-gateway", "search-engine", "page-renderer", "index-builder",
  "auth-service", "cache-layer", "worker-pool", "coordinator",
];

function createLogFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  let out = "";
  const y = 2024 + Math.floor(rng() * 3);
  let h = Math.floor(rng() * 24), m = Math.floor(rng() * 60), s = Math.floor(rng() * 60), ms = Math.floor(rng() * 1000);
  while (out.length < length) {
    const level = randomChoice(rng, LOG_LEVELS);
    const svc = randomChoice(rng, LOG_SERVICES);
    const msg = randomChoice(rng, LOG_MESSAGES);
    out += `${y}-${pad2(1 + Math.floor(rng() * 12))}-${pad2(1 + Math.floor(rng() * 28))}T${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad2(Math.floor(ms / 10))}Z [${level}] ${svc}: ${msg}\n`;
    s += 1 + Math.floor(rng() * 30); if (s >= 60) { s %= 60; m++; } if (m >= 60) { m %= 60; h++; } h %= 24;
  }
  const normalized = normalizeText(out.slice(0, length));
  const indices = tokenizeText(normalized);
  while (indices.length < length) indices.push(0);
  if (indices.length > length) indices.length = length;
  return indices;
}

function createHumanFillerIndices(seed, length) {
  const rng = rngFrom(seed);
  const modes = [
    ["dialogue", 0.30],
    ["post", 0.20],
    ["diary", 0.15],
    ["log", 0.10],
    ["words", 0.15],
    ["noise", 0.10],
  ];
  let roll = rng(), acc = 0;
  for (const [m, w] of modes) {
    acc += w;
    if (roll <= acc) return createFillerIndices(m, seed, length);
  }
  return createWordFillerIndices(seed, length);
}

function choosePosition(mode, phraseLength, rng) {
  const maxPosition = ALG.pageLength - phraseLength;
  if (mode === "empty") return Math.max(0, Math.floor((ALG.pageLength - phraseLength) / 2));
  return clamp(Math.floor(rng() * Math.max(1, maxPosition + 1)), 0, maxPosition);
}

/* ---- Search variants (legacy) ---- */
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

/* ---- Encoding helpers (custom base62 — no atob/btoa) ---- */
const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function bytesToBase64Url(bytes) {
  let num = 0n;
  for (const byte of bytes) num = (num << 8n) | BigInt(byte);
  if (num === 0n) return '0';
  let result = '';
  const base = 62n;
  while (num > 0n) {
    result = BASE62_CHARS[Number(num % base)] + result;
    num /= base;
  }
  return result;
}

function base64UrlToBytes(value) {
  const base = 62n;
  let num = 0n;
  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    let digit;
    if (code >= 48 && code <= 57) digit = code - 48;        // 0-9
    else if (code >= 97 && code <= 122) digit = code - 87;   // a-z
    else if (code >= 65 && code <= 90) digit = code - 29;    // A-Z
    else continue; // skip invalid chars
    num = num * base + BigInt(digit);
  }
  // Convert BigInt to bytes
  if (num === 0n) return new Uint8Array([0]);
  const bytes = [];
  while (num > 0n) { bytes.push(Number(num & 255n)); num >>= 8n; }
  return Uint8Array.from(bytes.reverse());
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
  return `X:${coordinates.x} Y:${coordinates.y} Z:${coordinates.z}`;
}

/* ---- Page data (legacy byte-level) ---- */
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
   PREFIX CODEC PAGE DATA — new decode path
   ═══════════════════════════════════════════════════════════ */

function prefixDecodePage(x, y, z, mode) {
  const bx = BigInt(x);
  const by = BigInt(y);
  const bz = BigInt(z || 1);

  /* Build full coordinates */
  const coords = xyToCoordinates(bx, by, bz);
  const xy = coordinatesToXY(coords);

  /* Random mode: use old byte-level decode */
  if (mode === 'random') {
    const hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
    const rawIdx = hallIndex * PAGES_PER_HALL + (bz - 1n);
    const number = feistelPermute(rawIdx);
    const indices = numberToIndices(number);
    const text = indicesToString(indices);
    const classification = classifyDecodedPage(text);
    return {
      text,
      coords: {
        sector: coords.sector.toString(), hall: coords.hall.toString(),
        wall: coords.wall.toString(), shelf: coords.shelf.toString(),
        volume: coords.volume.toString(), page: coords.page.toString(),
      },
      xy: { x: xy.x.toString(), y: xy.y.toString() },
      number: number.toString(),
      title: pageTitle(coords),
      temperature: 1.0,
      classification,
      engine: 'byte-level',
    };
  }

  /* Human mode (default): prefix codec with temperature */
  /* Compute internal address via Feistel permutation */
  const internalAddr = coordToInternalAddress(bx, by, bz);
  const totalBits = Number(TOTAL_BITS);

  /* Compute temperature from z */
  const temperature = computeTemperature(bz);

  /* Decode page */
  const text = decodeAddressToPage(internalAddr, totalBits, temperature);

  const classification = classifyDecodedPage(text);

  return {
    text,
    coords: {
      sector: coords.sector.toString(), hall: coords.hall.toString(),
      wall: coords.wall.toString(), shelf: coords.shelf.toString(),
      volume: coords.volume.toString(), page: coords.page.toString(),
    },
    xy: { x: xy.x.toString(), y: xy.y.toString() },
    number: internalAddr.toString(),
    title: pageTitle(coords),
    temperature,
    classification,
    engine: 'prefix',
  };
}

/* ═══════════════════════════════════════════════════════════
   MESSAGE HANDLER
   ═══════════════════════════════════════════════════════════ */

/* Async message handler for prefix codec operations that may need dictionary loading */
async function handleMessageAsync(type, payload) {
  switch (type) {
    case 'prefixDecodePage': {
      /* Lazy-load external dictionary on first prefix decode call */
      await loadExternalDictionary();

      const { x, y, z, mode } = payload;
      return prefixDecodePage(x, y, z, mode);
    }

    case 'prefixSearch': {
      /* Lazy-load external dictionary on first prefix search call */
      await loadExternalDictionary();

      const { phrase } = payload;
      const result = searchPhraseToAddress(phrase);
      if (!result) {
        return { found: false, phrase };
      }

      /* Convert address to coordinates */
      const coord = internalAddressToCoord(result.address);
      const coords = xyToCoordinates(coord.x, coord.y, coord.z);
      const xy = coordinatesToXY(coords);
      const borges = zToBorges(coord.z);

      return {
        found: true,
        phrase,
        text: result.text,
        phrasePos: result.phrasePos,
        phraseLen: result.phraseLen,
        address: result.address.toString(),
        coords: {
          x: coord.x.toString(),
          y: coord.y.toString(),
          z: coord.z.toString(),
          sector: coords.sector.toString(),
          hall: coords.hall.toString(),
          wall: borges.wall.toString(),
          shelf: borges.shelf.toString(),
          volume: borges.volume.toString(),
          page: borges.page.toString(),
        },
        xy: { x: xy.x.toString(), y: xy.y.toString() },
      };
    }

    default:
      return undefined; // Not an async handler
  }
}

self.onmessage = async function(e) {
  const { id, type, payload } = e.data;

  try {
    /* Try async handlers first */
    const asyncResult = await handleMessageAsync(type, payload);
    if (asyncResult !== undefined) {
      self.postMessage({ id, result: asyncResult, error: null });
      return;
    }

    /* Sync handlers (legacy) */
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
