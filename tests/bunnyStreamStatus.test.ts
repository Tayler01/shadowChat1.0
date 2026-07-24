import { getBunnyStreamReadyState } from '../supabase/functions/_shared/bunny-stream-status'

describe('Bunny Stream processing status', () => {
  test.each([3, 4])('treats official ready status %s as publishable', status => {
    expect(getBunnyStreamReadyState({ status })).toMatchObject({
      ready: true,
      failed: false,
      status,
    })
  })

  test.each([0, 1, 2, 6, 7])('keeps in-progress status %s pending', status => {
    expect(getBunnyStreamReadyState({ status, encodeProgress: 0 })).toMatchObject({
      ready: false,
      failed: false,
      status,
    })
  })

  test.each([5, 8])('treats official failure status %s as failed', status => {
    expect(getBunnyStreamReadyState({ status })).toMatchObject({
      ready: false,
      failed: true,
      status,
    })
  })

  test('accepts completed progress or generated renditions even before the status settles', () => {
    expect(getBunnyStreamReadyState({ status: 2, encodeProgress: 100 }).ready).toBe(true)
    expect(getBunnyStreamReadyState({ status: 2, availableResolutions: ['360p'] }).ready).toBe(true)
    expect(getBunnyStreamReadyState({ status: 2, availableResolutions: '360p,720p' }).ready).toBe(true)
  })
})
