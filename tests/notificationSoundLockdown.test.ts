import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), 'utf8')

const compact = (value: string) => value.replace(/\s+/g, ' ').toLowerCase()

describe('notification sound lockdown contracts', () => {
  it('keeps notification sounds local and removes the legacy database fetch path', () => {
    const source = read('src/hooks/useSoundEffects.tsx')

    expect(source).toContain("localStorage.removeItem('notificationSoundUrls')")
    expect(source).toContain('createOscillator')
    expect(source).not.toContain("from('notification_sounds')")
    expect(source).not.toContain('/sounds/message.mp3')
    expect(source).not.toContain('/sounds/reaction.mp3')
    expect(source).not.toContain('getWorkingClient')
  })

  it('archives the table behind RLS with no browser-role privileges or policies', () => {
    const migration = compact(read(
      'supabase/migrations/20260709215208_notification_sound_static_lockdown.sql'
    ))

    expect(migration).toContain(
      'alter table public.notification_sounds enable row level security'
    )
    expect(migration).toContain("tablename = 'notification_sounds'")
    expect(migration).toContain(
      'revoke all privileges on table public.notification_sounds from public, anon, authenticated'
    )
  })
})
