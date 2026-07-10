import { useRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useDialogAccessibility } from '../src/hooks/useDialogAccessibility'

function Harness({
  open,
  dismissible = true,
  onClose,
}: {
  open: boolean
  dismissible?: boolean
  onClose: () => void
}) {
  const firstRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogAccessibility({
    open,
    onClose,
    dismissible,
    initialFocusRef: firstRef,
  })

  if (!open) return null
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Test dialog">
      <button ref={firstRef}>First action</button>
      <button>Last action</button>
    </div>
  )
}

test('dialog traps focus, closes on Escape, unlocks scroll, and restores its opener', async () => {
  const onClose = jest.fn()
  const opener = document.createElement('button')
  opener.textContent = 'Open dialog'
  document.body.appendChild(opener)
  opener.focus()

  const view = render(<Harness open onClose={onClose} />)

  await waitFor(() => expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus())
  expect(document.body.style.overflow).toBe('hidden')

  const first = screen.getByRole('button', { name: 'First action' })
  const last = screen.getByRole('button', { name: 'Last action' })
  last.focus()
  fireEvent.keyDown(last, { key: 'Tab' })
  expect(first).toHaveFocus()

  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  expect(last).toHaveFocus()

  fireEvent.keyDown(last, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)

  act(() => {
    view.rerender(<Harness open={false} onClose={onClose} />)
  })
  expect(document.body.style.overflow).toBe('')
  expect(opener).toHaveFocus()
  opener.remove()
})

test('non-dismissible dialog contains Escape without closing', async () => {
  const onClose = jest.fn()
  render(<Harness open dismissible={false} onClose={onClose} />)

  const first = await screen.findByRole('button', { name: 'First action' })
  fireEvent.keyDown(first, { key: 'Escape' })

  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument()
})
