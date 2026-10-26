jest.mock('../src/hooks/useAuth', () => jest.requireMock('../apps/streamlined/src-overrides/hooks/useAuth'))
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StreamlinedMembershipGate } from '../src/streamlined/StreamlinedMembershipGate'
import { useAuth } from '../apps/streamlined/src-overrides/hooks/useAuth'
import { acceptStreamlinedMembership, getStreamlinedMembershipAcknowledgement, type StreamlinedMembershipAcknowledgement } from '../src/streamlined/membershipAcknowledgement'

jest.mock('../apps/streamlined/src-overrides/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/streamlined/membershipAcknowledgement', () => ({ getStreamlinedMembershipAcknowledgement: jest.fn(), acceptStreamlinedMembership: jest.fn() }))
const signOut = jest.fn()
const flags = globalThis as typeof globalThis & { __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__?: boolean }
const localPreviewMarker = document.createElement('meta')
localPreviewMarker.name = 'shadowchat-local-feature-preview'
localPreviewMarker.content = 'enabled'
const receipt: StreamlinedMembershipAcknowledgement = { userId: 'member-1', policyVersion: '2026-10-22.2', adultDeclared: true, termsAccepted: true, privacyAcknowledged: true, acceptedAt: '2026-10-22T20:00:00Z' }
const read = jest.mocked(getStreamlinedMembershipAcknowledgement)
const accept = jest.mocked(acceptStreamlinedMembership)
const setMember = (id: string | null) => jest.mocked(useAuth).mockReturnValue({ user: id ? { id } : null, signOut } as unknown as ReturnType<typeof useAuth>)
const preview = (fallback?: React.ReactNode) => <StreamlinedMembershipGate unacceptedContent={fallback}><div>Member content</div></StreamlinedMembershipGate>
const continueButton = () => screen.getByRole('button', { name: 'Continue to preview' })
async function acknowledge() {
  await waitFor(() => expect(screen.getByRole('radio', { name: 'I am 18 or older' })).toBeEnabled())
  fireEvent.click(screen.getByRole('radio', { name: 'I am 18 or older' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the Terms of use/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /I have read and acknowledge the Privacy policy/ }))
}
beforeEach(() => {
  jest.clearAllMocks()
  delete flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__
  delete window.__SHADOWCHAT_NATIVE_APP__
  window.localStorage.clear()
  setMember('member-1')
  signOut.mockResolvedValue(undefined)
  read.mockResolvedValue(null)
  accept.mockResolvedValue(receipt)
})
afterEach(() => {
  jest.restoreAllMocks()
  delete flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__
  delete window.__SHADOWCHAT_NATIVE_APP__
  localPreviewMarker.remove()
})

test('requires explicit adult/terms/privacy acknowledgement and a confirmed server save', async () => {
  let finish!: (value: StreamlinedMembershipAcknowledgement) => void
  accept.mockReturnValue(new Promise(resolve => { finish = resolve }))
  render(preview())
  expect(continueButton()).toBeDisabled()
  await waitFor(() => expect(screen.getByRole('radio', { name: 'I am 18 or older' })).toBeEnabled())
  fireEvent.click(screen.getByRole('link', { name: 'Terms of use' }))
  expect(screen.getByRole('checkbox', { name: /I agree to the Terms of use/ })).not.toBeChecked()
  fireEvent.submit(continueButton().closest('form')!)
  expect(accept).not.toHaveBeenCalled()
  await acknowledge()
  fireEvent.click(continueButton())
  expect(accept).toHaveBeenCalledWith({ userId: 'member-1', adultDeclared: true, termsAccepted: true, privacyAcknowledged: true })
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  await act(async () => finish(receipt))
  expect(screen.getByText('Member content')).toBeInTheDocument()
})

test('denies under-18 entry and preserves signout and account deletion', async () => {
  render(preview())
  await acknowledge()
  fireEvent.click(screen.getByRole('radio', { name: 'I am under 18' }))
  expect(screen.getByRole('alert')).toHaveTextContent('You must be at least 18')
  expect(continueButton()).toBeDisabled()
  expect(screen.getByRole('link', { name: 'Manage or delete my account' })).toHaveAttribute('href', '/?view=settings&settingsSection=account')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })))
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(accept).not.toHaveBeenCalled()
})

test('reads the server across mounts and isolates account changes', async () => {
  read.mockResolvedValueOnce(receipt).mockResolvedValueOnce(null)
  const view = render(preview())
  expect(await screen.findByText('Member content')).toBeInTheDocument()
  setMember('member-2')
  view.rerender(preview())
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  await waitFor(() => expect(read).toHaveBeenLastCalledWith('member-2'))
  expect(continueButton()).toBeDisabled()
})

test('ignores browser-only acceptance', async () => {
  window.localStorage.setItem('shadowchat:streamlined:membership:member-1', JSON.stringify({ adult: true, termsAccepted: true, privacyAcknowledged: true, version: '2026-10-22-preview.1' }))
  render(preview())
  await waitFor(() => expect(read).toHaveBeenCalledWith('member-1'))
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
})

test('fails closed on server read errors and supports retry', async () => {
  read.mockRejectedValueOnce(new Error('Membership service unavailable')).mockResolvedValueOnce(receipt)
  render(preview())
  expect(await screen.findByRole('alert')).toHaveTextContent('Membership service unavailable')
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Manage or delete my account' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry membership check' }))
  expect(await screen.findByText('Member content')).toBeInTheDocument()
})

test('fails closed on server save errors and permits a safe retry', async () => {
  accept.mockRejectedValueOnce(new Error('Could not save acknowledgement')).mockResolvedValueOnce(receipt)
  render(preview())
  await acknowledge()
  fireEvent.click(continueButton())
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save acknowledgement')
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  fireEvent.click(continueButton())
  expect(await screen.findByText('Member content')).toBeInTheDocument()
})

test('account management survives errors and normal account settings return once accepted', async () => {
  read.mockRejectedValueOnce(new Error('Unavailable'))
  const first = render(preview(<div>Restricted account controls</div>))
  expect(screen.getByText('Restricted account controls')).toBeInTheDocument()
  await act(async () => {})
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  first.unmount()
  read.mockResolvedValueOnce(receipt)
  render(preview(<div>Restricted account controls</div>))
  expect(await screen.findByText('Member content')).toBeInTheDocument()
  expect(screen.queryByText('Restricted account controls')).not.toBeInTheDocument()
})

test('ignores a stale response for a previous account', async () => {
  let finish!: (value: StreamlinedMembershipAcknowledgement) => void
  read.mockReturnValueOnce(new Promise(resolve => { finish = resolve })).mockResolvedValueOnce(null)
  const view = render(preview())
  setMember('member-2')
  view.rerender(preview())
  await act(async () => finish(receipt))
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
})

test('does not require browser storage for server acknowledgement', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Unavailable') })
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Unavailable') })
  render(preview())
  await acknowledge()
  fireEvent.click(continueButton())
  expect(await screen.findByText('Member content')).toBeInTheDocument()
})

test('never mounts content without authentication', () => {
  setMember(null)
  render(preview())
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  expect(read).not.toHaveBeenCalled()
})

test('local feature artifact opens authenticated content without reading or accepting a legal receipt', () => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  document.head.append(localPreviewMarker)
  render(preview())
  expect(screen.getByText('Member content')).toBeInTheDocument()
  expect(screen.queryByText('Before you continue')).not.toBeInTheDocument()
  expect(read).not.toHaveBeenCalled()
  expect(accept).not.toHaveBeenCalled()
  expect(window.localStorage.length).toBe(0)
})

test('local feature artifact cannot supply authentication', () => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  document.head.append(localPreviewMarker)
  setMember(null)
  render(preview())
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  expect(read).not.toHaveBeenCalled()
  expect(accept).not.toHaveBeenCalled()
})

test('native shell still fails closed when the membership service is unavailable', async () => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  document.head.append(localPreviewMarker)
  window.__SHADOWCHAT_NATIVE_APP__ = true
  read.mockRejectedValueOnce(new Error('Membership service unavailable'))
  render(preview())
  expect(await screen.findByRole('alert')).toHaveTextContent('Membership service unavailable')
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
  expect(accept).not.toHaveBeenCalled()
})

test('production mode cannot use local metadata to bypass a missing membership service', async () => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = false
  document.head.append(localPreviewMarker)
  read.mockRejectedValueOnce(new Error('Membership service unavailable'))
  render(preview())
  expect(await screen.findByRole('alert')).toHaveTextContent('Membership service unavailable')
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
})

test('local feature preview does not open while authentication is still loading', async () => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  document.head.append(localPreviewMarker)
  jest.mocked(useAuth).mockReturnValue({ user: { id: 'member-1' }, loading: true, signOut } as unknown as ReturnType<typeof useAuth>)
  render(preview())
  await act(async () => {})
  expect(screen.queryByText('Member content')).not.toBeInTheDocument()
})
