import { fireEvent, render, screen } from '@testing-library/react'
import { AppReleaseDialog } from '../src/components/releases/AppReleaseDialog'
import { getAppReleasePresentation } from '../src/lib/appReleases'
import type { VisibleAppRelease } from '../src/lib/supabase'

const makeRelease = (overrides: Partial<VisibleAppRelease> = {}): VisibleAppRelease => ({
  id: 'release-1', build_id: 'next-build', commit_sha: 'abcdef1234567890',
  deploy_id: null, deploy_url: null, title: 'Chat improvements', summary: 'Smoother conversations.',
  sections: [{ heading: 'New', items: ['Reliable read positions'] }],
  restart_policy: 'optional_restart', severity: 'feature', published_at: '2026-09-30T12:00:00Z',
  delivered_at: null, seen_at: null, dismissed_at: null, acknowledged_at: null, restarted_at: null,
  ...overrides,
})

function showDialog(overrides: Partial<VisibleAppRelease> = {}, countdown: number | null = null) {
  const release = makeRelease(overrides)
  const restart = jest.fn().mockResolvedValue(undefined)
  const close = jest.fn().mockResolvedValue(undefined)
  render(<AppReleaseDialog release={release} presentation={getAppReleasePresentation(release, 'test-build')}
    loadingRestart={false} criticalCountdown={countdown} restartForRelease={restart} closeRelease={close} />)
  return { release, restart, close }
}

describe('lazy release presentation', () => {
  beforeEach(() => sessionStorage.clear())

  it('preserves required restart and prevents dismissing the release', () => {
    const { release, restart, close } = showDialog({ restart_policy: 'required_restart' })
    expect(screen.getByRole('dialog', { name: 'Chat improvements' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close update notes' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /restart/i }))
    expect(restart).toHaveBeenCalledWith(release)
    expect(close).not.toHaveBeenCalled()
  })

  it('allows notice-only dismissal without offering restart', () => {
    const { close } = showDialog({ restart_policy: 'notice_only' })
    expect(screen.queryByRole('button', { name: /restart/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close update notes' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('retains critical countdown messaging', () => {
    showDialog({ restart_policy: 'critical_force_restart', severity: 'critical' }, 8)
    expect(screen.getByText(/will restart in 8s/)).toBeTruthy()
  })
})

