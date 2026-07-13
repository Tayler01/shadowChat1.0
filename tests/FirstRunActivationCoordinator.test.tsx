import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FirstRunActivationCoordinator } from '../src/features/activation/FirstRunActivationCoordinator'
import type { ActivationJourney } from '../src/features/activation/activationTypes'

const mockGetJourney = jest.fn()
const mockUpdateJourney = jest.fn()
const mockUpdateProfile = jest.fn().mockResolvedValue(undefined)
const mockUploadAvatar = jest.fn().mockResolvedValue(undefined)
const mockApplyPreset = jest.fn()
const mockEnablePush = jest.fn().mockResolvedValue(undefined)
const mockPromptInstall = jest.fn().mockResolvedValue(null)
let mockPushSupported = false
let mockPushSubscribed = false
let mockCanInstall = false
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

jest.mock('../src/features/activation/activationApi', () => ({
  getMyActivationJourney: (...args: unknown[]) => mockGetJourney(...args),
  updateMyActivationJourney: (...args: unknown[]) => mockUpdateJourney(...args),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    profile: {
      id: 'user-1', username: 'new_member', display_name: 'New Member', status_message: '',
      avatar_url: null, avatar_thumbnail_url: null, color: '#d7aa46',
    },
    updateProfile: mockUpdateProfile,
    uploadAvatar: mockUploadAvatar,
  }),
}))

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({ preferences: { preset: 'follow-device' }, applyPreset: mockApplyPreset }),
}))

jest.mock('../src/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: mockPushSupported, subscribed: mockPushSubscribed, enablePush: mockEnablePush }),
}))

jest.mock('../src/hooks/usePwaInstallPrompt', () => ({
  usePwaInstallPrompt: () => ({ canInstall: mockCanInstall, promptInstall: mockPromptInstall }),
}))

jest.mock('../src/features/activation/activationHistory', () => ({
  closeActivationHistory: jest.fn(() => 'back'),
  enterActivationHistory: jest.fn(() => true),
  isActivationHistoryEntry: jest.fn(() => true),
  replaceActivationHistory: jest.fn(() => true),
}))

const journey = (overrides: Partial<ActivationJourney> = {}): ActivationJourney => ({
  userId: 'user-1',
  enrollmentSource: 'invite_signup',
  identityCompletedAt: null,
  preferencesCompletedAt: null,
  notificationChoice: null,
  comfortReviewedAt: null,
  selectedFirstActionKind: null,
  firstActionKind: null,
  firstActionId: null,
  firstActionCompletedAt: null,
  installChoice: null,
  installCompletedAt: null,
  presentationState: 'expanded',
  dismissedAt: null,
  revision: 1,
  enrolledAt: '2026-07-13T00:00:00Z',
  updatedAt: '2026-07-13T00:00:00Z',
  completedAt: null,
  currentStep: 'identity',
  ...overrides,
})

function ActivationShellArbitrationHarness() {
  const [enrollment, setEnrollment] = useState<'checking' | 'enrolled' | 'unenrolled'>('checking')

  return (
    <>
      <FirstRunActivationCoordinator
        currentView="chat"
        onNavigate={jest.fn()}
        onEnrollmentStateChange={setEnrollment}
      />
      {enrollment === 'unenrolled' && <div data-testid="legacy-phone-install-onboarding" />}
    </>
  )
}

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: jest.fn(() => 'blob:activation-avatar-preview'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: jest.fn(),
  })
})

afterAll(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: originalCreateObjectURL,
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: originalRevokeObjectURL,
  })
})

beforeEach(() => {
  jest.clearAllMocks()
  mockPushSupported = false
  mockPushSubscribed = false
  mockCanInstall = false
  mockPromptInstall.mockResolvedValue(null)
  mockGetJourney.mockResolvedValue(null)
  mockUpdateJourney.mockImplementation(async (current: ActivationJourney, step: string, choice: string | null) => ({
    ...current,
    revision: current.revision + 1,
    presentationState: step === 'presentation' ? choice : current.presentationState,
    selectedFirstActionKind: step === 'first_action' ? choice : current.selectedFirstActionKind,
  }))
})

test('fails closed for existing or unenrolled users', async () => {
  render(<FirstRunActivationCoordinator currentView="chat" onNavigate={jest.fn()} />)
  await waitFor(() => expect(mockGetJourney).toHaveBeenCalled())
  expect(screen.queryByTestId('first-run-activation-journey')).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/resume first-run setup/i)).not.toBeInTheDocument()
})

test('retries enrollment lookup through the backoff ceiling and recovers without a retry leak', async () => {
  jest.useFakeTimers()
  try {
    const enrolledJourney = journey()
    mockGetJourney
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(enrolledJourney)
    const enrollmentState = jest.fn()
    const view = render(
      <FirstRunActivationCoordinator
        currentView="chat"
        onNavigate={jest.fn()}
        onEnrollmentStateChange={enrollmentState}
      />
    )

    await act(async () => { await Promise.resolve() })
    expect(mockGetJourney).toHaveBeenCalledTimes(1)
    expect(enrollmentState).toHaveBeenCalledWith('checking')

    for (const [index, delay] of [750, 2_000, 5_000, 15_000, 30_000].entries()) {
      await act(async () => {
        jest.advanceTimersByTime(delay - 1)
        await Promise.resolve()
      })
      expect(mockGetJourney).toHaveBeenCalledTimes(index + 1)

      await act(async () => {
        jest.advanceTimersByTime(1)
        await Promise.resolve()
      })
      expect(mockGetJourney).toHaveBeenCalledTimes(index + 2)
    }

    expect(enrollmentState).toHaveBeenLastCalledWith('enrolled')
    expect(enrollmentState).not.toHaveBeenCalledWith('unenrolled')

    view.unmount()
    expect(jest.getTimerCount()).toBe(0)
    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(mockGetJourney).toHaveBeenCalledTimes(6)
  } finally {
    jest.useRealTimers()
  }
})

test('does not schedule another enrollment request when an unavailable lookup settles after unmount', async () => {
  jest.useFakeTimers()
  try {
    let settleLookup: ((value: undefined) => void) | null = null
    mockGetJourney.mockImplementationOnce(() => new Promise<undefined>(resolve => {
      settleLookup = resolve
    }))
    const view = render(<FirstRunActivationCoordinator currentView="chat" onNavigate={jest.fn()} />)

    await act(async () => { await Promise.resolve() })
    expect(mockGetJourney).toHaveBeenCalledTimes(1)
    view.unmount()

    await act(async () => {
      settleLookup?.(undefined)
      await Promise.resolve()
    })
    expect(jest.getTimerCount()).toBe(0)

    await act(async () => {
      jest.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(mockGetJourney).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

test('keeps legacy phone onboarding mutually exclusive with an enrolled activation install flow', async () => {
  mockGetJourney.mockResolvedValue(journey({
    currentStep: 'complete',
    identityCompletedAt: '2026-07-13T00:01:00Z',
    preferencesCompletedAt: '2026-07-13T00:02:00Z',
    notificationChoice: 'notifications_later',
    comfortReviewedAt: '2026-07-13T00:02:00Z',
    selectedFirstActionKind: 'group_message',
    firstActionKind: 'group_message',
    firstActionId: 'message-1',
    firstActionCompletedAt: '2026-07-13T00:03:00Z',
    completedAt: '2026-07-13T00:03:00Z',
  }))

  render(<ActivationShellArbitrationHarness />)

  expect(await screen.findByLabelText('First-run setup complete')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument()
  expect(screen.queryByTestId('legacy-phone-install-onboarding')).not.toBeInTheDocument()
})

test('records unsupported notifications directly without requesting permission', async () => {
  mockGetJourney.mockResolvedValue(journey({
    currentStep: 'preferences',
    identityCompletedAt: '2026-07-13T00:01:00Z',
  }))
  mockUpdateJourney.mockImplementation(async (current: ActivationJourney, step: string, choice: string | null) => journey({
    ...current,
    currentStep: step === 'preferences' ? 'first_action' : current.currentStep,
    preferencesCompletedAt: step === 'preferences' ? '2026-07-13T00:02:00Z' : current.preferencesCompletedAt,
    notificationChoice: step === 'preferences' ? choice as ActivationJourney['notificationChoice'] : current.notificationChoice,
    revision: current.revision + 1,
  }))

  render(<FirstRunActivationCoordinator currentView="chat" onNavigate={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /continue without notifications/i }))
  await waitFor(() => expect(mockUpdateJourney).toHaveBeenCalledWith(
    expect.objectContaining({ revision: 1 }), 'preferences', 'notifications_unsupported'
  ))
  expect(mockEnablePush).not.toHaveBeenCalled()
})

test('stores first-action intent, minimizes, and hands off without client completion', async () => {
  const onNavigate = jest.fn()
  mockGetJourney.mockResolvedValue(journey({
    currentStep: 'first_action',
    identityCompletedAt: '2026-07-13T00:01:00Z',
    preferencesCompletedAt: '2026-07-13T00:02:00Z',
    notificationChoice: 'notifications_later',
  }))

  render(<FirstRunActivationCoordinator currentView="chat" onNavigate={onNavigate} />)
  fireEvent.click(await screen.findByRole('button', { name: /Say hello/i }))
  await waitFor(() => expect(mockUpdateJourney).toHaveBeenCalledWith(expect.anything(), 'first_action', 'group_message'))
  await waitFor(() => expect(mockUpdateJourney).toHaveBeenCalledWith(expect.anything(), 'presentation', 'minimized'))
  expect(onNavigate).toHaveBeenCalledWith('chat')
  expect(mockUpdateJourney).not.toHaveBeenCalledWith(expect.anything(), 'complete', expect.anything())
})

test('keeps a minimized journey compact and refreshes canonical completion on focus', async () => {
  const pending = journey({
    currentStep: 'first_action',
    presentationState: 'minimized',
    dismissedAt: '2026-07-13T00:03:00Z',
    identityCompletedAt: '2026-07-13T00:01:00Z',
    preferencesCompletedAt: '2026-07-13T00:02:00Z',
    notificationChoice: 'notifications_later',
    selectedFirstActionKind: 'shadow_pin_heart',
  })
  mockGetJourney.mockResolvedValue(pending)
  render(<FirstRunActivationCoordinator currentView="pins" onNavigate={jest.fn()} />)
  expect(await screen.findByLabelText(/resume first-run setup/i)).toBeInTheDocument()

  mockGetJourney.mockResolvedValue(journey({
    ...pending,
    currentStep: 'complete',
    presentationState: 'expanded',
    dismissedAt: null,
    firstActionKind: 'shadow_pin_heart',
    firstActionId: 'pin-1',
    firstActionCompletedAt: '2026-07-13T00:04:00Z',
    completedAt: '2026-07-13T00:04:00Z',
    revision: 2,
  }))
  fireEvent.focus(window)
  expect(await screen.findByText("You're in.")).toBeInTheDocument()
})

test('refreshes a stale journey after push succeeds but its preference receipt conflicts', async () => {
  mockPushSupported = true
  mockGetJourney.mockResolvedValue(journey({
    currentStep: 'preferences',
    identityCompletedAt: '2026-07-13T00:01:00Z',
  }))
  mockUpdateJourney.mockRejectedValueOnce(Object.assign(
    new Error('Activation journey changed on another device'),
    { code: '40001' }
  ))

  render(<FirstRunActivationCoordinator currentView="chat" onNavigate={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /turn on notifications/i }))

  await waitFor(() => expect(mockEnablePush).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(mockGetJourney).toHaveBeenCalledTimes(2))
  expect(await screen.findByRole('alert')).toHaveTextContent(/changed on another device/i)
})

test('retries identity safely after an optional avatar upload fails', async () => {
  mockGetJourney.mockResolvedValue(journey())
  mockUploadAvatar.mockRejectedValueOnce(new Error('Avatar upload paused'))
  render(<FirstRunActivationCoordinator currentView="chat" onNavigate={jest.fn()} />)
  const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })

  fireEvent.change(await screen.findByLabelText(/add a photo/i), {
    target: { files: [avatar] },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Avatar upload paused')
  expect(mockUpdateJourney).not.toHaveBeenCalledWith(expect.anything(), 'identity', expect.anything())

  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(mockUpdateJourney).toHaveBeenCalledWith(expect.anything(), 'identity', null))
  expect(mockUpdateProfile).toHaveBeenCalledTimes(2)
  expect(mockUploadAvatar).toHaveBeenCalledTimes(2)
})

test('surfaces a rejected native install prompt without recording a false install choice', async () => {
  mockCanInstall = true
  mockPromptInstall.mockRejectedValueOnce(new Error('Install prompt unavailable'))
  mockGetJourney.mockResolvedValue(journey({
    currentStep: 'complete',
    identityCompletedAt: '2026-07-13T00:01:00Z',
    preferencesCompletedAt: '2026-07-13T00:02:00Z',
    notificationChoice: 'notifications_later',
    comfortReviewedAt: '2026-07-13T00:02:00Z',
    selectedFirstActionKind: 'group_message',
    firstActionKind: 'group_message',
    firstActionId: 'message-1',
    firstActionCompletedAt: '2026-07-13T00:03:00Z',
    completedAt: '2026-07-13T00:03:00Z',
  }))

  render(<FirstRunActivationCoordinator currentView="chat" onNavigate={jest.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: /install app/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Install prompt unavailable')
  expect(mockUpdateJourney).not.toHaveBeenCalledWith(expect.anything(), 'install', 'installed')
})
