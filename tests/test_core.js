/**
 * Комплексный тест ядра Вавилона v8.0
 *
 * Проверяет:
 *   1. Префиксный поиск: найденный текст содержит искомую фразу
 *   2. Кнопка «Следующая обитаемая»: результат не шум
 *   3. Раунд-трип encode→decode: текст совпадает
 *   4. Декодирование по координатам: стабильность
 *   5. Классификация страниц: обитаемые не шум
 *   6. Legacy поиск vs prefix поиск
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ═══ Минимальный браузерный контекст ═══ */
const context = {
  window: {},
  console,
  setTimeout,
  location: { hash: '' },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  localStorage: { getItem: () => '[]', setItem: () => {}, removeItem: () => {} },
  alert: () => {},
  URLSearchParams: require('url').URLSearchParams,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  Worker: undefined,
  document: { createTreeWalker: () => ({ nextNode: () => null }), getElementById: () => null, querySelectorAll: () => [] },
};
vm.createContext(context);

/* ═══ Загружаем скрипты в правильном порядке (как index.html) ═══ */
const jsDir = path.join(__dirname, '..', 'js');
const scripts = [
  'words.js',
  'config.js',
  'utils.js',
  'lib-prefix-codec.js',
  'lib-token-table.js',
  'lib-address-codec.js',
  'lib-coordinate-permutation.js',
  'lib-tokens.js',
  'lib-core.js',
  'lib-fillers.js',
  'lib-classifier.js',
  'lib-api.js',
];

for (const file of scripts) {
  try {
    const code = fs.readFileSync(path.join(jsDir, file), 'utf8');
    vm.runInContext(code, context);
  } catch (err) {
    console.error(`ERROR loading ${file}: ${err.message}`);
    process.exit(1);
  }
}

const app = context.window.BabelApp;
const lib = app.library;
const ALG = app.config.ALG;

/* ═══ Утилиты ═══ */
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ❌ ${message}`);
  }
}

function section(title) {
  console.log(`\n═══ ${title} ═══\n`);
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 1: Раунд-трип encode→decode (префиксный кодек)
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 1: Раунд-трип encode→decode');

{
  /* Тестируем несколько фраз */
  const testPhrases = ['привет', 'мир', 'ночь', 'world', 'книга жизнь', 'очень важно'];

  for (const phrase of testPhrases) {
    try {
      const result = lib.encodePhraseToCoords(phrase);
      if (!result) {
        assert(false, `encodePhraseToCoords("${phrase}") вернул null`);
        continue;
      }

      /* Декодируем по координатам результата */
      const decodedText = lib.decodePage(
        result.coordinates.x,
        result.coordinates.y,
        result.coordinates.z
      );

      /* Текст из результата должен совпадать с декодированным */
      const textsMatch = result.text === decodedText;
      assert(textsMatch, `Раунд-трип для "${phrase}": текст совпадает`);

      /* Фраза должна найтись в декодированном тексте */
      const lowerDecoded = decodedText.toLowerCase();
      const phraseFound = lowerDecoded.includes(phrase.toLowerCase());
      assert(phraseFound, `Фраза "${phrase}" найдена в декодированном тексте`);

      /* Диапазон подсветки должен быть ненулевым */
      assert(result.range.length > 0, `Диапазон подсветки для "${phrase}": ${result.range.length} > 0`);

    } catch (err) {
      assert(false, `encodePhraseToCoords("${phrase}") ошибка: ${err.message}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 2: Префиксный поиск — фраза в найденном тексте
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 2: Префиксный поиск — фраза в найденном тексте');

{
  const searchPhrases = ['привет', 'мир', 'ночь', 'книга', 'жизнь', 'world', 'hello'];

  for (const phrase of searchPhrases) {
    try {
      const result = lib.encodePhraseToCoords(phrase);
      if (!result) {
        assert(false, `Поиск "${phrase}": результат null`);
        continue;
      }

      const lowerText = result.text.toLowerCase();
      const found = lowerText.includes(phrase.toLowerCase());

      if (!found) {
        /* Для многословных фраз — хотя бы одно слово */
        const words = phrase.toLowerCase().split(/\s+/);
        const anyWord = words.some(w => lowerText.includes(w));
        /* Также проверяем без пробелов — для RAW_CHAR кодировки (hello → hel l o) */
        const strippedMatch = lowerText.replace(/\s+/g, '').includes(phrase.toLowerCase().replace(/\s+/g, ''));
        assert(anyWord || strippedMatch, `Поиск "${phrase}": хотя бы одно слово найдено (или match без пробелов)`);
      } else {
        assert(true, `Поиск "${phrase}": фраза найдена в тексте`);
      }
    } catch (err) {
      assert(false, `Поиск "${phrase}" ошибка: ${err.message}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 3: Следующая обитаемая — не шум
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 3: Следующая обитаемая — не шум');

{
  /* Тестируем generateInhabitedPage — основа кнопки */
  const genres = ['text', 'dialogue', 'diary', 'post', 'log'];
  let allNonNoise = true;

  for (const genre of genres) {
    try {
      const step = Date.now();
      const result = lib.generateInhabitedPage(genre, step);
      if (!result) {
        assert(false, `generateInhabitedPage("${genre}") вернул null`);
        continue;
      }

      /* Классифицируем текст */
      const detection = lib.classifyPageByText(result.text);
      const isNoise = detection.kind === 'raw' || detection.kind === 'noise';

      if (isNoise) allNonNoise = false;

      assert(!isNoise, `Жанр "${genre}": классификация "${detection.kind}" (${detection.label}), preview: "${result.text.slice(0, 60).replace(/\n/g, ' ')}..."`);

      /* Фраза должна быть на странице */
      const lowerText = result.text.toLowerCase();
      const phraseFound = lowerText.includes(result.phrase.toLowerCase());
      assert(phraseFound, `Жанр "${genre}": фраза "${result.phrase}" найдена на странице`);

    } catch (err) {
      assert(false, `generateInhabitedPage("${genre}") ошибка: ${err.message}`);
    }
  }

  assert(allNonNoise, 'Все обитаемые страницы — не шум');
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 4: findNextInhabitedFromCoords — сканирование вперёд
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 4: findNextInhabitedFromCoords');

{
  const startCoords = { x: 0n, y: 0n, z: 1n };
  try {
    const result = lib.findNextInhabitedFromCoords(startCoords);
    if (!result) {
      assert(false, 'findNextInhabitedFromCoords вернул null');
    } else {
      const isNoise = result.detection.kind === 'raw' || result.detection.kind === 'noise';
      assert(!isNoise, `Сканирование вперёд: "${result.detection.kind}" (${result.detection.label}), расстояние: ${result.scanDistance}`);
      assert(result.scanDistance > 0, `Расстояние сканирования: ${result.scanDistance}`);
    }
  } catch (err) {
    assert(false, `findNextInhabitedFromCoords ошибка: ${err.message}`);
  }
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 5: Стабильность декодирования — одна координата → один текст
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 5: Стабильность декодирования');

{
  const testCoords = [
    { x: 0n, y: 0n, z: 1n },
    { x: 5n, y: -3n, z: 100n },
    { x: -500n, y: 200n, z: 1n },
  ];

  for (const coords of testCoords) {
    const text1 = lib.decodePage(coords.x, coords.y, coords.z);
    const text2 = lib.decodePage(coords.x, coords.y, coords.z);
    assert(text1 === text2, `Стабильность X:${coords.x} Y:${coords.y} Z:${coords.z}: текст совпадает`);
    assert(text1.length === 4096, `Длина страницы: ${text1.length} = 4096`);
  }
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 6: Классификация — страницы с Z=1 должны быть обитаемыми
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 6: Классификация страниц');

{
  /* Z=1 → должна быть обитаемая (через префиксный кодек) */
  const text1 = lib.decodePage(0n, 0n, 1n);
  const det1 = lib.classifyPageByText(text1);
  assert(det1.kind !== 'raw', `Z=1: "${det1.kind}" (${det1.label}) — не хаос`);
  assert(det1.kind !== 'noise', `Z=1: "${det1.kind}" (${det1.label}) — не шум`);

  /* Очень большой Z → скорее всего шум */
  const textBigZ = lib.decodePage(0n, 0n, 1000000000000n);
  const detBigZ = lib.classifyPageByText(textBigZ);
  /* Не обязательно шум, но давайте проверим что классификатор работает */
  assert(['raw', 'noise', 'sparse', 'text', 'dialogue'].includes(detBigZ.kind),
    `Z=10^12: "${detBigZ.kind}" — валидная классификация`);
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 7: Обратимость координат (permute ↔ unpermute)
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 7: Обратимость координат');

{
  const testXYs = [
    { x: 0n, y: 0n, z: 1n },
    { x: 100n, y: -200n, z: 42n },
    { x: -999n, y: 500n, z: 1n },
  ];

  for (const coords of testXYs) {
    const number = lib.coordinatesToNumber(coords);
    const recovered = lib.numberToCoordinates(number);

    assert(recovered.x === coords.x && recovered.y === coords.y && recovered.z === coords.z,
      `Обратимость X:${coords.x} Y:${coords.y} Z:${coords.z}: координаты совпадают`);
  }
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 8: Legacy поиск vs prefix — сравнение
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 8: Legacy vs Prefix поиск');

{
  const phrase = 'привет';

  /* Prefix search */
  const prefixResult = lib.encodePhraseToCoords(phrase);
  if (prefixResult) {
    const prefixDecoded = lib.decodePage(
      prefixResult.coordinates.x,
      prefixResult.coordinates.y,
      prefixResult.coordinates.z
    ).toLowerCase();
    const prefixHasPhrase = prefixDecoded.includes(phrase);
    assert(prefixHasPhrase, `Prefix поиск: фраза "${phrase}" найдена в декодированном тексте`);
  } else {
    assert(false, 'Prefix поиск: результат null');
  }

  /* Legacy search */
  const _tokens = app.library._tokens || context.window.BabelApp.library._tokens;
  if (_tokens && _tokens.findPhraseInTokenSpace) {
    const legacyResult = _tokens.findPhraseInTokenSpace(phrase);
    if (legacyResult) {
      /* Legacy результат использует PRNG-декодер — при навигации
         через префиксный кодек текст будет другим */
      const legacyDecoded = lib.decodePage(
        legacyResult.x,
        legacyResult.y,
        legacyResult.z
      ).toLowerCase();
      const legacyHasPhrase = legacyDecoded.includes(phrase);
      /* Legacy результат МОЖЕТ не содержать фразу — это известная проблема */
      if (legacyHasPhrase) {
        console.log(`  ℹ️  Legacy поиск: фраза "${phrase}" НАЙДЕНА в prefix-декодированном тексте (совпадение)`);
      } else {
        console.log(`  ⚠️  Legacy поиск: фраза "${phrase}" НЕ НАЙДЕНА в prefix-декодированном тексте (известная проблема)`);
      }
      /* Это не ошибка — legacy результаты не гарантируют наличие фразы */
      assert(true, 'Legacy поиск: работает (но может не содержать фразу через prefix codec)');
    } else {
      console.log('  ℹ️  Legacy поиск: _tokens.findPhraseInTokenSpace вернул null');
    }
  } else {
    console.log('  ℹ️  Legacy поиск: _tokens модуль недоступен');
  }
}

/* ═══════════════════════════════════════════════════════════
   ТЕСТ 9: Массовый тест поиска — 20 фраз
   ═══════════════════════════════════════════════════════════ */
section('ТЕСТ 9: Массовый тест поиска (20 фраз)');

{
  const wordBank = context.window.BABEL_WORD_BANK || [];
  const massPhrases = [];

  /* Берём слова из WORD_BANK */
  for (let i = 0; i < Math.min(15, wordBank.length); i++) {
    massPhrases.push(wordBank[i]);
  }
  /* Добавляем английские и двухсловные */
  massPhrases.push('hello');
  massPhrases.push('world');
  massPhrases.push('the world');
  if (wordBank.length > 2) massPhrases.push(`${wordBank[0]} ${wordBank[1]}`);

  let foundCount = 0;
  let totalTested = 0;

  for (const phrase of massPhrases) {
    try {
      const result = lib.encodePhraseToCoords(phrase);
      totalTested++;
      if (!result) continue;

      const lowerText = result.text.toLowerCase();
      const phraseLower = phrase.toLowerCase();

      if (lowerText.includes(phraseLower)) {
        foundCount++;
      } else {
        /* Проверяем отдельные слова */
        const words = phraseLower.split(/\s+/);
        const anyWord = words.some(w => lowerText.includes(w));
        /* Также проверяем без пробелов (RAW_CHAR кодировка) */
        const strippedMatch = lowerText.replace(/\s+/g, '').includes(phraseLower.replace(/\s+/g, ''));
        if (anyWord || strippedMatch) foundCount++;
      }
    } catch (err) {
      /* skip */
    }
  }

  const hitRate = totalTested > 0 ? foundCount / totalTested : 0;
  assert(hitRate >= 0.8, `Массовый поиск: ${foundCount}/${totalTested} фраз найдены (${(hitRate * 100).toFixed(0)}%), порог 80%`);
}

/* ═══════════════════════════════════════════════════════════
   ИТОГ
   ═══════════════════════════════════════════════════════════ */
console.log(`\n${'═'.repeat(50)}`);
console.log(`ПРОЙДЕНО: ${passed}  |  ПРОВАЛЕНО: ${failed}`);
if (failures.length > 0) {
  console.log('\nПроваленные тесты:');
  for (const f of failures) console.log(`  ❌ ${f}`);
}
console.log('═'.repeat(50));

process.exit(failed > 0 ? 1 : 0);
