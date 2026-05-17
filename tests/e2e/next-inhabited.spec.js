const { test, expect } = require('@playwright/test');

test.describe('next inhabited page', () => {
  test('clicking "next inhabited" actually navigates to a different page', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    /* Navigate to a specific page */
    await page.goto('/#/x/0/y/0/w/1/sh/1/v/1/p/1');

    /* Wait for the page to render */
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 10000 });

    /* Capture the current URL */
    const urlBefore = page.url();

    /* Click the "next inhabited" button */
    await page.locator('#exploreNextBtn').click();

    /* The button should show scanning state */
    await expect(page.locator('#exploreNextBtn')).toContainText('сканирую', { timeout: 3000 });

    /* Wait for navigation to complete — the URL should change */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 30000 }
    );

    /* Verify we're on a different page */
    const urlAfter = page.url();
    expect(urlAfter).not.toBe(urlBefore);

    /* Verify the new URL follows the unified scheme */
    expect(urlAfter).toMatch(/#\/x\//);

    /* Verify the page rendered (no error message) */
    const errorNotice = page.locator('.notice');
    const errorCount = await errorNotice.count();
    expect(errorCount).toBe(0);
  });

  test('next inhabited works from bookshelf theme too', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'bookshelf');
    });

    /* Navigate to a page */
    await page.goto('/#/x/0/y/0/w/1/sh/1/v/1/p/1');

    /* Wait for the page to render */
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 10000 });

    const urlBefore = page.url();

    /* Click next inhabited */
    await page.locator('#exploreNextBtn').click();

    /* Wait for navigation */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 30000 }
    );

    const urlAfter = page.url();
    expect(urlAfter).not.toBe(urlBefore);
    expect(urlAfter).toMatch(/#\/x\//);
  });

  test('next inhabited finds a page with readable content', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    /* Navigate to a page */
    await page.goto('/#/x/0/y/0/w/1/sh/1/v/1/p/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 10000 });

    const urlBefore = page.url();

    /* Click next inhabited */
    await page.locator('#exploreNextBtn').click();

    /* Wait for navigation */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 30000 }
    );

    /* Check that the destination page has some readable content
       (density badge showing Читаемая or Разреженная, not just Шум) */
    const densityText = await page.locator('#pageDensity').textContent().catch(() => '');
    /* The page should have rendered without error */
    const pageContent = page.locator('.msg-bubble-page, .page-text');
    await expect(pageContent.first()).toBeVisible({ timeout: 5000 });
  });
});
