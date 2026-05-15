(() => {
  const app = window.BabelApp;
  const { addFavorite, pushHistory } = app.storage;
  const { copyText, downloadText, esc, renderPageSpans } = app.utils;
  const { breadcrumbs, libraryRoute, passport, sectionShell } = app.views.common;

  function selectionRange() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.toString().trim()) {
      return null;
    }
    const spans = [...document.querySelectorAll("#pageText .char[data-pos]")].filter((span) => selection.getRangeAt(0).intersectsNode(span));
    if (!spans.length) {
      return null;
    }
    const positions = spans.map((span) => Number(span.dataset.pos));
    const start = Math.min(...positions);
    const end = Math.max(...positions) + 1;
    return { start, length: end - start };
  }

  app.views.page = function renderPage(parts, params) {
    const encoded = parts[1] || "";
    const number = app.library.b64ToNumber(encoded);
    const coordinates = app.library.numberToCoordinates(number);
    const text = app.library.numberToText(number);
    const highlight = app.library.parseHighlight(params);
    const title = app.library.pageTitle(coordinates);

    pushHistory({ type: "page", title, url: location.hash });

    return sectionShell(`
      <article class="page-layout card">
        ${breadcrumbs([
          { label: "Главная", href: "#/" },
          { label: "Прогулка", href: "#/library" },
          { label: `Зал ${coordinates.hall}`, href: libraryRoute({ sector: coordinates.sector, hall: coordinates.hall }) },
          { label: `Том ${coordinates.volume}`, href: libraryRoute(coordinates) },
        ])}
        <div class="page-header">
          <div>
            <p class="eyebrow">Страница библиотеки</p>
            <h1>${esc(title)}</h1>
          </div>
          <div class="page-nav">
            <a class="mini-button" href="${libraryRoute({ ...coordinates, page: 1 })}">Назад к тому</a>
            <button class="mini-button" id="favoritePageBtn" type="button">В избранное</button>
            <button class="mini-button" id="copyPageLinkBtn" type="button">Скопировать ссылку</button>
          </div>
        </div>
        <div id="pageText" class="page-text">${renderPageSpans(text, highlight)}</div>
        <div class="page-actions">
          <button class="mini-button" id="copySelectedBtn" type="button">Ссылка на выделение</button>
          <button class="mini-button" id="copyTextBtn" type="button">Скопировать текст</button>
          <button class="mini-button" id="downloadPageBtn" type="button">Скачать .txt</button>
        </div>
        ${passport(number, coordinates)}
      </article>
    `);
  };

  app.views.bindPage = function bindPageView() {
    const path = location.hash.slice(2).split("?")[0];
    const encoded = path.split("/")[1];
    if (!encoded) {
      return;
    }
    const number = app.library.b64ToNumber(encoded);
    const coordinates = app.library.numberToCoordinates(number);
    const text = app.library.numberToText(number);

    document.querySelector("#favoritePageBtn")?.addEventListener("click", () => {
      addFavorite({ title: app.library.pageTitle(coordinates), type: "page", url: location.hash });
      window.alert("Страница добавлена в избранное.");
    });
    document.querySelector("#copyPageLinkBtn")?.addEventListener("click", () => {
      copyText(location.href, "Ссылка на страницу скопирована.");
    });
    document.querySelector("#copyTextBtn")?.addEventListener("click", () => {
      copyText(text, "Текст страницы скопирован.");
    });
    document.querySelector("#downloadPageBtn")?.addEventListener("click", () => {
      downloadText("babel-page.txt", `${app.library.pageTitle(coordinates)}\n\n${text}`);
    });
    document.querySelector("#copySelectedBtn")?.addEventListener("click", () => {
      const range = selectionRange();
      if (!range) {
        window.alert("Сначала выделите фрагмент внутри страницы.");
        return;
      }
      copyText(`${location.origin}${location.pathname}${app.views.common.pageRoute(number, range)}`, "Ссылка на выделение скопирована.");
    });
  };
})();
