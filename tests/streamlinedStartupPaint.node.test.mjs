import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{JSDOM}=require('jsdom'),{createRoot}=require('react-dom/client')
function load(file,imports){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,window:global.window,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,CustomEvent:global.window?.CustomEvent,require:name=>{assert(Object.hasOwn(imports,name),name);return imports[name]}});return m.exports}
test('100% is painted before handoff, only after the last real import resolves',async()=>{
const dom=new JSDOM('<div id="root"></div>');global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;let id=0;const frames=new Map();global.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};global.cancelAnimationFrame=n=>frames.delete(n)
const work=load('src/streamlined/loading/startupWork.ts',{});const jsx=require('react/jsx-runtime');const view=load('src/streamlined/components/StreamlinedLoadingView.tsx',{'react/jsx-runtime':jsx,'../brand':{BRAND_MARK_URL:'mark'}})
const screen=load('src/streamlined/loading/StartupLoadingScreen.tsx',{'react':React,'react/jsx-runtime':jsx,'../../../apps/streamlined/src-overrides/hooks/useMessages':{useMessages:()=>({loading:false})},'../../../apps/streamlined/src-overrides/hooks/useDirectMessages':{useDirectMessages:()=>({loading:false})},'../components/StreamlinedLoadingView':view,'./startupWork':work})
const root=createRoot(document.getElementById('root'));try{await React.act(async()=>root.render(React.createElement(screen.StartupLoadingScreen)));let done;let pending;await React.act(async()=>{pending=work.startupWork.module(()=>new Promise(resolve=>{done=resolve}))});await React.act(async()=>{for(const phase of ['runtime','auth','membership','modules','data','view'])work.startupWork.finish(phase)})
assert.notEqual(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'100');assert.equal(frames.size,0)
await React.act(async()=>{done('last module');await pending});assert.equal(document.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'100')
const paint=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn())};await React.act(async()=>paint());assert(document.querySelector('[role=progressbar]'));await React.act(async()=>paint());assert.equal(document.querySelector('[role=progressbar]'),null)
}finally{await React.act(async()=>root.unmount());dom.window.close();delete global.window;delete global.document;delete global.requestAnimationFrame;delete global.cancelAnimationFrame;delete global.IS_REACT_ACT_ENVIRONMENT}
})
