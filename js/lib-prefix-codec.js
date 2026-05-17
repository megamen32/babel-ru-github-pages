(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* ═══════════════════════════════════════════════════════════
     ПРЕФИКСНЫЙ КОДЕК — канонический Хаффман
     ═══════════════════════════════════════════════════════════
     Частые токены → короткие коды → малые адреса.
     «Гравитация языка» к началу координат.

     Декодер: адрес (BigInt) → поток битов → префиксные коды → токены → страница
     Энкодер: текст → токены → префиксные коды → поток битов → адрес (BigInt) */

  /* ─── Построение длин кодов Хаффмана ─── */

  function buildHuffmanLengths(weights) {
    const n = weights.length;
    if (n === 0) return [];
    if (n === 1) return [1];

    /* Очередь с приоритетом (простая на массиве) */
    const heap = [];
    for (let i = 0; i < n; i++) {
      heap.push({ w: weights[i], i, left: null, right: null });
    }
    heap.sort((a, b) => a.w - b.w || a.i - b.i);

    while (heap.length > 1) {
      const left = heap.shift();
      const right = heap.shift();
      const parent = { w: left.w + right.w, i: -1, left, right };
      let pos = 0;
      while (pos < heap.length && (heap[pos].w < parent.w || (heap[pos].w === parent.w && heap[pos].i < parent.i))) pos++;
      heap.splice(pos, 0, parent);
    }

    const lengths = new Array(n).fill(0);
    (function walk(node, depth) {
      if (!node.left && !node.right) { lengths[node.i] = Math.max(1, depth); return; }
      if (node.left) walk(node.left, depth + 1);
      if (node.right) walk(node.right, depth + 1);
    })(heap[0], 0);

    /* Ограничение максимальной длины кода */
    const MAX_LEN = 22;
    for (let iter = 0; iter < 50; iter++) {
      let maxL = 0;
      for (let i = 0; i < n; i++) if (lengths[i] > maxL) maxL = lengths[i];
      if (maxL <= MAX_LEN) break;
      /* Уменьшаем длинные коды */
      for (let i = 0; i < n; i++) {
        if (lengths[i] > MAX_LEN) lengths[i] = MAX_LEN;
      }
    }

    return lengths;
  }

  /* ─── Каноническое присвоение кодов ─── */

  function assignCanonicalCodes(lengths) {
    const n = lengths.length;
    if (n === 0) return [];

    const sorted = lengths.map((len, i) => ({ i, len })).sort((a, b) => a.len - b.len || a.i - b.i);
    const codes = new Array(n);
    let code = 0;
    let prevLen = 0;

    for (const { i, len } of sorted) {
      code <<= (len - prevLen);
      codes[i] = { code, len };
      prevLen = len;
      code++;
    }
    return codes;
  }

  /* ─── Полный декодер для набора символов ─── */

  function buildDecoder(weights) {
    const lengths = buildHuffmanLengths(weights);
    const codes = assignCanonicalCodes(lengths);
    const n = weights.length;
    const maxLen = Math.max(...lengths);

    /* Группируем по длине для быстрого декодирования */
    const byLen = new Map();
    for (let i = 0; i < n; i++) {
      const len = lengths[i];
      if (!byLen.has(len)) byLen.set(len, new Map());
      byLen.get(len).set(codes[i].code, i);
    }
    const sortedLens = [...byLen.keys()].sort((a, b) => a - b);

    return {
      codes,       // array of { code, len } — для энкодинга
      lengths,     // array of int — длины кодов
      maxLen,      // максимальная длина кода
      count: n,    // количество символов

      /* Декодирование: читаем биты из потока, возвращаем индекс символа */
      decode(readBit) {
        let acc = 0;
        for (let bit = 0; bit < this.maxLen + 1; bit++) {
          acc = (acc << 1) | readBit();
          const m = byLen.get(bit + 1);
          if (m && m.has(acc)) return m.get(acc);
        }
        return 0; // fallback
      },

      /* Энкодинг: записываем код символа в битовый поток */
      encode(symbolIndex, writeBit) {
        const { code, len } = codes[symbolIndex];
        for (let i = len - 1; i >= 0; i--) {
          writeBit((code >> i) & 1);
        }
        return len;
      },

      /* Получить код и длину для символа */
      getCode(symbolIndex) {
        return codes[symbolIndex];
      },
    };
  }

  /* ═══════════════════════════════════════════════════════════
     БИТОВЫЕ ПОТОКИ
     ═══════════════════════════════════════════════════════════ */

  /* ─── Чтение битов из BigInt-адреса ─── */

  function createBitReader(address, totalBits) {
    const byteLen = Math.ceil(totalBits / 8);
    const bytes = new Uint8Array(byteLen);
    let v = BigInt(address);
    for (let i = byteLen - 1; i >= 0; i--) {
      bytes[i] = Number(v & 0xFFn);
      v >>= 8n;
    }

    let bitPos = 0;

    return {
      readBit() {
        if (bitPos >= totalBits) return 0;
        const byteIdx = bitPos >> 3;
        const bitIdx = 7 - (bitPos & 7);
        bitPos++;
        return (bytes[byteIdx] >> bitIdx) & 1;
      },
      get position() { return bitPos; },
      get remaining() { return Math.max(0, totalBits - bitPos); },
    };
  }

  /* ─── Запись битов для энкодинга ─── */

  function createBitWriter(totalBits) {
    const bits = [];
    const _totalBits = totalBits || 0;

    return {
      writeBit(b) { bits.push(b & 1); },
      writeCode(code, len) {
        for (let i = len - 1; i >= 0; i--) {
          bits.push((code >> i) & 1);
        }
      },
      toBigInt() {
        let result = 0n;
        for (const bit of bits) {
          result = (result << 1n) | BigInt(bit);
        }
        /* Выравниваем биты к MSB: чтобы декодер (читающий с MSB)
           прочитал наши биты первыми, сдвигаем влево на оставшиеся биты.
           Это значит: закодированная страница всегда имеет «большой» адрес,
           но это правильно — конкретная страница это конкретная точка
           в пространстве, а не «маленький адрес».
           Маленькие адреса (0, 1, 2, ...) — это «типичные» страницы
           из частых токенов. */
        if (_totalBits > 0 && bits.length < _totalBits) {
          result = result << BigInt(_totalBits - bits.length);
        }
        return result;
      },
      get length() { return bits.length; },
      get bits() { return bits; },
    };
  }

  /* ═══════════════════════════════════════════════════════════
     ЭКСПОРТ
     ═══════════════════════════════════════════════════════════ */

  app.library = app.library || {};
  app.library._prefix = {
    buildHuffmanLengths,
    assignCanonicalCodes,
    buildDecoder,
    createBitReader,
    createBitWriter,
  };
})();
