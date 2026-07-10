import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { OperationsHealthCenter } from '../src/components/settings/OperationsHealthCenter'
import type { OperationsHealthSnapshot } from '../src/lib/operationsHealth'

const mockFetchHealth = jest.fn()

jest.mock('../src/lib/operationsHealth', () => ({
  fetchOperationsHealthSnapshot: () => mockFetchHealth(),
  isOperationsSmokeFresh: () => true,
}))

jest.mock('../src/lib/appReleases', () => ({
  CURRENT_APP_COMMIT_SHA: 'abcdef123456',
}))

const buildSnapshot = (
  overrides: Partial<OperationsHealthSnapshot> = {}
): OperationsHealthSnapshot => ({
  environment: 'production',
  frontend_sha: 'abcdef123456',
  frontend_build_id: 'abcdef123456',
  deploy_id: 'deploy-1',
  deploy_url: 'https://deploy.example.test/',
  release_workflow_url: 'https://github.com/example/shadowchat/actions/runs/1',
  deployed_at: new Date().toISOString(),
  migration_version: '20260710040257',
  migrations_current: true,
  function_manifest_sha256: 'a'.repeat(64),
  active_function_count: 8,
  paused_function_count: 15,
  removed_function_count: 1,
  functions_current: true,
  backend_checked_at: new Date().toISOString(),
  smoke_status: 'passed',
  smoke_checked_at: new Date().toISOString(),
  app_http_status: 200,
  push_ready: true,
  push_missing_requirements: [],
  news_state: 'paused',
  bridge_state: 'paused',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
})

test('operator health center summarizes aligned release evidence and paused domains', async () => {
  mockFetchHealth.mockResolvedValueOnce(buildSnapshot())
  render(<OperationsHealthCenter />)

  expect(await screen.findByRole('heading', { name: 'Operations Health' })).toBeInTheDocument()
  expect(screen.getByText('20260710040257')).toBeInTheDocument()
  expect(screen.getByText(/8 active · 15 default-deny paused · 1 removed/i)).toBeInTheDocument()
  expect(screen.getByText(/frontend key, server key names/i)).toBeInTheDocument()
  expect(screen.getByText(/news: paused/i)).toBeInTheDocument()
  expect(screen.getByText(/esp bridge: paused/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /view release workflow evidence/i })).toHaveAttribute(
    'href',
    'https://github.com/example/shadowchat/actions/runs/1'
  )
  expect(screen.queryByText(/sb_secret_|service-role-key|Bearer eyJ/i)).not.toBeInTheDocument()
})

test('operator health center surfaces release drift and safe configuration names', async () => {
  mockFetchHealth.mockResolvedValueOnce(buildSnapshot({
    frontend_sha: 'different-sha',
    functions_current: false,
    push_ready: false,
    push_missing_requirements: ['WEB_PUSH_PRIVATE_KEY'],
  }))
  render(<OperationsHealthCenter />)

  expect(await screen.findByText('Mismatch')).toBeInTheDocument()
  expect(screen.getByText('Drift')).toBeInTheDocument()
  expect(screen.getByText('Config needed')).toBeInTheDocument()
  expect(screen.getByText(/WEB_PUSH_PRIVATE_KEY/)).toBeInTheDocument()
  expect(screen.getByText('Needs attention')).toBeInTheDocument()
})

test('operator health center handles an unavailable snapshot and retries', async () => {
  mockFetchHealth
    .mockRejectedValueOnce(new Error('forbidden'))
    .mockResolvedValueOnce(buildSnapshot())
  render(<OperationsHealthCenter />)

  expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /try again/i }))

  await waitFor(() => {
    expect(screen.getByText('20260710040257')).toBeInTheDocument()
  })
  expect(mockFetchHealth).toHaveBeenCalledTimes(2)
})
