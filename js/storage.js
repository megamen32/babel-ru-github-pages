(() => {
  const app = window.BabelApp;
  app.storage = {
    readStore(key) {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    },
    writeStore(key, items, limit) {
      localStorage.setItem(key, JSON.stringify(items.slice(0, limit)));
    },
    pushHistory(item) {
      const items = app.storage.readStore("babelHistory").filter((entry) => entry.url !== item.url);
      items.unshift({ ...item, createdAt: new Date().toISOString() });
      app.storage.writeStore("babelHistory", items, 100);
    },
    addFavorite(item) {
      const items = app.storage.readStore("babelFavorites").filter((entry) => entry.url !== item.url);
      items.unshift({ ...item, createdAt: new Date().toISOString() });
      app.storage.writeStore("babelFavorites", items, 100);
    },
    removeFavorite(url) {
      const items = app.storage.readStore("babelFavorites").filter((entry) => entry.url !== url);
      app.storage.writeStore("babelFavorites", items, 100);
    },
  };
})();
