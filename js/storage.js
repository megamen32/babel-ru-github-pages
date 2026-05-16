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

    /* ═══════════════════════════════════════════════════════════
       WANDER MAP — efficient object-based tracking of visited halls
       ═══════════════════════════════════════════════════════════ */

    /* Read the wander map as an object { "x,y": { x, y, ts } } */
    readWanderMap() {
      try {
        return JSON.parse(localStorage.getItem("babelWanderMap") || "{}");
      } catch {
        return {};
      }
    },

    /* Save a wander visit (fast, deduped by key) */
    pushWanderVisit(x, y) {
      const map = app.storage.readWanderMap();
      const key = `${x},${y}`;
      if (!map[key]) {
        map[key] = { x, y, ts: Date.now() };
        try { localStorage.setItem("babelWanderMap", JSON.stringify(map)); } catch {}
      }
    },

    /* Get all visited coordinates as an array */
    getVisitedCoords() {
      const map = app.storage.readWanderMap();
      return Object.values(map);
    },

    /* Get count of visited halls */
    getVisitedCount() {
      const map = app.storage.readWanderMap();
      return Object.keys(map).length;
    },

    /* Clear the wander map */
    clearWanderMap() {
      try { localStorage.removeItem("babelWanderMap"); } catch {}
    },
  };
})();
