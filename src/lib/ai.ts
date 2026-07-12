import type { ChatMessage } from './supabase'
import { invokeAuthenticatedEdgeFunction } from './edgeFunctions'

interface AIMessage {
  role: 'system' | 'user'
  content: string
}

interface AIChoice {
  message?: {
    content?: string
  }
}

interface AIResponse {
  choices?: AIChoice[]
}

interface AskQuestionOptions {
  postToChat?: boolean
}

const invokeAI = async (
  messages: AIMessage[],
  options: { model?: string; postToChat?: boolean } = {}
): Promise<AIResponse> => {
  const model = options.model ?? 'mistralai/mistral-nemo'
  return invokeAuthenticatedEdgeFunction<AIResponse>('openai-chat', {
      model,
      messages,
      postToChat: options.postToChat,
  })
}

export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  const data = await invokeAI([
    { role: 'system', content: 'Summarize the following conversation in a short paragraph.' },
    ...messages.map(m => ({ role: 'user' as const, content: m.content }))
  ])

  return data.choices?.[0]?.message?.content?.trim() || ''
}

export async function getSuggestedReplies(messages: ChatMessage[]): Promise<string[]> {
  const data = await invokeAI([
    {
      role: 'system',
      content:
        'Provide three short reply suggestions as a JSON array of strings for continuing this conversation.'
    },
    ...messages.map(m => ({ role: 'user' as const, content: m.content }))
  ])

  const content = data.choices?.[0]?.message?.content?.trim() || '[]'

  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.map(s => String(s))
    }
  } catch {
    // ignore JSON parse errors
  }

  return content.split('\n').map((s: string) => s.trim()).filter(Boolean)
}

export async function askQuestion(
  question: string,
  options: AskQuestionOptions = {}
): Promise<string> {
  const data = await invokeAI([
    {
      role: 'system',
      content:
        'You are a helpful assistant participating in a group chat. Provide a concise answer to the user question.'
    },
    { role: 'user', content: question }
  ], { postToChat: options.postToChat })

  return data.choices?.[0]?.message?.content?.trim() || ''
}
