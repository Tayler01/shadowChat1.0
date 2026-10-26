export type AISharingInfo = {
  version: string
  provider: 'openrouter' | 'openai'
  providerLabel: string
  model: string
  configurationKey: string
  maxMessages: number
  maxContentLength: number
}

export class AISharingConsentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'AISharingConsentError'
  }
}

export function buildAISharingInfo(provider: AISharingInfo['provider'], model: string, maxMessages: number, maxContentLength: number): AISharingInfo {
  const version = '2026-10-23.1'
  // These are public configuration values only. Never include keys or headers.
  return {
    version,
    provider,
    providerLabel: provider === 'openrouter' ? 'OpenRouter' : 'OpenAI',
    model,
    configurationKey: JSON.stringify([version, provider, model, maxMessages, maxContentLength, provider === 'openrouter' ? 'automatic-upstream-routing' : 'direct']),
    maxMessages,
    maxContentLength,
  }
}

export function validateAISharingConsent(consent: unknown, info: AISharingInfo, messages: unknown, postToChat: boolean): void {
  // Existing full-app/bridge callers retain their original API contract.
  if (consent === undefined) return
  const value = consent as { configurationKey?: unknown; scope?: unknown } | null
  if (!value || value.configurationKey !== info.configurationKey) {
    throw new AISharingConsentError('The AI service configuration changed. Review and approve a new request before sharing text.', 409)
  }
  if (value.scope !== 'question' && value.scope !== 'summary') {
    throw new AISharingConsentError('The AI sharing scope is not valid. Nothing was sent to AI.', 400)
  }
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > info.maxMessages || messages.some((message, index) => !message || message.role !== (index === 0 ? 'system' : 'user') || typeof message.content !== 'string' || message.content.length > info.maxContentLength)) {
    throw new AISharingConsentError('The AI text does not match the reviewed sharing limits. Nothing was sent to AI.', 400)
  }
  if ((value.scope === 'question' && messages.length !== 2) || (value.scope === 'summary' && (messages.length > 21 || postToChat))) {
    throw new AISharingConsentError('The AI text does not match the reviewed scope. Nothing was sent to AI.', 400)
  }
}
