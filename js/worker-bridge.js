/* ============================================
   ВАВИЛОН — Worker Bridge
   Promise-based API + loading overlay + jokes
   ============================================ */

(() => {
  'use strict';
  const app = window.BabelApp = window.BabelApp || {};

  /* ═══════════════════════════════════════════════════════════
     WORKER MANAGEMENT
     ═══════════════════════════════════════════════════════════ */

  let worker = null;
  let nextId = 1;
  const pending = new Map();

  function getWorker() {
    if (!worker) {
      worker = new Worker('js/worker.js');
      worker.onmessage = function(e) {
        const { id, result, error } = e.data;
        const resolve = pending.get(id);
        if (resolve) {
          pending.delete(id);
          if (error) resolve.reject(new Error(error));
          else resolve.resolve(result);
        }
        /* If no more pending, hide loading */
        if (pending.size === 0) hideLoading();
      };
      worker.onerror = function(err) {
        console.error('Worker error:', err);
        /* Reject all pending */
        for (const [id, { reject }] of pending) {
          reject(new Error('Worker error'));
        }
        pending.clear();
        hideLoading();
      };
    }
    return worker;
  }

  function dispatch(type, payload) {
    const id = nextId++;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    showLoading();
    getWorker().postMessage({ id, type, payload });
    return promise;
  }

  /* ═══════════════════════════════════════════════════════════
     LOADING OVERLAY
     ═══════════════════════════════════════════════════════════ */

  let loadingEl = null;
  let loadingCount = 0;

  /* Loading overlay disabled — jokes + typing indicator in chat
     already provide feedback. The overlay was blocking joke visibility. */
  function showLoading() {}
  function hideLoading() {}

  /* ═══════════════════════════════════════════════════════════
     TYPING INDICATOR (for messenger theme)
     ═══════════════════════════════════════════════════════════ */

  function showTyping(container, name) {
    if (!container) return null;
    const typingEl = document.createElement('div');
    typingEl.className = 'msg msg-them babel-typing-msg';
    typingEl.innerHTML = `
      <div class="msg-avatar">📚</div>
      <div class="msg-bubble">
        <div class="msg-name">${name || 'Библиотекарь'}</div>
        <div class="babel-typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    container.appendChild(typingEl);
    return typingEl;
  }

  function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ═══════════════════════════════════════════════════════════
     OFFLINE-FIRST JOKE / QUOTE SYSTEM
     ═══════════════════════════════════════════════════════════
     Pure local Russian quips/quotes — no network fetch needed.
     Previously fetched from forismatic.com via CORS proxies.
     Now fully offline: deterministic generation from query. */

  let jokesCache = [];
  let jokesFetched = false;
  let jokesFetchPromise = null;
  let jokesCacheKey = '';

  const JOKE_OPENERS = [
    'Библиотекарь шепчет',
    'Архивариус записал',
    'Каталог на полях заметил',
    'Дежурный по залу уверяет',
    'Случайный том подсказывает',
  ];
  const JOKE_SUBJECTS = [
    'что короткая фраза опаснее длинной',
    'что поиск в Вавилоне похож на рыбалку в космосе',
    'что каждая страница притворяется судьбой',
    'что тишина тут индексируется лучше шума',
    'что даже опечатка уже ждёт на своей полке',
  ];
  const JOKE_TWISTS = [
    'потому что вокруг неё помещается слишком много миров.',
    'но библиотека всё равно делает вид, что это рутина.',
    'и спорить с этим умеют только очень смелые книги.',
    'а потом просит не хлопать томами.',
    'так что паниковать пока рано.',
  ];
  const QUOTE_OPENERS = [
    'В хорошей библиотеке поиск не находит ответ, а выбирает декорации для него.',
    'Если текст можно вообразить, Вавилон уже выделил ему полку.',
    'Бесконечность пугает ровно до тех пор, пока не попросишь у неё страницу.',
    'Иногда лучшая навигация по хаосу — точная фраза и немного терпения.',
  ];
  const QUOTE_ENDINGS = [
    '— Борхес бы одобрил, программист бы залогировал.',
    '— Так работает местная география смысла.',
    '— Остальное делает арифметика.',
    '— Дальше остаётся только открыть том.',
  ];

  /* Offline: no forismatic fetch */

  function normalizeJokeSeed(seedText) {
    return String(seedText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function pickSeeded(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  function buildJokes(seedText) {
    const normalizedSeed = normalizeJokeSeed(seedText);
    const rng = app.utils.rngFrom(`joke:${normalizedSeed || 'default'}`);
    const seedMention = normalizedSeed ? ` Фраза «${normalizedSeed.slice(0, 120)}» уже строит себе адрес.` : '';
    const jokes = [];

    for (let index = 0; index < 4; index += 1) {
      jokes.push({
        label: index % 2 === 0 ? 'Шутка' : 'Наблюдение',
        text: `${pickSeeded(JOKE_OPENERS, rng)}: ${pickSeeded(JOKE_SUBJECTS, rng)}, ${pickSeeded(JOKE_TWISTS, rng)}${seedMention}`,
      });
    }

    for (let index = 0; index < 3; index += 1) {
      jokes.push({
        label: 'Цитата',
        text: `${pickSeeded(QUOTE_OPENERS, rng)} ${pickSeeded(QUOTE_ENDINGS, rng)}`,
      });
    }

    jokes.push({
      label: 'Библиотекарь',
      text: 'Пока идут вычисления, представь себе полку, где каждая книга уверена, что ты ищешь именно её.',
    });

    return jokes;
  }

  function fetchJokes(seedText) {
    const cacheKey = normalizeJokeSeed(seedText);
    if (jokesFetched && jokesCache.length > 0 && jokesCacheKey === cacheKey) return Promise.resolve(jokesCache);
    if (jokesFetchPromise && jokesCacheKey === cacheKey) return jokesFetchPromise;

    jokesCacheKey = cacheKey;
    jokesFetchPromise = Promise.resolve().then(() => {
      jokesCache = buildJokes(seedText);
      jokesFetched = true;
      return jokesCache;
    });

    return jokesFetchPromise;
  }

  /* Show rotating jokes in a container while search runs */
  function startJokeTicker(container, options) {
    if (!container) return { stop() {} };

    const seedText = options && options.seedText ? String(options.seedText) : '';
    let jokeIndex = 0;
    let intervalId = null;
    let transitionTimeoutId = null;
    let jokeEl = null;
    let stopped = false;
    let jokes = [];

    function renderJoke(joke) {
      if (!jokeEl || !joke) return;
      const textEl = jokeEl.querySelector('.babel-joke-text');
      const nameEl = jokeEl.querySelector('.msg-name');
      const avatarEl = jokeEl.querySelector('.msg-avatar');
      if (textEl) textEl.innerHTML = escJoke(joke.text);
      if (nameEl) nameEl.textContent = `${joke.label || 'Анекдот'} пока ждёшь`;
      if (avatarEl) avatarEl.textContent = joke.label === 'Цитата' ? '🧠' : '😂';
    }

    function stop() {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      if (transitionTimeoutId) clearTimeout(transitionTimeoutId);
      if (jokeEl && jokeEl.parentNode) jokeEl.parentNode.removeChild(jokeEl);
    }

    fetchJokes(seedText).then((initialJokes) => {
      if (stopped || !container.isConnected || !initialJokes.length) return;
      jokes = initialJokes.slice();
      jokeEl = document.createElement('div');
      jokeEl.className = 'msg msg-them babel-joke-msg';
      const joke = jokes[0];
      const avatar = joke.label === 'Цитата' ? '🧠' : '😂';
      jokeEl.innerHTML = `
        <div class="msg-avatar">${avatar}</div>
        <div class="msg-bubble">
          <div class="msg-name">${escJoke(joke.label || 'Анекдот')} пока ждёшь</div>
          <div class="babel-joke-text">${escJoke(joke.text)}</div>
        </div>
      `;
      container.appendChild(jokeEl);

      intervalId = setInterval(() => {
        if (stopped || !container.isConnected || !jokeEl || !jokeEl.isConnected) {
          stop();
          return;
        }
        jokeIndex = (jokeIndex + 1) % jokes.length;
        const textEl = jokeEl.querySelector('.babel-joke-text');
        const nameEl = jokeEl.querySelector('.msg-name');
        const avatarEl = jokeEl.querySelector('.msg-avatar');
        if (textEl) {
          textEl.style.opacity = '0';
          transitionTimeoutId = setTimeout(() => {
            if (stopped || !container.isConnected || !jokeEl || !jokeEl.isConnected) return;
            const j = jokes[jokeIndex];
            if (nameEl) nameEl.textContent = `${j.label || 'Анекдот'} пока ждёшь`;
            if (avatarEl) avatarEl.textContent = j.label === 'Цитата' ? '🧠' : '😂';
            textEl.innerHTML = escJoke(j.text);
            textEl.style.opacity = '1';
          }, 300);
        }
      }, 4000);
    });

    return {
      stop,
    };
  }

  function escJoke(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */

  /* Search across multiple modes simultaneously.
     Returns { phrase, modes: { [mode]: variant, ... } } — one variant per mode.

     IMPORTANT: Includes a 'prefix' mode that uses encodePhraseToCoords()
     through the prefix codec. This guarantees the phrase EXISTS in the
     decoded page when the user navigates to the result. The legacy
     worker modes (empty, dialogue, etc.) use the old byte-level system
     and the phrase may NOT be in the prefix-decoded page. */
  function searchMultiMode(phrase, modes) {
    const modeList = modes || ['empty', 'dialogue', 'post', 'diary', 'log', 'words'];
    const promises = modeList.map(mode =>
      dispatch('search', { phrase, mode, count: 1 })
        .then(variants => ({ mode, variant: variants[0] || null }))
        .catch(() => ({ mode, variant: null }))
    );

    /* Add prefix-verified mode: uses encodePhraseToCoords() which
       goes through the prefix codec. The phrase IS guaranteed to
       exist (or at least individual words) in the decoded page.
       Now supports variant parameter for multiple different results. */
    const prefixVariant = Math.floor(Math.random() * 100) + 1;
    promises.push(
      Promise.resolve().then(() => {
        try {
          const lib = app.library;
          const result = lib.encodePhraseToCoords(phrase, prefixVariant);
          if (!result) return { mode: 'prefix', variant: null };

          /* Convert BigInt coordinates to strings for serialization */
          const coords = result.coordinates || {};
          const xy = result.xy || {};
          return {
            mode: 'prefix',
            variant: {
              mode: 'prefix',
              number: String(result.number || 0n),
              coordinates: {
                sector: String(coords.sector || 1n),
                hall: String(coords.hall || 1n),
                wall: String(coords.wall || 1n),
                shelf: String(coords.shelf || 1n),
                volume: String(coords.volume || 1n),
                page: String(coords.page || 1n),
                x: String(coords.x || 0n),
                y: String(coords.y || 0n),
                z: String(coords.z || 1n),
              },
              xy: { x: String(xy.x || 0n), y: String(xy.y || 0n) },
              phrase: result.phrase,
              position: result.position || 0,
              text: result.text,
              variant: result.variant || prefixVariant,
              range: result.range || { start: 0, length: 0 },
              prefixVerified: true,
              phraseFound: result.phraseFound !== false,
            },
          };
        } catch (err) {
          console.warn('prefix search error:', err);
          return { mode: 'prefix', variant: null };
        }
      })
    );

    return Promise.all(promises).then(results => {
      const byMode = {};
      for (const r of results) {
        if (r.variant) byMode[r.mode] = r.variant;
      }
      return { phrase, modes: byMode };
    });
  }

  app.workerBridge = {
    /* Core async operations */
    search(phrase, mode, count) {
      return dispatch('search', { phrase, mode, count: count || 6 });
    },

    searchMultiMode,

    getPageData(number) {
      return dispatch('pageData', { number: String(number) });
    },

    /* Prefix codec page decode: (x, y, z) → human-readable page text */
    getPrefixPageData(x, y, z, mode) {
      return dispatch('prefixDecodePage', { x, y, z, mode: mode || 'human' });
    },

    getBookSpines(x, y, wall) {
      return dispatch('bookSpines', { x, y, wall });
    },

    getBookSpine(x, y, wall, shelf, volume) {
      return dispatch('bookSpine', { x, y, wall, shelf, volume });
    },

    numberToIndices(number) {
      return dispatch('numberToIndices', { number: String(number) });
    },

    coordinatesToNumber(coordinates) {
      return dispatch('coordinatesToNumber', { coordinates });
    },

    numberToB64(number) {
      return dispatch('numberToB64', { number: String(number) });
    },

    xyToHallXY(x, y) {
      return dispatch('xyToHallXY', { x, y });
    },

    hallToXY(sector, hall) {
      return dispatch('hallToXY', { sector, hall });
    },

    /* Loading UI helpers */
    showLoading,
    hideLoading,
    showTyping,
    removeTyping,

    /* Jokes */
    fetchJokes,
    startJokeTicker,

    /* Check if bridge is available (workers supported) */
    isAvailable() {
      return typeof Worker !== 'undefined';
    },
  };
})();
