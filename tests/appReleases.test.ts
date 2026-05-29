import {
  canAutoRestartRelease,
  chooseVisibleAppRelease,
  getAppReleasePresentation,
} from '../src/lib/appReleases'
import type { VisibleAppRelease } from '../src/lib/supabase'

const release = (overrides: Partial<VisibleAppRelease> = {}): VisibleAppRelease => ({
  id: 'release-1',
  build_id: 'next-build',
  commit_sha: 'abcdef1234567890',
  deploy_id: null,
  deploy_url: null,
  title: 'Update',
  summary: 'A release.',
  sections: [{ heading: 'New', items: ['Release gate'] }],
  restart_policy: 'optional_restart',
  severity: 'feature',
  published_at: '2026-05-26T12:00:00.000Z',
  delivered_at: null,
  seen_at: null,
  dismissed_at: null,
  acknowledged_at: null,
  restarted_at: null,
  ...overrides,
})

describe('app release presentation', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('shows current-build notes with a restart prompt until acknowledged', () => {
    const presentation = getAppReleasePresentation(
      release({ build_id: 'test-build' }),
      'test-build'
    )

    expect(presentation.shouldShow).toBe(true)
    expect(presentation.isCurrentBuild).toBe(true)
    expect(presentation.wantsRestart).toBe(true)
    expect(presentation.blocksDismiss).toBe(false)
    expect(presentation.closeLabel).toBe('Done')
  })

  it('does not prompt restart for current-build notice-only releases', () => {
    const presentation = getAppReleasePresentation(
      release({ build_id: 'test-build', restart_policy: 'notice_only' }),
      'test-build'
    )

    expect(presentation.shouldShow).toBe(true)
    expect(presentation.wantsRestart).toBe(false)
    expect(presentation.blocksDismiss).toBe(false)
  })

  it('hides current-build notes after they have been acknowledged', () => {
    const presentation = getAppReleasePresentation(
      release({
        build_id: 'test-build',
        acknowledged_at: '2026-05-26T12:01:00.000Z',
      }),
      'test-build'
    )

    expect(presentation.shouldShow).toBe(false)
  })

  it('lets optional old-build releases be dismissed after the user reads them', () => {
    const presentation = getAppReleasePresentation(release(), 'old-build')

    expect(presentation.shouldShow).toBe(true)
    expect(presentation.wantsRestart).toBe(true)
    expect(presentation.blocksDismiss).toBe(false)
    expect(presentation.closeLabel).toBe('Later')

    const dismissed = getAppReleasePresentation(
      release({ dismissed_at: '2026-05-26T12:01:00.000Z' }),
      'old-build'
    )
    expect(dismissed.shouldShow).toBe(false)
  })

  it('keeps required old-build releases visible until the build changes', () => {
    const presentation = getAppReleasePresentation(
      release({
        restart_policy: 'required_restart',
        acknowledged_at: '2026-05-26T12:01:00.000Z',
      }),
      'old-build'
    )

    expect(presentation.shouldShow).toBe(true)
    expect(presentation.wantsRestart).toBe(true)
    expect(presentation.blocksDismiss).toBe(true)
    expect(presentation.autoRestart).toBe(false)
  })

  it('marks critical old-build releases for auto restart', () => {
    const presentation = getAppReleasePresentation(
      release({ restart_policy: 'critical_force_restart', severity: 'critical' }),
      'old-build'
    )

    expect(presentation.shouldShow).toBe(true)
    expect(presentation.blocksDismiss).toBe(true)
    expect(presentation.autoRestart).toBe(true)
  })

  it('chooses the newest release when it still needs attention', () => {
    const selected = chooseVisibleAppRelease([
      release({
        id: 'older-release',
        build_id: 'older-build',
        published_at: '2026-05-26T12:00:00.000Z',
      }),
      release({
        id: 'newest-release',
        build_id: 'test-build',
        published_at: '2026-05-27T12:00:00.000Z',
      }),
    ], 'test-build')

    expect(selected?.id).toBe('newest-release')
  })

  it('does not fall back to older restart-required releases after the newest release is handled', () => {
    const selected = chooseVisibleAppRelease([
      release({
        id: 'older-required-release',
        build_id: 'older-build',
        restart_policy: 'required_restart',
        published_at: '2026-05-26T12:00:00.000Z',
      }),
      release({
        id: 'newest-restarted-release',
        build_id: 'newest-build',
        restart_policy: 'required_restart',
        published_at: '2026-05-27T12:00:00.000Z',
        restarted_at: '2026-05-27T12:01:00.000Z',
      }),
    ], 'newest-build')

    expect(selected).toBeNull()
  })

  it('throttles automatic critical restarts within a browser session', () => {
    expect(canAutoRestartRelease('release-1', 1000)).toBe(true)
    expect(canAutoRestartRelease('release-1', 3000)).toBe(false)
    expect(canAutoRestartRelease('release-1', 123000)).toBe(true)
  })
})
