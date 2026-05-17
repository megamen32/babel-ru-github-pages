(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* ═══════════════════════════════════════════════════════════
     КООРДИНАТНАЯ ПЕРЕСТАНОВКА — Feistel-подобное перемешивание
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
       • Обратимость: internal → coord тоже работает
       • Соседние координаты → далёкие внутренние адреса
       • Малые z → область адресного пространства,
         где префиксные коды чаще дают частые токены

     Для навигации используем существующую аффинную перестановку
     (permuteIndex/unpermuteIndex), которая уже обеспечивает
     перемешивание и обратимость. */

  /* ─── Константы из lib-core ─── */

  function init() {
    const ALG = app.config.ALG;
    const HALLS_PER_ROW = 1_000_000n;
    const HALF_ROW = HALLS_PER_ROW / 2n;
    const PAGES_PER_HALL = ALG.wallsPerHall * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume;

    /* ─── Affine permutation over Z/(2^32768) ───
       Используем существующую перестановку из lib-core */

    const BITS_PER_CHAR = 8n;
    const TOTAL_BITS = BITS_PER_CHAR * BigInt(ALG.pageLength);
    const BIT_MASK = (1n << TOTAL_BITS) - 1n;

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

    /* ─── Permutation ─── */

    function permute(index) {
      return ((BigInt(index) * PERM_C + PERM_OFFSET) & BIT_MASK);
    }

    function unpermute(index) {
      return (((BigInt(index) - PERM_OFFSET + (1n << (TOTAL_BITS + 8n))) * PERM_I) & BIT_MASK);
    }

    /* ═══════════════════════════════════════════════════════════
       ГЛАВНЫЕ ФУНКЦИИ
       ═══════════════════════════════════════════════════════════

       coordToInternalAddress(x, y, z):
         Координаты → rawIndex → permuted → внутренний адрес для декодирования.
         Аффинная перестановка обеспечивает:
         • Соседние координаты → далёкие адреса (визуальное разнообразие)
         • Обратимость (perm + offset — биекция над Z/2^n)

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
  };
})();
