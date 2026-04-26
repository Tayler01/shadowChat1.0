import type { ChatMessage } from './supabase'
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  ensureSession,
  getWorkingClient,
  supabase,
} from './supabase'

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
  const hasSession = await ensureSession()
  if (!hasSession) {
    throw new Error('Authentication required')
  }

  const workingClient = await getWorkingClient()
  const [
    { data: workingSessionData },
    { data: persistentSessionData },
  ] = await Promise.all([
    workingClient.auth.getSession(),
    supabase.auth.getSession(),
  ])

  const accessToken =
    workingSessionData.session?.access_token ||
    persistentSessionData.session?.access_token

  if (!accessToken) {
    throw new Error('Authentication required')
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/openai-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      postToChat: options.postToChat,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `AI function failed with status ${response.status}`)
  }

  return (await response.json()) as AIResponse
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
