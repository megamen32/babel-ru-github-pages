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
    container.scrollTop = container.scrollHeight;
    return typingEl;
  }

  function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  /* ═══════════════════════════════════════════════════════════
     RZHUNEMOGU.RU — Jokes while searching!
     CType 1-18 = different joke categories
     (1=Анекдоты, 2=Стишки, 3=Истории, 4=Афоризмы, 5=Цитаты,
      6=Тосты, 7=Анекдоты(18+), 8=Стишки(18+), 9=Афоризмы(18+),
      10=Цитаты(18+), 11=Тосты(18+), 12=Реклама, 13=Компьютер,
      14=Программистские, 15=Чёрный юмор, 16=В мире животных,
      17=Блондинки, 18=Студенческие)
     ═══════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════
     MULTI-SOURCE JOKE / QUOTE SYSTEM
     ═══════════════════════════════════════════════════════════
     Sources (in priority order):
     1. rzhunemogu.ru — jokes, anecdotes, aphorisms, stories (18 categories)
        via api.codetabs.com CORS proxy (allorigins.win is unreliable)
     2. forismatic.com — wise quotes in Russian (CORS-friendly JSON API)
     3. Built-in fallback — librarian-themed quips */

  let jokesCache = [];
  let jokesFetched = false;
  let jokesFetchPromise = null;

  /* CType descriptions for rzhunemogu.ru */
  const CTYPE_LABELS = {
    1: 'Анекдот', 2: 'Стишок', 3: 'История', 4: 'Афоризм',
    5: 'Цитата', 6: 'Тост', 7: 'Анекдот', 8: 'Стишок',
    9: 'Афоризм', 10: 'Цитата', 11: 'Тост', 12: 'Реклама',
    13: 'Компьютерный', 14: 'Программистский', 15: 'Чёрный юмор',
    16: 'Животные', 17: 'Блондинки', 18: 'Студенческий',
  };

  /* CORS proxies to try in order for rzhunemogu.ru */
  const CORS_PROXIES = [
    (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];

  /* Fetch a single joke from rzhunemogu.ru via CORS proxy cascade */
  function fetchRzhunemogu(cType) {
    const rawUrl = `http://rzhunemogu.ru/Rand.aspx?CType=${cType}`;

    /* Try each proxy in sequence */
    function tryProxy(proxyIndex) {
      if (proxyIndex >= CORS_PROXIES.length) return Promise.resolve(null);
      const proxyUrl = CORS_PROXIES[proxyIndex](rawUrl);
      return fetch(proxyUrl)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then(text => {
          /* API returns XML with windows-1251 encoding via proxy.
             Extract content from <content> tag. */
          const content = text
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
            .replace(/&nbsp;/g, ' ')
            .trim();
          if (content.length > 5) {
            return { text: content, label: CTYPE_LABELS[cType] || 'Юмор' };
          }
          return null;
        })
        .catch(() => tryProxy(proxyIndex + 1));
    }

    return tryProxy(0);
  }

  /* Fetch a wise quote from forismatic.com (CORS-friendly, no proxy needed) */
  function fetchForismaticQuote() {
    return fetch('https://api.forismatic.com/api/1.0/?method=getQuote&format=json&lang=ru')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const text = (data.quoteText || '').trim();
        const author = (data.quoteAuthor || '').trim();
        if (text.length > 5) {
          return {
            text: author ? `${text}\n— ${author}` : text,
            label: 'Мудрость',
          };
        }
        return null;
      })
      .catch(() => null);
  }

  /* Fetch jokes from all sources, collect a diverse set */
  function fetchJokes() {
    if (jokesFetched && jokesCache.length > 0) return Promise.resolve(jokesCache);
    if (jokesFetchPromise) return jokesFetchPromise;

    const promises = [];

    /* 4 jokes from rzhunemogu.ru with random CType for variety */
    for (let i = 0; i < 4; i++) {
      const cType = Math.floor(Math.random() * 18) + 1;
      promises.push(fetchRzhunemogu(cType));
    }

    /* 2 wise quotes from forismatic */
    promises.push(fetchForismaticQuote());
    promises.push(fetchForismaticQuote());

    jokesFetchPromise = Promise.all(promises).then(results => {
      const jokes = results.filter(r => r !== null);
      if (jokes.length === 0) {
        jokesCache = [
          { text: 'Библиотека бесконечна, а анекдоты всё равно конечны.', label: 'Библиотекарь' },
          { text: 'Вавилон считает. Анекдоты загружаются. Жизнь прекрасна.', label: 'Библиотекарь' },
          { text: 'Каждый анекдот уже существует в библиотеке. И каждый раз — на другой странице.', label: 'Библиотекарь' },
          { text: 'Книга — это устройство для перелистывания времени. Борхес это знал.', label: 'Библиотекарь' },
          { text: 'Если бы Борхес мог программировать, он бы написал Вавилон на JavaScript.', label: 'Библиотекарь' },
        ];
      } else {
        jokesCache = jokes;
      }
      jokesFetched = true;
      return jokesCache;
    });

    return jokesFetchPromise;
  }

  /* Show rotating jokes in a container while search runs */
  function startJokeTicker(container) {
    if (!container) return { stop() {} };

    let jokeIndex = 0;
    let intervalId = null;
    let jokeEl = null;

    /* Reset cache so each search gets fresh jokes */
    jokesFetched = false;
    jokesFetchPromise = null;

    fetchJokes().then(jokes => {
      if (!jokes.length) return;
      jokeEl = document.createElement('div');
      jokeEl.className = 'msg msg-them babel-joke-msg';
      const joke = jokes[0];
      const avatar = joke.label === 'Мудрость' ? '🧠' : '😂';
      jokeEl.innerHTML = `
        <div class="msg-avatar">${avatar}</div>
        <div class="msg-bubble">
          <div class="msg-name">${escJoke(joke.label || 'Анекдот')} пока ждёшь</div>
          <div class="babel-joke-text">${escJoke(joke.text)}</div>
        </div>
      `;
      container.appendChild(jokeEl);
      container.scrollTop = container.scrollHeight;

      intervalId = setInterval(() => {
        jokeIndex = (jokeIndex + 1) % jokes.length;
        const textEl = jokeEl.querySelector('.babel-joke-text');
        const nameEl = jokeEl.querySelector('.msg-name');
        const avatarEl = jokeEl.querySelector('.msg-avatar');
        if (textEl) {
          textEl.style.opacity = '0';
          setTimeout(() => {
            const j = jokes[jokeIndex];
            textEl.innerHTML = escJoke(j.text);
            if (nameEl) nameEl.textContent = `${escJoke(j.label || 'Анекдот')} пока ждёшь`;
            if (avatarEl) avatarEl.textContent = j.label === 'Мудрость' ? '🧠' : '😂';
            textEl.style.opacity = '1';
            container.scrollTop = container.scrollHeight;
          }, 300);
        }
      }, 4000);
    });

    return {
      stop() {
        if (intervalId) clearInterval(intervalId);
        if (jokeEl && jokeEl.parentNode) jokeEl.parentNode.removeChild(jokeEl);
      }
    };
  }

  function escJoke(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */

  app.workerBridge = {
    /* Core async operations */
    search(phrase, mode, count) {
      return dispatch('search', { phrase, mode, count: count || 6 });
    },

    getPageData(number) {
      return dispatch('pageData', { number: String(number) });
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
