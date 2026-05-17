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
  const _tokens = app.library._tokens;

  /* ═══════════════════════════════════════════════════════════
     КЛАССИФИКАТОР СТРАНИЦЫ
     ═══════════════════════════════════════════════════════════
     С токенным декодером классификация становится проще:
     температура z координаты определяет «обитаемость».

     Старые статистические методы сохранены для совместимости
     с legacy-системой (base64 URL, search). */

  function classifyPageText(text) {
    const lines = String(text).split(/\n+/).filter(l => l.trim());
    const tgPattern = /^\[\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s*(am|pm)?\]\s+[^:]{2,40}:/i;
    let tgLines = 0;
    let nameColonLines = 0;
    const logPattern = /^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}/;
    let logLines = 0;
    const postPattern = /^@\S+/;
    let postLines = 0;
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
     СТАТИСТИЧЕСКИЙ ДЕТЕКТОР РУССКОГО ТЕКСТА (legacy)
     ═══════════════════════════════════════════════════════════ */

  const RU_EXPECTED_FREQ = {
    'о': 0.1097, 'е': 0.0845, 'а': 0.0801, 'и': 0.0735, 'н': 0.0670,
    'т': 0.0626, 'с': 0.0547, 'р': 0.0473, 'в': 0.0454, 'л': 0.0440,
    'к': 0.0349, 'м': 0.0321, 'д': 0.0298, 'п': 0.0281, 'у': 0.0262,
    'я': 0.0201, 'ы': 0.0190, 'ь': 0.0174, 'г': 0.0170, 'з': 0.0165,
    'б': 0.0159, 'ч': 0.0144, 'й': 0.0121, 'х': 0.0097, 'ж': 0.0094,
    'ш': 0.0073, 'ю': 0.0064, 'ц': 0.0048, 'щ': 0.0036, 'э': 0.0032,
    'ф': 0.0026, 'ъ': 0.0004, 'ё': 0.0004,
  };

  const RU_VOWEL_SET = new Set('аеёиоуыэюя');

  const RU_COMMON_BIGRAMS = new Set([
    'ст','но','то','на','по','не','он','ни','ко','ра',
    'ал','ли','ен','ов','во','пр','ка','ро','ан','ре',
    'со','те','ат','ор','ет','ва','ав','ло','ла','ве',
    'ас','ел','та','па','ин','ак','са','де','мо','ле',
    'вс','св','тр','ед','ри','ов','ся','ть','ый','ой',
    'ий','ая','ое','ые','ся','ть','ер','ие','ну','вы',
    'ми','от','об','до','го','че','ме','ым','им','ес',
  ]);

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

    const ruLetters = t.match(/[а-яё]/gi) || [];
    const totalRuLetters = ruLetters.length;
    const totalChars = t.length;

    if (totalRuLetters < 20) {
      return { score: 0, kind: 'noise', label: 'Шум' };
    }

    const ruDensity = totalRuLetters / totalChars;
    const ruLower = ruLetters.map(c => c.toLowerCase());
    const freqMap = {};
    for (const c of ruLower) freqMap[c] = (freqMap[c] || 0) + 1;

    let chiSq = 0;
    for (const letter of Object.keys(RU_EXPECTED_FREQ)) {
      const expected = RU_EXPECTED_FREQ[letter];
      const observed = (freqMap[letter] || 0) / totalRuLetters;
      chiSq += (observed - expected) ** 2 / expected;
    }
    const freqScore = Math.max(0, Math.min(1, 1 - chiSq / 0.3));

    const vowelCount = ruLower.filter(c => RU_VOWEL_SET.has(c)).length;
    const vowelRatio = vowelCount / totalRuLetters;
    const vowelDev = Math.abs(vowelRatio - 0.40);
    const vowelScore = Math.max(0, 1 - vowelDev * 8);

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
    const bigramScore = Math.min(1, bigramRate / 0.18);

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

    const spaceCount = (t.match(/ /g) || []).length;
    const spaceRatio = spaceCount / totalChars;
    const spaceDev = Math.abs(spaceRatio - 0.17) / 0.17;
    const spaceScore = Math.max(0, 1 - spaceDev * 2);

    const punctCount = (t.match(/[.!?]/g) || []).length;
    const punctRate = punctCount / totalChars;
    const punctScore = Math.min(1, punctRate / 0.005);

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
     СКАНИРОВАНИЕ (legacy — для base64 адресов)
     ═══════════════════════════════════════════════════════════ */

  function scanForInhabited(startNumber, direction, maxScan) {
    const dir = direction || 0;
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

    if (bestResult) {
      bestResult.belowThreshold = true;
      return bestResult;
    }

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
     ОБИТАЕМЫЙ АТЛАС — регионы гекс-карты
     ═══════════════════════════════════════════════════════════ */

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

  function getInhabitedPageIndices(x, y, wall, shelf, volume, page) {
    const region = classifyRegion(x, y);
    const seed = `inhabited:${x}:${y}:${wall}:${shelf}:${volume}:${page}`;
    const rng = rngFrom(seed);
    const subSeed = `${seed}:v${Math.floor(rng() * 100000)}`;
    const indices = createFillerIndices(region.kind, subSeed, ALG.pageLength);
    return { indices, genre: region };
  }

  /* ---- Export ---- */

  app.library._classifier = {
    classifyPageText,
    detectRussianText,
    scanForInhabited,
    REGION_GENRES,
    classifyRegion,
    getInhabitedPageIndices,
  };
})();
