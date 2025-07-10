import type { ChatMessage } from './supabase'
import { supabase } from './supabase'

export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'Summarize the following conversation in a short paragraph.' },
      ...messages.map(m => ({ role: 'user', content: m.content }))
    ]
  }
  const { data, error } = await supabase.functions.invoke('openai-proxy', {
    body: payload
  })
  if (error) {
    throw error
  }
  // data is typed as any because the proxy just forwards the OpenAI response
  return (data as any).choices?.[0]?.message?.content?.trim() || ''
}

export async function getSuggestedReplies(messages: ChatMessage[]): Promise<string[]> {
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

  const { data, error } = await supabase.functions.invoke('openai-proxy', {
    body: payload
  })
  if (error) {
    throw error
  }
  const content = (data as any).choices?.[0]?.message?.content?.trim() || '[]'

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
