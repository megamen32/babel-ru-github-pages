(() => {
  const app = window.BabelApp;
  const { ALG, SEARCH_VARIANTS_DEFAULT, SEARCH_VARIANTS_MAX, WORD_BANK } = app.config;
  const { clamp, rngFrom, tokenizeText, indicesToString } = app.utils;

  /* ═══════════════════════════════════════════════════════════
     Base-256 (2^8) Byte-Level Engine
     ═══════════════════════════════════════════════════════════
     256-character alphabet = 1 byte per symbol.
     4096 symbols × 8 bits = 32768 bits = 2^15 bits per page.
     Every Telegram post (max 4096 chars) is exactly one page.
     All operations are byte shifts and masks. */

  const BITS_PER_CHAR = 8n;
  const CHAR_MASK = 255n;
  const TOTAL_BITS = BITS_PER_CHAR * BigInt(ALG.pageLength);
  const BIT_MASK = (1n << TOTAL_BITS) - 1n;

  function maxPageNumber() {
    return 1n << TOTAL_BITS;
  }

  /* ---- Affine Permutation over Z/(2^32768) ---- */

  /* C must be ODD (coprime to 2^n for bijection) and must have bits set
     across the ENTIRE width of the modulus. If C ≈ 2^63 while the modulus
     is 2^32768, adjacent indices differ by only 63 bits → first 4088 of 4096
     characters are identical! We build C by tiling a 64-bit pattern with
     alternating inversion to ensure high Hamming distance across the full width.
     The seed pattern 0x4CF3B209D871A5E6 is odd (LSB=0 → wait, 0xE6 ends in 0,
     that's even! Use 0x4CF3B209D871A5E7 to force odd). */

  const SEED_C = 0x4CF3B209D871A5E7n; // odd 64-bit seed
  const SEED_C_INV = SEED_C ^ 0xFFFFFFFFFFFFFFFFn; // bitwise complement for alternation

  let _c = 0n;
  for (let bitPos = 0; bitPos < Number(TOTAL_BITS); bitPos += 64) {
    const pattern = (bitPos / 64) % 2 === 0 ? SEED_C : SEED_C_INV;
    _c = (_c | (pattern << BigInt(bitPos))) & BIT_MASK;
  }
  // Ensure C is odd (required for coprimality with 2^n)
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

  /* ---- Core conversion (byte-level) ---- */

  function indicesToNumber(indices) {
    let output = 0n;
    for (const idx of indices) {
      output = (output << BITS_PER_CHAR) | BigInt(idx);
    }
    return output;
  }

  function numberToIndices(number) {
    const max = maxPageNumber();
    let value = BigInt(number);
    if (value < 0n || value >= max) {
      throw new Error("Адрес вне пространства библиотеки.");
    }
    const result = new Array(ALG.pageLength);
    for (let i = ALG.pageLength - 1; i >= 0; i--) {
      result[i] = Number(value & CHAR_MASK);
      value >>= BITS_PER_CHAR;
    }
    return result;
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

  function fixedPageText(text) {
    let normalized = app.utils.normalizeText(text);
    const indices = tokenizeText(normalized);
    if (indices.length > ALG.pageLength) indices.length = ALG.pageLength;
    while (indices.length < ALG.pageLength) indices.push(0);
    return indicesToString(indices);
  }

  /* ---- Coordinate system ---- */

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
    if (
      c.sector < 1n ||
      c.hall < 1n || c.hall > ALG.hallsPerSector ||
      c.wall < 1n || c.wall > ALG.wallsPerHall ||
      c.shelf < 1n || c.shelf > ALG.shelvesPerWall ||
      c.volume < 1n || c.volume > ALG.volumesPerShelf ||
      c.page < 1n || c.page > ALG.pagesPerVolume
    ) {
      throw new Error("Координаты вне геометрии библиотеки.");
    }
    let value = c.sector - 1n;
    value = value * ALG.hallsPerSector + (c.hall - 1n);
    value = value * ALG.wallsPerHall + (c.wall - 1n);
    value = value * ALG.shelvesPerWall + (c.shelf - 1n);
    value = value * ALG.volumesPerShelf + (c.volume - 1n);
    value = value * ALG.pagesPerVolume + (c.page - 1n);
    if (value >= maxPageNumber()) {
      throw new Error("Координаты выводят страницу за пределы пространства.");
    }
    return value;
  }

  /* ---- XY Coordinate System (Szudzik pairing) ---- */

  function szudzikPair(x, y) {
    const a = x >= 0 ? 2 * x : -2 * x - 1;
    const b = y >= 0 ? 2 * y : -2 * y - 1;
    return a >= b ? a * a + a + b : b * b + a;
  }

  function bigSqrt(n) {
    if (n < 0n) throw new Error("sqrt of negative");
    if (n < 2n) return n;
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) { x = y; y = (x + n / x) / 2n; }
    return x;
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

  /* ---- Filler Generation (index-based) ---- */

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
    return Array.from({ length }, () => Math.floor(rng() * ALG.alphabet.length));
  }

  /* ═══════════════════════════════════════════════════════════
     ОБИТАЕМЫЙ СЛОЙ — человеческие генераторы заполнения
     ═══════════════════════════════════════════════════════════
     Не меняет математику библиотеки — это надстройка поверх.
     Абсолютная библиотека остаётся честной: число ↔ текст.
     Обитаемый слой — вероятностная карта заселённых районов. */

  function randomChoice(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }
  function pad2(n) { return String(n).padStart(2, "0"); }

  /* ---- Диалог (переписка) ---- */
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
    const normalized = app.utils.normalizeText(out.slice(0, length));
    const indices = tokenizeText(normalized);
    while (indices.length < length) indices.push(0);
    if (indices.length > length) indices.length = length;
    return indices;
  }

  /* ---- Пост (соцсеть) ---- */
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
    const normalized = app.utils.normalizeText(out.slice(0, length));
    const indices = tokenizeText(normalized);
    while (indices.length < length) indices.push(0);
    if (indices.length > length) indices.length = length;
    return indices;
  }

  /* ---- Дневник ---- */
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
    const normalized = app.utils.normalizeText(out.slice(0, length));
    const indices = tokenizeText(normalized);
    while (indices.length < length) indices.push(0);
    if (indices.length > length) indices.length = length;
    return indices;
  }

  /* ---- Лог (серверный) ---- */
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
    const normalized = app.utils.normalizeText(out.slice(0, length));
    const indices = tokenizeText(normalized);
    while (indices.length < length) indices.push(0);
    if (indices.length > length) indices.length = length;
    return indices;
  }

  /* ---- Человек (смесь жанров) ---- */
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

  /* ---- Роутер заполнителей ---- */
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
     КЛАССИФИКАТОР СТРАНИЦЫ — какой жанр у этого текста?
     ═══════════════════════════════════════════════════════════ */

  function classifyPageText(text) {
    const lines = String(text).split(/\n+/).filter(l => l.trim());
    /* Telegram/WhatsApp pattern: [M/D/YY H:MM am/pm] Name: text (lowercase after normalize) */
    const tgPattern = /^\[\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*(am|pm)?\]\s+[^:]{2,40}:/i;
    let tgLines = 0;
    /* Name: text pattern (simpler chat) */
    let nameColonLines = 0;
    /* Log pattern: 2024-01-15t12:34:56 (lowercase after normalize) */
    const logPattern = /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}/;
    let logLines = 0;
    /* Post pattern: @author */
    const postPattern = /^@\S+/;
    let postLines = 0;
    /* Diary pattern: 15 января 2024 */
    const diaryPattern = /^\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i;
    let diaryLines = 0;

    for (const line of lines) {
      const t = line.trim();
      if (tgPattern.test(t)) tgLines++;
      if (/^[А-ЯЁA-Z][^:]{1,40}:\s+/.test(t)) nameColonLines++;
      if (logPattern.test(t)) logLines++;
      if (postPattern.test(t)) postLines++;
      if (diaryPattern.test(t)) diaryLines++;
    }

    const words = text.match(/[а-яёa-z]{3,}/gi) || [];
    const wordDensity = words.join("").length / Math.max(1, text.length);

    if (tgLines >= 3) return { kind: "dialogue", score: 0.95, label: "Переписка" };
    if (nameColonLines >= 5 && wordDensity > 0.30) return { kind: "dialogue", score: 0.80, label: "Переписка" };
    if (logLines >= 3) return { kind: "log", score: 0.90, label: "Лог" };
    if (postLines >= 2 && wordDensity > 0.25) return { kind: "post", score: 0.85, label: "Пост" };
    if (diaryLines >= 2) return { kind: "diary", score: 0.85, label: "Дневник" };
    if (wordDensity > 0.45) return { kind: "text", score: 0.60, label: "Текст" };
    if (wordDensity > 0.25) return { kind: "sparse", score: 0.40, label: "Разреженный" };
    return { kind: "noise", score: 0.20, label: "Шум" };
  }

  /* ═══════════════════════════════════════════════════════════
     СТАТИСТИЧЕСКИЙ ДЕТЕКТОР РУССКОГО ТЕКСТА
     ═══════════════════════════════════════════════════════════
     Анализирует страницу на наличие статистических признаков
     связного русского текста. В отличие от classifyPageText,
     который ищет конкретные шаблоны (даты, имена), этот
     детектор основан на частотных характеристиках языка.

     Алфавитные индексы (из config.js):
       0 = пробел, 1 = \n
       2–34 = русские буквы:
         а(2) б(3) в(4) г(5) д(6) е(7) ж(8) з(9) и(10) й(11)
         к(12) л(13) м(14) н(15) о(16) п(17) р(18) с(19) т(20) у(21)
         ф(22) х(23) ц(24) ч(25) ш(26) щ(27) ъ(28) ы(29) ь(30) э(31)
         ю(32) я(33) ё(34)

     Гласные: а(2) е(7) ё(34) и(10) о(16) у(21) ы(29) э(31) ю(32) я(33)
     Согласные: б(3) в(4) г(5) д(6) ж(8) з(9) й(11) к(12) л(13) м(14)
                н(15) п(17) р(18) с(19) т(20) ф(22) х(23) ц(24) ч(25)
                ш(26) щ(27) ъ(28) ь(30) */

  /* ---- Ожидаемые частоты русских букв (доля среди всех русских букв) ---- */
  const RU_EXPECTED_FREQ = {
    'о': 0.1097, 'е': 0.0845, 'а': 0.0801, 'и': 0.0735, 'н': 0.0670,
    'т': 0.0626, 'с': 0.0547, 'р': 0.0473, 'в': 0.0454, 'л': 0.0440,
    'к': 0.0349, 'м': 0.0321, 'д': 0.0298, 'п': 0.0281, 'у': 0.0262,
    'я': 0.0201, 'ы': 0.0190, 'ь': 0.0174, 'г': 0.0170, 'з': 0.0165,
    'б': 0.0159, 'ч': 0.0144, 'й': 0.0121, 'х': 0.0097, 'ж': 0.0094,
    'ш': 0.0073, 'ю': 0.0064, 'ц': 0.0048, 'щ': 0.0036, 'э': 0.0032,
    'ф': 0.0026, 'ъ': 0.0004, 'ё': 0.0004,
  };

  /* ---- Множество гласных (строчные) ---- */
  const RU_VOWEL_SET = new Set('аеёиоуыэюя');

  /* ---- Частые русские биграммы ---- */
  const RU_COMMON_BIGRAMS = new Set([
    'ст','но','то','на','по','не','он','ни','ко','ра',
    'ал','ли','ен','ов','во','пр','ка','ро','ан','ре',
    'со','те','ат','ор','ет','ва','ав','ло','ла','ве',
    'ас','ел','та','па','ин','ак','са','де','мо','ле',
    'вс','св','тр','ед','ри','ов','ся','ть','ый','ой',
    'ий','ая','ое','ые','ся','ть','ер','ие','ну','вы',
    'ми','от','об','до','го','че','ме','ым','им','ес',
  ]);

  /* ---- Типичные окончания русских слов ---- */
  const RU_COMMON_ENDINGS = [
    'ть','ся','ый','ой','ий','ая','ое','ые','ил','ла','ли','но',
    'ет','ут','ют','ем','им','ит','ал','ел','ол','ул','ок','ек',
    'ик','ка','ки','ку','ке','на','ны','не','ми','ма','му','ме',
    'ию','ого','ему','ими','ыми','ась','ись','ую','юю','ее','ие',
    'ье','ния','тие','сть','ный','мый','вый','кий','гий','ший',
    'щий','хий','жий','чий','рин','лов','ров','ник','тель','ость',
  ];

  function detectRussianText(text) {
    const t = String(text);
    if (!t || t.length === 0) return { score: 0, kind: 'noise', label: 'Шум' };

    /* ---- Быстрый отсев: считаем русские буквы ---- */
    const ruLetters = t.match(/[а-яё]/gi) || [];
    const totalRuLetters = ruLetters.length;
    const totalChars = t.length;

    if (totalRuLetters < 20) {
      return { score: 0, kind: 'noise', label: 'Шум' };
    }

    /* ---- A. Плотность русских букв ---- */
    const ruDensity = totalRuLetters / totalChars;

    /* ---- B. Частотное распределение (хи-квадрат) ---- */
    const ruLower = ruLetters.map(c => c.toLowerCase());
    const freqMap = {};
    for (const c of ruLower) freqMap[c] = (freqMap[c] || 0) + 1;

    let chiSq = 0;
    for (const letter of Object.keys(RU_EXPECTED_FREQ)) {
      const expected = RU_EXPECTED_FREQ[letter];
      const observed = (freqMap[letter] || 0) / totalRuLetters;
      chiSq += (observed - expected) ** 2 / expected;
    }
    /* Хороший текст: chiSq < 0.05, шум: > 0.3 */
    const freqScore = Math.max(0, Math.min(1, 1 - chiSq / 0.3));

    /* ---- C. Доля гласных среди русских букв ---- */
    const vowelCount = ruLower.filter(c => RU_VOWEL_SET.has(c)).length;
    const vowelRatio = vowelCount / totalRuLetters;
    /* Русский: ~38–42% гласных */
    const vowelDev = Math.abs(vowelRatio - 0.40);
    const vowelScore = Math.max(0, 1 - vowelDev * 8);

    /* ---- D. Частые биграммы ---- */
    const lowerText = t.toLowerCase();
    let bigramHits = 0;
    let totalBigramSlots = 0;
    for (let i = 0; i < lowerText.length - 1; i++) {
      if (/[а-яё]/.test(lowerText[i]) && /[а-яё]/.test(lowerText[i + 1])) {
        totalBigramSlots++;
        if (RU_COMMON_BIGRAMS.has(lowerText[i] + lowerText[i + 1])) bigramHits++;
      }
    }
    const bigramRate = totalBigramSlots > 0 ? bigramHits / totalBigramSlots : 0;
    /* Хороший текст: 20–35% биграмм совпадают */
    const bigramScore = Math.min(1, bigramRate / 0.18);

    /* ---- E. Типичные окончания слов ---- */
    const words = t.match(/[а-яё]{2,}/gi) || [];
    let endingHits = 0;
    for (const w of words) {
      const lw = w.toLowerCase();
      for (const e of RU_COMMON_ENDINGS) {
        if (lw.endsWith(e)) { endingHits++; break; }
      }
    }
    const endingRate = words.length > 0 ? endingHits / words.length : 0;
    const endingScore = Math.min(1, endingRate / 0.25);

    /* ---- F. Распределение длин слов ---- */
    let totalWordLen = 0;
    let longWords = 0;
    for (const w of words) {
      totalWordLen += w.length;
      if (w.length >= 15) longWords++;
    }
    const avgWordLen = words.length > 0 ? totalWordLen / words.length : 0;
    const avgDev = Math.abs(avgWordLen - 5.5) / 5.5;
    const longRate = words.length > 0 ? longWords / words.length : 0;
    const wordLenScore = Math.max(0, 1 - avgDev * 2) * Math.max(0, 1 - longRate * 10);

    /* ---- G. Пробельный паттерн ---- */
    const spaceCount = (t.match(/ /g) || []).length;
    const spaceRatio = spaceCount / totalChars;
    /* Русский текст: ~12–25% пробелов; шум: ~0.4% */
    const spaceDev = Math.abs(spaceRatio - 0.17) / 0.17;
    const spaceScore = Math.max(0, 1 - spaceDev * 2);

    /* ---- H. Знаки конца предложений ---- */
    const punctCount = (t.match(/[.!?]/g) || []).length;
    const punctRate = punctCount / totalChars;
    /* ~0.5–2% для прозы */
    const punctScore = Math.min(1, punctRate / 0.005);

    /* ---- Итоговая оценка (взвешенная сумма) ---- */
    const weights = {
      freq: 0.25, vowel: 0.08, bigram: 0.22, ending: 0.15,
      wordLen: 0.08, space: 0.12, punct: 0.05, density: 0.05,
    };
    let score =
      weights.freq * freqScore +
      weights.vowel * vowelScore +
      weights.bigram * bigramScore +
      weights.ending * endingScore +
      weights.wordLen * wordLenScore +
      weights.space * spaceScore +
      weights.punct * punctScore +
      weights.density * Math.min(1, ruDensity / 0.40);

    /* Бонус за высокую плотность русских букв */
    score *= Math.min(1, ruDensity / 0.30);

    score = Math.round(score * 100) / 100;

    let kind, label;
    if (score >= 0.50) {
      kind = 'russian';
      label = 'Русский текст';
    } else if (score >= 0.25) {
      kind = 'sparse';
      label = 'Разреженный';
    } else {
      kind = 'noise';
      label = 'Шум';
    }

    return { score, kind, label };
  }

  /* ═══════════════════════════════════════════════════════════
     СКАНИРОВАНИЕ — поиск обитаемых страниц
     ═══════════════════════════════════════════════════════════
     Сканирует пространство номеров страниц и определяет
     статистическую «обитаемость» с помощью detectRussianText. */

  function scanForInhabited(startNumber, direction, maxScan) {
    const dir = direction || 0;  // 1=вперёд, -1=назад, 0=обоими
    const limit = maxScan || 100;
    const THRESHOLD = 0.35;
    const start = BigInt(startNumber);
    const maxNum = maxPageNumber();

    let bestResult = null;
    let bestScore = 0;
    let scanned = 0;

    for (let i = 1; i <= limit; i++) {
      const offsets = dir === 0
        ? [BigInt(i), -BigInt(i)]
        : [BigInt(i) * BigInt(dir)];

      for (const offset of offsets) {
        const candidateNumber = start + offset;
        if (candidateNumber < 0n || candidateNumber >= maxNum) continue;
        scanned++;

        try {
          const indices = numberToIndices(candidateNumber);
          const text = indicesToString(indices);
          const detection = detectRussianText(text);

          if (detection.score > bestScore) {
            bestScore = detection.score;
            const coords = rawIndexToCoordinates(app.library.unpermuteIndex(candidateNumber));
            const xy = coordinatesToXY(coords);
            bestResult = {
              number: candidateNumber,
              coords,
              xy,
              text,
              detection,
              scanned,
              offset: Number(offset),
            };
          }

          if (detection.score >= THRESHOLD) {
            return bestResult;
          }
        } catch { continue; }
      }
    }

    /* Не нашли выше порога — возвращаем лучший результат, если он есть */
    if (bestResult) {
      bestResult.belowThreshold = true;
      return bestResult;
    }

    /* Абсолютный fallback — вернуть текущую страницу с её оценкой */
    try {
      const indices = numberToIndices(start);
      const text = indicesToString(indices);
      const detection = detectRussianText(text);
      const coords = rawIndexToCoordinates(app.library.unpermuteIndex(start));
      const xy = coordinatesToXY(coords);
      return {
        number: start,
        coords,
        xy,
        text,
        detection,
        scanned: 0,
        offset: 0,
        belowThreshold: true,
      };
    } catch {
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ОБИТАЕМЫЙ АТЛАС — жанры регионов гекс-карты
     ═══════════════════════════════════════════════════════════
     Каждая координата (x,y) определяет стабильный жанр региона.
     Путешественник попадает в районы с разным характером. */

  const REGION_GENRES = [
    { kind: "dialogue", label: "Район переписок", icon: "💬", weight: 0.25 },
    { kind: "diary",    label: "Район дневников", icon: "📔", weight: 0.15 },
    { kind: "post",     label: "Район постов",    icon: "📱", weight: 0.15 },
    { kind: "log",      label: "Серверный кластер", icon: "⌨️", weight: 0.10 },
    { kind: "text",     label: "Книжные полки",   icon: "📖", weight: 0.15 },
    { kind: "noise",    label: "Пустые залы",     icon: "🌫️", weight: 0.20 },
  ];

  function classifyRegion(x, y) {
    const seed = `region:${x}:${y}`;
    const rng = rngFrom(seed);
    const roll = rng();
    let acc = 0;
    for (const r of REGION_GENRES) {
      acc += r.weight;
      if (roll <= acc) return r;
    }
    return REGION_GENRES[REGION_GENRES.length - 1];
  }

  /* ---- Обитаемая страница по координатам (не абсолютная!) ---- */
  function getInhabitedPageIndices(x, y, wall, shelf, volume, page) {
    const region = classifyRegion(x, y);
    const seed = `inhabited:${x}:${y}:${wall}:${shelf}:${volume}:${page}`;
    const rng = rngFrom(seed);
    /* Sub-variation within region */
    const subSeed = `${seed}:v${Math.floor(rng() * 100000)}`;
    const indices = createFillerIndices(region.kind, subSeed, ALG.pageLength);
    return { indices, genre: region };
  }

  function choosePosition(mode, phraseLength, rng) {
    const maxPosition = ALG.pageLength - phraseLength;
    if (mode === "empty") return Math.max(0, Math.floor((ALG.pageLength - phraseLength) / 2));
    return clamp(Math.floor(rng() * Math.max(1, maxPosition + 1)), 0, maxPosition);
  }

  /* ---- Public API ---- */

  app.library = {
    maxPageNumber,
    numberToIndices,
    indicesToNumber,
    permuteIndex(index) {
      return ((BigInt(index) * PERM_C + PERM_OFFSET) & BIT_MASK);
    },
    unpermuteIndex(index) {
      return (((BigInt(index) - PERM_OFFSET + (1n << (TOTAL_BITS + 8n))) * PERM_I) & BIT_MASK);
    },
    fixedPageText,
    textToNumber,
    numberToText,
    rawIndexToCoordinates,
    coordinatesToRawIndex,
    coordinatesToNumber(coordinates) {
      return app.library.permuteIndex(coordinatesToRawIndex(coordinates));
    },
    numberToCoordinates(number) {
      return rawIndexToCoordinates(app.library.unpermuteIndex(number));
    },
    pageTitle(coordinates) {
      return `Сектор ${coordinates.sector} · Зал ${coordinates.hall} · Стена ${coordinates.wall} · Полка ${coordinates.shelf} · Том ${coordinates.volume} · Лист ${coordinates.page}`;
    },

    /* ---- Обитаемый слой — публичные API ---- */
    classifyPageText,
    detectRussianText,
    scanForInhabited,
    classifyRegion,
    getInhabitedPageIndices,
    REGION_GENRES,
    createFillerIndices,
    createDialogueFillerIndices,
    createPostFillerIndices,
    createDiaryFillerIndices,
    createLogFillerIndices,
    createHumanFillerIndices,

    /* Coordinate-based page URL: human-readable parts first, big seed at end in base64url
       New format: #/page/h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}/s/{seed_b64url}
       Old format: #/page/s/{sector_decimal}/h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}
       seed = sector - 1 (0-indexed), encoded as base64url for compactness.
       Decimal sector ≈ 9860 digits; base64url seed ≈ 5458 chars — 45% shorter. */
    coordsToPageUrl(coords, params) {
      const c = {
        sector: BigInt(coords.sector || 1),
        hall: BigInt(coords.hall || 1),
        wall: BigInt(coords.wall || 1),
        shelf: BigInt(coords.shelf || 1),
        volume: BigInt(coords.volume || 1),
        page: BigInt(coords.page || 1),
      };
      const seed = c.sector - 1n; // 0-indexed
      const seedB64 = app.library.numberToB64(seed);
      const base = `#/page/h/${c.hall}/w/${c.wall}/sh/${c.shelf}/v/${c.volume}/p/${c.page}/s/${seedB64}`;
      if (params) {
        const qs = new URLSearchParams(params).toString();
        return `${base}?${qs}`;
      }
      return base;
    },

    randomPageCoords() {
      return app.library.numberToCoordinates(app.library.randomPageNumber());
    },

    xyToCoordinates, coordinatesToXY, xyToHallXY, hallToXY, szudzikPair, szudzikUnpair,

    getBookSpine(x, y, wall, shelf, volume) {
      try {
        const coords = xyToCoordinates(x, y, wall, shelf, volume, 1);
        const number = app.library.coordinatesToNumber(coords);
        const indices = numberToIndices(number);
        let start = 0;
        while (start < indices.length && indices[start] === 0) start++;
        return indicesToString(indices.slice(start, start + 25));
      } catch { return ""; }
    },

    getPageByXY(x, y, wall, shelf, volume, page) {
      const coords = xyToCoordinates(x, y, wall, shelf, volume, page);
      const number = app.library.coordinatesToNumber(coords);
      const indices = numberToIndices(number);
      return { number, text: indicesToString(indices), indices, coordinates: coords };
    },

    classifySpine(spineText) {
      if (!spineText) return "empty";
      if (spineText.replace(/[\s\n]/g, "").length === 0) return "empty";
      const wordPattern = /[абвгдеёжзийклмнопрстуфхцчшщъыьэюяa-z]{3,}/gi;
      const words = spineText.match(wordPattern);
      if (words && words.length >= 1 && words.some(w => w.length >= 4)) return "text";
      if (words && words.length >= 2) return "text";
      return "noise";
    },

    /* Encoding helpers */
    bytesToBase64Url(bytes) {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    },
    base64UrlToBytes(value) {
      const base = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
      const padded = base + "=".repeat((4 - base.length % 4) % 4);
      return Uint8Array.from([...atob(padded)].map(c => c.charCodeAt(0)));
    },
    bigIntToBytes(number) {
      let value = BigInt(number);
      if (value === 0n) return new Uint8Array([0]);
      const bytes = [];
      while (value > 0n) { bytes.push(Number(value & 255n)); value >>= 8n; }
      return Uint8Array.from(bytes.reverse());
    },
    bytesToBigInt(bytes) {
      let output = 0n;
      for (const byte of bytes) output = (output << 8n) + BigInt(byte);
      return output;
    },
    numberToB64(number) { return app.library.bytesToBase64Url(app.library.bigIntToBytes(number)); },
    b64ToNumber(value) { return app.library.bytesToBigInt(app.library.base64UrlToBytes(value)); },
    bigintToBase36(number) { return BigInt(number).toString(36); },
    base36ToBigInt(value) {
      const clean = String(value || "").toLowerCase().replace(/[^0-9a-z]/g, "");
      if (!clean) return 0n;
      let output = 0n;
      for (const char of clean) {
        const code = char.charCodeAt(0);
        output = output * 36n + BigInt(code <= 57 ? code - 48 : code - 87);
      }
      return output;
    },
    prettyBase36(number) {
      const raw = app.library.bigintToBase36(number);
      const chunks = [];
      for (let i = 0; i < raw.length; i += 8) chunks.push(raw.slice(i, i + 8));
      return chunks.join("-");
    },

    createSearchVariants(phraseRaw, mode, countRaw) {
      const phrase = app.utils.normalizeText(phraseRaw);
      if (!phrase) throw new Error("После нормализации фраза пуста.");
      const phraseIndices = tokenizeText(phrase);
      if (phraseIndices.length > ALG.pageLength) throw new Error(`Фраза длиннее страницы: ${phraseIndices.length} позиций.`);
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
        const coords = rawIndexToCoordinates(app.library.unpermuteIndex(number));
        const xy = coordinatesToXY(coords);
        variants.push({ mode, number, coordinates: coords, xy, phrase, position, text: indicesToString(fillerIndices), variant, range: { start: position, length: phraseIndices.length } });
      }
      return variants;
    },

    randomPageNumber() {
      return indicesToNumber(createNoiseFillerIndices(`${Date.now()}:${Math.random()}`, ALG.pageLength));
    },
    randomHallXY() {
      return { x: Math.floor(Math.random() * 2000) - 1000, y: Math.floor(Math.random() * 2000) - 1000 };
    },

    /* Find a random hall that belongs to a specific genre region */
    findRandomHallOfGenre(kind, maxTries) {
      const limit = maxTries || 200;
      for (let i = 0; i < limit; i++) {
        const x = Math.floor(Math.random() * 2000) - 1000;
        const y = Math.floor(Math.random() * 2000) - 1000;
        if (classifyRegion(x, y).kind === kind) return { x, y };
      }
      /* Fallback: return any random hall */
      return { x: Math.floor(Math.random() * 2000) - 1000, y: Math.floor(Math.random() * 2000) - 1000 };
    },

    /* Generate an inhabited page for a specific genre at a given step.
       Uses createSearchVariants with auto-generated phrase for variety. */
    generateInhabitedPage(genre, step) {
      const seed = `genre-nav:${genre}:${step}`;
      const rng = rngFrom(seed);
      const wb = WORD_BANK;
      const w1 = wb[Math.floor(rng() * wb.length)];
      const w2 = wb[Math.floor(rng() * wb.length)];
      const phrase = app.utils.normalizeText(`${w1} ${w2}`);

      /* Map genre kind to filler mode */
      const modeMap = {
        dialogue: 'dialogue', diary: 'diary', post: 'post',
        log: 'log', text: 'words', noise: 'noise'
      };
      const mode = modeMap[genre] || 'words';

      /* Create 1 variant with this phrase and mode */
      const variants = app.library.createSearchVariants(phrase, mode, 1);
      return variants[0]; // { mode, number, coordinates, xy, phrase, position, text, variant, range }
    },

    /* Scan forward from a page number looking for a page of specific genre.
       Returns { number, coords, xy, text, classification } or null if maxScan reached. */
    scanNextInhabitedPage(startNumber, genre, maxScan) {
      const limit = maxScan || 50;
      const modeMap = {
        dialogue: 'dialogue', diary: 'diary', post: 'post',
        log: 'log', text: 'text', noise: 'noise'
      };
      const targetKind = modeMap[genre] || genre;

      for (let i = 1; i <= limit; i++) {
        try {
          const number = BigInt(startNumber) + BigInt(i);
          const indices = numberToIndices(number);
          const text = indicesToString(indices);
          const classification = classifyPageText(text);
          if (classification.kind === targetKind) {
            const coords = rawIndexToCoordinates(app.library.unpermuteIndex(number));
            const xy = coordinatesToXY(coords);
            return { number, coords, xy, text, classification, scanned: i };
          }
        } catch { continue; }
      }
      return null;
    },

    /* Find any next inhabited page — pick a random non-noise genre
       and generate an inhabited page for it. (Legacy — not position-aware) */
    findAnyNextInhabitedPage(step) {
      const nonNoiseGenres = REGION_GENRES.filter(g => g.kind !== 'noise');
      const pick = nonNoiseGenres[Math.floor(Math.random() * nonNoiseGenres.length)];
      return app.library.generateInhabitedPage(pick.kind, step);
    },

    /* Position-aware next inhabited page — statistical detection approach.
       Instead of generating pages with templates, scans through nearby
       page numbers and uses detectRussianText() to find pages that
       statistically resemble coherent Russian text. True discovery
       in the infinite library.

       1. Get current page number from coords.
       2. Spiral scan forward/backward through page numbers.
       3. Use detectRussianText() to score each candidate.
       4. Return the best-scoring page found (or above threshold).
       5. Fallback: return best page even if below threshold. */
    findNextInhabitedFromCoords(coords, step) {
      const number = app.library.coordinatesToNumber(coords);

      /* Scan in both directions, up to 100 pages */
      const result = scanForInhabited(number, 0, 100);

      if (result) {
        /* Add backward-compatible fields */
        result.coordinates = result.coords;
        result.regionGenre = {
          kind: result.detection.kind,
          label: result.detection.label,
          icon: result.detection.kind === 'russian' ? '📖'
              : result.detection.kind === 'sparse' ? '🌫️' : '🔇',
        };
        result.scanDistance = Math.abs(result.offset || 0);
        return result;
      }

      /* Absolute fallback — return current page with detection */
      try {
        const indices = numberToIndices(number);
        const text = indicesToString(indices);
        const detection = detectRussianText(text);
        const xy = coordinatesToXY(coords);
        return {
          number,
          coordinates: coords,
          coords,
          xy,
          text,
          detection,
          regionGenre: { kind: detection.kind, label: detection.label, icon: '🔇' },
          scanned: 0,
          scanDistance: -1,
          belowThreshold: true,
        };
      } catch {
        return null;
      }
    },

    /* Scan nearby hexes for inhabited regions.
       Returns array of { dx, dy, dist, genre } for non-noise hexes
       within maxDist (hex distance). Useful for the distance map. */
    scanInhabitedNearby(x, y, maxDist) {
      const limit = maxDist || 2;
      const results = [];
      for (let dist = 1; dist <= limit; dist++) {
        for (let dq = -dist; dq <= dist; dq++) {
          for (let dr = -dist; dr <= dist; dr++) {
            if (dq === 0 && dr === 0) continue;
            const hexDist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
            if (hexDist !== dist) continue;
            const region = classifyRegion(x + dq, y + dr);
            if (region.kind !== 'noise') {
              results.push({ dx: dq, dy: dr, dist, genre: region });
            }
          }
        }
      }
      return results;
    },

    /* Genre color for map rendering */
    GENRE_COLORS: {
      dialogue: '#5eb5f7',
      diary: '#e84670',
      post: '#1d9bf0',
      log: '#00ff41',
      text: '#c4956a',
      noise: '#4e5c6e',
    },

    parseAnyAddress(raw, kind) {
      const value = String(raw || "").trim();
      if (!value) throw new Error("Нечего распознавать.");
      if (value.includes("#/page/")) {
        const pagePart = value.split("#/page/").pop().split("?")[0];
        const parts = pagePart.split("/").filter(Boolean);
        /* New coordinate format: h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}/s/{seed_b64url} */
        const coords = {};
        for (let i = 0; i < parts.length - 1; i += 2) {
          switch (parts[i]) {
            case 's': coords.sector = parts[i + 1]; break;
            case 'h': coords.hall = parts[i + 1]; break;
            case 'w': coords.wall = parts[i + 1]; break;
            case 'sh': coords.shelf = parts[i + 1]; break;
            case 'v': coords.volume = parts[i + 1]; break;
            case 'p': coords.page = parts[i + 1]; break;
          }
        }
        if (coords.sector || coords.hall) {
          /* If sector is present, decode it — could be base64url (new) or decimal (old) */
          if (coords.sector) {
            const sectorStr = String(coords.sector);
            /* Old format: sector starts first and is decimal */
            /* New format: sector is last and is base64url */
            /* Heuristic: if sector contains only digits, treat as decimal; otherwise base64url */
            if (/^\d+$/.test(sectorStr)) {
              coords.sector = BigInt(sectorStr);
            } else {
              coords.sector = app.library.b64ToNumber(sectorStr) + 1n;
            }
          }
          try { return app.library.coordinatesToNumber(coords); }
          catch { /* fall through to raw parse */ }
        }
        /* Legacy raw base64 page number */
        return app.library.b64ToNumber(pagePart);
      }
      if (kind === "b64" || /^[A-Za-z0-9_-]+$/.test(value)) {
        try { return app.library.b64ToNumber(value.replace(/[^A-Za-z0-9_-]/g, "")); }
        catch (error) { if (kind === "b64") throw new Error("Не удалось разобрать base64url."); }
      }
      return app.library.base36ToBigInt(value);
    },
    parseHighlight(searchParams) {
      const raw = searchParams.get("hl") || "";
      const match = raw.match(/^(\d+):(\d+)$/);
      return match ? { start: Number(match[1]), length: Number(match[2]) } : null;
    },
  };
})();
