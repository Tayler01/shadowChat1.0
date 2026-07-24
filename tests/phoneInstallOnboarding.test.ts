import {
  hasPhoneInstallOnboardingPending,
  isPhoneInstallOnboardingSeen,
  markPhoneInstallOnboardingPending,
  markPhoneInstallOnboardingSeen,
  shouldShowPhoneInstallOnboarding,
} from '../src/lib/phoneInstallOnboarding'

const profile = {
  id: 'user-1',
  email: 'NewUser@Example.com',
  created_at: new Date().toISOString(),
}

beforeEach(() => {
  window.localStorage.clear()
})

test('shows onboarding when signup marked the account pending by email', () => {
  markPhoneInstallOnboardingPending('newuser@example.com')

  expect(hasPhoneInstallOnboardingPending(profile)).toBe(true)
  expect(shouldShowPhoneInstallOnboarding(profile, false, true)).toBe(true)
})

test('shows onboarding when signup marked the account pending by user id', () => {
  markPhoneInstallOnboardingPending(null, 'user-1')

  expect(hasPhoneInstallOnboardingPending(profile)).toBe(true)
  expect(shouldShowPhoneInstallOnboarding(profile, false, true)).toBe(true)
})

test('does not show onboarding to an established account without a signup marker', () => {
  expect(hasPhoneInstallOnboardingPending(profile)).toBe(false)
  expect(shouldShowPhoneInstallOnboarding(profile, false, true)).toBe(false)
})

test('ignores a legacy pending flag that was not tied to this signup', () => {
  window.localStorage.setItem(
    'shadowchat:phone-install-onboarding:pending-user:v2:user-1',
    '1'
  )

  expect(hasPhoneInstallOnboardingPending(profile)).toBe(false)
  expect(shouldShowPhoneInstallOnboarding(profile, false, true)).toBe(false)
})

test('does not show onboarding after the account has seen it', () => {
  markPhoneInstallOnboardingPending('newuser@example.com', 'user-1')
  markPhoneInstallOnboardingSeen(profile)

  expect(isPhoneInstallOnboardingSeen(profile)).toBe(true)
  expect(hasPhoneInstallOnboardingPending(profile)).toBe(false)
  expect(shouldShowPhoneInstallOnboarding(profile, false, true)).toBe(false)
})

test('does not show onboarding inside an already installed app window', () => {
  markPhoneInstallOnboardingPending('newuser@example.com')

  expect(shouldShowPhoneInstallOnboarding(profile, true, true)).toBe(false)
})

test('does not auto-open onboarding on non-phone devices', () => {
  expect(shouldShowPhoneInstallOnboarding(profile, false, false)).toBe(false)
})
