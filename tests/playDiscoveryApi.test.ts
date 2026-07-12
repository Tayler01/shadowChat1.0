import { searchPlayDiscovery } from '../src/features/discovery/playDiscoveryApi'
import { getWorkingClient } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
}))

type QueryResult = { data: unknown[] | null; error: unknown }

const createRequest = (result: QueryResult) => {
  const request: any = {
    abortSignal: jest.fn(),
  }
  request.abortSignal.mockReturnValue(request)
  request.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) => (
    Promise.resolve(result).then(resolve, reject)
  )
  return request
}

const workingClient = getWorkingClient as jest.MockedFunction<typeof getWorkingClient>

beforeEach(() => {
  jest.resetAllMocks()
})

test('maps query-bounded live Play rows to save UUIDs, exact routes, and safe thumbnail metadata', async () => {
  const request = createRequest({
    data: [
      {
        target_kind: 'shado_tv_video',
        target_id: '11111111-1111-4111-8111-111111111111',
        parent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        target_slug: 'the-chicken-snatchers',
        parent_slug: 'crimp-shrimp',
        title: 'The Chicken Snatchers',
        subtitle: 'Episode 1',
        description: 'A very bad chicken plan.',
        thumbnail_url: 'https://example.test/chicken.webp',
        thumbnail_path: 'tv/chicken.webp',
        search_rank: 4.5,
      },
      {
        target_kind: 'shadow_mystery_story',
        target_id: '22222222-2222-4222-8222-222222222222',
        parent_id: null,
        target_slug: 'camelot-golf-course',
        parent_slug: null,
        title: 'The Last Tee Time At Camelot',
        subtitle: 'A Shadow Mystery novella',
        description: 'The golf course keeps one final appointment.',
        thumbnail_url: null,
        thumbnail_path: 'stories/camelot/cover.webp',
        search_rank: 3.5,
      },
    ],
    error: null,
  })
  const rpc = jest.fn(() => request)
  workingClient.mockResolvedValue({ rpc } as any)

  const results = await searchPlayDiscovery('chicken', 8)
  const tvResult = results.find(item => item.targetKind === 'shado_tv_video')

  expect(rpc).toHaveBeenCalledWith('search_published_play_content', {
    search_query: 'chicken',
    result_limit: 8,
  })
  expect(tvResult).toMatchObject({
    kind: 'video',
    experience: 'shado-tv',
    item: 'the-chicken-snatchers',
    targetId: '11111111-1111-4111-8111-111111111111',
    parentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    parentSlug: 'crimp-shrimp',
    thumbnailUrl: 'https://example.test/chicken.webp',
    thumbnailPath: 'tv/chicken.webp',
  })
})

test('does not replace missing live episodes or stories with static save targets', async () => {
  const request = createRequest({ data: [], error: null })
  workingClient.mockResolvedValue({ rpc: () => request } as any)

  await expect(searchPlayDiscovery('chicken', 8)).resolves.toEqual([])
  await expect(searchPlayDiscovery('camelot', 8)).resolves.toEqual([])
})

test('surfaces live catalog failure so the discovery orchestrator can mark Play unavailable', async () => {
  const rpcError = new Error('play search unavailable')
  const request = createRequest({ data: null, error: rpcError })
  workingClient.mockResolvedValue({ rpc: () => request } as any)

  await expect(searchPlayDiscovery('shadow', 8)).rejects.toBe(rpcError)
})

test('passes cancellation to the live metadata RPC', async () => {
  const request = createRequest({ data: [], error: null })
  workingClient.mockResolvedValue({ rpc: () => request } as any)
  const controller = new AbortController()

  await searchPlayDiscovery('shadow', 8, controller.signal)

  expect(request.abortSignal).toHaveBeenCalledWith(controller.signal)
})
