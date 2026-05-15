(() => {
  const app = window.BabelApp;
  const { ALG } = app.config;
  const { pushHistory } = app.storage;
  const { esc, shortNumber } = app.utils;
  const { breadcrumbs, libraryRoute, pageRoute, sectionShell, utilityLinks } = app.views.common;

  function parsePart(parts, label, fallback) {
    const index = parts.indexOf(label);
    return index >= 0 && parts[index + 1] ? parts[index + 1] : fallback;
  }

  function parseLibraryPath(parts) {
    return {
      sector: parsePart(parts, "sector", "1"),
      hall: parsePart(parts, "hall", "1"),
      wall: parsePart(parts, "wall", "1"),
      shelf: parsePart(parts, "shelf", "1"),
      volume: parsePart(parts, "volume", "1"),
      page: parsePart(parts, "page", "1"),
    };
  }

  function renderGridCards(total, label, hrefFactory, subtitleFactory) {
    return `
      <div class="library-grid">
        ${Array.from({ length: total }, (_, index) => {
          const value = index + 1;
          return `
            <a class="library-card" href="${hrefFactory(value)}">
              <strong>${label} ${value}</strong>
              <small>${subtitleFactory(value)}</small>
            </a>
          `;
        }).join("")}
      </div>
    `;
  }

  app.views.library = function renderLibrary(parts) {
    const coordinates = parseLibraryPath(parts);
    const hasPage = parts.includes("page");
    const hasVolume = parts.includes("volume");
    const hasShelf = parts.includes("shelf");
    const hasWall = parts.includes("wall");

    if (hasPage) {
      const number = app.library.coordinatesToNumber(coordinates);
      location.hash = pageRoute(number);
      return "";
    }

    let title = `Сектор ${shortNumber(coordinates.sector)} · Зал ${coordinates.hall}`;
    let subtitle = "Выберите следующий уровень, чтобы углубиться в архитектуру библиотеки.";
    let grid = renderGridCards(Number(ALG.wallsPerHall), "Стена", (wall) => libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall }), () => `${ALG.shelvesPerWall} полок`);
    let crumbs = breadcrumbs([
      { label: "Прогулка", href: "#/library" },
      { label: `Сектор ${shortNumber(coordinates.sector)}`, href: libraryRoute({ sector: coordinates.sector, hall: coordinates.hall }) },
      { label: `Зал ${coordinates.hall}`, href: libraryRoute({ sector: coordinates.sector, hall: coordinates.hall }) },
    ]);

    if (hasWall && !hasShelf) {
      title = `Стена ${coordinates.wall}`;
      subtitle = "Каждая стена разбита на пять полок. Здесь библиотека становится ритмом повторяющихся секций.";
      grid = renderGridCards(Number(ALG.shelvesPerWall), "Полка", (shelf) => libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall: coordinates.wall, shelf }), () => `${ALG.volumesPerShelf} тома`);
      crumbs += breadcrumbs([{ label: `Стена ${coordinates.wall}`, href: libraryRoute(coordinates) }]);
    } else if (hasShelf && !hasVolume) {
      title = `Полка ${coordinates.shelf}`;
      subtitle = "Тома разложены последовательно, но сама библиотека остаётся бесконечной на вид.";
      grid = renderGridCards(Number(ALG.volumesPerShelf), "Том", (volume) => libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall: coordinates.wall, shelf: coordinates.shelf, volume }), () => `${ALG.pagesPerVolume} страниц`);
      crumbs += breadcrumbs([
        { label: `Стена ${coordinates.wall}`, href: libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall: coordinates.wall }) },
        { label: `Полка ${coordinates.shelf}`, href: libraryRoute(coordinates) },
      ]);
    } else if (hasVolume) {
      title = `Том ${coordinates.volume}`;
      subtitle = "Последний шаг перед самой страницей. Каждый лист можно открыть как отдельный адрес библиотеки.";
      grid = renderGridCards(Number(ALG.pagesPerVolume), "Лист", (page) => libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall: coordinates.wall, shelf: coordinates.shelf, volume: coordinates.volume, page }), () => "открыть страницу");
      crumbs += breadcrumbs([
        { label: `Стена ${coordinates.wall}`, href: libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall: coordinates.wall }) },
        { label: `Полка ${coordinates.shelf}`, href: libraryRoute({ sector: coordinates.sector, hall: coordinates.hall, wall: coordinates.wall, shelf: coordinates.shelf }) },
        { label: `Том ${coordinates.volume}`, href: libraryRoute(coordinates) },
      ]);
    }

    pushHistory({ type: "library", title, url: location.hash || "#/library" });

    return sectionShell(`
      <section class="library-layout">
        <div class="card library-intro">
          <p class="eyebrow">Прогулка по библиотеке</p>
          <h1>${esc(title)}</h1>
          <p class="lede">${esc(subtitle)}</p>
          <div class="hall-frame">
            <div class="hall-diagram"><span>◢</span><span>◣</span><span>◤</span><span>◥</span></div>
            <p>Шестигранный зал здесь подан как навигационный интерфейс: не схема алгоритма, а интерфейс пространства.</p>
          </div>
          ${utilityLinks()}
        </div>
        <div class="card library-browser">
          ${crumbs}
          ${grid}
        </div>
      </section>
    `);
  };
})();
