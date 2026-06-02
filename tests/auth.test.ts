jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getWorkingClient: jest.fn(),
  supabase: {
    rpc: jest.fn(),
    auth: {
      signUp: jest.fn(),
      resend: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getUser: jest.fn(),
    },
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}))

import {
  resendVerificationEmail,
  sendPasswordResetEmail,
  signUp,
  updatePasswordAfterRecovery,
} from '../src/lib/auth'
import { supabase } from '../src/lib/supabase'

const supabaseMock = supabase as any

beforeEach(() => {
  jest.clearAllMocks()
  window.history.pushState({}, '', '/')
  supabaseMock.rpc.mockResolvedValue({ data: true, error: null })
  supabaseMock.auth.signUp.mockResolvedValue({
    data: {
      user: { id: 'user-1', email: 'new@example.com' },
      session: null,
    },
    error: null,
  })
  supabaseMock.auth.resend.mockResolvedValue({ error: null })
  supabaseMock.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  supabaseMock.auth.updateUser.mockResolvedValue({ error: null })
})

test('signUp passes normalized invite metadata and redirect URL to Supabase Auth', async () => {
  const result = await signUp({
    email: 'New@Example.com',
    password: 'Secret!123',
    username: ' NewUser ',
    inviteCode: ' shado-123 ',
  })

  expect(supabaseMock.rpc).toHaveBeenCalledWith('is_username_available', {
    candidate: 'newuser',
  })
  expect(supabaseMock.auth.signUp).toHaveBeenCalledWith({
    email: 'New@Example.com',
    password: 'Secret!123',
    options: {
      emailRedirectTo: 'http://localhost/?auth=verified',
      data: {
        username: 'newuser',
        invite_code: 'shado-123',
      },
    },
  })
  expect(result).toEqual({
    user: { id: 'user-1', email: 'new@example.com' },
    profile: null,
    session: null,
  })
})

test('signUp rejects missing invite code before creating an auth user', async () => {
  await expect(signUp({
    email: 'new@example.com',
    password: 'Secret!123',
    username: 'newuser',
    inviteCode: '   ',
  })).rejects.toThrow('Invite code is required')

  expect(supabaseMock.auth.signUp).not.toHaveBeenCalled()
})

test('resendVerificationEmail uses signup resend with the app redirect URL', async () => {
  await resendVerificationEmail('pending@example.com')

  expect(supabaseMock.auth.resend).toHaveBeenCalledWith({
    type: 'signup',
    email: 'pending@example.com',
    options: {
      emailRedirectTo: 'http://localhost/?auth=verified',
    },
  })
})

test('sendPasswordResetEmail uses the reset-password redirect URL', async () => {
  await sendPasswordResetEmail('reset@example.com')

  expect(supabaseMock.auth.resetPasswordForEmail).toHaveBeenCalledWith('reset@example.com', {
    redirectTo: 'http://localhost/?auth=reset-password',
  })
})

test('updatePasswordAfterRecovery delegates the new password to Supabase Auth', async () => {
  await updatePasswordAfterRecovery('NewPassword!123')

  expect(supabaseMock.auth.updateUser).toHaveBeenCalledWith({
    password: 'NewPassword!123',
  })
})
