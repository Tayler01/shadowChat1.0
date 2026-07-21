import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NotificationSoundPicker } from '../src/components/settings/NotificationSoundPicker'

const mockPreviewNotificationCue = jest.fn().mockResolvedValue(true)
const mockStopNotificationCuePreview = jest.fn()

jest.mock('../src/hooks/useSoundEffects', () => ({
  useSoundEffects: () => ({
    previewNotificationCue: mockPreviewNotificationCue,
    stopNotificationCuePreview: mockStopNotificationCuePreview,
  }),
}))

beforeEach(() => {
  jest.clearAllMocks()
})

test('sound picker previews without saving and applies one exact event sound', async () => {
  const onApply = jest.fn().mockResolvedValue(true)
  const onClose = jest.fn()
  render(
    <NotificationSoundPicker
      open
      title="ShadowPin comment"
      description="A comment on your pin"
      value="pin_shutter"
      onClose={onClose}
      onApply={onApply}
    />,
  )

  expect(screen.getByRole('dialog', { name: /shadowpin comment sound/i })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /pin shutter/i })).toBeChecked()

  fireEvent.click(screen.getByRole('button', { name: /play gold signal sample/i }))
  await waitFor(() => {
    expect(mockPreviewNotificationCue).toHaveBeenCalledWith('gold_signal')
  })
  expect(onApply).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('radio', { name: /gold signal/i }))
  fireEvent.click(screen.getByRole('button', { name: /use sound/i }))

  await waitFor(() => {
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith('gold_signal')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

test('sound picker keeps System Default and Silent honest and cancel never saves', () => {
  const onApply = jest.fn().mockResolvedValue(true)
  const onClose = jest.fn()
  render(
    <NotificationSoundPicker
      open
      title="Direct message"
      description="A new private message"
      value="system_default"
      onClose={onClose}
      onApply={onApply}
    />,
  )

  expect(screen.getByText(/controlled by your phone/i)).toBeInTheDocument()
  expect(screen.getByText(/without a sound/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /play system default sample/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /play silent sample/i })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('radio', { name: /silent/i }))
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

  expect(onApply).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mockStopNotificationCuePreview).toHaveBeenCalled()
})
