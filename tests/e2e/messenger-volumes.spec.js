const { test, expect } = require('@playwright/test');

test.describe('messenger volumes', () => {
  test('opens a non-text volume from messenger wander view', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    await page.goto('/#/x/0/y/0/w/1');

    const shelfOneLinks = page.locator('a.msg-book-link[href*="#/x/0/y/0/w/1/sh/1/"]');
    await expect(shelfOneLinks).toHaveCount(32);

    const volume32Link = page.locator('a.msg-book-link[href*="/sh/1/"][href*="/v/32/p/1"]');
    await expect(volume32Link).toContainText('Том 32');
    await volume32Link.click();

    await expect(page).toHaveURL(/#\/x\/0\/y\/0\/w\/1\/sh\/1\/v\/32\/p\/1/);
    await expect(page.locator('.msg-room-title')).toContainText('Том 32');
    await expect(page.locator('#pageContentSlot')).toBeVisible();
  });
});
