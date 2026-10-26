const assert = require('node:assert/strict');
const test = require('node:test');
const queryString = require('query-string');

test('router query parsing preserves notification targets and Unicode drafts', () => {
  const values = { route: '/pins/pin-id', text: 'Hello 🌊 + & %', event: 'event-id' };
  assert.deepEqual({ ...queryString.parse(queryString.stringify(values)) }, values);
  assert.deepEqual({ ...queryString.parse('x=%E0%A4%A&y=a%20b') }, { x: '%E0%A4%A', y: 'a b' });
});
