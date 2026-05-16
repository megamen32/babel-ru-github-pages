/**
 * Тест: соседние страницы НЕ должны совпадать более чем на 50%
 *
 * Проблема: аффинная перестановка y = C*x + OFFSET mod 2^32768
 * Если C ≈ 2^63, то Δy = C при Δx = 1 — меняются только нижние 63 бита,
 * а верхние 32705 бит (первые ~4088 символов) остаются теми же!
 *
 * Решение: C должна быть "широкой" — иметь биты по всей ширине 32768 бит.
 */

const fs = require('fs');
const vm = require('vm');

// Create a minimal browser-like context
const context = {
  window: {},
  console,
  setTimeout,
  location: { hash: '' },
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  localStorage: { getItem: () => '[]', setItem: () => {} },
  alert: () => {},
  URLSearchParams: require('url').URLSearchParams,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
vm.createContext(context);

// Load scripts in order
const scripts = ['config.js', 'utils.js', 'library.js'];
for (const file of scripts) {
  const code = fs.readFileSync(__dirname + '/../js/' + file, 'utf8');
  vm.runInContext(code, context);
}

const app = context.window.BabelApp;
const lib = app.library;
const ALG = app.config.ALG;

// ─── Similarity metric ───

function similarity(indicesA, indicesB) {
  if (indicesA.length !== indicesB.length) throw new Error('Length mismatch');
  let matches = 0;
  for (let i = 0; i < indicesA.length; i++) {
    if (indicesA[i] === indicesB[i]) matches++;
  }
  return matches / indicesA.length;
}

// ─── Test: Adjacent pages similarity ───

function testAdjacentPages() {
  console.log('\n═══ ТЕСТ: Сходство соседних страниц ═══\n');

  const testPairs = [
    { a: 0n, b: 1n, label: 'index 0 vs 1' },
    { a: 100n, b: 101n, label: 'index 100 vs 101' },
    { a: 1000n, b: 1001n, label: 'index 1000 vs 1001' },
    { a: 12345n, b: 12346n, label: 'index 12345 vs 12346' },
    { a: 0n, b: 2n, label: 'index 0 vs 2' },
    { a: 0n, b: 100n, label: 'index 0 vs 100' },
  ];

  let allPassed = true;
  const MAX_SIMILARITY = 0.5; // 50% threshold

  for (const { a, b, label } of testPairs) {
    const permA = lib.permuteIndex(a);
    const permB = lib.permuteIndex(b);
    const indA = lib.numberToIndices(permA);
    const indB = lib.numberToIndices(permB);
    const sim = similarity(indA, indB);

    // Count how many chars differ in first 100 positions vs last 100
    let first100match = 0, last100match = 0;
    for (let i = 0; i < 100; i++) if (indA[i] === indB[i]) first100match++;
    for (let i = indA.length - 100; i < indA.length; i++) if (indA[i] === indB[i]) last100match++;

    const status = sim > MAX_SIMILARITY ? 'FAIL' : 'PASS';
    if (sim > MAX_SIMILARITY) allPassed = false;

    console.log(`[${status}] ${label}`);
    console.log(`  Сходство: ${(sim * 100).toFixed(2)}% (порог: ${MAX_SIMILARITY * 100}%)`);
    console.log(`  Первые 100 символов совпадают: ${first100match}/100 (${first100match}%)`);
    console.log(`  Последние 100 символов совпадают: ${last100match}/100 (${last100match}%)`);
  }

  // Also test adjacent coordinates (same hall, different page)
  console.log('\n--- Соседние страницы в одном томе ---');
  const coords = { sector: 1n, hall: 1n, wall: 1n, shelf: 1n, volume: 1n, page: 1n };
  const coords2 = { ...coords, page: 2n };
  const num1 = lib.coordinatesToNumber(coords);
  const num2 = lib.coordinatesToNumber(coords2);
  const ind1 = lib.numberToIndices(num1);
  const ind2 = lib.numberToIndices(num2);
  const sim = similarity(ind1, ind2);
  const status = sim > MAX_SIMILARITY ? 'FAIL' : 'PASS';
  if (sim > MAX_SIMILARITY) allPassed = false;
  console.log(`[${status}] Лист 1 vs Лист 2 (один том): сходство ${(sim * 100).toFixed(2)}%`);

  // Adjacent volumes
  const coords3 = { ...coords, volume: 2n };
  const num3 = lib.coordinatesToNumber(coords3);
  const ind3 = lib.numberToIndices(num3);
  const sim2 = similarity(ind1, ind3);
  const status2 = sim2 > MAX_SIMILARITY ? 'FAIL' : 'PASS';
  if (sim2 > MAX_SIMILARITY) allPassed = false;
  console.log(`[${status2}] Том 1 vs Том 2 (одна полка): сходство ${(sim2 * 100).toFixed(2)}%`);

  console.log('\n' + (allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));
  process.exit(allPassed ? 0 : 1);
}

// ─── Diagnostic: check PERM_C bit width ───

function diagnosePermutation() {
  console.log('\n═══ ДИАГНОСТИКА: Ширина PERM_C ═══\n');

  const TOTAL_BITS = 8n * BigInt(ALG.pageLength);

  // Compute PERM_C the same way library.js does
  const BIT_MASK = (1n << TOTAL_BITS) - 1n;
  const SEED_C = 0x4CF3B209D871A5E7n;
  const SEED_C_INV = SEED_C ^ 0xFFFFFFFFFFFFFFFFn;
  let _c = 0n;
  for (let bitPos = 0; bitPos < Number(TOTAL_BITS); bitPos += 64) {
    const pattern = (bitPos / 64) % 2 === 0 ? SEED_C : SEED_C_INV;
    _c = (_c | (pattern << BigInt(bitPos))) & BIT_MASK;
  }
  const PERM_C = _c | 1n;

  const bitLength = PERM_C.toString(2).length;
  console.log(`PERM_C bit width: ${bitLength} бит`);
  console.log(`Модуль: 2^${TOTAL_BITS} бит`);
  console.log(`Покрытие: ${bitLength}/${TOTAL_BITS} = ${(Number(bitLength) / Number(TOTAL_BITS) * 100).toFixed(2)}%`);
  console.log(`PERM_C is odd: ${PERM_C % 2n === 1n}`);

  if (bitLength >= Number(TOTAL_BITS) - 1) {
    console.log(`\nOK: PERM_C занимает почти всю ширину модуля — полный лавинный эффект.`);
  } else {
    console.log(`\nWARNING: PERM_C занимает только ${bitLength} бит из ${TOTAL_BITS}!`);
    console.log(`Соседние страницы будут совпадать в первых ${4096 - Math.ceil(Number(bitLength) / 8)} символах!`);
  }
}

// Run
diagnosePermutation();
testAdjacentPages();
