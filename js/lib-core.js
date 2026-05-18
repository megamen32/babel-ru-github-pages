(() => {
  const app = window.BabelApp;
  const { ALG, WORD_BANK } = app.config;
  const { rngFrom, tokenizeText, indicesToString } = app.utils;
  const _tokens = app.library._tokens;
  const _addressCodec = app.library._addressCodec;
  const _coordPerm = app.library._coordPerm;

  /* ═══════════════════════════════════════════════════════════
     Base-256 (2^8) Byte-Level Engine — LEGACY
     ═══════════════════════════════════════════════════════════
     Сохраняется для обратной совместимости (search, base64 url).
     Основной просмотр страниц использует ПРЕФИКСНЫЙ ДЕКОДЕР. */

  const BITS_PER_CHAR = 8n;
  const CHAR_MASK = 255n;
  const TOTAL_BITS = BITS_PER_CHAR * BigInt(ALG.pageLength);
  const BIT_MASK = (1n << TOTAL_BITS) - 1n;

  function maxPageNumber() {
    return 1n << TOTAL_BITS;
  }

  /* ---- Affine Permutation over Z/(2^32768) ---- */

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

  /* ---- Core conversion (byte-level) — LEGACY ---- */

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

  /* ═══════════════════════════════════════════════════════════
     СИСТЕМА КООРДИНАТ: БЕСКОНЕЧНАЯ ПОЛКА X, Y, Z
     ═══════════════════════════════════════════════════════════
     Три координаты кодируют всё пространство библиотеки:
       X, Y — позиция на бесконечной 2D-карте (зал)
       Z    — номер страницы в этом зале (BigInt, 1..∞)

     Новая архитектура:
       (x, y, z) → internalAddress → prefix decode → страница

     Малые адреса → частые токены → человекоподобный текст
     Большие адреса → редкие токены → шум

     rawIndex — внутренний BigInt для совместимости со старой
     аффинной перестановкой и base64-адресами. */

  /* ═══════════════════════════════════════════════════════════
     СИСТЕМА КООРДИНАТ — делегирование к _coordPerm
     ═══════════════════════════════════════════════════════════
     Базовые функции (xyToHallIndex, hallIndexToXY, zToBorges,
     borgesToZ, coordToRawIndex, rawIndexToCoord) определены
     в lib-coordinate-permutation.js и доступны через _coordPerm.
     Здесь только обогащённые обёртки с sector/hall/borges. */

  const HALLS_PER_ROW = _coordPerm.HALLS_PER_ROW;
  const HALF_ROW = _coordPerm.HALF_ROW;
  const PAGES_PER_HALL = _coordPerm.PAGES_PER_HALL;

  /* Делегирование базовых функций */
  const xyToHallIndex = (x, y) => _coordPerm.xyToHallIndex(x, y);
  const hallIndexToXY = (hi) => _coordPerm.hallIndexToXY(hi);
  const zToBorges = (z) => _coordPerm.zToBorges(z);
  const borgesToZ = (w, sh, v, p) => _coordPerm.borgesToZ(w, sh, v, p);

  /* ---- Coordinate ↔ rawIndex (обогащённые версии) ---- */

  function rawIndexToCoordinates(rawIndex) {
    const { x, y, z } = _coordPerm.rawIndexToCoord(rawIndex);
    const hallIndex = (BigInt(x) + HALF_ROW) + (BigInt(y) + HALF_ROW) * HALLS_PER_ROW;
    const sector = hallIndex / ALG.hallsPerSector + 1n;
    const hall = (hallIndex % ALG.hallsPerSector) + 1n;
    const borges = zToBorges(z);
    return { x, y, z, sector, hall, ...borges };
  }

  function coordinatesToRawIndex(coordinates) {
    /* Прямой путь: если есть x,y,z — делегируем */
    if (coordinates.x != null && coordinates.y != null && coordinates.z != null) {
      return _coordPerm.coordToRawIndex(coordinates.x, coordinates.y, coordinates.z);
    }
    /* Обратная совместимость: sector/hall или borges-формат */
    let hallIndex;
    if (coordinates.x != null || coordinates.y != null) {
      const bx = BigInt(coordinates.x || 0);
      const by = BigInt(coordinates.y || 0);
      hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
    } else {
      const sector = BigInt(coordinates.sector || 1);
      const hall = BigInt(coordinates.hall || 1);
      hallIndex = (sector - 1n) * ALG.hallsPerSector + (hall - 1n);
    }
    let z;
    if (coordinates.z != null) {
      z = BigInt(coordinates.z);
      if (z < 1n) z = 1n;
    } else {
      z = borgesToZ(
        BigInt(coordinates.wall || 1),
        BigInt(coordinates.shelf || 1),
        BigInt(coordinates.volume || 1),
        BigInt(coordinates.page || 1)
      );
    }
    return hallIndex * PAGES_PER_HALL + (z - 1n);
  }

  /* ---- XY helpers (обогащённые обёртки) ---- */

  function xyToHallXY(x, y) {
    const hallIndex = xyToHallIndex(x, y);
    return { sector: hallIndex / ALG.hallsPerSector + 1n, hall: hallIndex % ALG.hallsPerSector + 1n };
  }

  function hallToXY(sector, hall) {
    return hallIndexToXY((BigInt(sector) - 1n) * ALG.hallsPerSector + (BigInt(hall) - 1n));
  }

  function xyToCoordinates(x, y, z) {
    return _coordPerm.xyToFullCoords(x, y, z);
  }

  function coordinatesToXY(coords) {
    return {
      x: typeof coords.x === 'bigint' ? coords.x : BigInt(coords.x || 0),
      y: typeof coords.y === 'bigint' ? coords.y : BigInt(coords.y || 0),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     ПРЕФИКСНЫЙ ДЕКОДЕР — основная генерация страниц
     ═══════════════════════════════════════════════════════════
     Новая архитектура:
       (x, y, z) → internalAddress → prefix decode → страница

     Старый PRNG-декодер (lib-tokens.js) сохранён как fallback.
     Режим выбирается через app.config.USE_PREFIX_CODEC. */

  const USE_PREFIX_CODEC = true;

  const _tt = app.library._tokenTable;

  /* Library mode: check if user wants "random" (byte-level) or "human" (prefix codec) */
  function getLibraryMode() {
    try { return localStorage.getItem('babelLibraryMode') || 'human'; }
    catch { return 'human'; }
  }

  function decodePageByCoords(x, y, z, forcedTokens, forcedMode) {
    const libraryMode = forcedMode || getLibraryMode();

    /* Random mode: always use byte-level decode */
    if (libraryMode === 'random') {
      const bx = typeof x === 'bigint' ? x : BigInt(x);
      const by = typeof y === 'bigint' ? y : BigInt(y);
      const bz = typeof z === 'bigint' ? z : BigInt(z || 1);
      /* Use Feistel permutation + byte-level decode */
      const hallIndex = xyToHallIndex(bx, by);
      const rawIdx = hallIndex * PAGES_PER_HALL + (bz - 1n);
      const number = _coordPerm.feistelPermute
        ? _coordPerm.feistelPermute(rawIdx)
        : ((rawIdx * PERM_C + PERM_OFFSET) & BIT_MASK);
      const indices = numberToIndices(number);
      return indicesToString(indices);
    }

    if (USE_PREFIX_CODEC && _addressCodec && !forcedTokens) {
      /* Префиксное декодирование — temperature всегда 1.0
         Энкодинг использует temperature=1.0 для обратимости.
         z-зависимая температура при декодировании ломает консистентность
         поиска: тот же битовый поток декодируется другими Хаффман-таблицами,
         давая другой текст. Гравитация языка уже работает через структуру
         адресного пространства (малые адреса → частые токены). */
      try {
        const bx = typeof x === 'bigint' ? x : BigInt(x);
        const by = typeof y === 'bigint' ? y : BigInt(y);
        const bz = typeof z === 'bigint' ? z : BigInt(z || 1);
        const internalAddr = _coordPerm.coordToInternalAddress(bx, by, bz);
        const totalBits = Number(TOTAL_BITS);
        return _addressCodec.decodeAddressToPage(internalAddr, totalBits, 1.0);
      } catch (e) {
        /* Fallback на старый декодер при ошибке */
        console.warn('Prefix codec error, falling back to PRNG:', e);
      }
    }

    /* Старый декодер (PRNG) — fallback или forcedTokens */
    return _tokens.decodePage(x, y, z, forcedTokens);
  }

  /* ---- Filler Generation (index-based) — LEGACY ---- */

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

  /* ---- Export to temporary namespace ---- */

  app.library._core = {
    BITS_PER_CHAR, CHAR_MASK, TOTAL_BITS, BIT_MASK,
    maxPageNumber,
    PERM_C, PERM_OFFSET, PERM_I, modInvPow2,
    indicesToNumber, numberToIndices,
    textToNumber, numberToText, fixedPageText,
    rawIndexToCoordinates, coordinatesToRawIndex,
    PAGES_PER_HALL, zToBorges, borgesToZ,
    xyToHallXY, hallToXY, xyToCoordinates, coordinatesToXY,
    xyToHallIndex, hallIndexToXY,
    createWordFillerIndices, createNoiseFillerIndices,
    /* Prefix codec decoder */
    decodePageByCoords,
    USE_PREFIX_CODEC,
  };
})();
