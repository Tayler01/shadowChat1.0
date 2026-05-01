import { clearGroupNotifications } from '../src/lib/appBadge'

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
      ready: Promise.resolve({ active: { postMessage: activePostMessage } }),
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
      ready: Promise.resolve({ active: { postMessage: activePostMessage } }),
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
