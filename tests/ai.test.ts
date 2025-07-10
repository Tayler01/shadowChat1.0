import { summarizeConversation, analyzeTone, suggestReplies } from '../src/lib/ai'

describe('ai utilities', () => {
  test('summarizeConversation finds frequent words', () => {
    const msgs = [
      'I love pizza',
      'Pizza is awesome',
      'Did you try that new pizza place?'
    ]
    const summary = summarizeConversation(msgs)
    expect(summary).toContain('pizza')
  })

  test('analyzeTone detects sentiment', () => {
    expect(analyzeTone('I love this')).toBe('positive')
    expect(analyzeTone('I hate this')).toBe('negative')
    expect(analyzeTone('This is okay')).toBe('neutral')
  })

  test('suggestReplies suggests greetings', () => {
    const suggestions = suggestReplies('hello there')
    expect(suggestions.length).toBeGreaterThan(0)
  })
})
