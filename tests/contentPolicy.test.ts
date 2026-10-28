import {CONTENT_POLICY_MESSAGE,isContentPolicyRejection,normalizeContentPolicyError,normalizeContentPolicyFunctionError} from '../src/lib/contentPolicy'

describe('content policy errors',()=>{
  it('recognizes the exact server code and marker without exposing matched content',()=>{
    const error=normalizeContentPolicyError({code:'PT422',message:'CONTENT_POLICY_REJECTED',details:'private server diagnostics'}) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe(CONTENT_POLICY_MESSAGE)
    expect(isContentPolicyRejection(error)).toBe(true)
    expect(normalizeContentPolicyError(error)).toBe(error)
  })
  it.each([null, 'CONTENT_POLICY_REJECTED',{code:'42501',message:'CONTENT_POLICY_REJECTED'},{code:'PT422',message:'Something else'},new Error('Network error')])('preserves unrelated errors %#',error=>{
    expect(isContentPolicyRejection(error)).toBe(false)
    expect(normalizeContentPolicyError(error)).toBe(error)
  })
})

 test('decodes only the structured policy response from an Edge Function',async()=>{
   const error={context:{status:422,clone:()=>({json:async()=>({code:'PT422',error:'CONTENT_POLICY_REJECTED'})})}}
   await expect(normalizeContentPolicyFunctionError(error)).resolves.toMatchObject({code:'PT422',message:CONTENT_POLICY_MESSAGE})
   const unrelated={context:{status:422,clone:()=>({json:async()=>({code:'other',error:'different'})})}}
   await expect(normalizeContentPolicyFunctionError(unrelated)).resolves.toBe(unrelated)
   const ambiguous={context:{status:500,clone:()=>({json:async()=>({code:'PT422',error:'CONTENT_POLICY_REJECTED'})})}}
   await expect(normalizeContentPolicyFunctionError(ambiguous)).resolves.toBe(ambiguous)
 })
