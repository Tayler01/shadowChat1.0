import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url), ts = require('typescript')
const mod = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/streamlined/loading/startupWork.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports, Set })
const { createStartupWork } = mod.exports
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return {promise, resolve, reject} }
test('progress advances only on completed work; final import and view gate own 100%', async () => {
 const work=createStartupWork(), first=deferred(), last=deferred()
 work.finish('runtime'); work.finish('auth'); work.finish('membership')
 const a=work.module(()=>first.promise), b=work.module(()=>last.promise)
 const waiting=work.getSnapshot(); for(let i=0;i<100;i++)await Promise.resolve()
 assert.equal(work.getSnapshot(),waiting,'waiting must never invent progress')
 first.resolve('first');await a;assert(work.getSnapshot().progress>waiting.progress)
 work.finish('modules');work.finish('data');work.finish('view');assert.equal(work.getSnapshot().complete,false);assert(work.getSnapshot().progress<1)
 last.resolve('last');await b;assert.equal(work.getSnapshot().progress,1);assert.equal(work.getSnapshot().complete,true)
})
test('stages cannot regress when another real module is discovered',async()=>{
 const work=createStartupWork(), one=deferred(), two=deferred();work.finish('runtime')
 const a=work.module(()=>one.promise);one.resolve(1);await a;const prior=work.getSnapshot().progress
 const b=work.module(()=>two.promise);assert(work.getSnapshot().progress>=prior);two.resolve(2);await b
})
test('failed imports never announce successful completion and stale generations cannot finish a recovery',async()=>{
 const work=createStartupWork(), old=deferred();const pending=work.module(()=>old.promise)
 work.beginRecovery(['runtime'],true);old.resolve(1);await pending
 assert.equal(work.getSnapshot().progress,.1);assert.equal(work.getSnapshot().complete,false)
 await assert.rejects(work.module(()=>Promise.reject(new Error('offline'))));assert.equal(work.getSnapshot().failed,true);assert(work.getSnapshot().progress<1)
})

test('messages arriving is not enough: initial viewport must settle before completion',()=>{
 const work=createStartupWork()
 for(const phase of ['runtime','auth','membership','modules','data'])work.finish(phase)
 assert.equal(work.getSnapshot().complete,false);assert.equal(work.getSnapshot().progress,.95)
 work.finish('view');assert.equal(work.getSnapshot().progress,1);assert.equal(work.getSnapshot().complete,true)
})
