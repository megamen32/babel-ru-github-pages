/* ============================================
   ВАВИЛОН — Web Worker for async BigInt ops
   Self-contained computation engine
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

  /* Offline-first: word bank is embedded, no fetch needed */
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
