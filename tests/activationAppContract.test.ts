import fs from 'node:fs'
import path from 'node:path'

const app = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8')
const coordinator = fs.readFileSync(
  path.join(process.cwd(), 'src', 'features', 'activation', 'FirstRunActivationCoordinator.tsx'),
  'utf8'
)
const installGuide = fs.readFileSync(
  path.join(process.cwd(), 'src', 'components', 'onboarding', 'PhoneInstallGuide.tsx'),
  'utf8'
)

describe('activation shell integration contract', () => {
  test('preserves legacy install onboarding only for confirmed unenrolled members', () => {
    expect(app).toContain("useState<'checking' | 'enrolled' | 'unenrolled'>('checking')")
    expect(app).toContain('onEnrollmentStateChange={setActivationEnrollment}')
    expect(app).toContain("activationEnrollment === 'unenrolled' && <PhoneInstallOnboarding />")
    expect(coordinator).toContain("onEnrollmentStateChange?.('checking')")
    expect(coordinator).toContain("next ? 'enrolled' : 'unenrolled'")
    expect(coordinator).toContain('ACTIVATION_LOOKUP_RETRY_MS')
  })

  test('keeps action and success cards above chat/DM footer and keyboard insets', () => {
    expect(coordinator).toContain("currentView === 'chat' || currentView === 'dms'")
    expect(coordinator).toContain('var(--shadowchat-mobile-chat-footer-height,9.5rem)')
    expect(coordinator).toContain('var(--shadowchat-keyboard-inset,0px)')
    expect(coordinator.match(/\$\{mobileCardBottom\}/g)).toHaveLength(2)
  })

  test('does not show the Android tutorial video on the iPhone tab', () => {
    expect(installGuide).toMatch(/ios: \{[\s\S]*?src: null/)
    expect(installGuide).toMatch(/android: \{[\s\S]*?src: '\/tutorials\/shadochat-setup-android\.mp4'/)
  })
})
