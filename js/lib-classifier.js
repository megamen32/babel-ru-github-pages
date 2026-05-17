(() => {
  const app = window.BabelApp;
  const { ALG } = app.config;
  const { rngFrom, indicesToString } = app.utils;
  const {
    numberToIndices,
    rawIndexToCoordinates,
    coordinatesToXY,
    maxPageNumber,
  } = app.library._core;
  const {
    createFillerIndices,
  } = app.library._fillers;

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

  /* ---- Export to temporary namespace ---- */

  app.library._classifier = {
    classifyPageText,
    detectRussianText,
    scanForInhabited,
    REGION_GENRES,
    classifyRegion,
    getInhabitedPageIndices,
  };
})();
