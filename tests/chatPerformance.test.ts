import { beginChatTiming } from '../src/lib/chatPerformance'

describe('content-free chat performance sampling', () => {
  const measure = jest.fn()
  const clearMeasures = jest.fn()
  beforeEach(() => {
    Object.defineProperty(performance, 'measure', { configurable: true, value: measure })
    Object.defineProperty(performance, 'clearMeasures', { configurable: true, value: clearMeasures })
    jest.spyOn(Math, 'random').mockReturnValue(0)
    measure.mockClear()
    clearMeasures.mockClear()
  })
  afterEach(() => jest.restoreAllMocks())

  it('records only a fixed operation label and numerical timing once per operation', () => {
    const finish = beginChatTiming('send-ack', 'dm')
    finish()
    finish()
    expect(measure).toHaveBeenCalledTimes(1)
    expect(measure).toHaveBeenCalledWith('shadowchat:dm:send-ack', { start: expect.any(Number), end: expect.any(Number) })
  })
  it('samples and bounds entries without clearing unrelated performance data', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1)
    beginChatTiming('restore', 'general')()
    expect(measure).not.toHaveBeenCalled()
    jest.spyOn(Math, 'random').mockReturnValue(0)
    for (let index = 0; index < 80; index++) beginChatTiming('restore', 'general')()
    expect(clearMeasures).toHaveBeenCalled()
    expect(clearMeasures.mock.calls.every(([name]) => name.startsWith('shadowchat:'))).toBe(true)
  })
  it('does not fail a send when the browser rejects timing diagnostics', () => {
    measure.mockImplementationOnce(() => { throw new Error('unavailable') })
    expect(() => beginChatTiming('send-ack', 'thread')()).not.toThrow()
  })
})
