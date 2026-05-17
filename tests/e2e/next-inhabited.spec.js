const { test, expect } = require('@playwright/test');

test.describe('next inhabited page', () => {
  test('clicking "next inhabited" actually navigates to a different page', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    /* Navigate to a specific page using new X,Y,Z format */
    await page.goto('/#/x/0/y/0/z/1');

    /* Wait for the page to render */
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    /* Capture the current URL */
    const urlBefore = page.url();

    /* Click the "next inhabited" button */
    await page.locator('#exploreNextBtn').click();

    /* Wait for navigation to complete — the URL should change.
       Note: the scan may be instant (inhabited layer) or take time
       (statistical scan), so we just wait for URL change. */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 60000 }
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
    await page.goto('/#/x/0/y/0/z/1');

    /* Wait for the page to render */
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    const urlBefore = page.url();

    /* Click next inhabited */
    await page.locator('#exploreNextBtn').click();

    /* Wait for navigation */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 60000 }
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
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    const urlBefore = page.url();

    /* Click next inhabited */
    await page.locator('#exploreNextBtn').click();

    /* Wait for navigation */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 60000 }
    );

    /* The page should have rendered without error */
    const pageContent = page.locator('.msg-bubble-page, .page-text, section');
    await expect(pageContent.first()).toBeVisible({ timeout: 5000 });

    /* No error notice */
    const errorNotice = page.locator('.notice');
    const errorCount = await errorNotice.count();
    expect(errorCount).toBe(0);
  });

  test('multiple forward navigations work', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });

    /* Navigate to first page */
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    /* First forward navigation */
    const url1 = page.url();
    await page.locator('#exploreNextBtn').click();
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      url1,
      { timeout: 60000 }
    );

    /* Wait for the button to appear on the new page */
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    /* Second forward navigation */
    const url2 = page.url();
    await page.locator('#exploreNextBtn').click();
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      url2,
      { timeout: 60000 }
    );

    /* Should be on yet another different page */
    const url3 = page.url();
    expect(url3).not.toBe(url2);
    expect(url3).not.toBe(url1);
  });
});
