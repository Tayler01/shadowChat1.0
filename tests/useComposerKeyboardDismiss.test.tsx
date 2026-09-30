import { StrictMode, useRef } from 'react'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useComposerKeyboardDismiss } from '../src/hooks/useComposerKeyboardDismiss'

jest.mock('../src/hooks/useIsDesktop', () => ({ useIsDesktop: () => false }))

function Harness({ onTap = jest.fn(), onAncestorMove = jest.fn() }) {
  const field = useRef<HTMLTextAreaElement>(null)
  const keyboard = useComposerKeyboardDismiss(field)
  return <div onTouchMove={onAncestorMove}>
    <textarea ref={field} aria-label="Draft" defaultValue="Preserve this draft" />
    <button ref={keyboard.gestureHandleRef} style={{ touchAction: 'none' }}
      onPointerDown={keyboard.beginGesture} onPointerMove={keyboard.moveGesture}
      onPointerUp={event => { if (!keyboard.endGesture(event)) onTap() }}
      onPointerCancel={keyboard.cancelGesture}>Send</button>
    <button onClick={keyboard.dismissKeyboard}>Hide keyboard</button>
  </div>
}

function pointer(target: HTMLElement, kind: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel', x: number, y: number) {
  const event = createEvent[kind](target, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: 7 }, pointerType: { value: 'touch' },
    clientX: { value: x }, clientY: { value: y },
  })
  fireEvent(target, event)
}

function touch(target: HTMLElement, kind: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) {
  const touches = kind === 'touchEnd' ? [] : [{ identifier: 3, clientX: x, clientY: y }]
  const event = createEvent[kind](target, { bubbles: true, cancelable: true, touches })
  fireEvent(target, event)
  return event
}

test('native touch moves claim the handle before a slow swipe can pan an ancestor, and blur once', () => {
  const onTap = jest.fn()
  const onAncestorMove = jest.fn()
  render(<Harness onTap={onTap} onAncestorMove={onAncestorMove} />)
  const field = screen.getByRole('textbox')
  const handle = screen.getByRole('button', { name: 'Send' })
  field.focus()
  const blur = jest.spyOn(field, 'blur')
  pointer(handle, 'pointerDown', 300, 400)
  touch(handle, 'touchStart', 300, 400)
  expect(touch(handle, 'touchMove', 300, 403).defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(field)
  touch(handle, 'touchMove', 301, 435)
  pointer(handle, 'pointerMove', 301, 435)
  touch(handle, 'touchMove', 301, 475)
  touch(handle, 'touchEnd', 301, 475)
  pointer(handle, 'pointerUp', 301, 475)
  expect(blur).toHaveBeenCalledTimes(1)
  expect(onAncestorMove).not.toHaveBeenCalled()
  expect(onTap).not.toHaveBeenCalled()
  expect(field).toHaveValue('Preserve this draft')
})

test('a fast touch swipe still dismisses when Safari stops delivering pointer moves', () => {
  const onTap = jest.fn()
  render(<Harness onTap={onTap} />)
  const field = screen.getByRole('textbox')
  const handle = screen.getByRole('button', { name: 'Send' })
  field.focus()
  pointer(handle, 'pointerDown', 300, 400)
  touch(handle, 'touchStart', 300, 400)
  pointer(handle, 'pointerCancel', 300, 400)
  expect(touch(handle, 'touchMove', 302, 480).defaultPrevented).toBe(true)
  touch(handle, 'touchEnd', 302, 480)
  expect(document.activeElement).not.toBe(field)
  expect(onTap).not.toHaveBeenCalled()
})

test('horizontal and short handle movement cancel a send without hiding the keyboard', () => {
  const onTap = jest.fn()
  render(<Harness onTap={onTap} />)
  const field = screen.getByRole('textbox')
  const handle = screen.getByRole('button', { name: 'Send' })
  field.focus()
  pointer(handle, 'pointerDown', 300, 400)
  touch(handle, 'touchStart', 300, 400)
  touch(handle, 'touchMove', 340, 430)
  pointer(handle, 'pointerUp', 340, 430)
  touch(handle, 'touchEnd', 340, 430)
  expect(document.activeElement).toBe(field)
  expect(onTap).not.toHaveBeenCalled()
})

test('normal taps and textarea touches preserve send and caret behavior', () => {
  const onTap = jest.fn()
  const onAncestorMove = jest.fn()
  render(<Harness onTap={onTap} onAncestorMove={onAncestorMove} />)
  const field = screen.getByRole('textbox')
  const handle = screen.getByRole('button', { name: 'Send' })
  field.focus()
  pointer(handle, 'pointerDown', 300, 400)
  expect(touch(handle, 'touchStart', 300, 400).defaultPrevented).toBe(false)
  pointer(handle, 'pointerUp', 300, 400)
  touch(handle, 'touchEnd', 300, 400)
  expect(onTap).toHaveBeenCalledTimes(1)
  expect(touch(field, 'touchMove', 120, 450).defaultPrevented).toBe(false)
  expect(onAncestorMove).toHaveBeenCalledTimes(1)
  expect(document.activeElement).toBe(field)
})

test('the native fence survives StrictMode effect replay and detaches on unmount', () => {
  const { unmount } = render(<StrictMode><Harness /></StrictMode>)
  const handle = screen.getByRole('button', { name: 'Send' })
  touch(handle, 'touchStart', 300, 400)
  expect(touch(handle, 'touchMove', 300, 405).defaultPrevented).toBe(true)
  unmount()
  expect(touch(handle, 'touchMove', 300, 410).defaultPrevented).toBe(false)
})
