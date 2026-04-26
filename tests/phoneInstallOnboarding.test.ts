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
}

beforeEach(() => {
  window.localStorage.clear()
})

test('shows onboarding when signup marked the account pending by email', () => {
  markPhoneInstallOnboardingPending('newuser@example.com')

  expect(hasPhoneInstallOnboardingPending(profile)).toBe(true)
  expect(shouldShowPhoneInstallOnboarding(profile, false)).toBe(true)
})

test('shows onboarding when signup marked the account pending by user id', () => {
  markPhoneInstallOnboardingPending(null, 'user-1')

  expect(hasPhoneInstallOnboardingPending(profile)).toBe(true)
  expect(shouldShowPhoneInstallOnboarding(profile, false)).toBe(true)
})

test('does not show onboarding after the account has seen it', () => {
  markPhoneInstallOnboardingPending('newuser@example.com', 'user-1')
  markPhoneInstallOnboardingSeen(profile)

  expect(isPhoneInstallOnboardingSeen(profile)).toBe(true)
  expect(hasPhoneInstallOnboardingPending(profile)).toBe(false)
  expect(shouldShowPhoneInstallOnboarding(profile, false)).toBe(false)
})

test('does not show onboarding inside an already installed app window', () => {
  markPhoneInstallOnboardingPending('newuser@example.com')

  expect(shouldShowPhoneInstallOnboarding(profile, true)).toBe(false)
})
