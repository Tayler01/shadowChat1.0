import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { ShadowPinActivityAdmin } from '../src/components/settings/ShadowPinActivityAdmin'
import { fetchShadowPinActivityDashboard } from '../src/features/shadow-pin/api/shadowPinActivityApi'

jest.mock('../src/features/shadow-pin/api/shadowPinActivityApi', () => ({
  fetchShadowPinActivityDashboard: jest.fn(),
}))

jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}))

const mockFetchDashboard = fetchShadowPinActivityDashboard as jest.MockedFunction<typeof fetchShadowPinActivityDashboard>

beforeEach(() => {
  mockFetchDashboard.mockResolvedValue({
    users: [
      {
        user_id: 'user-1',
        username: 'pin_queen',
        display_name: 'Pin Queen',
        avatar_url: null,
        admin_role: null,
        visits: 3,
        active_seconds: 420,
        categories_viewed: 2,
        pins_viewed: 9,
        pin_opens: 4,
        posts: 2,
        categories_created: 1,
        hearts: 5,
        shares: 2,
        edits: 1,
        deletes: 0,
        activity_score: 42,
        previous_activity_score: 30,
        latest_activity: '2026-05-28T16:00:00.000Z',
      },
    ],
    categories: [
      {
        category_id: 'cat-1',
        title: 'Fam & Friends',
        thumbnail_url: 'https://images.example/cat-thumb.jpg',
        visits: 2,
        active_seconds: 180,
        unique_visitors: 1,
        pin_views: 8,
        pin_opens: 3,
        pins_created: 1,
        hearts: 4,
        shares: 1,
        latest_activity: '2026-05-28T16:00:00.000Z',
        activity_score: 24,
        previous_activity_score: 12,
      },
    ],
    pins: [
      {
        image_id: 'pin-1',
        title: 'Sunset',
        thumbnail_url: 'https://images.example/pin-thumb.jpg',
        category_id: 'cat-1',
        category_title: 'Fam & Friends',
        creator_id: 'user-1',
        creator_username: 'pin_queen',
        creator_display_name: 'Pin Queen',
        created_at: '2026-05-28T12:00:00.000Z',
        grid_views: 8,
        opens: 3,
        hearts: 4,
        shares: 1,
        latest_activity: '2026-05-28T16:00:00.000Z',
        activity_score: 18,
        previous_activity_score: 9,
      },
    ],
    timeline: [
      {
        id: 'event-1',
        created_at: '2026-05-28T16:00:00.000Z',
        user_id: 'user-1',
        username: 'pin_queen',
        display_name: 'Pin Queen',
        avatar_url: null,
        admin_role: null,
        event_type: 'pin_opened',
        target_type: 'pin',
        category_id: 'cat-1',
        image_id: 'pin-1',
        category_title: 'Fam & Friends',
        item_title: 'Sunset',
        thumbnail_url: 'https://images.example/pin-thumb.jpg',
        duration_seconds: null,
        score_value: 3,
        source: 'live',
      },
    ],
  })
})

afterEach(() => {
  jest.clearAllMocks()
})

test('renders Shadow Pin activity charts, tabbed tables, and timeline filters', async () => {
  render(<ShadowPinActivityAdmin />)

  expect(screen.getByRole('heading', { name: /shadow pin activity/i })).toBeInTheDocument()

  await waitFor(() => {
    expect(screen.getAllByText('Pin Queen').length).toBeGreaterThan(0)
  })

  expect(screen.getByTestId('chart')).toBeInTheDocument()
  expect(screen.getAllByText('42').length).toBeGreaterThan(0)
  expect(screen.getByText('Score Delta')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /categories/i }))
  expect(screen.getAllByText('Fam & Friends').length).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole('button', { name: /pins/i }))
  expect(screen.getAllByText('Sunset').length).toBeGreaterThan(0)

  fireEvent.click(screen.getByRole('button', { name: /show timeline/i }))
  expect(screen.getByText('Pin opened')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /^opens$/i }))
  await waitFor(() => {
    expect(mockFetchDashboard).toHaveBeenLastCalledWith(expect.objectContaining({
      actionFilter: 'opens',
    }))
  })
})
