import { getWorkingClient } from '../src/lib/supabase'
import { claimWebNotificationPresentation, registerWebNotificationInstallation, resetWebNotificationInstallationForUser } from '../src/lib/notificationInstallation'
jest.mock('../src/lib/supabase',()=>({ getWorkingClient: jest.fn() }))
jest.mock('../src/lib/env',()=>({ VITE_APP_BUILD_ID:'test',VITE_APP_COMMIT_SHA:'test',VITE_APP_DEPLOY_CONTEXT:'preview' }))
describe('notification installation registration identity and cache',()=>{
  const rpc=jest.fn()
  beforeEach(()=>{resetWebNotificationInstallationForUser(null);rpc.mockReset().mockResolvedValue({data:'installation'});(getWorkingClient as jest.Mock).mockResolvedValue({rpc})})
  test('coalesces concurrent registration and reuses successful device metadata',async()=>{
    resetWebNotificationInstallationForUser('u1')
    await Promise.all([registerWebNotificationInstallation(),registerWebNotificationInstallation()])
    await registerWebNotificationInstallation()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
  test('clears metadata cache for another account',async()=>{
    resetWebNotificationInstallationForUser('u1');await registerWebNotificationInstallation()
    resetWebNotificationInstallationForUser('u2');await registerWebNotificationInstallation()
    expect(rpc).toHaveBeenCalledTimes(2)
  })
  test('does not register after account change during client acquisition',async()=>{
    let resolveClient!: (client: {rpc: jest.Mock})=>void
    ;(getWorkingClient as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{resolveClient=resolve}))
    resetWebNotificationInstallationForUser('u1');const pending=registerWebNotificationInstallation()
    resetWebNotificationInstallationForUser('u2');resolveClient({rpc})
    expect(await pending).toBeNull();expect(rpc).not.toHaveBeenCalled()
  })
  test('does not claim after account change during registration',async()=>{
    let resolveRegistration!: (value: {data:string})=>void
    rpc.mockImplementationOnce(()=>new Promise(resolve=>{resolveRegistration=resolve}))
    resetWebNotificationInstallationForUser('u1');const pending=claimWebNotificationPresentation('event')
    await Promise.resolve();await Promise.resolve();await Promise.resolve()
    resetWebNotificationInstallationForUser('u2');resolveRegistration({data:'old-installation'})
    expect(await pending).toBeNull();expect(rpc).toHaveBeenCalledTimes(1)
  })
})
