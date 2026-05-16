const { test, expect } = require('@playwright/test');

test.describe('messenger volumes', () => {
  test('opens a non-text volume from messenger wander view', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    await page.goto('/#/wander/x/0/y/0/wall/1');

    const shelfOneLinks = page.locator('a.msg-book-link[href*="#/page/"][href*="/w/1/"][href*="/sh/1/"]');
    await expect(shelfOneLinks).toHaveCount(32);

    const volume32Link = page.locator('a.msg-book-link[href*="/sh/1/"][href*="/v/32/p/1"]');
    await expect(volume32Link).toContainText('Том 32');
    await volume32Link.click();

    await expect(page).toHaveURL(/#\/page\/h\/1\/w\/1\/sh\/1\/v\/32\/p\/1\/s\/AA$/);
    await expect(page.locator('.msg-room-title')).toContainText('Том 32');
    await expect(page.locator('#pageContentSlot')).toBeVisible();
  });
});
