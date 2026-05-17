const { test, expect } = require('@playwright/test');

test.describe('следующая обитаемая — префиксный кодек', () => {

  test('findNextInhabitedChunked использует generateInhabitedPage через префиксный кодек', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const coords = { x: 0n, y: 0n, z: 1n };

      /* Вызываем generateInhabitedPage — как теперь делает findNextInhabitedChunked */
      const genres = ['dialogue', 'diary', 'post', 'log', 'text'];
      const genre = genres[Math.floor(Math.random() * genres.length)];
      const inhabited = lib.generateInhabitedPage(genre, Date.now());

      if (!inhabited) return { error: 'generateInhabitedPage returned null' };

      /* Декодируем страницу по координатам результата */
      const decodedText = lib.decodePage(
        inhabited.coordinates.x,
        inhabited.coordinates.y,
        inhabited.coordinates.z
      );

      /* Классифицируем РЕАЛЬНЫЙ декодированный текст */
      const detection = lib.classifyPageByText(decodedText);

      return {
        genre,
        phrase: inhabited.phrase,
        decodedSnippet: decodedText.slice(0, 100),
        decodedLen: decodedText.length,
        detectionKind: detection.kind,
        detectionLabel: detection.label,
        detectionScore: detection.score,
        /* Проверяем: фраза из encodePhraseToCoords должна быть в decodedText */
        phraseInDecoded: decodedText.toLowerCase().includes(inhabited.phrase.toLowerCase()),
        coords: {
          x: String(inhabited.coordinates.x),
          y: String(inhabited.coordinates.y),
          z: String(inhabited.coordinates.z),
        },
      };
    });

    expect(result.error).toBeUndefined();
    /* Страница должна быть 4096 символов */
    expect(result.decodedLen).toBe(4096);
    /* Страница НЕ должна быть хаосом или шумом */
    expect(result.detectionKind).not.toBe('raw');
    /* Фраза (или хотя бы часть) должна найтись в декодированном тексте */
    expect(result.phraseInDecoded).toBe(true);
  });

  test('кнопка «следующая обитаемая» переходит на страницу без шума (prefix codec)', async ({ page }) => {
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

    /* Проверяем: страница должна быть классифицирована как НЕ шум
       через префиксный кодек (декодируем по координатам URL) */
    const classification = await page.evaluate(() => {
      const hash = window.location.hash;
      const match = hash.match(/\/x\/(-?\d+)\/y\/(-?\d+)\/z\/(\d+)/);
      if (!match) return { error: 'no coords in URL' };

      const x = BigInt(match[1]);
      const y = BigInt(match[2]);
      const z = BigInt(match[3]);

      const lib = window.BabelApp.library;
      /* Декодируем через префиксный кодек */
      const text = lib.decodePage(x, y, z);
      const detection = lib.classifyPageByText(text);

      return {
        kind: detection.kind,
        label: detection.label,
        score: detection.score,
        textPreview: text.slice(0, 120),
      };
    });

    expect(classification.error).toBeUndefined();
    /* Страница НЕ должна быть хаосом или шумом */
    expect(classification.kind).not.toBe('raw');
    expect(classification.kind).not.toBe('noise');
  });

  test('3 последовательные «обитаемые» страницы все не шум', async ({ page }) => {
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
