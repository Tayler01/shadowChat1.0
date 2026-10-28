import { getWorkingClient, uploadShadowPinImage } from '../src/lib/supabase'
import { createShadowPinCategory, createShadowPinImage, updateShadowPinCategory, updateShadowPinImage } from '../src/features/shadow-pin/api/shadowPinApi'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(), getSessionWithTimeout: jest.fn(), getWorkingClient: jest.fn(), uploadShadowPinImage: jest.fn(), SHADOW_PIN_BUCKET: 'shadow-pin',
}))

const policyError = { code: 'PT422', message: 'CONTENT_POLICY_REJECTED' }
const values = { title: 'Title', description: 'Description', file: new File(['image'], 'test.png', { type: 'image/png' }) }

function setup(error: unknown, cleanupError: unknown = null) {
  const remove = jest.fn().mockResolvedValue({ error: cleanupError })
  const table = { insert: jest.fn(), update: jest.fn(), eq: jest.fn(), select: jest.fn(), single: jest.fn().mockResolvedValue({ data: null, error }) }
  for (const method of ['insert','update','eq','select'] as const) table[method].mockReturnValue(table)
  ;(getWorkingClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'member' } } }) },
    from: jest.fn().mockReturnValue(table), storage: { from: jest.fn().mockReturnValue({ remove }) },
  })
  ;(uploadShadowPinImage as jest.Mock).mockResolvedValue({ path: 'member/categories/new/pins/new.png', publicUrl: 'https://example.test/new.png' })
  return { remove }
}

beforeEach(()=>jest.clearAllMocks())

test.each([
  ['new category', () => createShadowPinCategory(values)],
  ['new pin', () => createShadowPinImage('category', values)],
  ['category replacement', () => updateShadowPinCategory('category', values)],
  ['pin replacement', () => updateShadowPinImage('pin', { ...values, categoryId: 'category' })],
])('removes only the new upload after definitive policy rejection: %s',async(_label,run)=>{
  const { remove } = setup(policyError)
  await expect(run()).rejects.toMatchObject({ code: 'PT422', contentPolicyRejected: true })
  expect(remove).toHaveBeenCalledWith(['member/categories/new/pins/new.png'])
  expect(remove).toHaveBeenCalledTimes(1)
})

test('never deletes an uploaded object when a network error may hide a committed row',async()=>{
  const uncertain = new Error('Network error')
  const { remove } = setup(uncertain)
  await expect(createShadowPinCategory(values)).rejects.toBe(uncertain)
  expect(remove).not.toHaveBeenCalled()
})

test('surfaces failed cleanup without claiming the upload was removed',async()=>{
  setup(policyError,new Error('Storage unavailable'))
  await expect(createShadowPinCategory(values)).rejects.toMatchObject({ code:'PT422',cleanupIncomplete:true, message:expect.stringContaining('could not be removed') })
})
