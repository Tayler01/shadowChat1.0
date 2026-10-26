
import { buildAISharingInfo, validateAISharingConsent } from '../supabase/functions/_shared/ai-sharing'

const info = buildAISharingInfo('openrouter', 'example/model', 25, 8_000)
const consent = { configurationKey: info.configurationKey, scope: 'question' }
const messages = [{ role: 'system', content: 'Answer the question.' }, { role: 'user', content: 'A synthetic test question.' }]

test('public AI metadata is deterministic and changes for recipient, model or limits', () => {
  expect(Object.keys(info).sort()).toEqual(['configurationKey', 'maxContentLength', 'maxMessages', 'model', 'provider', 'providerLabel', 'version'].sort())
  expect(buildAISharingInfo('openrouter', 'example/model', 25, 8_000)).toEqual(info)
  for (const changed of [buildAISharingInfo('openai', 'example/model', 25, 8_000), buildAISharingInfo('openrouter', 'another/model', 25, 8_000), buildAISharingInfo('openrouter', 'example/model', 25, 4_000)]) {
    expect(() => validateAISharingConsent(consent, changed, messages, false)).toThrow('configuration changed')
  }
})

test('reviewed question and summary scopes accept only matching bounded payloads', () => {
  expect(() => validateAISharingConsent(consent, info, messages, true)).not.toThrow()
  expect(() => validateAISharingConsent({ ...consent, scope: 'summary' }, info, messages, false)).not.toThrow()
  expect(() => validateAISharingConsent({ ...consent, scope: 'summary' }, info, messages, true)).toThrow('reviewed scope')
  expect(() => validateAISharingConsent(consent, info, [...messages, { role: 'user', content: 'unreviewed extra context' }], false)).toThrow('reviewed scope')
  expect(() => validateAISharingConsent(consent, info, [{ role: 'system', content: 'test' }, { role: 'user', content: 'x'.repeat(8_001) }], false)).toThrow('sharing limits')
  expect(() => validateAISharingConsent({ ...consent, scope: 'unknown' }, info, messages, false)).toThrow('scope is not valid')
  expect(() => validateAISharingConsent(null, info, messages, false)).toThrow('configuration changed')
})

test('legacy callers retain the existing server API without an invented acknowledgement', () => {
  expect(() => validateAISharingConsent(undefined, info, messages, true)).not.toThrow()
})
