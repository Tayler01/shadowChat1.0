import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  SoundEffectsProvider,
  useSoundEffects,
} from '../src/hooks/useSoundEffects'
import { ComfortPreferencesProvider } from '../src/hooks/useComfortPreferences'

const resume = jest.fn().mockResolvedValue(undefined)
const close = jest.fn().mockResolvedValue(undefined)
const createOscillator = jest.fn()
const createGain = jest.fn()

const audioParam = () => ({
  setValueAtTime: jest.fn(),
  exponentialRampToValueAtTime: jest.fn(),
})

const makeOscillator = () => ({
  type: 'sine' as OscillatorType,
  frequency: audioParam(),
  connect: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
})

const makeGain = () => ({
  gain: audioParam(),
  connect: jest.fn(),
})

class MockAudioContext {
  currentTime = 1
  destination = {}
  state: AudioContextState = 'suspended'
  createOscillator = createOscillator
  createGain = createGain
  resume = resume
  close = close
}

function Harness() {
  const {
    enabled,
    setEnabled,
    playMessage,
    playReaction,
  } = useSoundEffects()

  return (
    <>
      <button onClick={playMessage}>Message tone</button>
      <button onClick={playReaction}>Reaction tone</button>
      <button onClick={() => setEnabled(!enabled)}>Toggle tones</button>
    </>
  )
}

describe('SoundEffectsProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('notificationSoundUrls', '{"message":"https://example.com/a.mp3"}')
    createOscillator.mockImplementation(makeOscillator)
    createGain.mockImplementation(makeGain)
    resume.mockClear()
    close.mockClear()
    createOscillator.mockClear()
    createGain.mockClear()

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: MockAudioContext,
    })
  })

  it('retires the remote sound cache and synthesizes distinct local tones', async () => {
    render(
      <ComfortPreferencesProvider>
        <SoundEffectsProvider>
          <Harness />
        </SoundEffectsProvider>
      </ComfortPreferencesProvider>
    )

    await waitFor(() => {
      expect(localStorage.getItem('notificationSoundUrls')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Message tone' }))
    expect(createOscillator).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Reaction tone' }))
    expect(createOscillator).toHaveBeenCalledTimes(4)
    expect(resume).toHaveBeenCalled()
  })

  it('honors the sound-effects preference and closes its shared context', () => {
    const { unmount } = render(
      <ComfortPreferencesProvider>
        <SoundEffectsProvider>
          <Harness />
        </SoundEffectsProvider>
      </ComfortPreferencesProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Message tone' }))
    expect(createOscillator).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle tones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Message tone' }))
    expect(createOscillator).toHaveBeenCalledTimes(2)
    expect(close).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Toggle tones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Message tone' }))
    expect(createOscillator).toHaveBeenCalledTimes(4)
    expect(close).not.toHaveBeenCalled()

    unmount()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
