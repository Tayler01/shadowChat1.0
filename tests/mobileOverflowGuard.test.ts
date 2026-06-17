import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const readSource = (path: string) => readFileSync(join(root, path), 'utf8')

describe('mobile overflow guardrails', () => {
  it('bounds the public profile dialog to the visual viewport with safe-area padding', () => {
    const source = readSource('src/components/profile/PublicProfileDialog.tsx')

    expect(source).toContain('h-[var(--shadowchat-visual-viewport-height,100dvh)]')
    expect(source).toContain('max-h-[var(--shadowchat-visual-viewport-height,100dvh)]')
    expect(source).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(source).toContain('flex-wrap items-center')
  })

  it('keeps admin access rows scroll bounded and long email text breakable', () => {
    const source = readSource('src/components/settings/SettingsView.tsx')

    expect(source).toContain('max-h-[min(36rem,calc(var(--shadowchat-visual-viewport-height,100dvh)-15rem))]')
    expect(source).toContain('overscroll-contain')
    expect(source).toContain('break-all text-sm text-[var(--text-muted)]')
  })

  it('allows profile identity text to wrap without widening the screen', () => {
    const source = readSource('src/components/profile/ProfileView.tsx')

    expect(source).toContain('w-full max-w-5xl min-w-0')
    expect(source).toContain('flex min-w-0 flex-wrap items-center gap-2')
    expect(source).toContain('whitespace-pre-wrap break-words')
  })
})
