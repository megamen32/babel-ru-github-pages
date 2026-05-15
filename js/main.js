(() => {
  const app = window.BabelApp;
  const { renderLayout } = app.views.common;

  app.main = {
    mount() {
      const route = app.router.parseRoute();
      document.body.innerHTML = renderLayout(app.router.renderRoute(route));
      app.router.bindRoute(route);
      document.querySelector("#randomPageBtn")?.addEventListener("click", () => {
        location.hash = app.views.common.pageRoute(app.library.randomPageNumber());
      });
    },
  };

  window.addEventListener("hashchange", app.main.mount);
  window.addEventListener("DOMContentLoaded", app.main.mount);
  app.main.mount();
})();
