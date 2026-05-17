const { test, expect } = require('@playwright/test');

test.describe('следующая обитаемая — не шум', () => {

  test('нажатие «следующая обитаемая» переходит на страницу без шума', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    /* Кликнуть «следующая обитаемая» */
    await page.locator('#exploreNextBtn').click();

    /* Ждём навигации */
    await page.waitForFunction(
      () => window.location.hash.includes('/z/'),
      { timeout: 60000 }
    );

    /* Проверяем: страница должна быть классифицирована как НЕ шум */
    const classification = await page.evaluate(() => {
      const hash = window.location.hash;
      const match = hash.match(/\/x\/(-?\d+)\/y\/(-?\d+)\/z\/(\d+)/);
      if (!match) return { error: 'no coords in URL' };

      const x = BigInt(match[1]);
      const y = BigInt(match[2]);
      const z = BigInt(match[3]);

      const lib = window.BabelApp.library;
      const text = lib.decodePage(x, y, z);
      const detection = lib.classifyPageByText(text);

      return {
        kind: detection.kind,
        label: detection.label,
        score: detection.score,
        textPreview: text.slice(0, 80),
      };
    });

    expect(classification.error).toBeUndefined();
    /* Страница НЕ должна быть хаосом или шумом */
    expect(classification.kind).not.toBe('raw');
    expect(classification.kind).not.toBe('noise');
  });

  test('findNextInhabitedFromCoords пропускает шумные страницы', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      /* Стартуем с координаты, где Z велик (шумная область) */
      const coords = { x: 0n, y: 0n, z: 1n };
      const next = lib.findNextInhabitedFromCoords(coords);

      if (!next) return { error: 'no inhabited page found' };

      return {
        kind: next.regionGenre.kind,
        label: next.regionGenre.label,
        score: next.detection.score,
        scanDistance: next.scanDistance,
        textPreview: next.text.slice(0, 80),
      };
    });

    expect(result.error).toBeUndefined();
    /* Результат не должен быть шумом или хаосом */
    expect(result.kind).not.toBe('raw');
    expect(result.kind).not.toBe('noise');
  });

  test('несколько последовательных «обитаемых» страниц все не шум', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    const classifications = [];

    for (let step = 0; step < 3; step++) {
      await page.locator('#exploreNextBtn').click();
      await page.waitForFunction(
        () => window.location.hash.includes('/z/'),
        { timeout: 60000 }
      );

      const cls = await page.evaluate(() => {
        const hash = window.location.hash;
        const match = hash.match(/\/x\/(-?\d+)\/y\/(-?\d+)\/z\/(\d+)/);
        if (!match) return null;
        const lib = window.BabelApp.library;
        const text = lib.decodePage(BigInt(match[1]), BigInt(match[2]), BigInt(match[3]));
        return lib.classifyPageByText(text);
      });

      if (cls) classifications.push(cls.kind);

      /* Ждём кнопку для следующего шага */
      await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });
    }

    /* Ни одна из 3 страниц не должна быть хаосом или шумом */
    for (const kind of classifications) {
      expect(kind).not.toBe('raw');
      expect(kind).not.toBe('noise');
    }
  });
});
