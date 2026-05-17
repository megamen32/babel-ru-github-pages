(() => {
  const app = window.BabelApp;
  const { ALG, WORD_BANK } = app.config;
  const { rngFrom, tokenizeText, indicesToString } = app.utils;
  const _tokens = app.library._tokens;

  /* ═══════════════════════════════════════════════════════════
     Base-256 (2^8) Byte-Level Engine
     ═══════════════════════════════════════════════════════════
     256-character alphabet = 1 byte per symbol.
     4096 symbols × 8 bits = 32768 bits = 2^15 bits per page.
     All operations are byte shifts and masks.

     СОХРАНЯЕТСЯ для обратной совместимости (search, base64 url).
     Основной просмотр страниц использует токенный декодер. */

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

     Малые Z → человекоподобный текст (языковая гравитация)
     Большие Z → шум и хаос

     rawIndex — внутренний BigInt для совместимости со старой
     аффинной перестановкой и base64-адресами.
     Для токенного декодера rawIndex не используется —
     текст генерируется напрямую из (x, y, z). */

  const HALLS_PER_ROW = 1_000_000n;
  const HALF_ROW = HALLS_PER_ROW / 2n;

  /* Количество страниц на зал для совместимости со старой системой */
  const PAGES_PER_HALL = ALG.wallsPerHall * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume;

  /* ---- X,Y ↔ hallIndex ---- */

  function xyToHallIndex(x, y) {
    return (BigInt(x) + HALF_ROW) + (BigInt(y) + HALF_ROW) * HALLS_PER_ROW;
  }

  function hallIndexToXY(hallIndex) {
    const hi = BigInt(hallIndex);
    return {
      x: (hi % HALLS_PER_ROW) - HALF_ROW,
      y: (hi / HALLS_PER_ROW) - HALF_ROW,
    };
  }

  /* ---- Борхесовский display-формат (только для отображения) ---- */

  function zToBorges(z) {
    let v = z - 1n;
    const page = (v % ALG.pagesPerVolume) + 1n;
    v /= ALG.pagesPerVolume;
    const volume = (v % ALG.volumesPerShelf) + 1n;
    v /= ALG.volumesPerShelf;
    const shelf = (v % ALG.shelvesPerWall) + 1n;
    v /= ALG.shelvesPerWall;
    const wall = v + 1n;
    return { wall, shelf, volume, page };
  }

  function borgesToZ(wall, shelf, volume, page) {
    return ((wall - 1n) * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume
          + (shelf - 1n) * ALG.volumesPerShelf * ALG.pagesPerVolume
          + (volume - 1n) * ALG.pagesPerVolume
          + page);
  }

  /* ---- Coordinate ↔ rawIndex (для старой системы) ---- */

  function rawIndexToCoordinates(rawIndex) {
    let value = BigInt(rawIndex);
    const z = (value % PAGES_PER_HALL) + 1n;
    const hallIndex = value / PAGES_PER_HALL;
    const x = (hallIndex % HALLS_PER_ROW) - HALF_ROW;
    const y = (hallIndex / HALLS_PER_ROW) - HALF_ROW;
    const sector = hallIndex / ALG.hallsPerSector + 1n;
    const hall = (hallIndex % ALG.hallsPerSector) + 1n;
    const borges = zToBorges(z);
    return { x, y, z, sector, hall, ...borges };
  }

  function coordinatesToRawIndex(coordinates) {
    let hallIndex;
    if (coordinates.x != null || coordinates.y != null) {
      const bx = BigInt(coordinates.x || 0);
      const by = BigInt(coordinates.y || 0);
      hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
    } else {
      const sector = BigInt(coordinates.sector || 1);
      const hall = BigInt(coordinates.hall || 1);
      if (sector < 1n || hall < 1n || hall > ALG.hallsPerSector) {
        throw new Error("Координаты вне геометрии библиотеки.");
      }
      hallIndex = (sector - 1n) * ALG.hallsPerSector + (hall - 1n);
    }

    let z;
    if (coordinates.z != null) {
      z = BigInt(coordinates.z);
      if (z < 1n) z = 1n;
    } else {
      const wall = BigInt(coordinates.wall || 1);
      const shelf = BigInt(coordinates.shelf || 1);
      const volume = BigInt(coordinates.volume || 1);
      const page = BigInt(coordinates.page || 1);
      if (wall < 1n || wall > ALG.wallsPerHall ||
          shelf < 1n || shelf > ALG.shelvesPerWall ||
          volume < 1n || volume > ALG.volumesPerShelf ||
          page < 1n || page > ALG.pagesPerVolume) {
        throw new Error("Координаты вне геометрии библиотеки.");
      }
      z = borgesToZ(wall, shelf, volume, page);
    }

    const value = hallIndex * PAGES_PER_HALL + (z - 1n);
    if (value >= maxPageNumber()) {
      throw new Error("Координаты выводят страницу за пределы пространства.");
    }
    return value;
  }

  /* ---- XY helpers ---- */

  function xyToHallXY(x, y) {
    const hallIndex = xyToHallIndex(x, y);
    return { sector: hallIndex / ALG.hallsPerSector + 1n, hall: hallIndex % ALG.hallsPerSector + 1n };
  }

  function hallToXY(sector, hall) {
    const hallIndex = (BigInt(sector) - 1n) * ALG.hallsPerSector + (BigInt(hall) - 1n);
    return hallIndexToXY(hallIndex);
  }

  function xyToCoordinates(x, y, z) {
    const { sector, hall } = xyToHallXY(x, y);
    const bz = BigInt(z || 1);
    const borges = zToBorges(bz);
    return { x: BigInt(x), y: BigInt(y), z: bz, sector, hall, ...borges };
  }

  function coordinatesToXY(coords) {
    return { x: BigInt(coords.x || 0), y: BigInt(coords.y || 0) };
  }

  /* ═══════════════════════════════════════════════════════════
     ТОКЕННЫЙ ДЕКОДЕР — основная генерация страниц
     ═══════════════════════════════════════════════════════════ */

  function decodePageByCoords(x, y, z, forcedTokens) {
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
    /* Token decoder */
    decodePageByCoords,
  };
})();
