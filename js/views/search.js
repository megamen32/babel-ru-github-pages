(() => {
  const app = window.BabelApp;
  const { SEARCH_VARIANTS_DEFAULT, SEARCH_VARIANTS_MAX } = app.config;
  const { addFavorite, pushHistory } = app.storage;
  const { copyText, esc, highlightByRange, snippetByRange } = app.utils;
  const { pageRoute, sectionShell, utilityLinks } = app.views.common;

  function modeLabel(mode) {
    return { empty: "Пустота", noise: "Шум", words: "Русские слова" }[mode] || mode;
  }

  function renderVariantCard(variant) {
    const preview = snippetByRange(variant.text, variant.range);
    const highlightStart = Math.max(0, preview.indexOf(variant.phrase));
    const highlightedPreview = highlightByRange(preview, { start: highlightStart, length: variant.phrase.length });
    return `
      <article class="result-card">
        <div class="result-head">
          <strong>Вариант ${variant.variant}</strong>
          <span>${modeLabel(variant.mode)} · позиция ${variant.position + 1}</span>
        </div>
        <p class="result-preview">${highlightedPreview}</p>
        <div class="coordinate-line">
          <span>сектор ${variant.coordinates.sector}</span>
          <span>зал ${variant.coordinates.hall}</span>
          <span>стена ${variant.coordinates.wall}</span>
          <span>полка ${variant.coordinates.shelf}</span>
          <span>том ${variant.coordinates.volume}</span>
          <span>лист ${variant.coordinates.page}</span>
        </div>
        <div class="result-actions">
          <a class="mini-button primary" href="${pageRoute(variant.number, variant.range)}">Открыть страницу</a>
          <button class="mini-button" data-copy-page="${pageRoute(variant.number, variant.range)}" type="button">Скопировать ссылку</button>
          <button class="mini-button" data-save='${esc(JSON.stringify({ title: variant.phrase, url: pageRoute(variant.number, variant.range), type: "find" }))}' type="button">В избранное</button>
        </div>
      </article>
    `;
  }

  app.views.search = function renderSearch(params) {
    const phrase = params.get("q") || "";
    const mode = params.get("mode") || "empty";
    const count = params.get("count") || String(SEARCH_VARIANTS_DEFAULT);

    let resultsHtml = '<div class="empty-search">Введите фразу, чтобы увидеть библиотеку в одном из трёх режимов окружения.</div>';
    if (phrase.trim()) {
      try {
        const variants = app.library.createSearchVariants(phrase, mode, count);
        pushHistory({ type: "search", title: `Поиск: ${variants[0].phrase}`, url: location.hash });
        resultsHtml = variants.map(renderVariantCard).join("");
      } catch (error) {
        resultsHtml = `<div class="notice warning">${esc(error.message)}</div>`;
      }
    }

    return sectionShell(`
      <section class="search-layout">
        <div class="card search-main">
          <p class="eyebrow">Поиск страницы</p>
          <h1>Фраза внутри пустоты, шума или русской речи.</h1>
          <p class="lede">Поиск больше не выбирает только место в строке. Он выбирает тип мира, который окружает вашу фразу.</p>
          <form id="searchForm" class="search-form">
            <label class="field">
              <span>Искомая фраза</span>
              <textarea id="searchPhraseInput" placeholder="Например: всякая строка уже написана">${esc(phrase)}</textarea>
            </label>
            <div class="search-controls">
              <label class="field">
                <span>Режим окружения</span>
                <select id="searchModeInput">
                  <option value="empty" ${mode === "empty" ? "selected" : ""}>Пустота</option>
                  <option value="noise" ${mode === "noise" ? "selected" : ""}>Шум</option>
                  <option value="words" ${mode === "words" ? "selected" : ""}>Русские слова</option>
                </select>
              </label>
              <label class="field">
                <span>Вариантов</span>
                <input id="searchCountInput" inputmode="numeric" value="${esc(count)}" />
              </label>
            </div>
            <div class="search-actions">
              <button class="cta-inline" type="submit">Показать страницы</button>
              <button class="ghost-inline" id="shareSearchBtn" type="button">Скопировать ссылку</button>
            </div>
          </form>
        </div>
        <aside class="card search-aside">
          <h2>Три режима</h2>
          <div class="mode-list">
            <article><strong>Пустота</strong><p>Страница почти безмолвна, и ваша фраза висит в белом пространстве.</p></article>
            <article><strong>Шум</strong><p>Фраза возникает внутри случайного символьного моря.</p></article>
            <article><strong>Русские слова</strong><p>Фраза вплетена в псевдокаталог, похожий на бесконечную русскую прозу.</p></article>
          </div>
          ${utilityLinks()}
        </aside>
        <section class="search-results">${resultsHtml}</section>
      </section>
    `);
  };

  app.views.bindSearch = function bindSearchView() {
    const form = document.querySelector("#searchForm");
    if (!form) {
      return;
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      const phrase = document.querySelector("#searchPhraseInput").value.trim();
      const mode = document.querySelector("#searchModeInput").value;
      const rawCount = document.querySelector("#searchCountInput").value || String(SEARCH_VARIANTS_DEFAULT);
      const count = Math.max(1, Math.min(SEARCH_VARIANTS_MAX, Number(rawCount) || SEARCH_VARIANTS_DEFAULT));
      location.hash = `#/search?q=${encodeURIComponent(phrase)}&mode=${encodeURIComponent(mode)}&count=${encodeURIComponent(String(count))}`;
    };

    document.querySelector("#shareSearchBtn")?.addEventListener("click", () => {
      copyText(location.href, "Ссылка на поиск скопирована.");
    });
    document.querySelectorAll("[data-copy-page]").forEach((button) => {
      button.addEventListener("click", () => {
        copyText(`${location.origin}${location.pathname}${button.dataset.copyPage}`, "Ссылка на страницу скопирована.");
      });
    });
    document.querySelectorAll("[data-save]").forEach((button) => {
      button.addEventListener("click", () => {
        addFavorite(JSON.parse(button.dataset.save));
        window.alert("Находка добавлена в избранное.");
      });
    });
  };
})();
