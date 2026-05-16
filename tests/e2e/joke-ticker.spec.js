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
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = String(typeof input === 'string' ? input : input.url);
        if (url.includes('forismatic') || url.includes('allorigins') || url.includes('codetabs')) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(new Response(JSON.stringify({
                quoteText: 'Человек страдает не столько от того, что происходит, сколько от того, как он оценивает происходящее.',
                quoteAuthor: 'Мишель де Монтень',
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }));
            }, 250);
          });
        }
        return originalFetch(input, init);
      };

      const originalSearch = window.BabelApp.workerBridge.searchMultiMode;
      window.BabelApp.workerBridge.searchMultiMode = (...args) => (
        new Promise((resolve) => {
          setTimeout(() => resolve(originalSearch(...args)), 5200);
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
    await expect(jokeText).toContainText('Мишель де Монтень', { timeout: 4000 });

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

  test('renders the search as a user chat message, shows variant count, and keeps scroll near the sent message', async ({ page }) => {
    await page.goto('/#/search?q=%D0%BC%D0%B8%D1%80');

    await expect(page.locator('#searchUserMessage')).toBeVisible();
    await expect(page.locator('#searchUserMessage .msg-text')).toContainText('мир');
    await expect(page.locator('.msg-search-count')).toContainText('256^(4096 - 3)');

    await expect(
      page.locator('#searchResultsSlot .msg-search-actions .msg-qa[href*="#/page/"]').first()
    ).toBeVisible({ timeout: 15000 });

    const metrics = await page.evaluate(() => {
      const chat = document.querySelector('#msgChat');
      const userMessage = document.querySelector('#searchUserMessage');
      return {
        scrollTop: chat.scrollTop,
        userTop: userMessage.offsetTop,
        maxScrollTop: chat.scrollHeight - chat.clientHeight,
      };
    });

    expect(Math.abs(metrics.scrollTop - metrics.userTop)).toBeLessThan(160);
    expect(metrics.scrollTop).toBeLessThan(metrics.maxScrollTop);
  });

  test('renders dialogue search results as telegram-like message bubbles', async ({ page }) => {
    await page.goto('/#/search?q=%D0%BB%D0%BE%D0%B3%D0%B8%D0%BA%D0%B0');

    const thread = page.locator('.tg-preview-thread').first();
    await expect(thread).toBeVisible();
    await expect(thread.locator('.tg-preview-msg')).toHaveCount(5);
    await expect(thread.locator('.tg-preview-name').first()).toContainText(/[А-Яа-яЁё]/);
    await expect(thread.locator('.tg-preview-time').first()).toContainText(/(AM|PM)/);
    await expect(thread.locator('mark').first()).toContainText('логика');
  });
});
