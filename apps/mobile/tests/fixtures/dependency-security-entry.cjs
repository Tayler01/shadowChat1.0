'use strict';

// This same entry is executed by Node and bundled by Expo for iOS/Android.
// It intentionally imports the installed production consumers, not a mock.
const queryString = require('query-string');
const { getStateFromPath } = require('expo-router/build/react-navigation/core/getStateFromPath');

let assertions = 0;
function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Native decoder regression: ${label}`);
  }
  assertions += 1;
}

equal(queryString.parse('name=hello%20world').name, 'hello world', 'encoded space');
equal(queryString.parse('name=hello+world').name, 'hello world', 'query plus separator');
equal(queryString.parse('reaction=%F0%9F%8E%89').reaction, '🎉', 'emoji');
equal(queryString.parse('name=Jos%C3%A9').name, 'José', 'Unicode');
equal(queryString.parse('tag=one&tag=two').tag, ['one', 'two'], 'duplicate values');
equal(queryString.parse('empty=&flag'), { empty: '', flag: null }, 'empty and absent values');
equal(queryString.parse('broken=%').broken, '%', 'bare percent');
equal(queryString.parse('broken=%E0%A4%A').broken, '%E0%A4%A', 'truncated UTF-8');
equal(queryString.parse('path=%2Fmedia%2Fphoto.jpg').path, '/media/photo.jpg', 'escaped media path');
equal(queryString.parse(queryString.stringify({ label: 'A+B & 🎉', id: 'thread-123' })),
  { id: 'thread-123', label: 'A+B & 🎉' }, 'query round trip');

const state = getStateFromPath(
  '/chat/thread-123?reply=hello%20world&photo=%2Fmedia%2Fx.jpg',
  { screens: { Chat: 'chat/:id' } },
);
equal(state.routes[0].name, 'Chat', 'Expo route');
equal(state.routes[0].params, { id: 'thread-123', photo: '/media/x.jpg', reply: 'hello world' },
  'Expo deep-link parameters');

// The old decoder repeatedly split malformed byte runs. These inputs exercise
// the upstream fixed scanning path; the caller imposes a process/VM timeout.
const malformed = '%FF'.repeat(16384);
equal(queryString.parse(`payload=${malformed}`).payload, malformed, 'long invalid byte run');
const mixed = `${'%E0%A4'.repeat(8192)}%20end`;
equal(queryString.parse(`payload=${mixed}`).payload, `${'%E0%A4'.repeat(8192)} end`,
  'long truncated sequences with valid tail');
equal(getStateFromPath(`/chat/thread-123?payload=${malformed}`, {
  screens: { Chat: 'chat/:id' },
}).routes[0].params.payload, malformed, 'adversarial Expo deep link');

globalThis.__SHADOWCHAT_DEPENDENCY_SECURITY_RESULT__ = { passed: true, assertions };
