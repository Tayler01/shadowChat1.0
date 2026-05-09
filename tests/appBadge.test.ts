import { clearGroupNotifications, updateAppBadge } from '../src/lib/appBadge'

const setNotificationPermission = (permission: NotificationPermission) => {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value: { permission },
  })
}

beforeEach(() => {
  jest.resetAllMocks()
})

test('skips notification clear messages before notification permission is granted', async () => {
  const controllerPostMessage = jest.fn()
  const activePostMessage = jest.fn()

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage: controllerPostMessage },
      getRegistration: jest.fn().mockResolvedValue({ active: { postMessage: activePostMessage } }),
    },
  })
  setNotificationPermission('default')

  await clearGroupNotifications()

  expect(controllerPostMessage).not.toHaveBeenCalled()
  expect(activePostMessage).not.toHaveBeenCalled()
})

test('sends notification clear messages when notification permission is granted', async () => {
  const controllerPostMessage = jest.fn()
  const activePostMessage = jest.fn()

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage: controllerPostMessage },
      getRegistration: jest.fn().mockResolvedValue({ active: { postMessage: activePostMessage } }),
    },
  })
  setNotificationPermission('granted')

  await clearGroupNotifications()

  expect(controllerPostMessage).toHaveBeenCalledWith({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'group_message',
  })
  expect(activePostMessage).toHaveBeenCalledWith({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'group_message',
  })
})

test('badge updates do not wait forever for a pending service worker ready promise', async () => {
  const setAppBadge = jest.fn().mockResolvedValue(undefined)
  const controllerPostMessage = jest.fn()

  Object.defineProperty(navigator, 'setAppBadge', {
    configurable: true,
    value: setAppBadge,
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage: controllerPostMessage },
      ready: new Promise(() => undefined),
    },
  })

  await expect(updateAppBadge(3)).resolves.toBeUndefined()

  expect(setAppBadge).toHaveBeenCalledWith(3)
  expect(controllerPostMessage).toHaveBeenCalledWith({
    type: 'SHADOWCHAT_BADGE_UPDATE',
    count: 3,
  })
})
