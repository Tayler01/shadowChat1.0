const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/nativeLaunch.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: mod, exports: mod.exports });
const { advanceLaunch, pageLaunchProgress, parseLaunchProgress, STREAMLINED_LAUNCH_SCRIPT } = mod.exports;

test('completed milestones never regress or restart after ready, including redirect and invalid progress', () => {
  let state = { progress: 0, stage: 'Preparing your community' };
  state = advanceLaunch(state, pageLaunchProgress(.5), 'Loading community page');
  assert.equal(state.progress, .4);
  state = advanceLaunch(state, .8, 'Restoring your community');
  for (const value of [pageLaunchProgress(1), pageLaunchProgress(0), .8, NaN, Infinity]) {
    assert.equal(advanceLaunch(state, value, 'Loading community page'), state);
  }
  state = advanceLaunch(state, 1, 'Ready');
  assert.equal(advanceLaunch(state, .8, 'Restoring your community'), state);
});

test('page load is bounded below session readiness and protocol rejects arbitrary text/progress', () => {
  assert.equal(pageLaunchProgress(Infinity), .1);
  assert.equal(pageLaunchProgress(-1), .1);
  assert.equal(pageLaunchProgress(20), .7);
  for (const raw of ['invalid', '{}', '{"version":2,"type":"launch_progress","progress":1,"stage":"Ready"}', '{"version":1,"type":"launch_progress","progress":0.9,"stage":"Fake"}']) assert.equal(parseLaunchProgress(raw), null);
  assert.equal(parseLaunchProgress('{"version":1,"type":"launch_progress","progress":1,"stage":"Ready"}').progress, 1);
});

function page() {
  const state = { children: [], documentStartup: true, busy: true, frames: [], messages: [], disconnected: false };
  let callback;
  vm.runInNewContext(STREAMLINED_LAUNCH_SCRIPT, {
    window: { ReactNativeWebView: { postMessage: raw => state.messages.push(JSON.parse(raw)) } },
    document: {
      documentElement: {},
      getElementById: id => id === 'root' ? { get children() { return state.children; } } : state.documentStartup ? {} : null,
      querySelector: () => state.busy ? {textContent: 'Restoring your community'} : null,
      addEventListener: () => {},
    },
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() { state.disconnected = true; } },
    requestAnimationFrame: fn => state.frames.push(fn),
  });
  state.mutate = () => callback();
  state.frame = () => state.frames.splice(0).forEach(fn => fn());
  return state;
}

test('HTML download does not announce restored session; suspense replacement stays covered until two stable frames', () => {
  const state = page();
  state.children = [{}]; state.mutate();
  assert.equal(state.messages.length, 0);
  state.documentStartup = false; state.mutate();
  assert.equal(state.messages.at(-1).progress, .8);
  state.busy = false; state.mutate(); state.frame();
  state.busy = true; state.frame();
  assert.equal(state.disconnected, false);
  state.busy = false; state.mutate(); state.frame(); state.frame();
  assert.equal(state.messages.at(-1).progress, 1);
  assert.equal(state.disconnected, true);
  const count = state.messages.length;
  state.busy = true; state.mutate();
  assert.equal(state.messages.length, count);
});

test('an actionable auth error with aria-busy=false reveals the underlying error instead of trapping the user', () => {
  const state = page();
  state.children = [{}]; state.documentStartup = false; state.busy = false;
  state.mutate(); state.frame(); state.frame();
  assert.equal(state.messages.at(-1).stage, 'Ready');
});
