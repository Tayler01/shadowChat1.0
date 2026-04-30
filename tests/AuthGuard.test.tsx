import { render, screen } from '@testing-library/react'
import React from 'react'
import { AuthGuard } from '../src/components/auth/AuthGuard'

const mockUseAuth = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

test('startup loading state uses the simplified Shado copy', () => {
  mockUseAuth.mockReturnValue({
    user: null,
    loading: true,
    error: null,
  })

  render(
    <AuthGuard>
      <div>Private app</div>
    </AuthGuard>
  )

  expect(screen.getByText('Loading Shado...')).toBeInTheDocument()
  expect(screen.queryByText('Restoring your workspace')).toBeNull()
  expect(screen.queryByText('Loading messages, presence, and account state.')).toBeNull()
  expect(screen.queryByText('Private app')).toBeNull()
})
