const { test, expect } = require('@playwright/test');

test.describe('поиск: prefix-верифицированный результат содержит искомую фразу', () => {

  test('encodePhraseToCoords: фраза «привет» найдена в декодированном тексте', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const phrase = 'привет';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'search returned null' };

      /* Декодируем страницу по координатам результата */
      const decodedText = lib.decodePage(
        searchResult.coordinates.x,
        searchResult.coordinates.y,
        searchResult.coordinates.z
      ).toLowerCase();

      return {
        phrase,
        decodedSnippet: decodedText.slice(0, 200),
        phraseInDecoded: decodedText.includes(phrase),
        phrasePos: searchResult.position,
        phraseLen: searchResult.range.length,
        coords: {
          x: String(searchResult.coordinates.x),
          y: String(searchResult.coordinates.y),
          z: String(searchResult.coordinates.z),
        },
      };
    });

    expect(result.error).toBeUndefined();
    /* Фраза должна найтись в декодированном тексте */
    expect(result.phraseInDecoded).toBe(true);
    /* Диапазон подсветки должен быть ненулевым */
    expect(result.phraseLen).toBeGreaterThan(0);
  });

  test('encodePhraseToCoords: английское слово «world» найдено', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const phrase = 'world';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'search returned null' };

      const decodedText = lib.decodePage(
        searchResult.coordinates.x,
        searchResult.coordinates.y,
        searchResult.coordinates.z
      ).toLowerCase();

      return {
        phrase,
        phraseInDecoded: decodedText.includes(phrase),
        decodedSnippet: decodedText.slice(0, 200),
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.phraseInDecoded).toBe(true);
  });

  test('encodePhraseToCoords: двухсловная фраза — хотя бы одно слово найдено', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const phrase = 'книга жизнь';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'search returned null' };

      const decodedText = lib.decodePage(
        searchResult.coordinates.x,
        searchResult.coordinates.y,
        searchResult.coordinates.z
      ).toLowerCase();

      /* Хотя бы одно из слов должно найтись */
      const hasKniga = decodedText.includes('книга');
      const hasZhizn = decodedText.includes('жизнь');

      return {
        phrase,
        hasKniga,
        hasZhizn,
        decodedSnippet: decodedText.slice(0, 200),
        atLeastOneWord: hasKniga || hasZhizn,
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.atLeastOneWord).toBe(true);
  });

  test('searchMultiMode включает prefix-верифицированный результат', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    const phrase = 'мир';
    await page.goto(`/#/search?q=${encodeURIComponent(phrase)}`);

    /* Ждём появления результатов */
    await expect(
      page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/x/"], #searchResultsSlot .catalog-actions a[href*="#/x/"]').first()
    ).toBeVisible({ timeout: 60000 });

    /* Проверяем через JS API: prefix-результат должен содержать фразу */
    const prefixResult = await page.evaluate((searchPhrase) => {
      const lib = window.BabelApp.library;
      const result = lib.encodePhraseToCoords(searchPhrase);
      if (!result) return { error: 'no prefix result' };

      /* Декодируем страницу — проверяем что фраза РЕАЛЬНО там */
      const decodedText = lib.decodePage(
        result.coordinates.x,
        result.coordinates.y,
        result.coordinates.z
      ).toLowerCase();

      return {
        phrase: searchPhrase,
        phraseInDecoded: decodedText.includes(searchPhrase.toLowerCase()),
        decodedSnippet: decodedText.slice(0, 200),
        coords: {
          x: String(result.coordinates.x),
          y: String(result.coordinates.y),
          z: String(result.coordinates.z),
        },
      };
    }, phrase);

    expect(prefixResult.error).toBeUndefined();
    expect(prefixResult.phraseInDecoded).toBe(true);
  });

  test('prefix-результат: при навигации фраза совпадает с декодированным текстом', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;

      /* Ищем фразу через encodePhraseToCoords */
      const phrase = 'ночь';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'encodePhraseToCoords returned null' };

      /* Декодируем страницу по координатам — должно совпасть с searchResult.text */
      const decodedText = lib.decodePage(
        searchResult.coordinates.x,
        searchResult.coordinates.y,
        searchResult.coordinates.z
      );

      return {
        phrase,
        searchResultText: searchResult.text.slice(0, 200),
        decodedText: decodedText.slice(0, 200),
        textsMatch: searchResult.text === decodedText,
        phraseInDecoded: decodedText.toLowerCase().includes(phrase),
      };
    });

    expect(result.error).toBeUndefined();
    /* Текст из encodePhraseToCoords должен совпадать с декодированным */
    expect(result.textsMatch).toBe(true);
    expect(result.phraseInDecoded).toBe(true);
  });
});
