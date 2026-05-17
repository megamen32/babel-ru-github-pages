const { test, expect } = require('@playwright/test');

/**
 * E2E-тесты для кнопки «Открыть» после поиска.
 *
 * Покрывает баг: vCoords не содержал x/y/z → coordsToPageUrl()
 * возвращал #/x/0/y/0/z/1, и страница не содержала искомую фразу.
 */

/* Утилита: парсинг base36 координат из URL (поддержка отрицательных) */
function parseBase36(str) {
  const negative = str.startsWith('-');
  const abs = negative ? str.slice(1) : str;
  let val = 0n;
  for (const ch of abs) {
    const digit = parseInt(ch, 36);
    val = val * 36n + BigInt(digit);
  }
  return negative ? -val : val;
}

test.describe('Кнопка «Открыть» после поиска — навигация и текст', () => {

  test('messenger: кнопка «Открыть» ведёт на правильные координаты (x≠0 или y≠0)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    const phrase = 'ночь';
    await page.goto(`/#/search?q=${encodeURIComponent(phrase)}`);

    /* Ждём появления кнопки «Открыть» */
    const openLink = page.locator('#searchResultsSlot .msg-qa').first();
    await expect(openLink).toBeVisible({ timeout: 60000 });

    /* Извлекаем href и проверяем что координаты не нулевые */
    const href = await openLink.getAttribute('href');

    /* Парсим URL вида #/x/<base36>/y/<base36>/z/<base36> */
    const xMatch = href.match(/\/x\/(-?[a-z0-9]+)/i);
    const yMatch = href.match(/\/y\/(-?[a-z0-9]+)/i);
    const zMatch = href.match(/\/z\/(-?[a-z0-9]+)/i);

    expect(xMatch).not.toBeNull();
    expect(yMatch).not.toBeNull();
    expect(zMatch).not.toBeNull();

    const xVal = xMatch ? parseBase36(xMatch[1]) : 0n;
    const yVal = yMatch ? parseBase36(yMatch[1]) : 0n;

    /* Хотя бы одна координата должна быть ненулевой (для нетривиальной фразы) */
    expect(xVal !== 0n || yVal !== 0n).toBe(true);
  });

  test('messenger: после клика «Открыть» — на странице есть искомая фраза', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    const phrase = 'мир';
    await page.goto(`/#/search?q=${encodeURIComponent(phrase)}`);

    /* Ждём появления кнопки «Открыть» */
    const openLink = page.locator('#searchResultsSlot .msg-qa').first();
    await expect(openLink).toBeVisible({ timeout: 60000 });

    /* Кликаем «Открыть» */
    await openLink.click();

    /* Ждём загрузки страницы (hash change) */
    await page.waitForFunction(() => {
      return location.hash.startsWith('#/x/') && location.hash.includes('/y/');
    }, { timeout: 15000 });

    /* Ждём рендера контента — в messenger это .msg-bubble-page .msg-text */
    await page.waitForFunction(() => {
      return document.querySelectorAll('.msg-bubble-page .msg-text').length > 0;
    }, { timeout: 30000 });

    /* Проверяем что текст страницы содержит искомую фразу */
    const phraseOnPage = await page.evaluate((searchPhrase) => {
      const textEls = document.querySelectorAll('.msg-bubble-page .msg-text');
      if (!textEls || textEls.length === 0) return { error: 'no text elements' };
      const text = Array.from(textEls).map(el => el.textContent).join('');
      return {
        textSnippet: text.slice(0, 300),
        found: text.toLowerCase().includes(searchPhrase.toLowerCase()),
      };
    }, phrase);

    expect(phraseOnPage.error).toBeUndefined();
    expect(phraseOnPage.found).toBe(true);
  });

  test('bookshelf: кнопка «Телепортироваться» ведёт на правильные координаты', async ({ page }) => {
    /* bookshelf тема использует renderSearchShared → .teleport-btn */
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'bookshelf');
    });

    const phrase = 'книга';
    await page.goto(`/#/search?q=${encodeURIComponent(phrase)}`);

    /* Ждём появления результатов — shared search использует .teleport-btn */
    const teleportLink = page.locator('.teleport-btn').first();
    await expect(teleportLink).toBeVisible({ timeout: 60000 });

    /* Извлекаем href и проверяем что координаты не нулевые */
    const href = await teleportLink.getAttribute('href');

    const xMatch = href.match(/\/x\/(-?[a-z0-9]+)/i);
    const yMatch = href.match(/\/y\/(-?[a-z0-9]+)/i);

    expect(xMatch).not.toBeNull();
    expect(yMatch).not.toBeNull();

    const xVal = parseBase36(xMatch[1]);
    const yVal = parseBase36(yMatch[1]);

    /* Хотя бы одна координата ненулевая */
    expect(xVal !== 0n || yVal !== 0n).toBe(true);
  });

  test('API: coordsToPageUrl с vCoords (x,y,z) ≠ coordsToPageUrl без x,y,z', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const phrase = 'привет';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'search returned null' };

      /* Формируем vCoords как в app.js (с x, y, z) */
      const vCoordsFull = {
        x: BigInt(searchResult.coordinates.x),
        y: BigInt(searchResult.coordinates.y),
        z: BigInt(searchResult.coordinates.z),
        sector: BigInt(searchResult.coordinates.sector),
        hall: BigInt(searchResult.coordinates.hall),
        wall: BigInt(searchResult.coordinates.wall),
        shelf: BigInt(searchResult.coordinates.shelf),
        volume: BigInt(searchResult.coordinates.volume),
        page: BigInt(searchResult.coordinates.page),
      };

      /* Формируем vCoords БЕЗ x, y, z (как было до фикса) */
      const vCoordsBroken = {
        sector: BigInt(searchResult.coordinates.sector),
        hall: BigInt(searchResult.coordinates.hall),
        wall: BigInt(searchResult.coordinates.wall),
        shelf: BigInt(searchResult.coordinates.shelf),
        volume: BigInt(searchResult.coordinates.volume),
        page: BigInt(searchResult.coordinates.page),
      };

      const urlFull = lib.coordsToPageUrl(vCoordsFull);
      const urlBroken = lib.coordsToPageUrl(vCoordsBroken);

      return {
        urlFull,
        urlBroken,
        sameUrl: urlFull === urlBroken,
        searchX: String(searchResult.coordinates.x),
        searchY: String(searchResult.coordinates.y),
      };
    });

    expect(result.error).toBeUndefined();
    /* URL с полными координатами НЕ должен совпадать с URL без x/y/z */
    expect(result.sameUrl).toBe(false);
  });
});

test.describe('Worker: координаты в результатах поиска содержат x, y, z', () => {

  test('searchMultiMode через Worker возвращает x, y, z в coordinates', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const bridge = window.BabelApp.workerBridge;
      if (!bridge) return { error: 'no workerBridge' };

      const { modes } = await bridge.searchMultiMode('ночь');
      const prefixResult = modes.prefix;

      if (!prefixResult) return { error: 'no prefix result' };

      return {
        hasX: 'x' in prefixResult.coordinates,
        hasY: 'y' in prefixResult.coordinates,
        hasZ: 'z' in prefixResult.coordinates,
        xIsNonZero: Number(prefixResult.coordinates.x) !== 0,
        yIsNonZero: Number(prefixResult.coordinates.y) !== 0,
        coords: {
          x: String(prefixResult.coordinates.x),
          y: String(prefixResult.coordinates.y),
          z: String(prefixResult.coordinates.z),
        },
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.hasX).toBe(true);
    expect(result.hasY).toBe(true);
    expect(result.hasZ).toBe(true);
    /* Хотя бы одна координата ненулевая для нетривиальной фразы */
    expect(result.xIsNonZero || result.yIsNonZero).toBe(true);
  });
});
