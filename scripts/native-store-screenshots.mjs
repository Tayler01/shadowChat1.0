// Capture real iOS simulator pixels. This helper never patches the shipping app.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const sourceSha = '6d3296433fe3be45da48bb4074b76d942f0770d3';
const bundle = 'com.shadowchat.mobile';
const root = resolve(process.env.NATIVE_CAPTURE_ROOT || 'output/native-store-capture');
const mobile = resolve('native-source/apps/mobile');
const required = name => {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  return process.env[name];
};
const command = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim();
const sim = args => command('xcrun', ['simctl', ...args]);
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const flow = (path, steps) => writeFileSync(path, `${JSON.stringify({ appId: bundle })}\n---\n${JSON.stringify(steps, null, 2)}\n`);
const tap = text => ({ tapOn: { text } });
const wait = text => ({ extendedWaitUntil: { visible: { text }, timeout: 60000 } });
const nativeProduct = () => {
  const device = json(join(root, 'simulator.json'));
  const productDir = process.env.NATIVE_SIMULATOR_PRODUCT || join(root, 'DerivedData/Build/Products/Release-iphonesimulator');
  const app = readdirSync(productDir).find(name => name.endsWith('.app') && !name.includes('Tests'));
  if (!app) throw new Error('Native Release simulator app missing.');
  const appPath = join(productDir, app);
  const plist = key => command('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(appPath, 'Info.plist')]);
  if (plist('CFBundleIdentifier') !== bundle || plist('CFBundleVersion') !== '26' ||
      plist('CFBundleSupportedPlatforms:0') !== 'iPhoneSimulator' || !existsSync(join(appPath, 'main.jsbundle'))) {
    throw new Error('Native Release simulator artifact identity mismatch.');
  }
  return { device, appPath, plist };
};

if (process.argv[2] === 'prepare') {
  if (process.platform !== 'darwin') throw new Error('A genuine macOS/Xcode simulator host is required.');
  if (command('git', ['-C', 'native-source', 'rev-parse', 'HEAD']) !== sourceSha) throw new Error('Wrong native source checkout.');
  mkdirSync(root, { recursive: true });
  const eas = json(join(mobile, 'eas.json'));
  const env = { ...eas.build.production.env, ...eas.build.streamlined.env,
    EXPO_PUBLIC_SUPABASE_URL: required('EXPO_PUBLIC_SUPABASE_URL'),
    EXPO_PUBLIC_SUPABASE_ANON_KEY: required('EXPO_PUBLIC_SUPABASE_ANON_KEY') };
  if (env.SHADOWCHAT_IOS_BUILD_NUMBER !== '26' || env.SHADOWCHAT_DEMO_WEB_ORIGIN !== 'https://shadowchat-review-demo.netlify.app') throw new Error('Build 26 profile drift.');
  // Only the public EAS allowlist is written. Never source a general-purpose .env.
  writeFileSync(join(root, 'build.env'), Object.entries(env).map(([key, value]) => {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n']/.test(value)) throw new Error('Invalid public build configuration.');
    return `${key}='${value}'`;
  }).join('\n') + '\n', { mode: 0o600 });
  const cacheKey = `native-store-build26-v1-${createHash('sha256').update(JSON.stringify({
    sourceSha, env, node: process.version, xcode: command('xcodebuild', ['-version']), arch: command('uname', ['-m']),
  })).digest('hex')}`;
  appendFileSync(required('GITHUB_OUTPUT'), `cache-key=${cacheKey}\n`);
  const devices = JSON.parse(sim(['list', 'devicetypes', '--json'])).devicetypes;
  const device = ['iPhone 17 Pro Max', 'iPhone 16 Pro Max'].map(name => devices.find(d => d.name === name)).find(Boolean);
  if (!device) throw new Error('No supported 6.9-inch iPhone simulator type installed.');
  const runtimes = JSON.parse(sim(['list', 'runtimes', '--json'])).runtimes
    .filter(r => r.isAvailable && r.identifier.includes('.iOS-')).sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!runtimes.length) throw new Error('No available iOS simulator runtime.');
  const id = sim(['create', `ShadoChat screenshots ${process.env.GITHUB_RUN_ID || Date.now()}`, device.identifier, runtimes[0].identifier]);
  // Export ownership immediately so always() can clean up even after a boot failure.
  appendFileSync(required('GITHUB_ENV'), `NATIVE_SIMULATOR_ID=${id}\n`);
  writeJson(join(root, 'simulator.json'), { id, name: device.name, runtime: runtimes[0].identifier });
  sim(['boot', id]);
  sim(['bootstatus', id, '-b']);
  sim(['status_bar', id, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100']);
  console.log(`Prepared real ${device.name} simulator; exact native Build 26 source. No EAS/Apple build or submission.`);
} else if (process.argv[2] === 'entry-probe') {
  // A separate workflow step supplies NO account credentials. This allows safe
  // diagnostics of genuine native startup/chooser/WebView accessibility.
  if (Object.keys(process.env).some(key => /^(NATIVE_SCREENSHOT_|MAESTRO_SCREENSHOT_)/.test(key))) {
    throw new Error('Entry probe must run without screenshot credentials.');
  }
  const { device, appPath } = nativeProduct();
  const diagnostics = join(root, 'entry-diagnostics');
  mkdirSync(diagnostics, { recursive: true });
  sim(['install', device.id, appPath]);
  command('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', device.id]);
  sim(['launch', device.id, bundle]);
  await new Promise(resolve => setTimeout(resolve, 10000));
  sim(['io', device.id, 'screenshot', join(diagnostics, 'native-before-entry.png')]);
  flow(join(diagnostics, 'entry.yaml'), [
    { launchApp: { clearState: true } }, wait('Demo community'), tap('Demo community'), wait('Enter your email'),
  ]);
  const result = spawnSync(join(root, 'tooling/maestro/bin/maestro'), ['--device', device.id, 'test',
    '--debug-output', join(diagnostics, 'private-debug'), '--test-output-dir', join(diagnostics, 'private-output'), join(diagnostics, 'entry.yaml')],
  { cwd: diagnostics, env: process.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 240000 });
  writeFileSync(join(diagnostics, 'credential-free-entry.txt'), `${result.stdout || ''}\n${result.stderr || ''}`);
  sim(['io', device.id, 'screenshot', join(diagnostics, 'native-after-entry.png')]);
  writeJson(join(root, 'entry-probe-result.json'), { simulatorId: device.id, passed: result.status === 0, exitCode: result.status,
    at: new Date().toISOString(), credentialsSupplied: false, genuineNativeFramebuffer: true });
  if (result.status !== 0) throw new Error('Credential-free native entry probe failed; inspect its native PNGs and safe CLI output.');
  console.log('Credential-free native entry probe passed; Demo login is ready.');
} else if (process.argv[2] === 'capture') {
  required('NATIVE_SCREENSHOT_EMAIL'); required('NATIVE_SCREENSHOT_PASSWORD');
  required('CAPTURE_CHAT_MARKER'); required('CAPTURE_PIN_MARKER'); required('CAPTURE_DM_MARKER');
  const { device, appPath, plist } = nativeProduct();
  const entryProbe = existsSync(join(root, 'entry-probe-result.json')) ? json(join(root, 'entry-probe-result.json')) : null;
  const entryReady = entryProbe?.passed === true && entryProbe.simulatorId === device.id;
  const final = join(root, 'final');
  const privateDir = join(root, 'private');
  const safeStatus = { runId: process.env.GITHUB_RUN_ID, nativeSourceSha: sourceSha, phases: [] };
  const record = (phase, status, extra = {}) => {
    safeStatus.phases.push({ phase, status, at: new Date().toISOString(), ...extra });
    writeJson(join(root, 'safe-capture-status.json'), safeStatus);
    console.log(`Native capture phase ${phase}: ${status}`);
  };
  mkdirSync(final, { recursive: true }); mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  if (!entryReady) sim(['install', device.id, appPath]);
  const maestro = join(root, 'tooling/maestro/bin/maestro');
  if (!existsSync(maestro)) throw new Error('Pinned Maestro installation missing.');
  const signout = [{ tapOn: { text: 'Back to direct messages', optional: true } }, tap('Settings'), wait('Account'), tap('Account'), wait('Sign out'), tap('Sign out'), wait('Enter your email')];
  flow(join(privateDir, 'entry.yaml'), [
    { launchApp: { clearState: true } }, wait('Demo community'), tap('Demo community'), wait('Enter your email'),
  ]);
  flow(join(privateDir, 'login.yaml'), [
    tap('Enter your email'), { inputText: { text: '${MAESTRO_SCREENSHOT_EMAIL}', label: 'Enter dedicated synthetic screenshot account email' } },
    tap('Enter your password'), { inputText: { text: '${MAESTRO_SCREENSHOT_PASSWORD}', label: 'Enter dedicated synthetic screenshot account password' } }, { hideKeyboard: {} },
    { tapOn: { text: 'Sign in', below: { text: 'Password' } } },
    wait('${MAESTRO_CAPTURE_CHAT_MARKER}'), { waitForAnimationToEnd: {} },
    { assertNotVisible: 'Enter your email' }, { assertNotVisible: 'Enter your password' },
  ]);
  flow(join(privateDir, 'pins.yaml'), [
    tap('ShadowPin(, .* unread)?'), wait('${MAESTRO_CAPTURE_PIN_MARKER}'), { waitForAnimationToEnd: {} },
  ]);
  flow(join(privateDir, 'dms.yaml'), [
    tap('DMs(, .* unread)?'), wait('${MAESTRO_CAPTURE_DM_MARKER}'), { waitForAnimationToEnd: {} },
    tap('${MAESTRO_CAPTURE_DM_MARKER}'), wait('Hello from the review account\\. This private conversation is part of the demo\\.'),
    { waitForAnimationToEnd: {} },
  ]);
  flow(join(privateDir, 'signout.yaml'), signout);
  // Pinned Maestro only injects MAESTRO_* shell variables into flows. Credentials
  // stay in child-process environment; they never become CLI arguments.
  const childEnv = { ...process.env,
    MAESTRO_SCREENSHOT_EMAIL: required('NATIVE_SCREENSHOT_EMAIL'),
    MAESTRO_SCREENSHOT_PASSWORD: required('NATIVE_SCREENSHOT_PASSWORD'),
    MAESTRO_CAPTURE_CHAT_MARKER: required('CAPTURE_CHAT_MARKER'),
    MAESTRO_CAPTURE_PIN_MARKER: required('CAPTURE_PIN_MARKER'),
    MAESTRO_CAPTURE_DM_MARKER: required('CAPTURE_DM_MARKER'),
  };
  const run = (file, phase) => {
    record(phase, 'started');
    const result = spawnSync(maestro, ['--device', device.id, 'test', '--debug-output', join(privateDir, 'debug'), '--test-output-dir', join(privateDir, 'test-output'), file],
      { cwd: privateDir, env: childEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 480000 });
    // Classify failures without exporting CLI text, hierarchy, commands or input values.
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const classification = result.status === 0 ? 'passed'
      : /ReferenceError|is not defined/.test(output) ? 'missing-flow-variable'
      : /Parsing Failed|parse.*error|UnrecognizedProperty|Unknown.*command/i.test(output) ? 'flow-parse-error'
      : /Assertion.*fail|not visible|not found|Unable to find|No visible element/i.test(output) ? 'element-or-content-not-found'
      : /driver.*(fail|error)|xcodebuild.*(fail|error)|Failed to.*(driver|device)/i.test(output) ? 'native-driver-error'
      : result.error?.code === 'ETIMEDOUT' ? 'phase-timeout' : 'unclassified-cli-failure';
    record(phase, result.status === 0 ? 'passed' : 'failed', { exitCode: result.status, classification });
    return result;
  };
  let authenticationStarted = false;
  try {
    if (entryReady) record('entry-before-credentials', 'passed-via-separate-no-credential-probe');
    else if (run(join(privateDir, 'entry.yaml'), 'entry-before-credentials').status !== 0) throw new Error('Native entry flow failed.');
    for (const [name, filename] of [['login', '01-chat.png'], ['pins', '02-shadowpin.png'], ['dms', '03-direct-messages.png']]) {
      if (name === 'login') authenticationStarted = true;
      if (run(join(privateDir, `${name}.yaml`), name).status !== 0) throw new Error(`Native ${name} screen did not reach its synthetic-content assertion.`);
      // simctl reads the actual foreground simulator framebuffer; no browser capture or resizing.
      sim(['io', device.id, 'screenshot', join(final, filename)]);
    }
    if (run(join(privateDir, 'signout.yaml'), 'signout').status !== 0) throw new Error('UI sign-out verification failed.');
  } catch {
    const cleanup = authenticationStarted ? run(join(privateDir, 'signout.yaml'), 'failure-signout') : null;
    if (!cleanup) record('failure-signout', 'not-needed-before-credentials');
    const cleanupStatus = !cleanup ? 'not needed before credentials' : cleanup.status === 0 ? 'passed' : 'requires exact session reconciliation';
    throw new Error(`Native capture failed; no screenshot artifacts uploaded. UI sign-out cleanup ${cleanupStatus}. No private diagnostics are uploaded.`);
  } finally {
    // Maestro can include resolved input commands in diagnostics. These are never
    // deliverables; remove the exact directory this helper created after sign-out.
    if (resolve(privateDir) !== join(root, 'private')) throw new Error('Unsafe diagnostic cleanup target.');
    rmSync(privateDir, { recursive: true, force: true });
  }
  const files = ['01-chat.png', '02-shadowpin.png', '03-direct-messages.png'].map(name => {
    const path = join(final, name);
    const bytes = readFileSync(path);
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Capture is not PNG.');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width !== 1320 || height !== 2868) throw new Error(`Unexpected native 6.9-inch dimensions: ${width}x${height}.`);
    return { name, width, height, sha256: hash(path) };
  });
  writeJson(join(final, 'provenance.json'), {
    capturedAt: new Date().toISOString(), kind: 'native-iOS-simulator-Release',
    nativeSourceSha: sourceSha, bundleIdentifier: bundle, version: plist('CFBundleShortVersionString'), build: '26',
    executableSha256: hash(join(appPath, plist('CFBundleExecutable'))),
    embeddedBundleSha256: hash(join(appPath, 'main.jsbundle')),
    simulator: device, xcode: command('xcodebuild', ['-version']),
    community: 'isolated synthetic demo', webOrigin: 'https://shadowchat-review-demo.netlify.app',
    sessionCleanup: 'UI sign-out verified', runId: process.env.GITHUB_RUN_ID, files,
    limitation: 'Simulator screenshots are genuine native app captures; they do not prove physical-device push or matching TestFlight binary bytes. Visually review pixels and live web content before store upload.',
  });
  console.log('Captured three genuine post-login iPhone PNGs and verified UI sign-out. Review pixels before App Store upload.');
} else {
  throw new Error('Usage: node scripts/native-store-screenshots.mjs prepare|entry-probe|capture');
}
