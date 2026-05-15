(() => {
  const app = window.BabelApp;
  const { ALG, QUOTE } = app.config;
  const { esc, routeFor, shortNumber } = app.utils;

  app.views = app.views || {};
  app.views.common = {
    pageRoute(number, highlight) {
      const params = highlight ? { hl: `${highlight.start}:${highlight.length}` } : null;
      return routeFor(`/page/${app.library.numberToB64(number)}`, params);
    },
    libraryRoute(coordinates) {
      const segments = ["/library"];
      if (coordinates.sector) {
        segments.push("sector", coordinates.sector);
      }
      if (coordinates.hall) {
        segments.push("hall", coordinates.hall);
      }
      if (coordinates.wall) {
        segments.push("wall", coordinates.wall);
      }
      if (coordinates.shelf) {
        segments.push("shelf", coordinates.shelf);
      }
      if (coordinates.volume) {
        segments.push("volume", coordinates.volume);
      }
      if (coordinates.page) {
        segments.push("page", coordinates.page);
      }
      return routeFor(segments.join("/"));
    },
    sectionShell(inner) {
      return `<section class="section-shell">${inner}</section>`;
    },
    renderLayout(content) {
      return `
        <div class="shell">
          <header class="site-header">
            <a class="brand" href="#/">
              <span class="brand-mark">БВ</span>
              <span class="brand-copy">
                <strong>Библиотека Вавилона</strong>
                <small>художественная русская версия · статический сайт</small>
              </span>
            </a>
            <nav class="top-nav">
              <a href="#/">Главная</a>
              <a href="#/library">Прогулка</a>
              <a href="#/search">Поиск</a>
              <a href="#/about">Алгоритм и доказательство</a>
              <a href="#/favorites">Избранное</a>
            </nav>
          </header>
          <main id="view">${content}</main>
          <footer class="site-footer">
            <span>${QUOTE.author}</span>
            <span>${esc(QUOTE.source)}</span>
            <span>${ALG.pageLength} символов на страницу</span>
          </footer>
        </div>
      `;
    },
    breadcrumbs(items) {
      return `<div class="breadcrumbs">${items.map((item) => `<a class="crumb" href="${item.href}">${esc(item.label)}</a>`).join("")}</div>`;
    },
    utilityLinks() {
      return `
        <div class="utility-links">
          <a class="utility-link" href="#/converter">Конвертер адресов</a>
          <a class="utility-link" href="#/history">История переходов</a>
          <button class="utility-link button-reset" id="randomPageBtn" type="button">Случайная страница</button>
        </div>
      `;
    },
    passport(number, coordinates) {
      const b64 = app.library.numberToB64(number);
      return `
        <section class="passport-card">
          <div class="passport-grid">
            <div class="passport-label">Координаты</div>
            <div class="passport-value">сектор ${coordinates.sector} / зал ${coordinates.hall} / стена ${coordinates.wall} / полка ${coordinates.shelf} / том ${coordinates.volume} / лист ${coordinates.page}</div>
            <div class="passport-label">base64url</div>
            <div class="passport-value">${esc(b64)}</div>
            <div class="passport-label">base36</div>
            <div class="passport-value">${esc(app.library.prettyBase36(number))}</div>
            <div class="passport-label">Сектор</div>
            <div class="passport-value">${shortNumber(coordinates.sector)}</div>
          </div>
        </section>
      `;
    },
  };
})();
