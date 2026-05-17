(() => {
  const app = window.BabelApp;
  const { ALG, SEARCH_VARIANTS_DEFAULT, SEARCH_VARIANTS_MAX, WORD_BANK } = app.config;
  const { clamp, rngFrom, tokenizeText, indicesToString } = app.utils;

  const _core = app.library._core;
  const _fillers = app.library._fillers;
  const _classifier = app.library._classifier;
  const _tokens = app.library._tokens;
  const _addressCodec = app.library._addressCodec;
  const _coordPerm = app.library._coordPerm;
  const _tokenTable = app.library._tokenTable;
  const _prefix = app.library._prefix;

  const {
    BITS_PER_CHAR, CHAR_MASK, TOTAL_BITS, BIT_MASK,
    maxPageNumber,
    PERM_C, PERM_OFFSET, PERM_I, modInvPow2,
    indicesToNumber, numberToIndices,
    textToNumber, numberToText, fixedPageText,
    rawIndexToCoordinates, coordinatesToRawIndex,
    xyToHallXY, hallToXY, xyToCoordinates, coordinatesToXY,
    xyToHallIndex, hallIndexToXY,
    PAGES_PER_HALL, zToBorges, borgesToZ,
    createWordFillerIndices, createNoiseFillerIndices,
    decodePageByCoords,
    USE_PREFIX_CODEC,
  } = _core;

  const {
    createDialogueFillerIndices,
    createPostFillerIndices,
    createDiaryFillerIndices,
    createLogFillerIndices,
    createHumanFillerIndices,
    createFillerIndices,
    choosePosition,
  } = _fillers;

  const {
    classifyPageText,
    detectRussianText,
    scanForInhabited,
    REGION_GENRES,
    classifyRegion,
    getInhabitedPageIndices,
  } = _classifier;

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — Префиксный кодек + обратная совместимость
     ═══════════════════════════════════════════════════════════ */

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

    /* ─── Флаг архитектуры ─── */
    USE_PREFIX_CODEC,

    /* ─── Загрузка словаря ─── */
    async loadTokenDictionary() {
      const result = await _tokenTable.loadDictionary();
      if (result) {
        /* Сбрасываем кэш таблицы при загрузке нового словаря */
        console.log('[babel] Token dictionary loaded, rebuilding table...');
      }
      return result;
    },
    isTokenDictionaryLoaded() {
      return _tokenTable.isDictionaryLoaded();
    },

    /* ─── Температурная коррекция ─── */
    applyTemperature(weights, temp) {
      return _tokenTable.applyTemperature(weights, temp);
    },

    /* ═══════════════════════════════════════════════════════════
       ПРЕФИКСНЫЙ КОДЕК — новые API
       ═══════════════════════════════════════════════════════════ */

    /* Декодирование: BigInt-адрес → страница */
    decodeAddressToPage(address) {
      return _addressCodec.decodeAddressToPage(address, Number(TOTAL_BITS));
    },

    /* Кодирование: текст → BigInt-адрес (ЧЕСТНЫЙ энкодинг) */
    encodePageToAddress(text) {
      return _addressCodec.encodePageToAddress(text);
    },

    /* Поиск фразы: фраза → адрес → координаты (честный) */
    encodePhraseToCoords(phrase) {
      const result = _addressCodec.searchPhraseToAddress(phrase);
      if (!result) return null;

      /* Конвертируем адрес в координаты */
      const coords = _coordPerm.internalAddressToCoord(result.address);
      const fullCoords = xyToCoordinates(coords.x, coords.y, coords.z);
      const number = app.library.coordinatesToNumber(fullCoords);
      const xy = coordinatesToXY(fullCoords);

      return {
        number,
        coordinates: fullCoords,
        xy,
        phrase,
        position: result.phrasePos,
        text: result.text,
        variant: 1,
        range: { start: result.phrasePos, length: result.phraseLen },
        mode: 'prefix',
      };
    },

    /* Классификация страницы по тексту (префиксный кодек) */
    classifyPageByText(text) {
      return _addressCodec.classifyDecodedPage(text);
    },

    /* ─── Заголовки страниц ─── */

    pageTitle(coordinates) {
      return `X:${coordinates.x} Y:${coordinates.y} Z:${coordinates.z}`;
    },
    pageTitleBorges(coordinates) {
      return `Сектор ${coordinates.sector} · Зал ${coordinates.hall} · Стена ${coordinates.wall} · Полка ${coordinates.shelf} · Том ${coordinates.volume} · Лист ${coordinates.page}`;
    },

    /* ─── Токенный декодер — ОСНОВНОЙ метод ─── */

    decodePage(x, y, z, forcedTokens) {
      return decodePageByCoords(x, y, z, forcedTokens);
    },

    /* Получить страницу по координатам */
    getPageByXY(x, y, z) {
      const bz = typeof z === 'bigint' ? z : BigInt(z || 1);
      const bx = typeof x === 'bigint' ? x : BigInt(x || 0);
      const by = typeof y === 'bigint' ? y : BigInt(y || 0);
      const text = decodePageByCoords(bx, by, bz);
      const indices = tokenizeText(text);
      while (indices.length < ALG.pageLength) indices.push(0);
      if (indices.length > ALG.pageLength) indices.length = ALG.pageLength;
      const coords = xyToCoordinates(bx, by, bz);
      return { text, indices, coordinates: coords };
    },

    /* ─── Температура и классификация ─── */

    computeTemperature(z) {
      return _tokenTable.computeTemperature(BigInt(z));
    },
    classifyPageByTemp(z) {
      /* Legacy: классификация по z через температуру */
      const temp = app.library.computeTemperature(z);
      if (temp < 0.2) return { kind: 'text', label: 'Читаемый текст', icon: '📖' };
      if (temp < 0.4) return { kind: 'dialogue', label: 'Разговорный', icon: '💬' };
      if (temp < 0.6) return { kind: 'sparse', label: 'Разреженный', icon: '🌫️' };
      if (temp < 0.8) return { kind: 'noise', label: 'Шум', icon: '🔇' };
      return { kind: 'raw', label: 'Хаос', icon: '💀' };
    },

    /* ─── Обитаемый слой — публичные API ─── */

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

    /* ─── URL ─── */

    coordsToPageUrl(coords, params) {
      const c = {
        x: typeof coords.x === 'bigint' ? coords.x : BigInt(coords.x || 0),
        y: typeof coords.y === 'bigint' ? coords.y : BigInt(coords.y || 0),
        z: typeof coords.z === 'bigint' ? coords.z : BigInt(coords.z || 1),
      };
      /* Используем base36 для компактных URL: 
         BigInt → base36 сокращает длину в ~2 раза */
      const base = `#/x/${c.x.toString(36)}/y/${c.y.toString(36)}/z/${c.z.toString(36)}`;
      if (params) {
        const qs = new URLSearchParams(params).toString();
        return `${base}?${qs}`;
      }
      return base;
    },

    randomPageCoords() {
      const x = BigInt(Math.floor(Math.random() * 200000) - 100000);
      const y = BigInt(Math.floor(Math.random() * 200000) - 100000);
      const z = 1n + BigInt(Math.floor(Math.random() * 1000000));
      const coords = xyToCoordinates(x, y, z);
      return coords;
    },

    xyToCoordinates, coordinatesToXY, xyToHallXY, hallToXY,
    PAGES_PER_HALL, zToBorges, borgesToZ,

    getBookSpine(x, y, z) {
      try {
        const coords = xyToCoordinates(x, y, z);
        const text = decodePageByCoords(BigInt(x), BigInt(y), BigInt(z));
        let spine = '';
        for (let i = 0; i < text.length && spine.length < 25; i++) {
          if (text[i] !== ' ' && text[i] !== '\n') spine += text[i];
        }
        return spine || 'пустая полка';
      } catch { return ""; }
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

    /* ─── Кодирования ─── */

    bytesToBase64Url(bytes) {
      const B64URL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
      let num = 0n;
      for (const byte of bytes) num = (num << 8n) | BigInt(byte);
      if (num === 0n) return '0';
      let result = '';
      const base = 64n;
      while (num > 0n) {
        result = B64URL[Number(num % base)] + result;
        num /= base;
      }
      return result;
    },
    base64UrlToBytes(value) {
      const B64URL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
      const base = 64n;
      let num = 0n;
      for (const char of String(value || '')) {
        const idx = B64URL.indexOf(char);
        if (idx < 0) continue;
        num = num * base + BigInt(idx);
      }
      if (num === 0n) return new Uint8Array([0]);
      const bytes = [];
      while (num > 0n) { bytes.push(Number(num & 255n)); num >>= 8n; }
      return Uint8Array.from(bytes.reverse());
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

    /* ═══════════════════════════════════════════════════════════
       ПОИСК — честный через префиксный кодек + legacy fallback
       ═══════════════════════════════════════════════════════════ */

    createSearchVariants(phraseRaw, mode, countRaw) {
      const phrase = app.utils.normalizeText(phraseRaw);
      if (!phrase) throw new Error("После нормализации фраза пуста.");
      const count = clamp(Math.floor(Number(countRaw) || SEARCH_VARIANTS_DEFAULT), 1, SEARCH_VARIANTS_MAX);
      const variants = [];

      /* Если включён префиксный кодек — используем честный поиск */
      if (USE_PREFIX_CODEC && _addressCodec) {
        for (let variant = 1; variant <= count; variant++) {
          const result = app.library.encodePhraseToCoords(phrase);
          if (!result) continue;
          result.variant = variant;
          variants.push(result);
        }
        if (variants.length > 0) return variants;
      }

      /* Legacy fallback: PRNG-based search */
      for (let variant = 1; variant <= count; variant++) {
        const result = _tokens.findPhraseInTokenSpace(phrase);
        if (!result) continue;

        const coords = xyToCoordinates(result.x, result.y, result.z);
        const number = app.library.coordinatesToNumber(coords);
        const xy = coordinatesToXY(coords);

        variants.push({
          mode: mode || 'tokens',
          number,
          coordinates: coords,
          xy,
          phrase,
          position: result.phrasePos,
          text: result.text,
          variant,
          range: { start: result.phrasePos, length: result.phraseLen },
        });
      }
      return variants;
    },

    randomPageNumber() {
      return indicesToNumber(createNoiseFillerIndices(`${Date.now()}:${Math.random()}`, ALG.pageLength));
    },
    randomHallXY() {
      return { x: Math.floor(Math.random() * 200000) - 100000, y: Math.floor(Math.random() * 200000) - 100000 };
    },

    findRandomHallOfGenre(kind, maxTries) {
      const limit = maxTries || 500;
      for (let i = 0; i < limit; i++) {
        const x = Math.floor(Math.random() * 200000) - 100000;
        const y = Math.floor(Math.random() * 200000) - 100000;
        if (classifyRegion(x, y).kind === kind) return { x, y };
      }
      return { x: Math.floor(Math.random() * 200000) - 100000, y: Math.floor(Math.random() * 200000) - 100000 };
    },

    /* Генерация обитаемой страницы */
    generateInhabitedPage(genre, step) {
      const seed = `genre-nav:${genre}:${step}`;
      const rng = rngFrom(seed);
      const wb = WORD_BANK;
      const w1 = wb[Math.floor(rng() * wb.length)];
      const w2 = wb[Math.floor(rng() * wb.length)];
      const phrase = app.utils.normalizeText(`${w1} ${w2}`);

      /* Пробуем честный поиск через префиксный кодек */
      if (USE_PREFIX_CODEC && _addressCodec) {
        const result = app.library.encodePhraseToCoords(phrase);
        if (result) return { ...result, mode: genre };
      }

      /* Legacy fallback */
      const result = _tokens.findPhraseInTokenSpace(phrase);
      if (!result) {
        const x = BigInt(Math.floor(rng() * 200000) - 100000);
        const y = BigInt(Math.floor(rng() * 200000) - 100000);
        const z = 1n + BigInt(Math.floor(rng() * 100000));
        const text = decodePageByCoords(x, y, z);
        const coords = xyToCoordinates(x, y, z);
        return { mode: genre, number: 0n, coordinates: coords, xy: { x, y }, phrase, position: 0, text, variant: 1, range: { start: 0, length: 0 } };
      }

      const coords = xyToCoordinates(result.x, result.y, result.z);
      const number = app.library.coordinatesToNumber(coords);
      const xy = coordinatesToXY(coords);
      return {
        mode: genre,
        number,
        coordinates: coords,
        xy,
        phrase,
        position: result.phrasePos,
        text: result.text,
        variant: 1,
        range: { start: result.phrasePos, length: result.phraseLen },
      };
    },

    /* Scan forward */
    scanNextInhabitedPage(startNumber, genre, maxScan) {
      const limit = maxScan || 200;
      const startCoords = rawIndexToCoordinates(app.library.unpermuteIndex(startNumber));

      for (let i = 1; i <= limit; i++) {
        try {
          const newZ = BigInt(startCoords.z) + BigInt(i);
          if (newZ < 1n) continue;
          const text = decodePageByCoords(BigInt(startCoords.x), BigInt(startCoords.y), newZ);
          /* Классификация: используем текстовый анализатор если префиксный кодек */
          const classification = USE_PREFIX_CODEC && _addressCodec
            ? _addressCodec.classifyDecodedPage(text)
            : _tokens.classifyPageByTemp(newZ);
          const coords = xyToCoordinates(startCoords.x, startCoords.y, newZ);
          const xy = coordinatesToXY(coords);
          return { number: app.library.coordinatesToNumber(coords), coords, xy, text, classification, scanned: i };
        } catch { continue; }
      }
      return null;
    },

    findAnyNextInhabitedPage(step) {
      const nonNoiseGenres = REGION_GENRES.filter(g => g.kind !== 'noise');
      const pick = nonNoiseGenres[Math.floor(Math.random() * nonNoiseGenres.length)];
      return app.library.generateInhabitedPage(pick.kind, step);
    },

    /* Position-aware next inhabited page */
    findNextInhabitedFromCoords(coords, step) {
      const x = typeof coords.x === 'bigint' ? coords.x : BigInt(coords.x || 0);
      const y = typeof coords.y === 'bigint' ? coords.y : BigInt(coords.y || 0);
      let z = typeof coords.z === 'bigint' ? coords.z : BigInt(coords.z || 1);

      for (let i = 1; i <= 200; i++) {
        const newZ = z + BigInt(i);
        const text = decodePageByCoords(x, y, newZ);

        let detection, temp;
        if (USE_PREFIX_CODEC && _addressCodec) {
          detection = _addressCodec.classifyDecodedPage(text);
          temp = 1.0 - (detection.score || 0);
        } else {
          temp = _tokens.computeTemperature(newZ);
          detection = _tokens.classifyPageByTemp(newZ);
        }

        /* Пропускаем шум и хаос — ищем обитаемую страницу */
        if (detection.kind === 'raw' || detection.kind === 'noise') continue;

        const newCoords = xyToCoordinates(x, y, newZ);
        const xy = { x, y };

        return {
          number: app.library.coordinatesToNumber(newCoords),
          coordinates: newCoords,
          coords: newCoords,
          xy,
          text,
          detection,
          regionGenre: {
            kind: detection.kind,
            label: detection.label,
            icon: detection.icon,
          },
          scanned: i,
          scanDistance: i,
          temperature: temp,
        };
      }
      return null;
    },

    scanInhabitedNearby(x, y, maxDist) {
      const limit = maxDist || 6;
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

        if (parts[0] === 'x' && parts.length >= 4) {
          const parsed = {};
          for (let i = 0; i < parts.length - 1; i += 2) {
            switch (parts[i]) {
              case 'x': parsed.x = parts[i + 1]; break;
              case 'y': parsed.y = parts[i + 1]; break;
              case 'z': parsed.z = parts[i + 1]; break;
              case 'w': parsed.wall = parts[i + 1]; break;
              case 'sh': parsed.shelf = parts[i + 1]; break;
              case 'v': parsed.volume = parts[i + 1]; break;
              case 'p': parsed.page = parts[i + 1]; break;
            }
          }
          if (parsed.x != null && parsed.y != null) {
            try {
              const coords = xyToCoordinates(parsed.x, parsed.y, parsed.z || parsed.wall && borgesToZ(BigInt(parsed.wall||1), BigInt(parsed.shelf||1), BigInt(parsed.volume||1), BigInt(parsed.page||1)) || 1);
              return app.library.coordinatesToNumber(coords);
            } catch { /* fall through */ }
          }
        }

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
          if (coords.sector) {
            const sectorStr = String(coords.sector);
            if (/^\d+$/.test(sectorStr)) {
              coords.sector = BigInt(sectorStr);
            } else {
              coords.sector = app.library.b64ToNumber(sectorStr) + 1n;
            }
          }
          try { return app.library.coordinatesToNumber(coords); }
          catch { /* fall through to raw parse */ }
        }
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

  /* ---- Keep private namespaces alive ----
     They are referenced at runtime by functions in lib-address-codec.js,
     lib-token-table.js, and lib-core.js. Deleting them would cause
     "Cannot read properties of undefined" errors. */

  /* Восстанавливаем приватные пространства имён на новом объекте.
     Функции в lib-token-table.js и lib-address-codec.js обращаются
     к app.library._prefix и app.library._tokenTable в рантайме. */
  app.library._prefix = _prefix;
  app.library._tokenTable = _tokenTable;
  app.library._addressCodec = _addressCodec;
  app.library._coordPerm = _coordPerm;
  app.library._core = _core;
  app.library._fillers = _fillers;
  app.library._classifier = _classifier;
  app.library._tokens = _tokens;
})();
