(() => {
  const app = window.BabelApp;
  const { ALG, SEARCH_VARIANTS_DEFAULT, SEARCH_VARIANTS_MAX, WORD_BANK } = app.config;
  const { clamp, rngFrom, tokenizeText, indicesToString } = app.utils;

  const _core = app.library._core;
  const _fillers = app.library._fillers;
  const _classifier = app.library._classifier;
  const _tokens = app.library._tokens;

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
     PUBLIC API — Токенный декодер + обратная совместимость
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

    /* ---- Заголовки страниц ---- */
    pageTitle(coordinates) {
      return `X:${coordinates.x} Y:${coordinates.y} Z:${coordinates.z}`;
    },
    pageTitleBorges(coordinates) {
      return `Сектор ${coordinates.sector} · Зал ${coordinates.hall} · Стена ${coordinates.wall} · Полка ${coordinates.shelf} · Том ${coordinates.volume} · Лист ${coordinates.page}`;
    },

    /* ---- Токенный декодер — ОСНОВНОЙ метод ---- */
    decodePage(x, y, z, forcedTokens) {
      return decodePageByCoords(x, y, z, forcedTokens);
    },

    /* Получить страницу по координатам (токенный декодер) */
    getPageByXY(x, y, z) {
      const bz = BigInt(z || 1);
      const bx = BigInt(x || 0);
      const by = BigInt(y || 0);
      const text = decodePageByCoords(bx, by, bz);
      const indices = tokenizeText(text);
      while (indices.length < ALG.pageLength) indices.push(0);
      if (indices.length > ALG.pageLength) indices.length = ALG.pageLength;
      const coords = xyToCoordinates(bx, by, bz);
      return { text, indices, coordinates: coords };
    },

    /* ---- Температура и классификация ---- */
    computeTemperature(z) {
      return _tokens.computeTemperature(z);
    },
    classifyPageByTemp(z) {
      return _tokens.classifyPageByTemp(z);
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

    /* Coordinate-based page URL
       Формат: #/x/{x}/y/{y}/z/{z} */
    coordsToPageUrl(coords, params) {
      const c = {
        x: BigInt(coords.x || 0),
        y: BigInt(coords.y || 0),
        z: BigInt(coords.z || 1),
      };
      const base = `#/x/${c.x}/y/${c.y}/z/${c.z}`;
      if (params) {
        const qs = new URLSearchParams(params).toString();
        return `${base}?${qs}`;
      }
      return base;
    },

    randomPageCoords() {
      const x = BigInt(Math.floor(Math.random() * 2000) - 1000);
      const y = BigInt(Math.floor(Math.random() * 2000) - 1000);
      /* Малый z → человекоподобный текст */
      const z = 1n + BigInt(Math.floor(Math.random() * 10000));
      return { x, y, z, sector: 1n, hall: 1n, wall: 1n, shelf: 1n, volume: 1n, page: z };
    },

    xyToCoordinates, coordinatesToXY, xyToHallXY, hallToXY,
    PAGES_PER_HALL, zToBorges, borgesToZ,

    getBookSpine(x, y, z) {
      try {
        const coords = xyToCoordinates(x, y, z);
        const text = decodePageByCoords(BigInt(x), BigInt(y), BigInt(z));
        /* Берём первые 25 непробельных символов */
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

    /* ---- Кодирования ---- */
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
       ПОИСК — через токенный декодер с forced-токенами
       ═══════════════════════════════════════════════════════════ */

    createSearchVariants(phraseRaw, mode, countRaw) {
      const phrase = app.utils.normalizeText(phraseRaw);
      if (!phrase) throw new Error("После нормализации фраза пуста.");
      const count = clamp(Math.floor(Number(countRaw) || SEARCH_VARIANTS_DEFAULT), 1, SEARCH_VARIANTS_MAX);
      const variants = [];

      for (let variant = 1; variant <= count; variant++) {
        /* Используем токенный декодер для поиска */
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
      return { x: Math.floor(Math.random() * 2000) - 1000, y: Math.floor(Math.random() * 2000) - 1000 };
    },

    findRandomHallOfGenre(kind, maxTries) {
      const limit = maxTries || 200;
      for (let i = 0; i < limit; i++) {
        const x = Math.floor(Math.random() * 2000) - 1000;
        const y = Math.floor(Math.random() * 2000) - 1000;
        if (classifyRegion(x, y).kind === kind) return { x, y };
      }
      return { x: Math.floor(Math.random() * 2000) - 1000, y: Math.floor(Math.random() * 2000) - 1000 };
    },

    /* Генерация обитаемой страницы через токенный декодер */
    generateInhabitedPage(genre, step) {
      const seed = `genre-nav:${genre}:${step}`;
      const rng = rngFrom(seed);
      const wb = WORD_BANK;
      const w1 = wb[Math.floor(rng() * wb.length)];
      const w2 = wb[Math.floor(rng() * wb.length)];
      const phrase = app.utils.normalizeText(`${w1} ${w2}`);

      const result = _tokens.findPhraseInTokenSpace(phrase);
      if (!result) {
        /* Fallback */
        const x = BigInt(Math.floor(rng() * 2000) - 1000);
        const y = BigInt(Math.floor(rng() * 2000) - 1000);
        const z = 1n + BigInt(Math.floor(rng() * 1000));
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

    /* Scan forward — через токенный декодер */
    scanNextInhabitedPage(startNumber, genre, maxScan) {
      const limit = maxScan || 50;
      const startCoords = rawIndexToCoordinates(app.library.unpermuteIndex(startNumber));

      for (let i = 1; i <= limit; i++) {
        try {
          const newZ = BigInt(startCoords.z) + BigInt(i);
          if (newZ < 1n) continue;
          const text = decodePageByCoords(BigInt(startCoords.x), BigInt(startCoords.y), newZ);
          const classification = _tokens.classifyPageByTemp(newZ);
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
      const x = BigInt(coords.x || 0);
      const y = BigInt(coords.y || 0);
      let z = BigInt(coords.z || 1);

      /* Ищем страницу с более низкой температурой (ближе к началу) */
      for (let i = 1; i <= 50; i++) {
        const newZ = z + BigInt(i);
        const text = decodePageByCoords(x, y, newZ);
        const temp = _tokens.computeTemperature(newZ);
        const detection = _tokens.classifyPageByTemp(newZ);
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

  /* ---- Clean up temporary namespaces ---- */
  delete app.library._core;
  delete app.library._fillers;
  delete app.library._classifier;
  delete app.library._tokens;
})();
