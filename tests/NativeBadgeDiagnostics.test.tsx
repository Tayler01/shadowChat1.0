import { render, screen, act } from '@testing-library/react'
import { NativeBadgeDiagnostics } from '../src/streamlined/components/NativeBadgeDiagnostics'
import { parseBadgeDiagnostics, parseRouteDiagnostics } from '../src/streamlined/nativeNotificationDiagnostics'
import { NATIVE_APP_MESSAGE_EVENT } from '../src/lib/nativeAppBridge'

test('Settings diagnostic accepts only the bounded public fields', () => {
  const value = { status: 'verified', expected: 0, observed: 0, at: 1000, secret: 'never render' }
  expect(parseBadgeDiagnostics(value)).toEqual({ status: 'verified', expected: 0, observed: 0, at: 1000 })
  expect(parseBadgeDiagnostics({ ...value, status: 'raw secret' })).toBeNull()
  expect(parseBadgeDiagnostics({ ...value, observed: 'secret' })).toBeNull()
  render(<NativeBadgeDiagnostics />)
  act(() => window.dispatchEvent(new CustomEvent(NATIVE_APP_MESSAGE_EVENT, { detail: { version: 1, type: 'notifications_state', badgeDiagnostics: value } })))
  expect(screen.getByText(/App icon count verified/)).toHaveTextContent('unread 0 · device 0')
  expect(screen.queryByText(/never render/)).not.toBeInTheDocument()
})

test('notification route diagnostic contains only allowlisted status/source/time', () => {
  const value = { status: 'scope_rejected', source: 'expo', at: 2000, userId: 'private', token: 'secret' }
  expect(parseRouteDiagnostics(value)).toEqual({ status: 'scope_rejected', source: 'expo', at: 2000 })
  expect(parseRouteDiagnostics({ ...value, status: 'private-error' })).toBeNull()
  expect(parseRouteDiagnostics({ ...value, source: 'secret' })).toBeNull()
  render(<NativeBadgeDiagnostics />)
  act(() => window.dispatchEvent(new CustomEvent(NATIVE_APP_MESSAGE_EVENT, { detail: { version: 1, type: 'notifications_state', routeDiagnostics: value } })))
  expect(screen.getByText(/Notification belongs to another sign-in or community/)).toBeInTheDocument()
  expect(screen.queryByText(/private|secret/)).not.toBeInTheDocument()
})
