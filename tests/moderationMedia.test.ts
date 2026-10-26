jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import { fetchModerationCaseMedia } from '../src/lib/moderationMedia'
const invoke = jest.fn()
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ getWorkingClient: jest.fn(async () => ({ functions: { invoke } })) }))
const caseId = '10000000-0000-4000-8000-000000000001'
const asset = { id: caseId, reportId: caseId, kind: 'image', status: 'ready', url: 'https://project.supabase.co/storage/v1/object/sign/evidence?token=short' }
beforeEach(() => invoke.mockReset())
test('requests only the case identity and accepts its bounded private review response', async () => {
  invoke.mockResolvedValue({ data: { assets: [asset] }, error: null })
  expect(await fetchModerationCaseMedia(caseId)).toEqual([asset])
  expect(invoke).toHaveBeenCalledWith('moderation-media', { body: { caseId } })
})
test('denied operator request never falls back to a snapshot URL', async () => {
  invoke.mockResolvedValue({ data: null, error: { message: 'Forbidden' } })
  await expect(fetchModerationCaseMedia(caseId)).rejects.toThrow('Confirm case access')
})
test.each(['javascript:alert(1)', 'http://unsafe.example/file', 'https://user:password@project.supabase.co/file'])('rejects unsafe review URL %s', async url => {
  invoke.mockResolvedValue({ data: { assets: [{ ...asset, url }] }, error: null })
  await expect(fetchModerationCaseMedia(caseId)).rejects.toThrow('URL was not confirmed')
})
test('rejects an invalid case before network access and malformed response before rendering', async () => {
  await expect(fetchModerationCaseMedia('not-a-case')).rejects.toThrow('valid case')
  expect(invoke).not.toHaveBeenCalled()
  invoke.mockResolvedValue({ data: { assets: [{ ...asset, status: 'pending' }] }, error: null })
  await expect(fetchModerationCaseMedia(caseId)).rejects.toThrow('URL was not confirmed')
})
