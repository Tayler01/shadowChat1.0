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
const nativeEntrySource = readFileSync(join(mobileRoot, 'index.js'), 'utf8')
const nativeAppSource = readFileSync(
  join(mobileRoot, 'src', 'app', 'index.tsx'),
  'utf8',
)
const nativeBridgeSource = readFileSync(
  join(mobileRoot, 'src', 'lib', 'nativeAppBridge.ts'),
  'utf8',
)
const nativeRegistrationSource = readFileSync(
  join(mobileRoot, 'src', 'lib', 'notifications', 'registration.ts'),
  'utf8',
)
const nativeFreshTokenSource = readFileSync(
  join(
    mobileRoot,
    'src',
    'lib',
    'notifications',
    'freshDevicePushToken.ts',
  ),
  'utf8',
)
const nativeRegistrationPipelineSource = readFileSync(
  join(
    mobileRoot,
    'src',
    'lib',
    'notifications',
    'registrationPipeline.ts',
  ),
  'utf8',
)
const webNativeBridgeSource = readFileSync(
  join(repoRoot, 'src', 'components', 'native', 'NativeAppBridge.tsx'),
  'utf8',
)
const webBridgeTransportSource = readFileSync(
  join(repoRoot, 'src', 'lib', 'nativeAppBridge.ts'),
  'utf8',
)
const webMainSource = readFileSync(join(repoRoot, 'src', 'main.tsx'), 'utf8')
const mobilePackage = JSON.parse(
  readFileSync(join(mobileRoot, 'package.json'), 'utf8'),
)
const androidBackgroundSource = readFileSync(
  join(mobileRoot, 'src', 'lib', 'notifications', 'background.ts'),
  'utf8',
)
const androidPresenterSource = readFileSync(
  join(mobileRoot, 'src', 'lib', 'notifications', 'androidPresenter.ts'),
  'utf8',
)
const iosExtensionPluginSource = readFileSync(
  join(mobileRoot, 'plugins', 'with-shadowchat-notification-service-extension.js'),
  'utf8',
)
const iosExtensionSource = readFileSync(
  join(
    mobileRoot,
    'plugins',
    'notification-service-extension',
    'NotificationService.swift',
  ),
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

test('delivery worker uses a dedicated secret and platform-specific rich payloads', () => {
  assert.match(deliveryWorkerSource, /NOTIFICATION_V2_WORKER_SECRET/)
  assert.match(deliveryWorkerSource, /x-shadowchat-worker-secret/)
  assert.match(deliveryWorkerSource, /EXPO_PUSH_ACCESS_TOKEN/)
  assert.match(deliveryWorkerSource, /DeviceNotRegistered/)
  assert.match(deliveryWorkerSource, /push\/getReceipts/)
  assert.match(deliveryWorkerSource, /payloadBytes\(\) > 3_800/)
  assert.match(deliveryWorkerSource, /installation\.platform === 'android'/)
  assert.match(deliveryWorkerSource, /badgeCount: badge/)
  assert.doesNotMatch(deliveryWorkerSource, /_contentAvailable: true/)
  assert.doesNotMatch(deliveryWorkerSource, /richContent/)
  assert.match(deliveryWorkerSource, /mutableContent/)
})

test('Android registers its headless task before Expo Router and presents rich groups', () => {
  assert.match(nativeEntrySource, /notifications\/background/)
  assert.match(nativeEntrySource, /expo-router\/entry/)
  assert.ok(
    nativeEntrySource.indexOf('notifications/background') <
      nativeEntrySource.indexOf('expo-router/entry'),
  )
  assert.match(androidBackgroundSource, /TaskManager\.defineTask/)
  assert.match(androidBackgroundSource, /AppState\.currentState === 'active'/)
  assert.match(androidBackgroundSource, /data\.dataString/)
  assert.doesNotMatch(androidBackgroundSource, /notifee\.onBackgroundEvent/)
  assert.match(androidPresenterSource, /AndroidStyle\.MESSAGING/)
  assert.match(androidPresenterSource, /AndroidStyle\.BIGPICTURE/)
  assert.match(androidPresenterSource, /notifee\.setBadgeCount/)
  assert.match(androidPresenterSource, /groupSummary: true/)
})

test('iOS ships a communication-aware notification service extension', () => {
  assert.equal(
    appConfig.expo.extra.eas.build.experimental.ios.appExtensions.length,
    1,
  )
  assert.equal(
    appConfig.expo.extra.eas.build.experimental.ios.appExtensions[0].bundleIdentifier,
    'com.shadowchat.mobile.notification-service',
  )
  assert.equal(
    appConfig.expo.ios.entitlements[
      'com.apple.developer.usernotifications.communication'
    ],
    true,
  )
  assert.match(iosExtensionPluginSource, /ShadowChatNotificationService/)
  assert.match(iosExtensionSource, /UNNotificationServiceExtension/)
  assert.match(iosExtensionSource, /INSendMessageIntent/)
  assert.match(iosExtensionSource, /downloadedAvatar\.flatMap/)
  assert.match(iosExtensionSource, /INInteractionDirection\.incoming/)
  assert.match(iosExtensionSource, /interaction\.donate \{ _ in \}/)
  assert.match(iosExtensionSource, /serviceExtensionTimeWillExpire/)
})

test('native auth loss, opt-out, read state, and badges are durable', () => {
  assert.match(nativeNotificationHookSource, /revokeInstallationWithSession\(priorSession\)/)
  assert.match(nativeNotificationHookSource, /unregisterForNotificationsAsync\(\)/)
  assert.match(nativeNotificationHookSource, /dismissAllNotificationsAsync\(\)/)
  assert.match(nativeNotificationHookSource, /setBadgeCountAsync\(0\)/)
  assert.match(nativeNotificationHookSource, /registrationInFlightRef/)
  assert.match(nativeNotificationHookSource, /authEventVersion === 0/)
  assert.match(nativeNotificationHookSource, /getSupabase\(\)\.auth\.getSession\(\)/)
  assert.match(nativeNotificationHookSource, /setNativeNotificationDeviceOptOut\(true\)/)
  assert.match(nativeNotificationHookSource, /get_app_badge_state_v2/)
  assert.match(nativeNotificationHookSource, /mark_my_notification_event_read/)
})

test('signed mobile client contains the full production app and a secure native session bridge', () => {
  assert.equal(typeof mobilePackage.dependencies['react-native-webview'], 'string')
  assert.match(nativeAppSource, /from 'react-native-webview'/)
  assert.match(nativeAppSource, /https:\/\/shadochat\.online/)
  assert.match(nativeAppSource, /new URL\(value\)\.origin === APP_ORIGIN/)
  assert.match(nativeAppSource, /sb-shsqqouecvdoifzufkqm-auth-token/)
  assert.match(nativeAppSource, /window\.setInterval\(publishWebSession, 1200\)/)
  assert.match(nativeAppSource, /client\.auth\.setSession/)
  assert.match(nativeAppSource, /Enable Notifications/)
  assert.match(nativeAppSource, /<SafeAreaView edges=\{\['top', 'bottom'\]\}/)
  assert.match(nativeAppSource, /message\.type === 'notifications_open_settings'/)
  assert.match(nativeAppSource, /subscribeToNativeNotificationRoutes/)
  assert.doesNotMatch(nativeAppSource, /fetchGeneralMessages/)
  assert.doesNotMatch(nativeAppSource, /sendGeneralTextMessage/)
  assert.equal(
    existsSync(join(mobileRoot, 'src', 'app', 'notification-target.tsx')),
    false,
  )

  assert.match(webMainSource, /<NativeAppBridge \/>/)
  assert.match(webBridgeTransportSource, /ReactNativeWebView/)
  assert.match(webBridgeTransportSource, /get\('nativeApp'\) === '1'/)
  assert.match(webBridgeTransportSource, /openNativeNotificationSettings/)
  assert.match(
    webBridgeTransportSource,
    /type: 'notifications_enable', requestId, session/,
  )
  assert.match(webBridgeTransportSource, /type: 'auth_session'/)
  assert.match(webBridgeTransportSource, /state\.requestId === requestId/)
  assert.doesNotMatch(
    webBridgeTransportSource,
    /state\.permission === 'undetermined'\s*\n\s*\)/,
  )
  assert.match(webNativeBridgeSource, /accessToken: session\.access_token/)
  assert.match(webNativeBridgeSource, /refreshToken: session\.refresh_token/)
  assert.match(nativeBridgeSource, /parseNativeWebMessage/)
  assert.match(nativeBridgeSource, /publishNativeNotificationRoute/)
  assert.match(nativeBridgeSource, /requestId: string \| null/)
  assert.match(nativeAppSource, /createSerializedCommandQueue/)
  assert.match(nativeAppSource, /stage: 'syncing_session'/)
  assert.match(nativeFreshTokenSource, /requireNativeModule/)
  assert.match(nativeFreshTokenSource, /ExpoPushTokenManager/)
  assert.match(
    nativeRegistrationSource,
    /getExpoPushTokenAsync\(\{\s*projectId,\s*devicePushToken,/,
  )
  assert.match(nativeRegistrationPipelineSource, /Promise\.race/)
  assert.match(
    nativeRegistrationPipelineSource,
    /requesting_device_token: 20_000/,
  )
  assert.match(
    nativeNotificationHookSource,
    /publishNativeNotificationRoute\(normalizeNotificationRoute\(envelope\.route\)\)/,
  )
})
