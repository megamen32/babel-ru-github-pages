const { test, expect } = require('@playwright/test');

test.describe('joke ticker', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
  });

  test('renders readable russian text while search is in progress and disappears after results', async ({ page }) => {
    await page.goto('/#/search');

    await page.evaluate(() => {
      const originalSearch = window.BabelApp.workerBridge.searchMultiMode;
      window.BabelApp.workerBridge.searchMultiMode = (...args) => (
        new Promise((resolve) => {
          setTimeout(() => resolve(originalSearch(...args)), 1200);
        }).then((result) => result)
      );
    });

    await page.locator('#msgSearchInput').fill('русская проверка');
    await page.locator('#msgSearchBtn').click();

    const jokeMessage = page.locator('.babel-joke-msg');
    const jokeText = page.locator('.babel-joke-text');

    await expect(jokeMessage).toBeVisible();
    await expect(jokeText).toContainText(/[А-Яа-яЁё]/);
    await expect(jokeText).not.toContainText('�');

    await expect(
      page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/page/"]').first()
    ).toBeVisible({ timeout: 15000 });
    await expect(jokeMessage).toHaveCount(0);
  });

  test('does not append a joke after ticker.stop() during async startup', async ({ page }) => {
    await page.goto('/#/search');

    const state = await page.evaluate(async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);

      const ticker = window.BabelApp.workerBridge.startJokeTicker(host, { seedText: 'гонка остановки' });
      ticker.stop();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const jokeExists = host.querySelector('.babel-joke-msg') !== null;
      host.remove();

      return { jokeExists };
    });

    expect(state.jokeExists).toBe(false);
  });
});
