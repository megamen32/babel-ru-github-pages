(() => {
  const app = window.BabelApp;
  const { ALG, SEARCH_VARIANTS_DEFAULT, SEARCH_VARIANTS_MAX, WORD_BANK } = app.config;
  const { clamp, normalizeText, rngFrom } = app.utils;

  /* ---- Base-64 (2^6) Bitwise Engine ----
     Since our alphabet has exactly 64 characters (2^6),
     each character maps to exactly 6 bits. This means:
     - textToNumber: simple bit-shifting (n * 64 = n << 6)
     - numberToText: simple bit-masking (n % 64 = n & 63n)
     No BigInt division needed — 100x faster than arbitrary-base conversion.
  */

  const BITS_PER_CHAR = 6n;  // log2(64) = 6
  const CHAR_MASK = 63n;     // 0b111111 = 63

  // Pre-build lookup table: char → index
  const charToIndex = {};
  for (let i = 0; i < ALG.alphabet.length; i++) {
    charToIndex[ALG.alphabet[i]] = i;
  }

  function maxPageNumber() {
    // 64^900 = 2^(6*900) = 2^5400
    return 1n << (BITS_PER_CHAR * BigInt(ALG.pageLength));
  }

  /* ---- Affine Permutation (Multiplicative + Offset) ----
     We use an affine cipher over Z/(2^5400):
       contentNumber = (bookIndex * C + OFFSET) mod 2^5400
       bookIndex     = (contentNumber - OFFSET) * I mod 2^5400
     where C * I ≡ 1 (mod 2^5400), ensuring a perfect bijection.

     C must be odd (coprime to 2^5400).
     OFFSET is a large "random-looking" constant that ensures even bookIndex=0
     maps to a dense, high-entropy number — so (0,0) produces a full page
     instead of an almost-empty one.

     Since the modulus is a power of 2, we use bitwise AND instead of mod.
  */
  const PERM_C = 9182736450192837465n;  // odd, large — coprime to 2^5400

  // OFFSET: a large, visually-dense constant in base-64.
  // This number has alternating bit patterns so that even index=0
  // produces a page full of varied characters, not spaces.
  // We construct it by repeating a 64-bit pattern across 5400 bits.
  const TOTAL_BITS = BITS_PER_CHAR * BigInt(ALG.pageLength);
  const BIT_MASK = (1n << TOTAL_BITS) - 1n;
  let _offset = 0n;
  const PATTERN = 0x5BD1E9A3F7C20658n;  // 64 bits of high entropy
  for (let bitPos = 0; bitPos < 5400; bitPos += 64) {
    _offset = (_offset | (PATTERN << BigInt(bitPos))) & BIT_MASK;
  }
  const PERM_OFFSET = _offset;

  function modInvPow2(a, n) {
    // Modular inverse of odd 'a' modulo 2^n using Hensel's lemma
    // For 2-adic numbers: a^(-1) ≡ a * (2 - a*a) iterated
    // Since a is odd, gcd(a, 2^n) = 1, inverse exists.
    let inv = a;  // Start with a ≡ a^(-1) mod 2
    // Each iteration doubles the precision
    // We need n bits of precision, so ceil(log2(n)) iterations
    const iterations = Math.ceil(Math.log2(Number(n))) + 1;
    const mod = 1n << n;
    for (let i = 0; i < iterations; i++) {
      // inv = inv * (2 - a * inv) mod 2^(2^(i+1))
      inv = (inv * (2n - a * inv % mod) % mod + mod) % mod;
    }
    return inv;
  }

  // Precompute the inverse of C
  const PERM_I = modInvPow2(PERM_C, TOTAL_BITS);

  function fixedPageText(text) {
    let normalized = normalizeText(text);
    if (normalized.length > ALG.pageLength) {
      normalized = normalized.slice(0, ALG.pageLength);
    }
    return normalized.padEnd(ALG.pageLength, " ");
  }

  function textToNumber(text) {
    const fixed = fixedPageText(text);
    let output = 0n;
    for (const char of fixed) {
      const digit = charToIndex[char];
      if (digit === undefined) {
        throw new Error(`Символ не входит в алфавит библиотеки: ${char}`);
      }
      output = (output << BITS_PER_CHAR) | BigInt(digit);
    }
    return output;
  }

  function numberToText(number) {
    const max = maxPageNumber();
    let value = BigInt(number);
    if (value < 0n || value >= max) {
      throw new Error("Адрес вне пространства библиотеки.");
    }
    const chars = new Array(ALG.pageLength);
    for (let index = ALG.pageLength - 1; index >= 0; index -= 1) {
      const digit = Number(value & CHAR_MASK);
      chars[index] = ALG.alphabet[digit];
      value >>= BITS_PER_CHAR;
    }
    return chars.join("");
  }

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

  /* BigInt integer square root (Newton's method) */
  function bigSqrt(n) {
    if (n < 0n) throw new Error("sqrt of negative");
    if (n < 2n) return n;
    let x = n;
    let y = (x + 1n) / 2n;
    while (y < x) {
      x = y;
      y = (x + n / x) / 2n;
    }
    return x;
  }

  function szudzikUnpair(n) {
    const bn = BigInt(n);
    const m = bigSqrt(bn);
    let a, b;
    if (bn - m * m < m) {
      a = bn - m * m;
      b = m;
    } else {
      a = m;
      b = bn - m * m - m;
    }
    const x = a % 2n === 0n ? a / 2n : -(a + 1n) / 2n;
    const y = b % 2n === 0n ? b / 2n : -(b + 1n) / 2n;
    return { x, y };
  }

  function xyToHallXY(x, y) {
    const linear = szudzikPair(x, y);
    const sector = BigInt(Math.floor(linear / 20)) + 1n;
    const hall = BigInt(linear % 20) + 1n;
    return { sector, hall };
  }

  function hallToXY(sector, hall) {
    const linear = (BigInt(sector) - 1n) * 20n + (BigInt(hall) - 1n);
    return szudzikUnpair(linear);
  }

  function xyToCoordinates(x, y, wall, shelf, volume, page) {
    const { sector, hall } = xyToHallXY(x, y);
    return {
      sector, hall,
      wall: BigInt(wall || 1),
      shelf: BigInt(shelf || 1),
      volume: BigInt(volume || 1),
      page: BigInt(page || 1),
    };
  }

  function coordinatesToXY(coords) {
    return hallToXY(coords.sector, coords.hall);
  }

  /* ---- Filler Generation ---- */

  function createWordFiller(seed, length) {
    const rng = rngFrom(seed);
    const chunks = [];
    while (chunks.join("").length < length + 16) {
      const word = WORD_BANK[Math.floor(rng() * WORD_BANK.length)];
      const separator = rng() < 0.14 ? ", " : " ";
      chunks.push(word, separator);
    }
    return chunks.join("").slice(0, length).padEnd(length, " ");
  }

  function createNoiseFiller(seed, length) {
    const rng = rngFrom(seed);
    let output = "";
    for (let index = 0; index < length; index += 1) {
      output += ALG.alphabet[Math.floor(rng() * ALG.alphabet.length)];
    }
    return output;
  }

  function createFiller(mode, seed, length) {
    if (mode === "empty") {
      return "".padEnd(length, " ");
    }
    if (mode === "words") {
      return createWordFiller(seed, length);
    }
    return createNoiseFiller(seed, length);
  }

  function choosePosition(mode, phraseLength, rng) {
    const maxPosition = ALG.pageLength - phraseLength;
    if (mode === "empty") {
      return Math.max(0, Math.floor((ALG.pageLength - phraseLength) / 2));
    }
    return clamp(Math.floor(rng() * Math.max(1, maxPosition + 1)), 0, maxPosition);
  }

  /* ---- Public API ---- */

  app.library = {
    maxPageNumber,
    permuteIndex(index) {
      // Affine permutation: contentNum = (index * C + OFFSET) mod 2^5400
      return ((BigInt(index) * PERM_C + PERM_OFFSET) & BIT_MASK);
    },
    unpermuteIndex(index) {
      // Inverse: index = (contentNum - OFFSET) * I mod 2^5400
      return (((BigInt(index) - PERM_OFFSET + (1n << (TOTAL_BITS + 6n))) * PERM_I) & BIT_MASK);
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

    /* XY Coordinate System */
    xyToCoordinates,
    coordinatesToXY,
    xyToHallXY,
    hallToXY,
    szudzikPair,
    szudzikUnpair,

    /* Get the blind spine text for a volume (first ~25 chars of page 1) */
    getBookSpine(x, y, wall, shelf, volume) {
      try {
        const coords = xyToCoordinates(x, y, wall, shelf, volume, 1);
        const number = app.library.coordinatesToNumber(coords);
        const text = numberToText(number);
        const trimmed = text.trimStart();
        if (trimmed.length === 0) return "";
        return trimmed.slice(0, 25);
      } catch {
        return "";
      }
    },

    /* Get page content by XY coordinates */
    getPageByXY(x, y, wall, shelf, volume, page) {
      const coords = xyToCoordinates(x, y, wall, shelf, volume, page);
      const number = app.library.coordinatesToNumber(coords);
      const text = numberToText(number);
      return { number, text, coordinates: coords };
    },

    /* Check if a spine text looks like noise or has readable content */
    classifySpine(spineText) {
      if (!spineText) return "empty";
      if (spineText.trim().length === 0) return "empty";
      // Look for word-like patterns: sequences of 3+ consecutive Cyrillic letters
      const wordPattern = /[абвгдеёжзийклмнопрстуфхцчшщъыьэюя]{3,}/gi;
      const words = spineText.match(wordPattern);
      if (words && words.length >= 1 && words.some(w => w.length >= 4)) return "text";
      if (words && words.length >= 2) return "text";
      return "noise";
    },

    /* Encoding helpers */
    bytesToBase64Url(bytes) {
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    },
    base64UrlToBytes(value) {
      const base = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
      const padded = base + "=".repeat((4 - base.length % 4) % 4);
      const binary = atob(padded);
      return Uint8Array.from([...binary].map((char) => char.charCodeAt(0)));
    },
    bigIntToBytes(number) {
      let value = BigInt(number);
      if (value === 0n) {
        return new Uint8Array([0]);
      }
      const bytes = [];
      while (value > 0n) {
        bytes.push(Number(value & 255n));
        value >>= 8n;
      }
      return Uint8Array.from(bytes.reverse());
    },
    bytesToBigInt(bytes) {
      let output = 0n;
      for (const byte of bytes) {
        output = (output << 8n) + BigInt(byte);
      }
      return output;
    },
    numberToB64(number) {
      return app.library.bytesToBase64Url(app.library.bigIntToBytes(number));
    },
    b64ToNumber(value) {
      return app.library.bytesToBigInt(app.library.base64UrlToBytes(value));
    },
    bigintToBase36(number) {
      return BigInt(number).toString(36);
    },
    base36ToBigInt(value) {
      const clean = String(value || "").toLowerCase().replace(/[^0-9a-z]/g, "");
      if (!clean) {
        return 0n;
      }
      let output = 0n;
      for (const char of clean) {
        const code = char.charCodeAt(0);
        const digit = code <= 57 ? code - 48 : code - 87;
        output = output * 36n + BigInt(digit);
      }
      return output;
    },
    prettyBase36(number) {
      const raw = app.library.bigintToBase36(number);
      const chunks = [];
      for (let index = 0; index < raw.length; index += 8) {
        chunks.push(raw.slice(index, index + 8));
      }
      return chunks.join("-");
    },
    createSearchVariants(phraseRaw, mode, countRaw) {
      const phrase = normalizeText(phraseRaw);
      if (!phrase) {
        throw new Error("После нормализации фраза пуста.");
      }
      if (phrase.length > ALG.pageLength) {
        throw new Error(`Фраза длиннее страницы: ${phrase.length} символов.`);
      }
      const count = clamp(Math.floor(Number(countRaw) || SEARCH_VARIANTS_DEFAULT), 1, SEARCH_VARIANTS_MAX);
      const variants = [];
      for (let variant = 1; variant <= count; variant += 1) {
        const seed = `${ALG.label}:mode:${mode}:phrase:${phrase}:variant:${variant}`;
        const rng = rngFrom(seed);
        const position = choosePosition(mode, phrase.length, rng);
        const filler = createFiller(mode, seed, ALG.pageLength);
        const chars = filler.split("");
        for (let index = 0; index < phrase.length; index += 1) {
          chars[position + index] = phrase[index];
        }
        if (position > 0) {
          chars[position - 1] = " ";
        }
        if (position + phrase.length < chars.length) {
          chars[position + phrase.length] = " ";
        }
        const text = chars.join("");
        const number = textToNumber(text);
        const coords = app.library.numberToCoordinates(number);
        const xy = coordinatesToXY(coords);
        variants.push({
          mode,
          number,
          coordinates: coords,
          xy,
          phrase,
          position,
          text,
          variant,
          range: { start: position, length: phrase.length },
        });
      }
      return variants;
    },
    randomPageNumber() {
      const text = createNoiseFiller(`${Date.now()}:${Math.random()}`, ALG.pageLength);
      return textToNumber(text);
    },
    randomHallXY() {
      const x = Math.floor(Math.random() * 2000) - 1000;
      const y = Math.floor(Math.random() * 2000) - 1000;
      return { x, y };
    },
    parseAnyAddress(raw, kind) {
      const value = String(raw || "").trim();
      if (!value) {
        throw new Error("Нечего распознавать.");
      }
      if (value.includes("#/page/")) {
        return app.library.b64ToNumber(value.split("#/page/").pop().split("?")[0]);
      }
      if (kind === "b64" || /^[A-Za-z0-9_-]+$/.test(value)) {
        try {
          return app.library.b64ToNumber(value.replace(/[^A-Za-z0-9_-]/g, ""));
        } catch (error) {
          if (kind === "b64") {
            throw new Error("Не удалось разобрать base64url.");
          }
        }
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
