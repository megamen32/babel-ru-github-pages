(() => {
  const app = window.BabelApp;
  const { ALG, SEARCH_VARIANTS_DEFAULT, SEARCH_VARIANTS_MAX, WORD_BANK } = app.config;
  const { clamp, rngFrom, tokenizeText, indicesToString } = app.utils;

  const _core = app.library._core;
  const _fillers = app.library._fillers;
  const _classifier = app.library._classifier;

  const {
    BITS_PER_CHAR, CHAR_MASK, TOTAL_BITS, BIT_MASK,
    maxPageNumber,
    PERM_C, PERM_OFFSET, PERM_I, modInvPow2,
    indicesToNumber, numberToIndices,
    textToNumber, numberToText, fixedPageText,
    rawIndexToCoordinates, coordinatesToRawIndex,
    xyToHallXY, hallToXY, xyToCoordinates, coordinatesToXY,
    createWordFillerIndices, createNoiseFillerIndices,
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

    /* Coordinate-based page URL: x,y coordinates first (small integers),
       then wall/shelf/volume/page.
       New format: #/page/x/{x}/y/{y}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}
       Old format: #/page/h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}/s/{seed_b64url}
       Ancient format: #/page/s/{sector_decimal}/h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}
       x,y are now first-class coordinate fields. Sector is no longer needed
       in the URL since x,y fully determine it. */
    coordsToPageUrl(coords, params) {
      const c = {
        x: BigInt(coords.x || 0),
        y: BigInt(coords.y || 0),
        wall: BigInt(coords.wall || 1),
        shelf: BigInt(coords.shelf || 1),
        volume: BigInt(coords.volume || 1),
        page: BigInt(coords.page || 1),
      };
      const base = `#/page/x/${c.x}/y/${c.y}/w/${c.wall}/sh/${c.shelf}/v/${c.volume}/p/${c.page}`;
      if (params) {
        const qs = new URLSearchParams(params).toString();
        return `${base}?${qs}`;
      }
      return base;
    },

    randomPageCoords() {
      return app.library.numberToCoordinates(app.library.randomPageNumber());
    },

    xyToCoordinates, coordinatesToXY, xyToHallXY, hallToXY,

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

    /* Custom base62 encoding — URL-safe, no atob/btoa limitations */
    bytesToBase64Url(bytes) {
      let num = 0n;
      for (const byte of bytes) num = (num << 8n) | BigInt(byte);
      if (num === 0n) return '0';
      let result = '';
      const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const base = 62n;
      while (num > 0n) {
        result = BASE62_CHARS[Number(num % base)] + result;
        num /= base;
      }
      return result;
    },
    base64UrlToBytes(value) {
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

        /* NEW format: x/{x}/y/{y}/w/{wall}/sh/{shelf}/v/{volume}/p/{page} */
        if (parts[0] === 'x' && parts.length >= 4) {
          const parsed = {};
          for (let i = 0; i < parts.length - 1; i += 2) {
            switch (parts[i]) {
              case 'x': parsed.x = parts[i + 1]; break;
              case 'y': parsed.y = parts[i + 1]; break;
              case 'w': parsed.wall = parts[i + 1]; break;
              case 'sh': parsed.shelf = parts[i + 1]; break;
              case 'v': parsed.volume = parts[i + 1]; break;
              case 'p': parsed.page = parts[i + 1]; break;
            }
          }
          if (parsed.x != null && parsed.y != null) {
            try {
              const coords = xyToCoordinates(parsed.x, parsed.y, parsed.wall, parsed.shelf, parsed.volume, parsed.page);
              return app.library.coordinatesToNumber(coords);
            } catch { /* fall through */ }
          }
        }

        /* OLD format: h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page}/s/{seed_b64url}
           ANCIENT format: s/{sector_decimal}/h/{hall}/w/{wall}/sh/{shelf}/v/{volume}/p/{page} */
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
          /* If sector is present, decode it — could be base64url (old) or decimal (ancient) */
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

  /* ---- Clean up temporary namespaces ---- */
  delete app.library._core;
  delete app.library._fillers;
  delete app.library._classifier;
})();
