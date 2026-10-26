import {
  beginAccountDeletionAttempt, confirmAccountDeletion, finishAccountDeletionAttempt,
  getAccountDeletionState, getPendingAccountDeletion, prepareAccountDeletion,
  getConfirmedAccountDeletionReloadUrl,
  withAccountDeletionLock,
} from '../src/lib/accountDeletionReceipt'
import { installTestWebLocks } from './mocks/webLocks'

const firstUser = '00000000-0000-4000-8000-000000000001'
const secondUser = '00000000-0000-4000-8000-000000000002'
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  finishAccountDeletionAttempt()
  window.history.replaceState({}, '', '/')
})

test('keeps the same cryptographically generated receipt across reload reads and retry preparation', () => {
  const first = prepareAccountDeletion(firstUser)
  expect(first.receipt).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(getPendingAccountDeletion()).toEqual(first)
  expect(prepareAccountDeletion(firstUser)).toEqual(first)
})

test('late completion of an older request cannot remove or hide a newer request', () => {
  const first = prepareAccountDeletion(firstUser)
  beginAccountDeletionAttempt(first.receipt)
  // Another tab has legitimately completed/cleared the old request and started another.
  localStorage.clear()
  const second = prepareAccountDeletion(secondUser)
  confirmAccountDeletion(first.receipt)
  finishAccountDeletionAttempt(undefined, first.receipt)
  expect(getAccountDeletionState()).toEqual({ pending: second, confirmed: false, running: false, error: null })
})

test('an old response cannot end or report failure on a newer running request', () => {
  const first = prepareAccountDeletion(firstUser)
  beginAccountDeletionAttempt(first.receipt)
  localStorage.clear()
  const second = prepareAccountDeletion(secondUser)
  beginAccountDeletionAttempt(second.receipt)
  confirmAccountDeletion(first.receipt)
  finishAccountDeletionAttempt('Old request failed', first.receipt)
  expect(getAccountDeletionState()).toEqual({ pending: second, confirmed: false, running: true, error: null })
})

test('a duplicate attempt cannot begin while the same receipt is running', () => {
  const pending = prepareAccountDeletion(firstUser)
  beginAccountDeletionAttempt(pending.receipt)
  expect(() => beginAccountDeletionAttempt(pending.receipt)).toThrow('already running')
  finishAccountDeletionAttempt('Retry later', pending.receipt)
  beginAccountDeletionAttempt(pending.receipt)
  expect(getAccountDeletionState().error).toBeNull()
})

test('confirmed completion survives a controlled reload without storing a token, receipt or identity', () => {
  const pending = prepareAccountDeletion(firstUser)
  beginAccountDeletionAttempt(pending.receipt)
  confirmAccountDeletion(pending.receipt)
  finishAccountDeletionAttempt(undefined, pending.receipt)
  const marker = sessionStorage.getItem('shadowchat:account-deletion-confirmed:v1')!
  expect(JSON.parse(marker)).toEqual({ version: 1, confirmedAt: expect.any(Number) })
  expect(marker).not.toContain(pending.receipt)
  expect(marker).not.toContain(firstUser)
  expect(getConfirmedAccountDeletionReloadUrl(pending.receipt)).toBe('http://localhost/?accountDeletion=retry')
  jest.isolateModules(() => {
    const resumed = jest.requireActual('../src/lib/accountDeletionReceipt')
    expect(resumed.getAccountDeletionState()).toEqual({ pending: null, running: false, error: null, confirmed: true })
  })
})

test('a newer pending receipt blocks an older controlled reload and its confirmation marker', () => {
  const first = prepareAccountDeletion(firstUser)
  beginAccountDeletionAttempt(first.receipt)
  confirmAccountDeletion(first.receipt)
  finishAccountDeletionAttempt(undefined, first.receipt)
  const next = prepareAccountDeletion(secondUser)
  expect(getConfirmedAccountDeletionReloadUrl(first.receipt)).toBeNull()
  beginAccountDeletionAttempt(next.receipt)
  expect(sessionStorage.getItem('shadowchat:account-deletion-confirmed:v1')).toBeNull()
  expect(getAccountDeletionState().confirmed).toBe(false)
})

test.each([Date.now() - 300_001, Date.now() + 60_000, 'invalid'])('expired or invalid confirmation time %p is not reused after reload', confirmedAt => {
  sessionStorage.setItem('shadowchat:account-deletion-confirmed:v1', JSON.stringify({ version: 1, confirmedAt }))
  jest.isolateModules(() => {
    const resumed = jest.requireActual('../src/lib/accountDeletionReceipt')
    expect(resumed.getAccountDeletionState().confirmed).toBe(false)
  })
})

test('unavailable tab storage preserves in-page confirmation and prevents a confirmation-losing reload', () => {
  const pending = prepareAccountDeletion(firstUser)
  beginAccountDeletionAttempt(pending.receipt)
  const original = Storage.prototype.setItem
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    if (this === sessionStorage) throw new Error('Session storage disabled')
    original.call(this, key, value)
  })
  try {
    confirmAccountDeletion(pending.receipt)
    finishAccountDeletionAttempt(undefined, pending.receipt)
    expect(getAccountDeletionState().confirmed).toBe(true)
    expect(getConfirmedAccountDeletionReloadUrl(pending.receipt)).toBeNull()
  } finally { set.mockRestore() }
})

test('two independent tabs cannot create competing receipts while the first deletion request is in flight', async () => {
  const locks = installTestWebLocks()
  let secondTab!: typeof import('../src/lib/accountDeletionReceipt')
  jest.isolateModules(() => { secondTab = jest.requireActual('../src/lib/accountDeletionReceipt') })
  let finishRequest!: () => void
  const inFlight = new Promise<void>(resolve => { finishRequest = resolve })
  let firstReceipt: ReturnType<typeof prepareAccountDeletion> | undefined
  const secondStarted = jest.fn()
  try {
    const firstAttempt = withAccountDeletionLock(async () => {
      firstReceipt = prepareAccountDeletion(firstUser)
      await inFlight // The first server request might finish after its response is lost.
    })
    await expect(secondTab.withAccountDeletionLock(async () => {
      secondStarted(secondTab.prepareAccountDeletion(firstUser))
    })).rejects.toThrow('another window')
    expect(secondStarted).not.toHaveBeenCalled()
    expect(secondTab.getPendingAccountDeletion()).toEqual(firstReceipt)
    finishRequest()
    await firstAttempt
    await secondTab.withAccountDeletionLock(async () => {
      expect(secondTab.prepareAccountDeletion(firstUser)).toEqual(firstReceipt)
    })
    expect(getPendingAccountDeletion()).toEqual(firstReceipt)
    expect(locks.request).toHaveBeenCalledTimes(3)
  } finally { finishRequest(); locks.restore() }
})
