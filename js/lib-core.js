(() => {
  const app = window.BabelApp;
  const { ALG, WORD_BANK } = app.config;
  const { rngFrom, tokenizeText, indicesToString } = app.utils;

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

  /* ---- Coordinate system: бесконечная полка X,Y,Z ----

     Три координаты кодируют всё пространство 256^4096:
       X, Y — позиция на бесконечной 2D-карте (какой зал)
       Z    — номер листа в этом зале (1 .. PAGES_PER_HALL)

     rawIndex = hallIndex × PAGES_PER_HALL + (Z - 1)
     hallIndex = (X + HALF_ROW) + (Y + HALF_ROW) × HALLS_PER_ROW

     Sector/hall/wall/shelf/volume/page — борхесовский display-формат,
     вычисляется из hallIndex и Z только для pageTitle(). */

  const HALLS_PER_ROW = 1_000_000n;  // ширина сетки карты
  const HALF_ROW = HALLS_PER_ROW / 2n; // 500 000 — центр в (0,0)
  const PAGES_PER_HALL = ALG.wallsPerHall * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume;

  /* Разложить Z на борхесовскую иерархию (display only) */
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

  /* Собрать Z из борхесовской иерархии */
  function borgesToZ(wall, shelf, volume, page) {
    return ((wall - 1n) * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume
          + (shelf - 1n) * ALG.volumesPerShelf * ALG.pagesPerVolume
          + (volume - 1n) * ALG.pagesPerVolume
          + page);
  }

  function rawIndexToCoordinates(rawIndex) {
    let value = BigInt(rawIndex);
    const z = (value % PAGES_PER_HALL) + 1n;
    const hallIndex = value / PAGES_PER_HALL;
    const x = (hallIndex % HALLS_PER_ROW) - HALF_ROW;
    const y = (hallIndex / HALLS_PER_ROW) - HALF_ROW;
    /* Борхесовский display (для pageTitle) */
    const sector = hallIndex / ALG.hallsPerSector + 1n;
    const hall = (hallIndex % ALG.hallsPerSector) + 1n;
    const borges = zToBorges(z);
    return { x, y, z, sector, hall, ...borges };
  }

  function coordinatesToRawIndex(coordinates) {
    /* Основной формат: {x, y, z}
       Обратная совместимость: {sector, hall, wall, shelf, volume, page}
       Смешанный: {x, y, wall, shelf, volume, page} */
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

    /* Определяем Z: напрямую или из борхесовской иерархии */
    let z;
    if (coordinates.z != null) {
      z = BigInt(coordinates.z);
      if (z < 1n || z > PAGES_PER_HALL) {
        throw new Error("Z вне диапазона зала.");
      }
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

  /* ---- XY helpers (для карты и URL) ---- */

  function xyToHallXY(x, y) {
    const bx = BigInt(x);
    const by = BigInt(y);
    const hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
    return { sector: hallIndex / ALG.hallsPerSector + 1n, hall: hallIndex % ALG.hallsPerSector + 1n };
  }

  function hallToXY(sector, hall) {
    const hallIndex = (BigInt(sector) - 1n) * ALG.hallsPerSector + (BigInt(hall) - 1n);
    return {
      x: (hallIndex % HALLS_PER_ROW) - HALF_ROW,
      y: (hallIndex / HALLS_PER_ROW) - HALF_ROW,
    };
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

  /* ---- Export to temporary namespace ---- */

  app.library = app.library || {};
  app.library._core = {
    BITS_PER_CHAR, CHAR_MASK, TOTAL_BITS, BIT_MASK,
    maxPageNumber,
    PERM_C, PERM_OFFSET, PERM_I, modInvPow2,
    indicesToNumber, numberToIndices,
    textToNumber, numberToText, fixedPageText,
    rawIndexToCoordinates, coordinatesToRawIndex,
    PAGES_PER_HALL, zToBorges, borgesToZ,
    xyToHallXY, hallToXY, xyToCoordinates, coordinatesToXY,
    createWordFillerIndices, createNoiseFillerIndices,
  };
})();
