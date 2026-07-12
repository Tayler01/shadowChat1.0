import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('mobile headerless tab contract', () => {
  test('active tabs hide shared headers on phones while retaining desktop headers', () => {
    const dms = source('src/components/dms/DirectMessagesView.tsx')
    const pins = source('src/features/shadow-pin/ShadowPin.tsx')
    const games = source('src/features/games/GamesHome.tsx')
    const settings = source('src/components/settings/SettingsView.tsx')

    expect(dms.match(/<MobileAppHeader/g)).toHaveLength(4)
    expect(dms).toContain('{isDesktop && (')
    expect(dms).toContain('{isDesktop ? (')
    expect(pins.match(/className="hidden md:flex"/g)).toHaveLength(2)
    expect(games).toContain('className="hidden md:flex"')
    expect(settings.match(/<MobileAppHeader/g)).toHaveLength(1)
    expect(settings).toContain('{isDesktop && (')
    expect(settings).toContain('{!isDesktop && activeSection && (')
  })

  test('phone-safe replacement controls preserve actions without rebuilding a header bar', () => {
    const dms = source('src/components/dms/DirectMessagesView.tsx')
    const inboxControls = source('src/components/dms/hub/DMHubInboxControls.tsx')
    const pins = source('src/features/shadow-pin/ShadowPin.tsx')
    const settings = source('src/components/settings/SettingsView.tsx')

    expect(inboxControls).toContain('pt-[calc(env(safe-area-inset-top)+0.5rem)]')
    expect(inboxControls).toContain('aria-label="Start new conversation"')
    expect(dms).toContain('top-[calc(env(safe-area-inset-top)+0.5rem)] z-40')
    expect(dms).toContain('Open conversation details for')
    expect(pins).toContain('aria-label="Back to Shado Pin"')
    expect(pins).toContain('md:top-[calc(env(safe-area-inset-top)_+_3.85rem)]')
    expect(settings).toContain("activeSection === 'accessibility-comfort'")
    expect(settings).toContain('aria-label="Reset comfort settings"')
  })
})
