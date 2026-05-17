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

  test('finds mixed Russian, English, emoji, and multiline text and opens a page that contains it', async ({ page }) => {
    const rawPhrase = 'Привет, BABEL 🔥\n\nEnglish line ✅\nТретий абзац 😎';

    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    await page.goto('/#/search');

    const expectedPhrase = await page.evaluate((value) => {
      return window.BabelApp.utils.normalizeText(value);
    }, rawPhrase);

    await page.locator('#msgSearchInput').fill(rawPhrase);
    await page.locator('#msgSearchBtn').click();

    await expect(page).toHaveURL(/#\/search\?q=/);

    const results = page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/x/"], #searchResultsSlot .msg-search-actions .msg-qa[href*="#/page/"]');
    await expect(results.first()).toBeVisible();

    await results.first().click();

    await expect(page).toHaveURL(/#\/(x|page)\//);

    const expectedParts = expectedPhrase.split(/\n+/).filter(Boolean);
    const pageContent = page.locator('#pageContentSlot');

    for (const part of expectedParts) {
      await expect(pageContent).toContainText(part);
    }
  });
});
