import type { ChatMessage } from './supabase'

// Build the Supabase functions URL from the main project URL
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const functionsUrl = supabaseUrl
  ? supabaseUrl.replace('.supabase.co', '.functions.supabase.co')
  : ''

export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  if (!functionsUrl) {
    throw new Error('Missing Supabase configuration')
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'Summarize the following conversation in a short paragraph.' },
      ...messages.map(m => ({ role: 'user', content: m.content }))
    ]
  }
  const res = await fetch(`${functionsUrl}/openai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

export async function getSuggestedReplies(messages: ChatMessage[]): Promise<string[]> {
  if (!functionsUrl) {
    throw new Error('Missing Supabase configuration')
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'Provide three short reply suggestions as a JSON array of strings for continuing this conversation.'
      },
      ...messages.map(m => ({ role: 'user', content: m.content }))
    ]
  }

  const res = await fetch(`${functionsUrl}/openai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content?.trim() || '[]'

  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.map((s: any) => String(s))
    }
  } catch {
    // ignore JSON parse errors
  }

  return content.split('\n').map((s: string) => s.trim()).filter(Boolean)
}
