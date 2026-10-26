import assert from 'node:assert/strict'
import { getAISharingInfo, requestAICompletion } from './ai.ts'

const envKeys = ['AI_PROVIDER', 'AI_MODEL', 'AI_ALLOWED_MODELS', 'OPENROUTER_MODEL', 'OPENROUTER_API_KEY', 'OPENAI_KEY', 'OPENAI_API_KEY']

Deno.test('AI metadata is read without sharing text; changed recipients reject before provider fetch', async () => {
  const previous = new Map(envKeys.map(key => [key, Deno.env.get(key)]))
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  try {
    for (const key of envKeys) Deno.env.delete(key)
    Deno.env.set('AI_PROVIDER', 'openrouter')
    Deno.env.set('OPENROUTER_API_KEY', 'synthetic-test-key')
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic answer' } }] }), { status: 200 })
    }
    const info = getAISharingInfo('mistralai/mistral-nemo')
    assert.equal(info.provider, 'openrouter')
    assert.equal(calls.length, 0)
    assert.equal(JSON.stringify(info).includes('synthetic-test-key'), false)
    const consent = { configurationKey: info.configurationKey, scope: 'question' }
    const messages = [{ role: 'system', content: 'Answer this question.' }, { role: 'user', content: 'Synthetic question only' }]
    await requestAICompletion(messages, info.model, consent)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions')
    assert.deepEqual(calls[0].body.messages, messages)
    Deno.env.set('AI_PROVIDER', 'openai')
    Deno.env.set('OPENAI_API_KEY', 'another-synthetic-test-key')
    await assert.rejects(() => requestAICompletion(messages, info.model, consent), /configuration changed/)
    assert.equal(calls.length, 1, 'Changed configuration must never reach a provider')
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})
