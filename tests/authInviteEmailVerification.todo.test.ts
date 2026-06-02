describe('invite-only signup and email verification QA contract', () => {
  describe('signup invite-code validation UI', () => {
    test.todo('requires an invite code before submitting signup credentials')
    test.todo('shows a focused inline error when the invite code is invalid, expired, disabled, reused, or wrong-email')
    test.todo('submits a valid invite code with email, password, username, and display name')
    test.todo('shows the pending-verification screen after a valid invite creates an unconfirmed auth user')
  })

  describe('admin invite management UI', () => {
    test.todo('renders invite management under Settings > Admin for admin and sub-admin operators')
    test.todo('creates a single-use invite with 24-hour expiration and an optional allowed email')
    test.todo('disables or revokes an invite without exposing plaintext invite codes after creation')
    test.todo('hides invite creation and revoke controls from non-operator users')
  })

  describe('auth hook signup, resend, and reset behavior', () => {
    test.todo('passes inviteCode and emailRedirectTo through useAuth.signUp and auth.signUp')
    test.todo('keeps the app unauthenticated and exposes pending verification state when signup returns user without session')
    test.todo('resends signup confirmation email with the configured redirect URL')
    test.todo('starts password reset with the configured redirect URL and surfaces provider errors')
  })

  describe('Supabase invite SQL and RPC negative cases', () => {
    test.todo('rejects signup before auth user/profile creation when invite metadata is missing')
    test.todo('rejects expired, revoked, reused, and wrong-email invite codes')
    test.todo('prevents anon/authenticated callers from reading invite hashes or executing private redemption helpers directly')
    test.todo('allows only admin-class operators to create, revoke, and inspect invite audit state')
  })
})
