(() => {
  const app = window.BabelApp;
  const { ALG } = app.config;
  const { clamp, rngFrom, tokenizeText } = app.utils;
  const {
    createWordFillerIndices,
    createNoiseFillerIndices,
  } = app.library._core;

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

  function choosePosition(mode, phraseLength, rng) {
    const maxPosition = ALG.pageLength - phraseLength;
    if (mode === "empty") return Math.max(0, Math.floor((ALG.pageLength - phraseLength) / 2));
    return clamp(Math.floor(rng() * Math.max(1, maxPosition + 1)), 0, maxPosition);
  }

  /* ---- Export to temporary namespace ---- */

  app.library._fillers = {
    createDialogueFillerIndices,
    createPostFillerIndices,
    createDiaryFillerIndices,
    createLogFillerIndices,
    createHumanFillerIndices,
    createFillerIndices,
    choosePosition,
  };
})();
