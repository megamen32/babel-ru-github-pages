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

  function createFillerIndices(mode, seed, length) {
    if (mode === "empty") return new Array(length).fill(0);
    if (mode === "words") return createWordFillerIndices(seed, length);
    return createNoiseFillerIndices(seed, length);
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
