export function summarizeConversation(messages: string[]): string {
  if (messages.length === 0) return 'No messages yet.'
  const stopwords = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'to',
    'of',
    'in',
    'is',
    'it',
    'that',
    'this',
    'for',
    'on',
    'with',
    'as',
    'was',
    'but',
    'be',
    'are',
  ])

  const freq: Record<string, number> = {}
  for (const msg of messages) {
    for (const word of msg.toLowerCase().split(/\W+/)) {
      if (!word || stopwords.has(word)) continue
      freq[word] = (freq[word] || 0) + 1
    }
  }
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w)
  return top.length > 0
    ? `Recent topics: ${top.join(', ')}`
    : 'Conversation is quite varied.'
}

const positiveWords = new Set([
  'love',
  'like',
  'great',
  'awesome',
  'good',
  'happy',
  'thanks',
])
const negativeWords = new Set([
  'hate',
  'bad',
  'sad',
  'angry',
  'upset',
  'terrible',
  'sorry',
])

export function analyzeTone(
  text: string
): 'positive' | 'negative' | 'neutral' {
  const words = text.toLowerCase().split(/\W+/)
  let score = 0
  for (const w of words) {
    if (positiveWords.has(w)) score++
    if (negativeWords.has(w)) score--
  }
  if (score > 0) return 'positive'
  if (score < 0) return 'negative'
  return 'neutral'
}

export function suggestReplies(text: string): string[] {
  const lower = text.toLowerCase()
  const suggestions: string[] = []
  if (/\b(hello|hi|hey)\b/.test(lower)) {
    suggestions.push('Hello!', 'How are you?')
  }
  if (/thank/.test(lower)) {
    suggestions.push("You're welcome!", 'No problem!')
  }
  if (/\b(bye|goodbye)\b/.test(lower)) {
    suggestions.push('See you later!', 'Bye!')
  }
  return suggestions
}
