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

    /* ═══════════════════════════════════════════════════════════
       JOURNEY HISTORY — ordered path with jump distances
       Unlike the wander map (deduped set), this tracks the
       ORDER of visits for the journey map visualization.
       ═══════════════════════════════════════════════════════════ */

    pushJourneyStep(x, y, genre) {
      const journey = app.storage.readStore("babelJourney");
      const last = journey.length > 0 ? journey[journey.length - 1] : null;
      /* Skip if same position as last step (dedup consecutive) */
      if (last && last.x === x && last.y === y) return;
      /* Calculate hex distance from previous step */
      let dist = 0;
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
      }
      journey.push({ x, y, genre: genre || '', dist, ts: Date.now() });
      /* Keep last 200 steps */
      app.storage.writeStore("babelJourney", journey, 200);
    },

    getJourney() {
      return app.storage.readStore("babelJourney");
    },

    clearJourney() {
      try { localStorage.removeItem("babelJourney"); } catch {}
    },
  };
})();
