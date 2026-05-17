(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* ═══════════════════════════════════════════════════════════
     КООРДИНАТНАЯ ПЕРЕСТАНОВКА — Feistel-сеть перемешивания
     ═══════════════════════════════════════════════════════════
     Схема:
       user coordinate (x, y, z)
         ↓
       coordToInternalAddress()  — биективное отображение
         ↓
       internal address (BigInt)  — используется для декодирования
         ↓
       prefix decode → page

     Свойства:
       • Обратимость: Feistel-сеть обратима по построению
       • Соседние координаты → далёкие внутренние адреса
         (гораздо лучше аффинной перестановки)
       • Малые z → область адресного пространства,
         где префиксные коды чаще дают частые токены

     Реализация: 4-раундовая Feistel-сеть над Z/2^32768
       L_new = R
       R_new = L XOR F(R, round_key)
     Обратимость: раунды в обратном порядке. */

  /* ─── Константы из lib-core ─── */

  function init() {
    const ALG = app.config.ALG;
    const HALLS_PER_ROW = 1_000_000n;
    const HALF_ROW = HALLS_PER_ROW / 2n;
    const PAGES_PER_HALL = ALG.wallsPerHall * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume;

    /* ─── Feistel network permutation over Z/(2^32768) ─── */

    const BITS_PER_CHAR = 8n;
    const TOTAL_BITS = BITS_PER_CHAR * BigInt(ALG.pageLength);   // 32768
    const BIT_MASK = (1n << TOTAL_BITS) - 1n;
    const HALF_BITS = TOTAL_BITS / 2n;                            // 16384
    const HALF_MASK = (1n << HALF_BITS) - 1n;

    /* ─── Round key generation ───
       64-битные константы повторяются для заполнения HALF_BITS ширины.
       K0, K1 — производные от существующих SEED-констант для совместимости.
       K2 — золотое сечение (0x9E3779B97F4A7C15).
       K3 — дополнительный ключ для четвёртого раунда. */

    function makeExpandedKey(pattern64) {
      let key = 0n;
      for (let bitPos = 0; bitPos < Number(HALF_BITS); bitPos += 64) {
        key = (key | (pattern64 << BigInt(bitPos))) & HALF_MASK;
      }
      return key;
    }

    const ROUND_KEYS = [
      makeExpandedKey(0x4CF3B209D871A5E7n),   // K0 — from SEED_C
      makeExpandedKey(0x5BD1E9A3F7C20658n),   // K1 — from PATTERN
      makeExpandedKey(0x9E3779B97F4A7C15n),   // K2 — golden ratio
      makeExpandedKey(0x8A5B6C7D9E0F1A2Bn),   // K3 — additional
    ];

    /* ─── Round function F(value, key) ───
       value — HALF_BITS-битное число
       key   — HALF_BITS-битный раундовый ключ

       1. multiply-scramble: (value * key) mod 2^HALF_BITS
       2. shift-xor diffusion: XOR с собственным сдвигом >> 3
       3. key mixing: XOR с раундовым ключом */

    function roundFunc(value, key) {
      let mixed = (value * key) & HALF_MASK;     // multiply-scramble
      mixed = mixed ^ (mixed >> 3n);              // shift-xor diffusion
      mixed = (mixed ^ key) & HALF_MASK;          // XOR with round key
      return mixed;
    }

    /* ─── Core mapping functions ─── */

    /* Координаты → rawIndex (линейный индекс в зале) */
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

    /* rawIndex из координат */
    function coordToRawIndex(x, y, z) {
      const bx = BigInt(x || 0);
      const by = BigInt(y || 0);
      const bz = BigInt(z || 1);
      const hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
      return hallIndex * PAGES_PER_HALL + (bz - 1n);
    }

    /* rawIndex → координаты */
    function rawIndexToCoord(rawIndex) {
      let value = BigInt(rawIndex);
      const z = (value % PAGES_PER_HALL) + 1n;
      const hallIndex = value / PAGES_PER_HALL;
      const x = (hallIndex % HALLS_PER_ROW) - HALF_ROW;
      const y = (hallIndex / HALLS_PER_ROW) - HALF_ROW;
      return { x, y, z };
    }

    /* ─── Feistel Permutation ─── */

    function permute(index) {
      const value = BigInt(index) & BIT_MASK;
      let L = value >> HALF_BITS;
      let R = value & HALF_MASK;
      for (let round = 0; round < 4; round++) {
        const newL = R;
        const newR = L ^ roundFunc(R, ROUND_KEYS[round]);
        L = newL;
        R = newR;
      }
      return (L << HALF_BITS) | R;
    }

    function unpermute(permuted) {
      let L = (BigInt(permuted) >> HALF_BITS) & HALF_MASK;
      let R = BigInt(permuted) & HALF_MASK;
      for (let round = 3; round >= 0; round--) {
        const newR = L;
        const newL = R ^ roundFunc(L, ROUND_KEYS[round]);
        L = newL;
        R = newR;
      }
      return (L << HALF_BITS) | R;
    }

    /* ═══════════════════════════════════════════════════════════
       ГЛАВНЫЕ ФУНКЦИИ
       ═══════════════════════════════════════════════════════════

       coordToInternalAddress(x, y, z):
         Координаты → rawIndex → permuted → внутренний адрес для декодирования.
         Feistel-перестановка обеспечивает:
         • Соседние координаты → далёкие адреса (визуальное разнообразие)
         • Обратимость (Feistel-сеть — биекция по построению)
         • Гораздо лучшее перемешивание, чем аффинная перестановка

       internalAddressToCoord(address):
         Обратное преобразование: адрес → координаты.

       coordToPublicNumber(x, y, z):
         Координаты → число для URL (permuted rawIndex).

       publicNumberToCoord(number):
         Число из URL → координаты. */

    function coordToInternalAddress(x, y, z) {
      const rawIdx = coordToRawIndex(x, y, z);
      return permute(rawIdx);
    }

    function internalAddressToCoord(address) {
      const rawIdx = unpermute(address);
      return rawIndexToCoord(rawIdx);
    }

    function coordToPublicNumber(x, y, z) {
      return coordToInternalAddress(x, y, z);
    }

    function publicNumberToCoord(number) {
      return internalAddressToCoord(number);
    }

    /* ─── Борхесовский формат отображения ─── */

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

    /* ─── Helper: полные координаты ─── */

    function xyToFullCoords(x, y, z) {
      const bx = BigInt(x || 0);
      const by = BigInt(y || 0);
      const bz = BigInt(z || 1);
      const borges = zToBorges(bz);
      const hallIndex = (bx + HALF_ROW) + (by + HALF_ROW) * HALLS_PER_ROW;
      const sector = hallIndex / ALG.hallsPerSector + 1n;
      const hall = (hallIndex % ALG.hallsPerSector) + 1n;
      return { x: bx, y: by, z: bz, sector, hall, ...borges };
    }

    return {
      coordToInternalAddress,
      internalAddressToCoord,
      coordToPublicNumber,
      publicNumberToCoord,
      coordToRawIndex,
      rawIndexToCoord,
      permute,
      unpermute,
      zToBorges,
      borgesToZ,
      xyToFullCoords,
      xyToHallIndex,
      hallIndexToXY,
      TOTAL_BITS: Number(TOTAL_BITS),
      PAGES_PER_HALL,
      HALLS_PER_ROW,
      HALF_ROW,
    };
  }

  let _instance = null;

  function getInstance() {
    if (!_instance) {
      _instance = init();
    }
    return _instance;
  }

  /* ═══════════════════════════════════════════════════════════
     ЭКСПОРТ
     ═══════════════════════════════════════════════════════════ */

  app.library = app.library || {};
  app.library._coordPerm = {
    getInstance,
    /* Проксирование для удобства */
    coordToInternalAddress(x, y, z) { return getInstance().coordToInternalAddress(x, y, z); },
    internalAddressToCoord(addr) { return getInstance().internalAddressToCoord(addr); },
    coordToPublicNumber(x, y, z) { return getInstance().coordToPublicNumber(x, y, z); },
    publicNumberToCoord(num) { return getInstance().publicNumberToCoord(num); },
    coordToRawIndex(x, y, z) { return getInstance().coordToRawIndex(x, y, z); },
    rawIndexToCoord(ri) { return getInstance().rawIndexToCoord(ri); },
    zToBorges(z) { return getInstance().zToBorges(z); },
    borgesToZ(w, sh, v, p) { return getInstance().borgesToZ(w, sh, v, p); },
    xyToFullCoords(x, y, z) { return getInstance().xyToFullCoords(x, y, z); },
    permute(i) { return getInstance().permute(i); },
    unpermute(i) { return getInstance().unpermute(i); },
    get TOTAL_BITS() { return getInstance().TOTAL_BITS; },
    get PAGES_PER_HALL() { return getInstance().PAGES_PER_HALL; },
    get HALLS_PER_ROW() { return getInstance().HALLS_PER_ROW; },
    get HALF_ROW() { return getInstance().HALF_ROW; },
  };
})();
