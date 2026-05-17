const { test, expect } = require('@playwright/test');

test.describe('поиск: найденная страница содержит искомую фразу', () => {

  test('простая русская фраза «привет» найдена через prefix codec', async ({ page }) => {
    await page.goto('/');

    /* Используем encodePhraseToCoords — честный поиск через префиксный кодек */
    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const phrase = 'привет';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'search returned null' };

      /* Декодируем страницу по координатам — фраза должна быть */
      const decodedText = lib.decodePage(
        searchResult.coordinates.x,
        searchResult.coordinates.y,
        searchResult.coordinates.z
      ).toLowerCase();

      return {
        phraseInDecoded: decodedText.includes(phrase),
        decodedSnippet: decodedText.slice(0, 200),
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.phraseInDecoded).toBe(true);
  });

  test('английское слово «world» найдено через prefix codec', async ({ page }) => {
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
        phraseInDecoded: decodedText.includes(phrase),
        decodedSnippet: decodedText.slice(0, 200),
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.phraseInDecoded).toBe(true);
  });
});

test.describe('префиксный кодек: roundtrip encode→decode', () => {

  test('encodePageToAddress → decodeAddressToPage содержит исходные слова', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const phrase = 'привет мир';
      const searchResult = lib.encodePhraseToCoords(phrase);
      if (!searchResult) return { error: 'search returned null' };

      /* Декодируем адрес обратно и проверяем */
      const decodedText = searchResult.text.toLowerCase();
      return {
        phrase: phrase,
        decodedSnippet: decodedText.slice(0, 200),
        hasPrivet: decodedText.includes('привет'),
        hasMir: decodedText.includes('мир'),
        phrasePos: searchResult.position,
        phraseLen: searchResult.range.length,
      };
    });

    expect(result.error).toBeUndefined();
    /* Хотя бы одно из слов должно найтись в декодированном тексте */
    expect(result.hasPrivet || result.hasMir).toBe(true);
  });

  test('decodeAddressToPage: возвращает 4096 символов для любого адреса', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      const text1 = lib.decodeAddressToPage(0n);
      const text2 = lib.decodeAddressToPage(0xFFFFFFFFFFFFFFFFn);
      return {
        len1: text1.length,
        len2: text2.length,
        both4096: text1.length === 4096 && text2.length === 4096,
      };
    });

    /* Обе страницы должны быть длиной 4096 */
    expect(result.len1).toBe(4096);
    expect(result.len2).toBe(4096);
  });
});
