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

      /* Normalize x,y to safe serializable values.
         BigInt coordinates from coordinatesToXY can be huge —
         convert to string for storage so JSON doesn't mangle them. */
      const sx = (x != null && typeof x !== 'undefined') ? String(x) : '0';
      const sy = (y != null && typeof y !== 'undefined') ? String(y) : '0';

      /* Skip if same position as last step (dedup consecutive) */
      if (last && String(last.x) === sx && String(last.y) === sy) return;

      /* Calculate hex distance from previous step */
      let dist = 0;
      if (last) {
        const prevX = Number(last.x) || 0;
        const prevY = Number(last.y) || 0;
        const curX = Number(sx) || 0;
        const curY = Number(sy) || 0;
        if (Number.isFinite(prevX) && Number.isFinite(curX) &&
            Number.isFinite(prevY) && Number.isFinite(curY)) {
          const dx = curX - prevX;
          const dy = curY - prevY;
          dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
        } else {
          dist = 999; /* huge jump between incompatible coords */
        }
      }
      journey.push({ x: sx, y: sy, genre: genre || '', dist, ts: Date.now() });
      /* Keep last 200 steps */
      app.storage.writeStore("babelJourney", journey, 200);
    },

    getJourney() {
      /* Migration: clean up entries with null/undefined x,y from old bug */
      const journey = app.storage.readStore("babelJourney");
      let needsClean = false;
      const cleaned = journey.filter(step => {
        if (step.x == null || step.y == null) { needsClean = true; return false; }
        return true;
      });
      if (needsClean) {
        app.storage.writeStore("babelJourney", cleaned, 200);
      }
      return cleaned;
    },

    clearJourney() {
      try { localStorage.removeItem("babelJourney"); } catch {}
    },
  };
})();
