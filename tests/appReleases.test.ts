import {
  canAutoRestartRelease,
  chooseVisibleAppRelease,
  getAppReleasePresentation,
} from '../src/lib/appReleases'
import {
  normalizeAppReleaseSections,
  type VisibleAppRelease,
} from '../src/lib/supabase'

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

describe('app release sections', () => {
  it('preserves requester recognition metadata from release JSON', () => {
    const sections = normalizeAppReleaseSections([
      {
        kind: 'recognition',
        heading: 'Community credit',
        items: ['JJ asked for photo zooming and it shipped.'],
        recognition: {
          user_id: 'user-1',
          username: 'jj',
          display_name: 'JJ',
          avatar_thumbnail_url: 'https://example.test/avatar.webp',
          banner_thumbnail_url: 'https://example.test/banner.webp',
          profile_color: '#c8b08a',
          submission_id: 'submission-1',
          submission_title: 'Zoom feature on photos',
          submission_type: 'bug',
          feature_title: 'Full-screen photo pinch zoom',
        },
      },
    ])

    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({
      kind: 'recognition',
      heading: 'Community credit',
      items: ['JJ asked for photo zooming and it shipped.'],
      recognition: {
        userId: 'user-1',
        username: 'jj',
        displayName: 'JJ',
        avatarThumbnailUrl: 'https://example.test/avatar.webp',
        bannerThumbnailUrl: 'https://example.test/banner.webp',
        profileColor: '#c8b08a',
        submissionId: 'submission-1',
        submissionTitle: 'Zoom feature on photos',
        submissionType: 'bug',
        featureTitle: 'Full-screen photo pinch zoom',
      },
    })
  })

  it('treats recognition sections without profile metadata as standard sections', () => {
    const sections = normalizeAppReleaseSections([
      {
        kind: 'recognition',
        heading: 'Fallback',
        items: ['Still visible as regular release copy.'],
      },
    ])

    expect(sections).toEqual([
      {
        heading: 'Fallback',
        items: ['Still visible as regular release copy.'],
      },
    ])
  })
})
