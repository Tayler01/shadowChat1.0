import type { ChatMessage } from './supabase'

export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_KEY
  if (!apiKey) {
    throw new Error('Missing OpenAI API key')
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'Summarize the following conversation in a short paragraph.' },
      ...messages.map(m => ({ role: 'user', content: m.content }))
    ]
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  })

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}
