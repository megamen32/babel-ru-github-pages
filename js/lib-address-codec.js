(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* Захватываем ссылки на модули при загрузке IIFE.
     lib-api.js позже удалит их из app.library (cleanup),
     но замыкание сохранит живую ссылку. */
  const _tokenTable = app.library._tokenTable;
  const _prefix = app.library._prefix;

  /* ═══════════════════════════════════════════════════════════
     АДРЕСНЫЙ КОДЕК — обратимая система: адрес ↔ страница
     ═══════════════════════════════════════════════════════════
     ДЕКОДИРОВАНИЕ:  адрес (BigInt) → поток битов →
                      префиксный декодер Level1 (тип токена) →
                      префиксный декодер Level2 (конкретный токен) →
                      текст страницы 4096 символов

     КОДИРОВАНИЕ:    текст → токены →
                      префиксные коды Level1 + Level2 →
                      поток битов → адрес (BigInt)

     Поиск: фраза → кодирование → адрес → честное место в библиотеке.

     Ключевое свойство: частые токены имеют короткие коды,
     поэтому страницы с человеческим текстом кодируются
     в меньшие адреса. Это и есть «гравитация языка».

     ТЕМПЕРАТУРНЫЙ СЛОЙ:
     decodeAddressToPage(address, totalBits, temperature)
       temperature = 1.0  → стандартные веса (по умолчанию)
       temperature < 1.0  → сглаживание весов → больше шум
       temperature > 1.0  → обострение → чаще частые токены

     Энкодинг всегда использует temperature=1.0 для обратимости. */

  const PAGE_LEN = 4096;

  /* ═══════════════════════════════════════════════════════════
     ТЕМПЕРАТУРНО-ЗАВИСИМЫЕ ДЕКОДЕРЫ
     ═══════════════════════════════════════════════════════════
     При temperature ≠ 1.0 пересчитываем Хаффман-коды для
     переходов конечного автомата (Level 1).
     Level 2 (токены внутри типа) не меняется —
     язык остаётся языком, меняется лишь «грамматика». */

  const _tempDecoderCache = new Map();

  function buildTemperatureStateDecoders(temperature) {
    if (temperature === 1.0) return null; // используем стандартные

    const cacheKey = temperature.toFixed(4);
    if (_tempDecoderCache.has(cacheKey)) return _tempDecoderCache.get(cacheKey);

    const tt = _tokenTable;
    const stateDecoders = new Array(tt.STATE_COUNT);

    for (let state = 0; state < tt.STATE_COUNT; state++) {
      const trans = tt.STATE_TRANSITIONS[state];
      const weights = trans.map(t => t.w);
      const adjusted = tt.applyTemperature(weights, temperature);
      stateDecoders[state] = _prefix.buildDecoder(adjusted);
    }

    _tempDecoderCache.set(cacheKey, stateDecoders);

    /* Ограничиваем размер кэша */
    if (_tempDecoderCache.size > 32) {
      const firstKey = _tempDecoderCache.keys().next().value;
      _tempDecoderCache.delete(firstKey);
    }

    return stateDecoders;
  }

  /* ═══════════════════════════════════════════════════════════
     ДЕКОДИРОВАНИЕ: адрес → страница
     ═══════════════════════════════════════════════════════════ */

  function decodeAddressToPage(address, totalBits, temperature) {
    const tt = _tokenTable;
    const table = tt.buildTokenTable();
    const { typeDecoders, stateDecoders: baseStateDecoders, STATE_TRANSITIONS, allTokens, typeOffsets } = table;
    const T = tt.T;

    /* Температурные декодеры для Level 1 (или стандартные при temp=1.0) */
    const temp = (typeof temperature === 'number' && temperature > 0) ? temperature : 1.0;
    const stateDecoders = (temp === 1.0) ? baseStateDecoders : (buildTemperatureStateDecoders(temp) || baseStateDecoders);

    const reader = _prefix.createBitReader(address, totalBits);
    const readBit = () => reader.readBit();

    let result = '';
    let state = tt.S.START;

    while (result.length < PAGE_LEN) {
      /* Level 1: определяем тип токена по текущему состоянию */
      const stateDec = stateDecoders[state];
      const transIdx = stateDec.decode(readBit);
      const trans = STATE_TRANSITIONS[state][transIdx];
      if (!trans) {
        /* Fallback: пробел */
        result += ' ';
        state = tt.S.AFTER_SPACE;
        continue;
      }

      const tokenType = trans.type;
      state = trans.ns;

      /* Level 2: определяем конкретный токен */
      if (tokenType === T.SPACE) {
        result += ' ';
      } else if (tokenType === T.NEWLINE) {
        result += '\n';
      } else if (tokenType === T.DOT) {
        result += '.';
      } else if (tokenType === T.RAW_CHAR) {
        /* RAW_CHAR: читаем 21-битный Unicode code point (0..0x10FFFF) */
        let cp = 0;
        for (let i = 0; i < 21; i++) {
          cp = (cp << 1) | readBit();
        }
        /* Проверяем валидность code point */
        if (cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF)) {
          result += String.fromCodePoint(cp);
        } else {
          result += '?'; /* невалидный code point → заменяем */
        }
      } else {
        /* Декодируем токен из Хаффмана для данного типа */
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

    /* Обрезаем до точной длины */
    if (result.length > PAGE_LEN) {
      result = result.slice(0, PAGE_LEN);
    }
    while (result.length < PAGE_LEN) {
      result += ' ';
    }

    return result;
  }

  /* ═══════════════════════════════════════════════════════════
     КОДИРОВАНИЕ: текст → адрес
     ═══════════════════════════════════════════════════════════
     Это обратная операция: текст → токены → префиксные коды → биты → BigInt.
     Позволяет найти «честный» адрес для любой фразы.
     Всегда использует temperature=1.0 (базовые веса) для обратимости. */

  function encodePageToAddress(text) {
    const tt = _tokenTable;
    const table = tt.buildTokenTable();
    const { typeDecoders, stateDecoders, STATE_TRANSITIONS, allTokens, typeOffsets } = table;
    const T = tt.T;

    /* Токенизируем текст */
    const tokenList = tt.tokenizeForEncoding(text, table);

    const ALG = app.config.ALG;
    const TOTAL_BITS = Number(8n * BigInt(ALG.pageLength));
    const writer = _prefix.createBitWriter(TOTAL_BITS);

    let state = tt.S.START;

    for (const token of tokenList) {
      const tokenType = tt.getTokenType(token, table);

      /* Level 1: кодируем тип токена */
      const transIdx = tt.getTransitionIndex(state, tokenType);
      if (transIdx < 0) {
        /* Токен несовместим с текущим состоянием — вставляем пробел */
        const spaceTransIdx = tt.getTransitionIndex(state, T.SPACE);
        if (spaceTransIdx >= 0) {
          stateDecoders[state].encode(spaceTransIdx, (b) => writer.writeBit(b));
          state = tt.getNextState(state, T.SPACE);
        }
        /* Пробуем снова */
        const retryTransIdx = tt.getTransitionIndex(state, tokenType);
        if (retryTransIdx < 0) continue; // пропускаем несовместимый токен
        stateDecoders[state].encode(retryTransIdx, (b) => writer.writeBit(b));
      } else {
        stateDecoders[state].encode(transIdx, (b) => writer.writeBit(b));
      }

      state = tt.getNextState(state, tokenType);

      /* Level 2: кодируем конкретный токен */
      if (tokenType === T.SPACE || tokenType === T.NEWLINE || tokenType === T.DOT) {
        /* Одинарные токены — Level 2 не нужен */
      } else if (tokenType === T.RAW_CHAR) {
        /* RAW_CHAR: 21-bit Unicode code point (0..0x10FFFF) — matches decoder */
        const cp = token.codePoint;
        for (let i = 20; i >= 0; i--) {
          writer.writeBit((cp >> i) & 1);
        }
      } else {
        /* Кодируем индекс токена в типе */
        const typeIdx = (typeof token === 'object' && token.isRaw)
          ? 0
          : allTokens[token].typeIndex;
        typeDecoders[tokenType].encode(typeIdx, (b) => writer.writeBit(b));
      }
    }

    return writer.toBigInt();
  }

  /* ═══════════════════════════════════════════════════════════
     ПОИСК: фраза → адрес + координаты
     ═══════════════════════════════════════════════════════════
     Честный поиск: фраза кодируется в адрес через префиксный кодек.
     Адрес — это реальное место, где фраза существует. */

  function searchPhraseToAddress(phrase, variant) {
    const normalized = phrase.toLowerCase().trim();
    if (!normalized) return null;

    /* Стратегия: кодируем фразу + естественный контекст в полную страницу.
       Чем длиннее и естественнее контекст, тем лучше выглядит страница.
       Параметр variant меняет сид контекста — разные варианты
       дают разные адреса для одной и той же фразы. */
    const v = variant || 1;
    const WORD_BANK = (window.BABEL_WORD_BANK || []);
    /* Берём случайные слова для контекста (но детерминировано из фразы + варианта) */
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
    }
    /* Variant влияет на сид: разные варианты → разный контекст → разные адреса */
    hash = ((hash << 5) - hash + v * 13337) | 0;
    function seededChoice(arr, idx) {
      return arr[Math.abs(hash + idx * 7919) % arr.length];
    }

    /* Фразу вставляем в разные позиции в зависимости от варианта:
       variant 1 → фраза в начале,
       variant 2+ → фраза после контекстного предложения */
    let pageText = '';
    if (v === 1) {
      pageText = normalized + '. ';
    } else {
      /* Предварительное контекстное предложение перед фразой */
      const preLen = 2 + (v % 5);
      const preWords = [];
      for (let w = 0; w < preLen; w++) {
        preWords.push(seededChoice(WORD_BANK, v * 100 + w));
      }
      pageText = preWords.join(' ') + '. ' + normalized + '. ';
    }

    /* Генерируем несколько предложений для контекста */
    for (let sent = 0; sent < 20; sent++) {
      const words = [];
      const len = 3 + Math.abs((hash + sent * 31) % 10);
      for (let w = 0; w < len; w++) {
        words.push(seededChoice(WORD_BANK, sent * 10 + w));
      }
      pageText += words.join(' ') + '. ';
    }

    /* Дополняем пробелами до 4096 */
    while (pageText.length < PAGE_LEN) {
      pageText += ' ';
    }
    pageText = pageText.slice(0, PAGE_LEN);

    /* 2. Кодируем страницу в адрес */
    const address = encodePageToAddress(pageText);

    /* 3. Находим позицию фразы в закодированной странице */
    /* Декодируем обратно для проверки (и для показа пользователю) */
    const ALG = app.config.ALG;
    const TOTAL_BITS = 8n * BigInt(ALG.pageLength);
    const decodedText = decodeAddressToPage(address, Number(TOTAL_BITS));
    const lowerDecoded = decodedText.toLowerCase();
    const phrasePos = lowerDecoded.indexOf(normalized);

    /* Если фраза не нашлась в декодированном тексте —
       пробуем посимвольный поиск по словам фразы */
    let foundPos = phrasePos;
    let foundLen = normalized.length;
    let phraseFound = phrasePos >= 0;

    if (!phraseFound) {
      /* Попробуем найти каждое слово фразы отдельно */
      const phraseWords = normalized.split(/\s+/).filter(Boolean);
      let bestPos = -1;
      for (const word of phraseWords) {
        const wp = lowerDecoded.indexOf(word);
        if (wp >= 0) {
          if (bestPos < 0 || wp < bestPos) bestPos = wp;
        }
      }
      if (bestPos >= 0) {
        foundPos = bestPos;
        foundLen = phraseWords[0].length;
        phraseFound = true;
      } else {
        /* Последняя попытка: ищем фразу без учёта пробелов.
           Это нужно когда неизвестное слово (например "hello")
           при кодировании разбивается на RAW_CHAR символы,
           а FSM вставляет пробелы между ними: "hel l o".
           Убираем пробелы из декодированного текста и ищем там. */
        const strippedDecoded = lowerDecoded.replace(/\s+/g, '');
        const strippedPhrase = normalized.replace(/\s+/g, '');
        const strippedPos = strippedDecoded.indexOf(strippedPhrase);
        if (strippedPos >= 0) {
          /* Маппим позицию обратно в исходный текст с пробелами.
             Ищем ближайшую позицию в оригинальном тексте. */
          let charCount = 0;
          for (let i = 0; i < decodedText.length; i++) {
            if (decodedText[i] !== ' ' && decodedText[i] !== '\n') {
              if (charCount === strippedPos) {
                foundPos = i;
                break;
              }
              charCount++;
            }
          }
          /* Длина подсветки — оригинальная длина фразы */
          foundLen = normalized.length;
          phraseFound = true;
        } else {
          /* Фраза не найдена — помечаем начало, но сигнализируем об ошибке */
          foundPos = 0;
          foundLen = 0;
          phraseFound = false;
        }
      }
    }

    return {
      address,
      text: decodedText,
      phrasePos: foundPos >= 0 ? foundPos : 0,
      phraseLen: foundLen,
      phraseFound,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     КЛАССИФИКАЦИЯ СТРАНИЦЫ
     ═══════════════════════════════════════════════════════════ */

  function classifyDecodedPage(text) {
    /* Считаем отношение «человеческих» символов к общему числу */
    const len = text.length;
    if (len === 0) return { kind: 'empty', label: 'Пусто', score: 0, icon: '📭' };

    let humanChars = 0;
    let wordChars = 0;
    let wordCount = 0;
    let inWord = false;

    for (let i = 0; i < len; i++) {
      const ch = text[i];
      const code = ch.codePointAt(0);

      /* Человеческие символы: буквы, пробелы, пунктуация, цифры */
      if (
        (code >= 0x0430 && code <= 0x044F) || // русские строчные
        (code >= 0x0410 && code <= 0x042F) || // русские прописные
        code === 0x0451 || code === 0x0401 ||  // ё/Ё
        (code >= 0x0061 && code <= 0x007A) || // английские строчные
        (code >= 0x0041 && code <= 0x005A) || // английские прописные
        (code >= 0x0030 && code <= 0x0039) || // цифры
        code === 0x0020 || code === 0x000A ||  // пробел, newline
        code === 0x002E || code === 0x002C ||  // точка, запятая
        code === 0x0021 || code === 0x003F ||  // ! ?
        code === 0x003B || code === 0x003A ||  // ; :
        code === 0x2014 ||                       // —
        code === 0x2026                          // …
      ) {
        humanChars++;
      }

      /* Считаем слова */
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

    /* Классификация на основе статистики */
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
    if (humanRatio > 0.1) {
      return { kind: 'raw', label: 'Хаос', score: humanRatio * 0.1, icon: '💀' };
    }
    return { kind: 'raw', label: 'Глубокий хаос', score: 0, icon: '🕳️' };
  }

  /* ═══════════════════════════════════════════════════════════
     ЭКСПОРТ
     ═══════════════════════════════════════════════════════════ */

  app.library = app.library || {};
  app.library._addressCodec = {
    decodeAddressToPage,
    encodePageToAddress,
    searchPhraseToAddress,
    classifyDecodedPage,
    buildTemperatureStateDecoders,
    PAGE_LEN,
  };
})();
