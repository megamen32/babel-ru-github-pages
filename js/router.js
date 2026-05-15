(() => {
  const app = window.BabelApp;
  app.router = {
    parseRoute() {
      const raw = location.hash || "#/";
      const pieces = raw.slice(1).split("?");
      const path = pieces[0];
      const query = pieces[1] || "";
      const parts = path.split("/").filter(Boolean);
      const params = new URLSearchParams(query);
      const root = parts[0] || "";
      return { name: root || "home", parts, params };
    },
    renderRoute(route) {
      if (route.name === "search") {
        return app.views.search(route.params);
      }
      if (route.name === "library") {
        return app.views.library(route.parts.slice(1));
      }
      if (route.name === "page") {
        return app.views.page(route.parts, route.params);
      }
      if (route.name === "about") {
        return app.views.about();
      }
      if (route.name === "favorites") {
        return app.views.favorites();
      }
      if (route.name === "history") {
        return app.views.history();
      }
      if (route.name === "converter") {
        return app.views.converter();
      }
      return app.views.home();
    },
    bindRoute(route) {
      if (route.name === "search") {
        app.views.bindSearch();
      } else if (route.name === "page") {
        app.views.bindPage();
      } else if (route.name === "favorites" || route.name === "history" || route.name === "converter") {
        app.views.bindUtility(route.name);
      }
    },
  };
})();
