import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const repoRoot = join(import.meta.dirname, '..')
const mobileRoot = join(repoRoot, 'apps', 'mobile')
const soundRoot = join(mobileRoot, 'assets', 'sounds')
const manifest = JSON.parse(readFileSync(join(soundRoot, 'manifest.json'), 'utf8'))
const appConfig = JSON.parse(readFileSync(join(mobileRoot, 'app.json'), 'utf8'))
const nativeConfigSource = readFileSync(
  join(mobileRoot, 'src', 'lib', 'notifications', 'config.ts'),
  'utf8',
)
const deliveryWorkerSource = readFileSync(
  join(repoRoot, 'supabase', 'functions', 'deliver-notifications-v2', 'index.ts'),
  'utf8',
)
const nativeNotificationHookSource = readFileSync(
  join(mobileRoot, 'src', 'hooks', 'useNativeNotifications.tsx'),
  'utf8',
)

test('all original ShadowChat notification sounds exist and ship through Expo', () => {
  assert.equal(manifest.version, 1)
  assert.equal(manifest.license, 'Original ShadowChat generated assets')
  assert.equal(manifest.sounds.length, 12)

  const notificationPlugin = appConfig.expo.plugins.find(
    plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
  )
  assert.ok(notificationPlugin)
  const configuredSounds = notificationPlugin[1].sounds
  assert.equal(configuredSounds.length, manifest.sounds.length)

  for (const soundId of manifest.sounds) {
    const filename = `${soundId}.wav`
    assert.ok(existsSync(join(soundRoot, filename)), `Missing ${filename}`)
    assert.ok(
      configuredSounds.includes(`./assets/sounds/${filename}`),
      `Expo does not include ${filename}`,
    )
  }
})

test('native notification channels are versioned, private, and foreground-suppressed', () => {
  assert.match(nativeConfigSource, /NOTIFICATION_CHANNEL_SCHEMA_VERSION = 2/)
  assert.match(nativeConfigSource, /shadowchat_sound_\$\{soundId\}_v\$\{NOTIFICATION_CHANNEL_SCHEMA_VERSION\}/)
  assert.match(nativeConfigSource, /AndroidNotificationVisibility\.PRIVATE/)
  assert.match(nativeConfigSource, /shouldShowBanner: false/)
  assert.match(nativeConfigSource, /shouldShowList: false/)
  assert.equal(
    appConfig.expo.plugins.find(
      plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
    )[1].defaultChannel,
    'shadowchat_sound_shadow_whisper_v2',
  )
})

test('delivery worker enforces service-only delivery and Expo reliability controls', () => {
  assert.match(deliveryWorkerSource, /Service role required/)
  assert.match(deliveryWorkerSource, /EXPO_PUSH_ACCESS_TOKEN/)
  assert.match(deliveryWorkerSource, /DeviceNotRegistered/)
  assert.match(deliveryWorkerSource, /push\/getReceipts/)
  assert.match(deliveryWorkerSource, /payloadBytes\(\) > 3_800/)
  assert.match(deliveryWorkerSource, /richContent/)
  assert.match(deliveryWorkerSource, /mutableContent/)
})

test('native auth loss revokes the installation and invalidates local push state', () => {
  assert.match(nativeNotificationHookSource, /revokeInstallationWithSession\(priorSession\)/)
  assert.match(nativeNotificationHookSource, /unregisterForNotificationsAsync\(\)/)
  assert.match(nativeNotificationHookSource, /dismissAllNotificationsAsync\(\)/)
  assert.match(nativeNotificationHookSource, /setBadgeCountAsync\(0\)/)
  assert.match(nativeNotificationHookSource, /registrationInFlightRef/)
})
