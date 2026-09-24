/**
 * Test Duration Parser
 */

const { parseDuration, formatDuration } = require('../utils/parseDuration');
const assert = require('assert');

console.log('--- Testing Duration Parser ---');

// Valid inputs
const testCases = [
  { input: '30s', expectedMs: 30 * 1000 },
  { input: '45m', expectedMs: 45 * 60 * 1000 },
  { input: '2h30m', expectedMs: (2 * 60 + 30) * 60 * 1000 },
  { input: '1d', expectedMs: 24 * 60 * 60 * 1000 },
  { input: '1d12h', expectedMs: 36 * 60 * 60 * 1000 },
  { input: '1w', expectedMs: 7 * 24 * 60 * 60 * 1000 },
];

for (const tc of testCases) {
  const result = parseDuration(tc.input);
  assert.strictEqual(result, tc.expectedMs, `Failed for ${tc.input}: got ${result}, expected ${tc.expectedMs}`);
  console.log(`✔ parseDuration("${tc.input}") -> ${result}ms (${formatDuration(result)})`);
}

// Invalid inputs
const invalidCases = [
  'abc',
  '-5m',
  '0s',
  '40d', // exceeds 30-day max
  '10x',
  '',
  null,
];

for (const inv of invalidCases) {
  assert.throws(
    () => parseDuration(inv),
    (err) => err instanceof Error,
    `Should have thrown for invalid input "${inv}"`
  );
  console.log(`✔ Correctly rejected invalid input: "${inv}"`);
}

console.log('All parseDuration tests passed!\n');
