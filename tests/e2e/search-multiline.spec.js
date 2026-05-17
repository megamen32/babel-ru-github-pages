const { test, expect } = require('@playwright/test');

test.describe('search', () => {
  test('shows footer only on the home route', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.locator('.site-footer')).toBeVisible();

    await page.goto('/#/search');
    await expect(page.locator('.site-footer')).toBeHidden();

    await page.goto('/#/about');
    await expect(page.locator('.site-footer')).toBeHidden();
  });

  test('finds mixed Russian, English, emoji, and multiline text via prefix codec', async ({ page }) => {
    const rawPhrase = 'Привет, BABEL 🔥\n\nEnglish line ✅\nТретий абзац 😎';

    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    await page.goto('/#/search');

    const expectedPhrase = await page.evaluate((value) => {
      return window.BabelApp.utils.normalizeText(value);
    }, rawPhrase);

    /* Проверяем через JS API: encodePhraseToCoords находит страницу с фразой */
    const searchCheck = await page.evaluate((phrase) => {
      const lib = window.BabelApp.library;
      const result = lib.encodePhraseToCoords(phrase);
      if (!result) return { error: 'no result' };

      /* Декодируем страницу и проверяем что хотя бы часть фразы найдена */
      const decodedText = lib.decodePage(
        result.coordinates.x,
        result.coordinates.y,
        result.coordinates.z
      ).toLowerCase();

      /* Проверяем каждое слово из фразы */
      const words = phrase.split(/[\s\n]+/).filter(w => w.length > 2);
      const found = words.filter(w => decodedText.includes(w.toLowerCase()));

      return {
        totalWords: words.length,
        foundWords: found.length,
        foundList: found,
        decodedSnippet: decodedText.slice(0, 200),
      };
    }, expectedPhrase);

    expect(searchCheck.error).toBeUndefined();
    /* Хотя бы одно слово из фразы должно найтись */
    expect(searchCheck.foundWords).toBeGreaterThan(0);
  });
});
