import { render, screen } from '@testing-library/react'
import { StreamlinedPolicies, type StreamlinedLegalPage } from '../src/streamlined/StreamlinedPolicies'

test.each<StreamlinedLegalPage>(['privacy', 'terms', 'safety', 'delete-account'])('renders public %s policy without auth and clearly marks unfinished release details', page => {
  render(<StreamlinedPolicies page={page} />)
  expect(screen.getByRole('complementary', { name: 'Policy draft status' })).toHaveTextContent('not final store-release policies')
  expect(screen.getByText('Service operator: Caleb Y Polder')).toBeInTheDocument()
  expect(screen.getByText('Support mailbox: not configured.')).toBeInTheDocument()
  expect(screen.getByText('Privacy mailbox: not configured.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Email a deletion request' })).not.toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'ShadowChat policies' }).querySelector('[aria-current="page"]')).toHaveAttribute('href', `/?legal=${page}`)
})

test('provides the actual external account-deletion route and warns that both editions share the account', () => {
  render(<StreamlinedPolicies page="delete-account" privacyEmail="privacy@example.test" />)
  expect(screen.getByRole('link', { name: 'Open account deletion' })).toHaveAttribute('href', '/?view=settings&settingsSection=account')
  expect(screen.getByRole('link', { name: 'Resume account deletion' })).toHaveAttribute('href', '/?accountDeletion=retry')
  expect(screen.getByText(/Keep this browser's site data until the server confirms completion/)).toBeInTheDocument()
  expect(screen.getByText(/Account deletion affects the same account used by the full web app/)).toBeInTheDocument()
  expect(screen.getByText(/Coordinated backend rollout and a disposable-account check/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Email a deletion request' })).toHaveAttribute('href', 'mailto:privacy@example.test?subject=ShadowChat%20account%20deletion%20request')
})

test('discloses retained provider processing, server acknowledgement and the selected safety retention exception', () => {
  render(<StreamlinedPolicies page="privacy" supportEmail="support@shadochat.online" privacyEmail="privacy@shadochat.online" />)
  expect(screen.getByText(/accepted policy version and acceptance time are stored with your account/)).toBeInTheDocument()
  expect(screen.getByText(/up to 20 recent loaded message texts/)).toBeInTheDocument()
  expect(screen.getByText(/OpenRouter and the model hosting provider it selects/)).toBeInTheDocument()
  expect(screen.getByText(/KLIPY:/)).toBeInTheDocument()
  expect(screen.getByText(/Bunny Stream:/)).toBeInTheDocument()
  expect(screen.getByText(/Zoho Mail:/)).toBeInTheDocument()
  expect(screen.getByText(/90 days after case closure/)).toBeInTheDocument()
  expect(screen.getByText(/This does not share the surrounding private conversation/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'privacy@shadochat.online' })).toHaveAttribute('href', 'mailto:privacy@shadochat.online')
  expect(screen.queryByText(/remembered for your account on this browser/)).not.toBeInTheDocument()
})

test('uses supplied contacts and operator overrides with the confirmed operator as the default', () => {
  const { rerender } = render(<StreamlinedPolicies page="privacy" supportEmail=" support@example.test " privacyEmail="privacy@example.test" operatorName="Example Operator" />)
  expect(screen.getByRole('link', { name: 'support@example.test' })).toHaveAttribute('href', 'mailto:support@example.test')
  expect(screen.getByText('Service operator: Example Operator')).toBeInTheDocument()
  rerender(<StreamlinedPolicies page="privacy" supportEmail="javascript:invalid" privacyEmail="privacy@example.test?bcc=third@example.test" operatorName=" " />)
  expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
  expect(screen.getByText('Service operator: Caleb Y Polder')).toBeInTheDocument()
})
