import { isLocalFeaturePreview, isLocalFeaturePreviewHost } from '../src/streamlined/localFeaturePreview'

const flags = globalThis as typeof globalThis & { __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__?: boolean }
const marker = document.createElement('meta')
marker.name = 'shadowchat-local-feature-preview'
marker.content = 'enabled'

beforeEach(() => {
  delete flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__
  delete window.__SHADOWCHAT_NATIVE_APP__
  delete window.ReactNativeWebView
  window.history.replaceState({}, '', '/')
  document.head.append(marker)
})
afterEach(() => {
  delete flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__
  delete window.__SHADOWCHAT_NATIVE_APP__
  delete window.ReactNativeWebView
  window.history.replaceState({}, '', '/')
  marker.remove()
})

test.each(['127.0.0.1', 'localhost', '[::1]'])('recognizes exact loopback hostname %s', hostname => {
  expect(isLocalFeaturePreviewHost(hostname)).toBe(true)
})

test.each(['shadochat.online', 'localhost.example.test', '127.0.0.1.example.test', '127.0.0.2', '::1', 'localhost.', '', '192.168.1.1'])('rejects non-allowlisted hostname %s', hostname => {
  expect(isLocalFeaturePreviewHost(hostname)).toBe(false)
})

test('requires the explicit compile flag even with a local preview marker', () => {
  expect(isLocalFeaturePreview()).toBe(false)
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = false
  expect(isLocalFeaturePreview()).toBe(false)
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  expect(isLocalFeaturePreview()).toBe(true)
})

test('requires the matching local artifact HTML marker', () => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  marker.remove()
  expect(isLocalFeaturePreview()).toBe(false)
})

test.each(['native flag', 'native query', 'native bridge'])('denies %s through the authoritative native-shell helper', kind => {
  flags.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ = true
  if (kind === 'native flag') window.__SHADOWCHAT_NATIVE_APP__ = true
  if (kind === 'native query') window.history.replaceState({}, '', '/?nativeApp=1')
  if (kind === 'native bridge') window.ReactNativeWebView = { postMessage: jest.fn() }
  expect(isLocalFeaturePreview()).toBe(false)
})
