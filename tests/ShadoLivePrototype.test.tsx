import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadoLivePrototype } from '../src/features/entertainment/shado-live/ShadoLivePrototype'

describe('ShadoLivePrototype', () => {
  test('keeps the flagship prototype local, navigable, and explicit about its release lock', async () => {
    const onExit = jest.fn()
    const getUserMedia = jest.fn()
    const previousMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    try {
      render(<ShadoLivePrototype onExit={onExit} />)

      expect(screen.getByRole('heading', { name: 'Shado Live' })).toBeInTheDocument()
      expect(screen.getByText(/No microphone, camera, broadcast, upload, or backend room is started/i)).toBeInTheDocument()
      expect(screen.getByText('Release lock')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Enter interactive preview' }))
      expect(await screen.findByTestId('shado-live-stage')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Leave Shado Live preview' })).toHaveFocus())

      fireEvent.click(screen.getByRole('button', { name: 'Preview unmuted microphone state' }))
      fireEvent.click(screen.getByRole('button', { name: 'Preview camera on state' }))
      expect(getUserMedia).not.toHaveBeenCalled()

      const roomTab = screen.getByRole('tab', { name: 'Room' })
      fireEvent.click(roomTab)
      fireEvent.keyDown(roomTab, { key: 'ArrowRight' })
      const safetyTab = screen.getByRole('tab', { name: 'Safety' })
      expect(safetyTab).toHaveAttribute('aria-selected', 'true')
      await waitFor(() => expect(safetyTab).toHaveFocus())
      expect(screen.getByTestId('shado-live-safety-panel')).toHaveTextContent(/reporting is paused/i)

      fireEvent.click(roomTab)
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
      expect(screen.getByRole('dialog', { name: 'Reconnecting to the room' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }))

      fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Preview a chat message' }), { target: { value: 'This stays on my device.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add message to local preview' }))
      expect(screen.getByText('This stays on my device.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Leave Shado Live preview' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Enter interactive preview' })).toHaveFocus())
      expect(onExit).not.toHaveBeenCalled()
    } finally {
      if (previousMediaDevices) Object.defineProperty(navigator, 'mediaDevices', previousMediaDevices)
      else Reflect.deleteProperty(navigator, 'mediaDevices')
    }
  })

  test('returns to Entertainment from the lobby', () => {
    const onExit = jest.fn()
    render(<ShadoLivePrototype onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Entertainment' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})
