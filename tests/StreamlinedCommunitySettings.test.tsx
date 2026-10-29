import { fireEvent, render, screen } from '@testing-library/react'
import { SignInSettings } from '../src/streamlined/components/SignInSettings'
import { requestNativeCommunityChooser } from '../src/streamlined/nativeCommunity'

afterEach(() => {
  delete window.ReactNativeWebView
  delete window.__SHADOWCHAT_NATIVE_APP__
  delete window.__SHADOWCHAT_NATIVE_COMMUNITY_CHOOSER__
  window.history.replaceState({}, '', '/')
})

test('native chooser remains available after a notification deep link without bootstrap query parameters', () => {
  window.ReactNativeWebView = { postMessage: jest.fn() }
  window.__SHADOWCHAT_NATIVE_COMMUNITY_CHOOSER__ = true
  window.history.replaceState({}, '', '/?view=settings')
  render(<SignInSettings />)
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
})

test('signed-out native community access lives inside Settings, not the main screen', () => {
  const postMessage = jest.fn()
  window.ReactNativeWebView = { postMessage }
  window.history.replaceState({}, '', '/?nativeApp=1&nativeBridge=4')
  render(<SignInSettings />)
  expect(screen.queryByRole('button', { name: 'Change community' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Change community' }))
  expect(postMessage).toHaveBeenCalledWith(JSON.stringify({ version: 1, type: 'community_choose' }))
})

test.each(['/', '/?nativeApp=1&nativeBridge=3'])('web and older native builds do not offer an unsupported chooser: %s', path => {
  window.history.replaceState({}, '', path)
  const { container } = render(<SignInSettings />)
  expect(container).toBeEmptyDOMElement()
  expect(requestNativeCommunityChooser()).toBe(false)
})
