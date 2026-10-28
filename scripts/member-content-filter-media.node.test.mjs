import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const policyError = { code: 'PT422', message: 'CONTENT_POLICY_REJECTED' }
const source = path => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
function evaluate(text, names, values, result) {
  const code = ts.transpileModule(text, { compilerOptions: { target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS } }).outputText
  return new Function('exports',...names,`${code}\nreturn ${result}`)({},...values)
}

test('actual Netlify handler emits a stable 422 for a database policy failure',async()=>{
  const file=source('netlify/functions/shadow-pin-media.mjs')
  const handler=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='handler')
  const run=evaluate(handler.getText(file),['createAdminClient','json'],[()=>{throw policyError},(body,statusCode)=>({body,statusCode})],'handler')
  assert.deepEqual(await run({httpMethod:'POST'}),{body:{code:'PT422',error:'CONTENT_POLICY_REJECTED'},statusCode:422})
})

test('actual video handler emits the same 422 contract',async()=>{
  const file=source('supabase/functions/shadow-pin-video/index.ts')
  const call=file.statements.find(s=>ts.isExpressionStatement(s)&&ts.isCallExpression(s.expression)&&s.expression.expression.getText(file)==='serve').expression
  const callback=call.arguments[0].getText(file)
  const run=evaluate(`const handler=${callback}`,['readJson','json'],[async()=>{throw policyError},(body,status)=>({body,status})],'handler')
  assert.deepEqual(await run({method:'POST'}),{body:{code:'PT422',error:'CONTENT_POLICY_REJECTED'},status:422})
})

for(const error of [policyError,new Error('Network timeout')]){
 test(`actual imported-image insert compensates only a definite policy failure (${error.code??'network'})`,async()=>{
  const file=source('netlify/functions/_shared/shadow-pin-media.mjs')
  const declaration=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='createImportedShadowPinItem')
  const removed=[]
  const storage={upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:'https://example.test/new'}}),remove:async paths=>{removed.push(...paths);return{error:null}}}
  const query={insert:()=>query,select:()=>query,single:async()=>({data:null,error})}
  const admin={storage:{from:()=>storage},from:()=>query}
  const run=evaluate(declaration.getText(file),['fetchRemoteImage','crypto','SHADOW_PIN_BUCKET','tableFor'],[
    async()=>({extension:'png',buffer:new Uint8Array([1]),contentType:'image/png',sizeBytes:1}),{randomUUID:()=> 'fresh-id'},'shadow-pin',()=> 'shadow_pin_categories',
  ],'createImportedShadowPinItem')
  await assert.rejects(()=>run({admin,userId:'member',targetType:'category',title:'Title',description:'Description',url:'https://example.test/source'}),failure=>failure===error)
  assert.deepEqual(removed,error===policyError?['member/categories/fresh-id/cover/original.png']:[])
 })
}
