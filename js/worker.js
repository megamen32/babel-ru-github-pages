/* ============================================
   ВАВИЛОН — Web Worker for async BigInt ops
   Thin wrapper: imports shared lib-*.js modules
   via importScripts() and delegates computation
   to app.library API.
   ============================================ */

'use strict';

/* ─── Worker compatibility shims ───
   IIFE lib-*.js scripts reference window.BabelApp,
   document, and localStorage. Provide minimal stubs
   so they execute correctly in the Worker context. */

self.window = self;
self.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
};
self.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
self.BabelApp = self.BabelApp || {};
self.BabelApp.library = self.BabelApp.library || {};

/* ─── Load shared modules in dependency order ───
   Same order as index.html <script defer> tags.
   importScripts() is synchronous — each script runs
   to completion before the next one starts. */

importScripts(
  'words.js',
  'config.js',
  'utils.js',
  'lib-prefix-codec.js',
  'lib-token-table.js',
  'lib-address-codec.js',
  'lib-coordinate-permutation.js',
  'lib-tokens.js',
  'lib-core.js',
  'lib-fillers.js',
  'lib-classifier.js',
  'lib-api.js'
);

/* ─── Convenience references ─── */
const lib = self.BabelApp.library;
const ALG = self.BabelApp.config.ALG;

/* ─── Lazy-load external token dictionary ─── */
let _dictLoaded = false;

async function ensureDictionary() {
  if (_dictLoaded) return;
  try {
    await lib.loadTokenDictionary();
  } catch (_e) {
    /* Dictionary fetch may fail in Worker — inline fallback is fine */
  }
  _dictLoaded = true;
}

/* ─── BigInt serialization helper ───
   BigInt values cannot cross postMessage() via structured clone.
   All BigInt values must be .toString()'d before posting. */

function stringifyCoords(coords) {
  return {
    x: coords.x.toString(),
    y: coords.y.toString(),
    z: coords.z.toString(),
    sector: coords.sector.toString(),
    hall: coords.hall.toString(),
    wall: coords.wall.toString(),
    shelf: coords.shelf.toString(),
    volume: coords.volume.toString(),
    page: coords.page.toString(),
  };
}

function stringifyXY(xy) {
  return { x: xy.x.toString(), y: xy.y.toString() };
}

/* ─── Core page decode: (x, y, z) → page data ─── */

function prefixDecodePage(x, y, z, mode) {
  const bx = BigInt(x);
  const by = BigInt(y);
  const bz = BigInt(z || 1);

  const text = lib.decodePage(bx, by, bz, null, mode || 'human');
  const coords = lib.xyToCoordinates(bx, by, bz);
  const xy = lib.coordinatesToXY(coords);
  const number = lib.coordinatesToNumber(coords);
  const classification = lib.classifyPageByText
    ? lib.classifyPageByText(text)
    : { kind: 'text', label: 'Текст', score: 0.5, icon: '📖' };

  return {
    text,
    coords: stringifyCoords(coords),
    xy: stringifyXY(xy),
    number: number.toString(),
    title: lib.pageTitle(coords),
    temperature: 1.0,
    classification,
    engine: mode === 'random' ? 'byte-level' : 'prefix',
  };
}

/* ─── Search: phrase → address variants ─── */

function createSearchVariants(phrase, mode, count) {
  const variants = lib.createSearchVariants(phrase, mode, count);
  return variants.map(v => {
    const c = v.coordinates || {};
    const xy = v.xy || {};
    return {
      mode: v.mode || mode,
      number: String(v.number || 0n),
      coordinates: {
        x: String(c.x || 0n), y: String(c.y || 0n), z: String(c.z || 1n),
        sector: String(c.sector || 1n), hall: String(c.hall || 1n),
        wall: String(c.wall || 1n), shelf: String(c.shelf || 1n),
        volume: String(c.volume || 1n), page: String(c.page || 1n),
      },
      xy: { x: String(xy.x || 0n), y: String(xy.y || 0n) },
      phrase: v.phrase,
      position: v.position || v.range?.start || 0,
      text: v.text,
      variant: v.variant || 1,
      range: v.range || { start: 0, length: 0 },
      phraseFound: v.phraseFound !== false,
    };
  });
}

/* ─── Search: phrase → address variants (Feistel-compatible for random mode) ─── */

function createSearchVariantsFeistel(phrase, mode, count) {
  /* Feistel-compatible search for random library mode.
     Uses the same lib.createSearchVariants but forces mode to 'random'
     so that coordinates decode correctly through Feistel permutation
     when prefixDecodePage uses mode='random'. */
  const effectiveMode = mode || 'random';
  const variants = lib.createSearchVariants(phrase, effectiveMode, count);
  return variants.map(v => {
    const c = v.coordinates || {};
    const xy = v.xy || {};
    return {
      mode: v.mode || effectiveMode,
      number: String(v.number || 0n),
      coordinates: {
        x: String(c.x || 0n), y: String(c.y || 0n), z: String(c.z || 1n),
        sector: String(c.sector || 1n), hall: String(c.hall || 1n),
        wall: String(c.wall || 1n), shelf: String(c.shelf || 1n),
        volume: String(c.volume || 1n), page: String(c.page || 1n),
      },
      xy: { x: String(xy.x || 0n), y: String(xy.y || 0n) },
      phrase: v.phrase,
      position: v.position || v.range?.start || 0,
      text: v.text,
      variant: v.variant || 1,
      range: v.range || { start: 0, length: 0 },
      phraseFound: v.phraseFound !== false,
    };
  });
}

/* ─── Page data from BigInt number (legacy byte-level) ─── */

function getPageData(number) {
  const num = BigInt(number);
  const coords = lib.numberToCoordinates(num);
  const text = lib.numberToText(num);
  const xy = lib.coordinatesToXY(coords);
  return {
    text,
    coordinates: stringifyCoords(coords),
    xy: stringifyXY(xy),
    number: num.toString(),
    title: lib.pageTitle(coords),
  };
}

/* ─── Book spines ─── */

function getBookSpines(x, y, wall) {
  const spines = [];
  const bx = BigInt(x);
  const by = BigInt(y);
  for (let s = 1n; s <= ALG.shelvesPerWall; s++) {
    for (let v = 1n; v <= ALG.volumesPerShelf; v++) {
      const z = (BigInt(wall || 1) - 1n) * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume
        + (s - 1n) * ALG.volumesPerShelf * ALG.pagesPerVolume
        + v * ALG.pagesPerVolume;
      const text = lib.getBookSpine(bx, by, z);
      const cls = lib.classifySpine(text);
      spines.push({ text, cls });
    }
  }
  return spines;
}

/* ═══════════════════════════════════════════════════════════
   MESSAGE HANDLER
   ═══════════════════════════════════════════════════════════ */

/* Async operations that need the external dictionary */
async function handleMessageAsync(type, payload) {
  switch (type) {
    case 'prefixDecodePage': {
      await ensureDictionary();
      const { x, y, z, mode } = payload;
      return prefixDecodePage(x, y, z, mode);
    }

    case 'prefixSearch': {
      await ensureDictionary();
      const { phrase, variant } = payload;
      const result = lib.encodePhraseToCoords(phrase, variant || 1);
      if (!result) return { found: false, phrase };

      const c = result.coordinates || {};
      const xy = result.xy || {};
      return {
        found: true,
        phrase: result.phrase,
        text: result.text,
        phrasePos: result.position || 0,
        phraseLen: result.range?.length || 0,
        address: String(result.number || 0n),
        coords: {
          x: String(c.x || 0n), y: String(c.y || 0n), z: String(c.z || 1n),
          sector: String(c.sector || 1n), hall: String(c.hall || 1n),
          wall: String(c.wall || 1n), shelf: String(c.shelf || 1n),
          volume: String(c.volume || 1n), page: String(c.page || 1n),
        },
        xy: { x: String(xy.x || 0n), y: String(xy.y || 0n) },
      };
    }

    default:
      return undefined; // Not an async handler
  }
}

self.onmessage = async function(e) {
  const { id, type, payload } = e.data;

  try {
    /* Try async handlers first (they need dictionary) */
    const asyncResult = await handleMessageAsync(type, payload);
    if (asyncResult !== undefined) {
      self.postMessage({ id, result: asyncResult, error: null });
      return;
    }

    /* Sync handlers (legacy) */
    let result;
    switch (type) {
      case 'search': {
        const { phrase, mode, count } = payload;
        result = createSearchVariants(phrase, mode, count);
        break;
      }
      case 'searchRandom': {
        /* Feistel-compatible search for random library mode */
        const { phrase, mode, count } = payload;
        result = createSearchVariantsFeistel(phrase, mode, count);
        break;
      }
      case 'pageData': {
        const { number } = payload;
        result = getPageData(number);
        break;
      }
      case 'bookSpines': {
        const { x, y, wall } = payload;
        result = getBookSpines(x, y, wall);
        break;
      }
      case 'bookSpine': {
        const { x, y, wall, shelf, volume } = payload;
        const bx = BigInt(x); const by = BigInt(y);
        const z = (BigInt(wall || 1) - 1n) * ALG.shelvesPerWall * ALG.volumesPerShelf * ALG.pagesPerVolume
          + (BigInt(shelf || 1) - 1n) * ALG.volumesPerShelf * ALG.pagesPerVolume
          + BigInt(volume || 1) * ALG.pagesPerVolume;
        const spineText = lib.getBookSpine(bx, by, z);
        const cls = lib.classifySpine(spineText);
        result = { spineText, cls };
        break;
      }
      case 'numberToIndices': {
        const { number } = payload;
        result = lib.numberToIndices(BigInt(number));
        break;
      }
      case 'coordinatesToNumber': {
        const c = payload.coordinates;
        const coords = {
          sector: BigInt(c.sector || 1), hall: BigInt(c.hall || 1),
          wall: BigInt(c.wall || 1), shelf: BigInt(c.shelf || 1),
          volume: BigInt(c.volume || 1), page: BigInt(c.page || 1),
        };
        result = lib.coordinatesToNumber(coords).toString();
        break;
      }
      case 'numberToB64': {
        result = lib.numberToB64(BigInt(payload.number));
        break;
      }
      case 'xyToHallXY': {
        const { x, y } = payload;
        const hi = lib.xyToHallXY(x, y);
        result = { sector: hi.sector.toString(), hall: hi.hall.toString() };
        break;
      }
      case 'hallToXY': {
        const { sector, hall } = payload;
        const xy = lib.hallToXY(sector, hall);
        result = { x: xy.x.toString(), y: xy.y.toString() };
        break;
      }
      default:
        throw new Error(`Unknown worker operation: ${type}`);
    }
    self.postMessage({ id, result, error: null });
  } catch (err) {
    self.postMessage({ id, result: null, error: err.message });
  }
};
