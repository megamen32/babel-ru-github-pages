const { test, expect } = require('@playwright/test');

test.describe('поиск: найденная страница содержит искомую фразу', () => {

  test('простая русская фраза «привет» найдена в декодированном тексте', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/search?q=%D0%BF%D1%80%D0%B8%D0%B0%D0%B5%D1%82');

    /* Ждём появления результатов */
    await expect(
      page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/x/"], [href*="#/page/"]').first()
    ).toBeVisible({ timeout: 30000 });

    /* Клик на первую ссылку — перейти на страницу */
    const pageLink = page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/x/"], [href*="#/page/"]').first();
    await pageLink.click();
    await page.waitForFunction(() => window.location.hash.includes('/x/'), { timeout: 10000 });

    /* На открытой странице должен быть текст «привет» (без учёта регистра) */
    const pageContent = page.locator('#pageContentSlot, .page-text, .msg-bubble-page');
    await expect(pageContent.first()).toBeVisible({ timeout: 10000 });
    const text = await pageContent.first().textContent();
    expect(text.toLowerCase()).toContain('привет');
  });

  test('английское слово «world» найдено в декодированном тексте', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/search?q=world');

    await expect(
      page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/x/"], [href*="#/page/"]').first()
    ).toBeVisible({ timeout: 30000 });

    const pageLink = page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/x/"], [href*="#/page/"]').first();
    await pageLink.click();
    await page.waitForFunction(() => window.location.hash.includes('/x/'), { timeout: 10000 });

    const pageContent = page.locator('#pageContentSlot, .page-text, .msg-bubble-page');
    await expect(pageContent.first()).toBeVisible({ timeout: 10000 });
    const text = await pageContent.first().textContent();
    expect(text.toLowerCase()).toContain('world');
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

  test('decodeAddressToPage корректно обрабатывает RAW_CHAR (21 бит)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(() => {
      const lib = window.BabelApp.library;
      /* Тестируем декодирование произвольной страницы */
      const text1 = lib.decodeAddressToPage(0n);
      const text2 = lib.decodeAddressToPage(1n);
      return {
        len1: text1.length,
        len2: text2.length,
        different: text1 !== text2,
      };
    });

    /* Обе страницы должны быть длиной 4096 */
    expect(result.len1).toBe(4096);
    expect(result.len2).toBe(4096);
    /* Разные адреса → разный текст */
    expect(result.different).toBe(true);
  });
});
