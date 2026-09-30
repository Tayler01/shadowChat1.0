const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const queryString = require('query-string');
const imageSize = require('image-size').default;

test('router query parsing preserves notification targets and Unicode drafts', () => {
  const values = { route: '/pins/pin-id', text: 'Hello 🌊 + & %', event: 'event-id' };
  assert.deepEqual({ ...queryString.parse(queryString.stringify(values)) }, values);
  assert.deepEqual({ ...queryString.parse('x=%E0%A4%A&y=a%20b') }, { x: '%E0%A4%A', y: 'a b' });
});

test('Metro-compatible image decoder reads the actual launcher asset', () => {
  const bytes = fs.readFileSync(path.join(__dirname, '../assets/images/icon.png'));
  const dimensions = imageSize(bytes);
  assert.equal(dimensions.type, 'png');
  assert.equal(dimensions.width, 1024);
  assert.equal(dimensions.height, 1024);
});
