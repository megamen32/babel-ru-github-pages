(() => {
  const app = window.BabelApp;
  const { EPIGRAPHS, HOME_HEXES, QUOTE } = app.config;
  const { sectionShell } = app.views.common;
  const { esc } = app.utils;

  app.views.home = function renderHome() {
    return sectionShell(`
      <section class="landing">
        <div class="landing-copy card">
          <p class="eyebrow">Русская Библиотека Вавилона</p>
          <h1>Вселенная здесь выглядит как библиотека, а не как форма поиска.</h1>
          <blockquote class="hero-quote">
            <p>${esc(QUOTE.text)}</p>
            <footer>${esc(QUOTE.author)} · ${esc(QUOTE.source)}</footer>
          </blockquote>
          <div class="epigraphs">
            ${EPIGRAPHS.map((item) => `<p>${esc(item)}</p>`).join("")}
          </div>
          <div class="cta-grid">
            <a class="cta-card primary" href="#/library">
              <span class="cta-kicker">Первый путь</span>
              <strong>Пройтись по библиотеке</strong>
              <small>залы, стены, полки, тома и листы как архитектура пространства</small>
            </a>
            <a class="cta-card secondary" href="#/search">
              <span class="cta-kicker">Второй путь</span>
              <strong>Провести поиск</strong>
              <small>найти страницу, где фраза окружена пустотой, шумом или русскими словами</small>
            </a>
          </div>
        </div>
        <div class="library-vision card">
          <div class="vision-stack" aria-hidden="true">
            ${HOME_HEXES.map((hex, index) => `
              <div class="hex hex-${index + 1} tone-${hex.tone}">
                <span>${esc(hex.label)}</span>
              </div>
            `).join("")}
            <div class="vision-depth"></div>
          </div>
          <div class="vision-note">
            <strong>Шестигранные залы</strong>
            <p>Сетка не иллюстрирует алгоритм буквально. Она задаёт ритм: свет, повторение, бесконечность, навигацию.</p>
          </div>
        </div>
      </section>
    `);
  };
})();
