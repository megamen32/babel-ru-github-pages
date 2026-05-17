const { test, expect } = require('@playwright/test');

test.describe('навигация по библиотеке', () => {

  test('главная страница загружается без ошибок', async ({ page }) => {
    await page.goto('/');
    /* Должен отобразиться контент (не пустой #view) */
    await expect(page.locator('#view')).not.toBeEmpty({ timeout: 10000 });
    /* Не должно быть ошибок */
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('навигация на зал X:0 Y:0', async ({ page }) => {
    await page.goto('/#/x/0/y/0');
    /* Должен отобразиться зал */
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    /* В URL должен быть #/x/0/y/0 */
    expect(page.url()).toContain('#/x/0/y/0');
    /* Нет ошибок */
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('навигация в соседний зал по кнопке', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'bookshelf');
    });
    await page.goto('/#/x/0/y/0');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });

    /* Клик по кнопке направления */
    const dirBtn = page.locator('.bk-nav-btn').first();
    await dirBtn.click();

    /* URL должен измениться на соседнюю позицию */
    await page.waitForFunction(() => window.location.hash !== '#/x/0/y/0', { timeout: 5000 });
    const newHash = page.url().split('#')[1];
    expect(newHash).toMatch(/\/x\//);
    expect(newHash).toMatch(/\/y\//);
  });

  test('навигация на страницу X:0 Y:0 Z:1', async ({ page }) => {
    await page.goto('/#/x/0/y/0/z/1');
    /* Должна отобразиться страница */
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    /* Нет ошибок */
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('старый URL /w/1/sh/1/v/1/p/1 редиректит на /z/', async ({ page }) => {
    await page.goto('/#/x/0/y/0/w/1/sh/1/v/1/p/1');
    /* Должен произойти редирект на формат с z */
    await page.waitForFunction(
      () => window.location.hash.includes('/z/'),
      { timeout: 10000 }
    );
    expect(page.url()).toContain('/z/');
  });

  test('навигация на случайную страницу', async ({ page }) => {
    await page.goto('/#/random');
    /* Должен редирект на конкретную страницу */
    await page.waitForFunction(
      () => window.location.hash.includes('/x/') && window.location.hash.includes('/y/'),
      { timeout: 10000 }
    );
    const hash = page.url().split('#')[1];
    expect(hash).toMatch(/\/x\//);
    expect(hash).toMatch(/\/y\//);
  });
});

test.describe('переключение тем', () => {

  test('мессенджер тема загружается', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('книжная полка тема загружается', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'bookshelf');
    });
    await page.goto('/');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('космос тема загружается', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'cosmos');
    });
    await page.goto('/');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('лента тема загружается', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'feed');
    });
    await page.goto('/');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('терминал тема загружается', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'terminal');
    });
    await page.goto('/');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });
});

test.describe('открытие страницы (page view)', () => {

  test('страница рендерится в теме мессенджер', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 15000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('страница рендерится в теме книжная полка', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'bookshelf');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 15000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('страница рендерится в теме космос', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'cosmos');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 15000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('страница рендерится в теме терминал', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'terminal');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 15000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('кнопка «вперёд» присутствует на странице', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('следующая обитаемая страница', () => {

  test('нажатие «следующая обитаемая» переводит на другую страницу', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    const urlBefore = page.url();

    /* Кликнуть «следующая обитаемая» */
    await page.locator('#exploreNextBtn').click();

    /* URL должен измениться — навигация произошла */
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 60000 }
    );

    const urlAfter = page.url();
    expect(urlAfter).not.toBe(urlBefore);
    expect(urlAfter).toMatch(/#\/x\//);

    /* Новая страница тоже должна рендериться без ошибок */
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('следующая обитаемая работает в книжной полке', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'bookshelf');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    const urlBefore = page.url();
    await page.locator('#exploreNextBtn').click();

    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      urlBefore,
      { timeout: 60000 }
    );

    expect(page.url()).not.toBe(urlBefore);
    expect(page.url()).toMatch(/#\/x\//);
  });

  test('после навигации вперёд можно нажать ещё раз', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    /* Первое нажатие */
    const url1 = page.url();
    await page.locator('#exploreNextBtn').click();
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      url1,
      { timeout: 60000 }
    );

    /* Ждём появления кнопки на новой странице */
    await expect(page.locator('#exploreNextBtn')).toBeVisible({ timeout: 15000 });

    /* Второе нажатие */
    const url2 = page.url();
    await page.locator('#exploreNextBtn').click();
    await page.waitForFunction(
      (prevUrl) => window.location.href !== prevUrl,
      url2,
      { timeout: 60000 }
    );

    expect(page.url()).not.toBe(url2);
  });
});

test.describe('поиск', () => {

  test('поиск «привет» показывает результаты', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/search?q=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82');

    /* Должны появиться результаты поиска */
    await expect(page.locator('.catalog-card, .msg-dialogue-card, .search-explanation').first())
      .toBeVisible({ timeout: 30000 });

    /* Нет ошибок */
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });

  test('форма поиска отправляет запрос', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/search');
    await expect(page.locator('#searchInput, #msgSearchInput, .search-input, .msg-input').first()).toBeVisible({ timeout: 10000 });

    /* Ввести текст и нажать кнопку поиска */
    await page.locator('#searchInput, #msgSearchInput, .search-input, .msg-input').first().fill('мир');
    /* Нажать кнопку отправки (или отправить форму) */
    const sendBtn = page.locator('#msgSearchBtn, .search-submit, .msg-send-btn').first();
    if (await sendBtn.isVisible().catch(() => false)) {
      await sendBtn.click();
    } else {
      await page.locator('#searchForm, .search-form').first().evaluate(form => form.submit());
    }

    /* URL должен измениться */
    await page.waitForFunction(
      () => window.location.hash.includes('q='),
      { timeout: 5000 }
    );
    expect(page.url()).toContain('q=');
  });

  test('результаты поиска содержат ссылки на страницы', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/search?q=%D0%BC%D0%B8%D1%80');

    /* Ждём результатов */
    await expect(page.locator('a[href*="#/x/"]').first()).toBeVisible({ timeout: 30000 });

    /* Клик по ссылке на страницу */
    const pageLink = page.locator('a[href*="#/x/"]').first();
    const href = await pageLink.getAttribute('href');
    expect(href).toContain('/x/');

    await pageLink.click();

    /* Должны перейти на страницу */
    await page.waitForFunction(
      () => window.location.hash.includes('/x/'),
      { timeout: 5000 }
    );
  });
});

test.describe('атлас', () => {

  test('атлас загружается с жанрами', async ({ page }) => {
    await page.goto('/#/atlas');
    await expect(page.locator('.atlas-card, section').first()).toBeVisible({ timeout: 10000 });
    const notices = page.locator('.notice');
    const count = await notices.count();
    expect(count).toBe(0);
  });
});

test.describe('URL-схема', () => {

  test('формат #/x/{x}/y/{y} — зал (wander)', async ({ page }) => {
    await page.goto('/#/x/5/y/3');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });
    /* Wander view, нет /z/ */
    expect(page.url()).toContain('#/x/5/y/3');
  });

  test('формат #/x/{x}/y/{y}/z/{z} — страница (page)', async ({ page }) => {
    await page.goto('/#/x/5/y/3/z/100');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 15000 });
    expect(page.url()).toContain('/z/100');
  });

  test('навигация между листами Z в странице', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babelTheme', 'messenger');
    });
    await page.goto('/#/x/0/y/0/z/1');
    await expect(page.locator('section').first()).toBeVisible({ timeout: 15000 });

    /* Должна быть ссылка на следующий лист */
    const nextLink = page.locator('a[href*="/z/2"], a[href*="Лист 2"], a[href*="→"]').first();
    if (await nextLink.isVisible().catch(() => false)) {
      await nextLink.click();
      await page.waitForFunction(
        () => window.location.hash.includes('/z/'),
        { timeout: 5000 }
      );
      expect(page.url()).toMatch(/\/z\//);
    }
  });
});
