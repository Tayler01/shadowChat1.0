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
} else if (process.argv[2] === 'capture') {
  required('NATIVE_SCREENSHOT_EMAIL'); required('NATIVE_SCREENSHOT_PASSWORD');
  required('CAPTURE_CHAT_MARKER'); required('CAPTURE_PIN_MARKER'); required('CAPTURE_DM_MARKER');
  const device = json(join(root, 'simulator.json'));
  const productDir = join(root, 'DerivedData/Build/Products/Release-iphonesimulator');
  const app = readdirSync(productDir).find(name => name.endsWith('.app') && !name.includes('Tests'));
  if (!app) throw new Error('Native Release simulator app missing.');
  const appPath = join(productDir, app);
  const plist = (key) => command('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(appPath, 'Info.plist')]);
  if (plist('CFBundleIdentifier') !== bundle || plist('CFBundleVersion') !== '26' ||
      plist('CFBundleSupportedPlatforms:0') !== 'iPhoneSimulator' || !existsSync(join(appPath, 'main.jsbundle'))) {
    throw new Error('Native Release simulator artifact identity mismatch.');
  }
  const final = join(root, 'final');
  const privateDir = join(root, 'private');
  mkdirSync(final, { recursive: true }); mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  sim(['install', device.id, appPath]);
  const maestro = join(root, 'tooling/maestro/bin/maestro');
  if (!existsSync(maestro)) throw new Error('Pinned Maestro installation missing.');
  const signout = [tap('Settings'), wait('Account'), tap('Account'), wait('Sign out'), tap('Sign out'), wait('Enter your email')];
  flow(join(privateDir, 'login.yaml'), [
    { launchApp: { clearState: true } }, wait('Demo community'), tap('Demo community'), wait('Enter your email'),
    tap('Enter your email'), { inputText: { text: '${NATIVE_SCREENSHOT_EMAIL}', label: 'Enter dedicated synthetic screenshot account email' } },
    tap('Enter your password'), { inputText: { text: '${NATIVE_SCREENSHOT_PASSWORD}', label: 'Enter dedicated synthetic screenshot account password' } }, { hideKeyboard: {} },
    { tapOn: { text: 'Sign in', below: { text: 'Password' } } },
    wait('${CAPTURE_CHAT_MARKER}'), { waitForAnimationToEnd: {} },
    { assertNotVisible: 'Enter your email' }, { assertNotVisible: 'Enter your password' },
  ]);
  flow(join(privateDir, 'pins.yaml'), [
    tap('ShadowPin(, .* unread)?'), wait('${CAPTURE_PIN_MARKER}'), { waitForAnimationToEnd: {} },
  ]);
  flow(join(privateDir, 'dms.yaml'), [
    tap('DMs(, .* unread)?'), wait('${CAPTURE_DM_MARKER}'), { waitForAnimationToEnd: {} },
  ]);
  flow(join(privateDir, 'signout.yaml'), signout);
  const run = file => spawnSync(maestro, ['--device', device.id, 'test', '--debug-output', join(privateDir, 'debug'), '--test-output-dir', join(privateDir, 'test-output'), file],
    { cwd: privateDir, env: process.env, stdio: 'ignore', timeout: 480000 });
  try {
    for (const [name, filename] of [['login', '01-chat.png'], ['pins', '02-shadowpin.png'], ['dms', '03-direct-messages.png']]) {
      if (run(join(privateDir, `${name}.yaml`)).status !== 0) throw new Error(`Native ${name} screen did not reach its synthetic-content assertion.`);
      // simctl reads the actual foreground simulator framebuffer; no browser capture or resizing.
      sim(['io', device.id, 'screenshot', join(final, filename)]);
    }
    if (run(join(privateDir, 'signout.yaml')).status !== 0) throw new Error('UI sign-out verification failed.');
  } catch {
    const cleanup = run(join(privateDir, 'signout.yaml'));
    throw new Error(`Native capture failed; no screenshot artifacts uploaded. UI sign-out cleanup ${cleanup.status === 0 ? 'passed' : 'requires exact session reconciliation'}. No private diagnostics are uploaded.`);
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
  throw new Error('Usage: node scripts/native-store-screenshots.mjs prepare|capture');
}
