import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { AdminInvitesPanel } from '../src/components/settings/AdminInvitesPanel'

const mockRefresh = jest.fn()
const mockGenerateInvite = jest.fn()
const mockRevokeInvite = jest.fn()

const activeInvite = {
  id: 'invite-1',
  emailLock: 'locked@example.com',
  createdBy: 'admin-1',
  createdByEmail: 'admin@example.com',
  createdByUsername: 'admin',
  createdByDisplayName: 'Admin User',
  redeemedBy: null,
  redeemedByEmail: null,
  redeemedByUsername: null,
  redeemedByDisplayName: null,
  createdAt: '2026-06-01T12:00:00.000Z',
  expiresAt: '2999-06-02T12:00:00.000Z',
  redeemedAt: null,
  revokedAt: null,
}

const redeemedInvite = {
  id: 'invite-2',
  emailLock: 'new-user@example.com',
  createdBy: 'admin-1',
  createdByEmail: 'admin@example.com',
  createdByUsername: 'admin',
  createdByDisplayName: 'Admin User',
  redeemedBy: 'user-2',
  redeemedByEmail: 'new-user@example.com',
  redeemedByUsername: 'newuser',
  redeemedByDisplayName: 'New User',
  createdAt: '2026-06-01T13:00:00.000Z',
  expiresAt: '2026-06-02T13:00:00.000Z',
  redeemedAt: '2026-06-01T14:00:00.000Z',
  revokedAt: null,
}

jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: () => ({
    isOperator: true,
    loading: false,
  }),
}))

jest.mock('../src/hooks/useAdminInvites', () => ({
  useAdminInvites: () => ({
    invites: [activeInvite, redeemedInvite],
    lastCreatedInvite: {
      code: 'SHADO-TEST-CODE',
      invite: activeInvite,
    },
    loading: false,
    creating: false,
    revokingInviteId: null,
    error: null,
    refresh: mockRefresh,
    generateInvite: mockGenerateInvite,
    revokeInvite: mockRevokeInvite,
  }),
}))

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

beforeEach(() => {
  jest.clearAllMocks()
})

test('admin invites panel generates optional email-locked invites and shows history', async () => {
  mockGenerateInvite.mockResolvedValueOnce({ code: 'SHADO-NEW-CODE', invite: activeInvite })
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)
  mockRevokeInvite.mockResolvedValueOnce(undefined)

  render(<AdminInvitesPanel />)

  expect(screen.getByRole('heading', { name: 'Invites' })).toBeInTheDocument()
  expect(screen.getByText('24-hour expiry')).toBeInTheDocument()
  expect(screen.getByText('Single-use')).toBeInTheDocument()
  expect(screen.getByText('locked@example.com')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Redeemed History' })).toBeInTheDocument()
  expect(screen.getByText('New User')).toBeInTheDocument()
  expect(screen.getByText('SHADO-TEST-CODE')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText(/email lock/i), { target: { value: 'New.User@Example.com' } })
  fireEvent.click(screen.getByRole('button', { name: /generate/i }))

  await waitFor(() => {
    expect(mockGenerateInvite).toHaveBeenCalledWith('new.user@example.com')
  })

  fireEvent.click(screen.getByRole('button', { name: /revoke invite for locked@example.com/i }))

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('locked@example.com'))
  await waitFor(() => {
    expect(mockRevokeInvite).toHaveBeenCalledWith('invite-1')
  })
})
