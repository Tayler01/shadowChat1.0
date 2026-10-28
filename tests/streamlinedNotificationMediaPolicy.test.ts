import { normalizeNotificationMediaUrl } from '../src/features/notifications/notificationEnvelopeV2'

const modulePath = '../apps/streamlined/src-overrides/lib/notificationMediaPolicy'
const envPath = './mocks/env'
const demoOrigin = 'https://shadowchat-review-demo.netlify.app'
const demoBackend = 'https://lzmbwrbvtugqnmuefdrm.supabase.co'
const demoMedia = `${demoBackend}/storage/v1/object/public/avatars/reviewer.jpg`
const memberMedia = 'https://shsqqouecvdoifzufkqm.supabase.co/storage/v1/object/public/avatars/member.jpg'

function loadPolicy(env: Record<string, unknown>) {
  let policy: Parameters<typeof normalizeNotificationMediaUrl>[1]
  jest.isolateModules(() => {
    jest.doMock(envPath, () => env)
    policy = jest.requireActual(modulePath).streamlinedNotificationMediaUrlPolicy
  })
  return policy
}

afterEach(() => jest.dontMock(envPath))

test('the demo consumer selects only its compiled app and backend origins', () => {
  const policy = loadPolicy({
    VITE_APP_DEPLOY_CONTEXT: 'review-demo', VITE_NOTIFICATION_APP_ORIGIN: demoOrigin,
    VITE_SUPABASE_URL: demoBackend,
  })
  expect(normalizeNotificationMediaUrl(demoMedia, policy)).toBe(demoMedia)
  expect(normalizeNotificationMediaUrl(memberMedia, policy)).toBeNull()
})

test('review-demo config omissions fail closed at the real consumer', () => {
  for (const config of [{}, { VITE_NOTIFICATION_APP_ORIGIN: demoOrigin }, { VITE_SUPABASE_URL: demoBackend }]) {
    const policy = loadPolicy({ VITE_APP_DEPLOY_CONTEXT: 'review-demo', ...config })
    expect(policy).toBeDefined()
    expect(normalizeNotificationMediaUrl(demoMedia, policy)).toBeNull()
    expect(normalizeNotificationMediaUrl(memberMedia, policy)).toBeNull()
  }
})

test('the member build keeps the existing legacy policy', () => {
  const policy = loadPolicy({ VITE_APP_DEPLOY_CONTEXT: 'production' })
  expect(policy).toBeUndefined()
  expect(normalizeNotificationMediaUrl(memberMedia, policy)).toBe(memberMedia)
})
