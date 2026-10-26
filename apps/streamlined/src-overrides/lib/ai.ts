import type { ChatMessage } from './supabase'
import { invokeAuthenticatedEdgeFunction } from '../../../../src/lib/edgeFunctions'

export interface AIMessage {
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

export type AISharingScope = 'question' | 'summary'
export interface AISharingInfo {
  version: string
  provider: 'openai' | 'openrouter'
  providerLabel: string
  model: string
  configurationKey: string
  maxMessages: number
  maxContentLength: number
}
export interface AISharingConsent {
  configurationKey: string
  scope: AISharingScope
}
export interface AIShareRequest {
  scope: AISharingScope
  messages: AIMessage[]
  postToChat: boolean
}
export interface ApprovedAIShare {
  request: AIShareRequest
  consent: AISharingConsent
}
interface AskQuestionOptions {
  postToChat?: boolean
  sharingConsent?: AISharingConsent
}

const AI_MODEL = 'mistralai/mistral-nemo'
export const questionMessages = (question: string): AIMessage[] => [
  { role: 'system', content: 'You are a helpful assistant participating in a group chat. Provide a concise answer to the user question.' },
  { role: 'user', content: question },
]
export const summaryMessages = (messages: ChatMessage[]): AIMessage[] => [
  { role: 'system', content: 'Summarize the following conversation in a short paragraph.' },
  ...messages.map(message => ({ role: 'user' as const, content: message.content })),
]

export async function getAISharingInfo(): Promise<AISharingInfo> {
  const info = await invokeAuthenticatedEdgeFunction<AISharingInfo>('openai-chat', { action: 'sharing-info', model: AI_MODEL })
  if (!info || !['openai', 'openrouter'].includes(info.provider) || typeof info.version !== 'string' || !info.version || typeof info.configurationKey !== 'string' || !info.configurationKey || typeof info.model !== 'string' || !info.model || !Number.isInteger(info.maxMessages) || info.maxMessages < 2 || info.maxMessages > 25 || !Number.isInteger(info.maxContentLength) || info.maxContentLength < 1 || info.maxContentLength > 8_000) {
    throw new Error('AI sharing details could not be verified. Nothing has been shared.')
  }
  return info
}

export async function completeApprovedAIShare({ request, consent }: ApprovedAIShare): Promise<string> {
  const data = await invokeAI(request.messages, { postToChat: request.postToChat, sharingConsent: consent })
  return data.choices?.[0]?.message?.content?.trim() || ''
}

const invokeAI = async (
  messages: AIMessage[],
  options: { model?: string; postToChat?: boolean; sharingConsent?: AISharingConsent } = {}
): Promise<AIResponse> => {
  const model = options.model ?? AI_MODEL
  return invokeAuthenticatedEdgeFunction<AIResponse>('openai-chat', {
      model,
      messages,
      postToChat: options.postToChat,
      ...(options.sharingConsent ? { sharingConsent: options.sharingConsent } : {}),
  })
}

export async function summarizeConversation(messages: ChatMessage[]): Promise<string> {
  const data = await invokeAI(summaryMessages(messages))

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
  const data = await invokeAI(questionMessages(question), { postToChat: options.postToChat, sharingConsent: options.sharingConsent })

  return data.choices?.[0]?.message?.content?.trim() || ''
}
