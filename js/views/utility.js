(() => {
  const app = window.BabelApp;
  const { copyText, esc } = app.utils;
  const { pageRoute, passport, sectionShell } = app.views.common;

  app.views.favorites = function renderFavorites() {
    const items = app.storage.readStore("babelFavorites");
    return sectionShell(`
      <section class="utility-layout">
        <article class="card utility-card">
          <p class="eyebrow">Избранное</p>
          <h1>Сохранённые страницы и поисковые находки.</h1>
          <div class="utility-list">
            ${items.length ? items.map((item, index) => `
              <div class="utility-item">
                <strong>${esc(item.title || item.type)}</strong>
                <small>${esc(new Date(item.createdAt).toLocaleString())}</small>
                <div class="result-actions">
                  <a class="mini-button primary" href="${esc(item.url)}">Открыть</a>
                  <button class="mini-button" data-remove-favorite="${index}" type="button">Удалить</button>
                </div>
              </div>
            `).join("") : '<div class="empty-search">Пока ничего не сохранено.</div>'}
          </div>
        </article>
      </section>
    `);
  };

  app.views.history = function renderHistory() {
    const items = app.storage.readStore("babelHistory");
    return sectionShell(`
      <section class="utility-layout">
        <article class="card utility-card">
          <p class="eyebrow">История</p>
          <h1>Последние переходы по библиотеке.</h1>
          <div class="result-actions">
            <button class="mini-button" id="clearHistoryBtn" type="button">Очистить историю</button>
          </div>
          <div class="utility-list">
            ${items.length ? items.map((item) => `
              <div class="utility-item">
                <strong>${esc(item.title || item.type)}</strong>
                <small>${esc(new Date(item.createdAt).toLocaleString())}</small>
                <a class="mini-button primary" href="${esc(item.url)}">Открыть</a>
              </div>
            `).join("") : '<div class="empty-search">История пуста.</div>'}
          </div>
        </article>
      </section>
    `);
  };

  app.views.converter = function renderConverter() {
    return sectionShell(`
      <section class="utility-layout">
        <article class="card utility-card">
          <p class="eyebrow">Конвертер адресов</p>
          <h1>Преобразование машинного адреса в страницу библиотеки.</h1>
          <form id="converterForm" class="search-form">
            <label class="field">
              <span>Тип адреса</span>
              <select id="converterKind">
                <option value="auto">Определить автоматически</option>
                <option value="b64">base64url</option>
                <option value="b36">base36</option>
              </select>
            </label>
            <label class="field">
              <span>Адрес или ссылка</span>
              <textarea id="converterInput" placeholder="Вставьте адрес страницы, base64url или base36"></textarea>
            </label>
            <div class="search-actions">
              <button class="cta-inline" type="submit">Распознать</button>
            </div>
          </form>
          <div id="converterResult"></div>
        </article>
      </section>
    `);
  };

  app.views.bindUtility = function bindUtilityView(routeName) {
    if (routeName === "favorites") {
      document.querySelectorAll("[data-remove-favorite]").forEach((button) => {
        button.addEventListener("click", () => {
          const items = app.storage.readStore("babelFavorites");
          items.splice(Number(button.dataset.removeFavorite), 1);
          app.storage.writeStore("babelFavorites", items, 100);
          location.hash = "#/favorites";
          app.main.mount();
        });
      });
      return;
    }

    if (routeName === "history") {
      document.querySelector("#clearHistoryBtn")?.addEventListener("click", () => {
        app.storage.writeStore("babelHistory", [], 100);
        app.main.mount();
      });
      return;
    }

    if (routeName === "converter") {
      document.querySelector("#converterForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const kind = document.querySelector("#converterKind").value;
        const raw = document.querySelector("#converterInput").value;
        const resultNode = document.querySelector("#converterResult");
        try {
          const number = app.library.parseAnyAddress(raw, kind);
          const coordinates = app.library.numberToCoordinates(number);
          resultNode.innerHTML = `
            <div class="notice good">Адрес распознан.</div>
            ${passport(number, coordinates)}
            <div class="result-actions">
              <a class="mini-button primary" href="${pageRoute(number)}">Открыть страницу</a>
              <button class="mini-button" id="copyConverterPage" type="button">Скопировать ссылку</button>
            </div>
          `;
          document.querySelector("#copyConverterPage")?.addEventListener("click", () => {
            copyText(`${location.origin}${location.pathname}${pageRoute(number)}`, "Ссылка на страницу скопирована.");
          });
        } catch (error) {
          resultNode.innerHTML = `<div class="notice warning">${esc(error.message)}</div>`;
        }
      });
    }
  };
})();
