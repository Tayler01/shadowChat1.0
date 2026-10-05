import { act, fireEvent, render, screen } from '@testing-library/react'
import { GamesHome } from '../src/features/games/GamesHome'

const mockSoundtrack = {
  play: jest.fn(), stop: jest.fn(), dispose: jest.fn(), setVolume: jest.fn(), isPlaying: jest.fn(),
}
let mockMusicEnabled = true
jest.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
jest.mock('../src/config/featureFlags', () => ({ SHADO_LIVE_PROTOTYPE_ENABLED: false, SHADO_LIVE_REAL_ENABLED: true }))
jest.mock('../src/features/games/gameSoundtrack', () => ({
  createGameSoundtrackController: () => mockSoundtrack,
}))
jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({ effectivePreferences: { gameMusic: mockMusicEnabled }, updatePreferences: jest.fn() }),
}))
jest.mock('../src/hooks/useAppBadgeState', () => ({ useAppBadgeState: () => ({ gameDestinations: [] }) }))
jest.mock('../src/features/games/shadow-checkers/ShadowCheckersExperience', () => ({
  ShadowCheckersExperience: (props: { musicPlaying: boolean; onToggleMasterSound: () => void }) => <>
    <span>{props.musicPlaying ? 'playing' : 'quiet'}</span>
    <button onClick={props.onToggleMasterSound}>Master sound</button>
  </>,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockMusicEnabled = true
  mockSoundtrack.play.mockResolvedValue(true)
  mockSoundtrack.isPlaying.mockReturnValue(true)
})

const props = { currentView: 'games' as const, onViewChange: jest.fn(), initialExperience: 'shadow-checkers' as const }
const settle = async () => { await act(async () => { await Promise.resolve() }) }

test('parent callback changes do not dispose a playing soundtrack', async () => {
  const first = jest.fn(), second = jest.fn()
  const view = render(<GamesHome {...props} onImmersiveChange={first} />)
  await settle()
  expect(screen.getByText('playing')).toBeInTheDocument()
  view.rerender(<GamesHome {...props} onImmersiveChange={second} />)
  expect(mockSoundtrack.dispose).not.toHaveBeenCalled()
  expect(mockSoundtrack.play).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(mockSoundtrack.dispose).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenLastCalledWith(false)
})

test.each(['pointerup', 'keydown', 'shadow-checkers-audio-gesture'])('%s recovers interrupted music without restarting running music', async event => {
  const view = render(<GamesHome {...props} />)
  await settle()
  act(() => window.dispatchEvent(new Event(event)))
  expect(mockSoundtrack.play).toHaveBeenCalledTimes(1)
  mockSoundtrack.isPlaying.mockReturnValue(false)
  act(() => window.dispatchEvent(new Event(event)))
  await settle()
  expect(mockSoundtrack.play).toHaveBeenCalledTimes(2)
  view.unmount()
  act(() => window.dispatchEvent(new Event(event)))
  expect(mockSoundtrack.play).toHaveBeenCalledTimes(2)
})

test('gesture recovery never overrides master mute or the Comfort music setting', async () => {
  const view = render(<GamesHome {...props} />)
  await settle()
  fireEvent.click(screen.getByText('Master sound'))
  mockSoundtrack.isPlaying.mockReturnValue(false)
  act(() => window.dispatchEvent(new Event('shadow-checkers-audio-gesture')))
  expect(mockSoundtrack.play).toHaveBeenCalledTimes(1)
  expect(mockSoundtrack.stop).toHaveBeenCalled()
  mockMusicEnabled = false
  view.rerender(<GamesHome {...props} />)
  fireEvent.click(screen.getByText('Master sound'))
  act(() => window.dispatchEvent(new Event('pointerup')))
  expect(mockSoundtrack.play).toHaveBeenCalledTimes(1)
})
