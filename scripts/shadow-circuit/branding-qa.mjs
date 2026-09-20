import { chromium,webkit } from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const out='output/playwright/shadow-circuit-branding'
await mkdir(out,{recursive:true})
const results=[]
for(const [name,type,size] of [['desktop',chromium,{width:1672,height:941}],['android',chromium,{width:844,height:390}],['iphone',webkit,{width:844,height:390}]]){
  const browser=await type.launch({headless:true,...(type===chromium?{channel:'chromium',args:['--use-angle=swiftshader']}: {})})
  try{
    const page=await browser.newPage({viewport:size,hasTouch:name!=='desktop',isMobile:name!=='desktop'})
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{
      const fetch=window.fetch.bind(window)
      window.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);return (u.hostname.endsWith('.supabase.co')&&!u.pathname.startsWith('/storage/v1/object/public/game-assets/'))?Promise.resolve(new Response(u.pathname.startsWith('/auth/')?'{}':'[]',{headers:{'content-type':'application/json'}})):fetch(input,init)}
      window.__audioQa={contexts:[],voices:0,supported:!!(window.AudioContext??window.webkitAudioContext)}
      if(!window.__audioQa.supported)return
      const prototype=(window.AudioContext??window.webkitAudioContext).prototype
      const create=prototype.createBufferSource
      prototype.createBufferSource=function(){window.__audioQa.voices++;if(!window.__audioQa.contexts.includes(this))window.__audioQa.contexts.push(this);return create.call(this)}
    })
    await page.goto('http://127.0.0.1:4175/?view=games&localPreview=shadow-circuit')
    await page.getByRole('button',{name:'Play',exact:true}).waitFor()
    await page.locator('.circuit-brand-logo').evaluate(img=>img.decode())
    await page.locator('.circuit-menu-atmosphere img').evaluate(img=>img.decode())
    await page.screenshot({path:`${out}/${name}-menu.png`})
    const controls=await page.locator('.circuit-launch').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height,visible:r.top>=0&&r.bottom<=innerHeight}}))
    assert.ok(controls.every(c=>c.visible&&c.w>=48&&c.h>=48),'Primary controls clipped or too small')
    assert.equal(await page.evaluate(()=>window.__audioQa.voices),0,'Music started before a gesture')
    const audioSupported=await page.evaluate(()=>window.__audioQa.supported)
    await page.getByRole('button',{name:'Play',exact:true}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).click({timeout:30000})
    await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]').dataset.screen==='playing');await page.waitForTimeout(650)
    if(audioSupported)await page.waitForFunction(()=>window.__audioQa.voices>0,{timeout:5000}).catch(async()=>{throw new Error('Music not scheduled: '+JSON.stringify(await page.evaluate(()=>({contexts:window.__audioQa.contexts.map(c=>c.state),screen:document.querySelector('[data-testid="shadow-circuit"]').dataset.screen,voices:window.__audioQa.voices}))))})
    await page.getByRole('button',{name:'Move right',exact:true}).click()
    await page.waitForTimeout(350)
    await page.screenshot({path:`${out}/${name}-playing.png`})
    await page.getByRole('button',{name:'Pause game',exact:true}).click()
    await page.waitForFunction(()=>window.__audioQa.contexts.every(c=>c.state!=='running'))
    await page.getByRole('button',{name:'Main menu',exact:true}).click()
    await page.getByRole('button',{name:'SETTINGS',exact:true}).click()
    await page.getByLabel('Music',{exact:true}).uncheck()
    await page.getByRole('button',{name:'Back',exact:true}).click()
    await page.getByRole('button',{name:'Continue expedition',exact:true}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).click()
    const muted=await page.evaluate(()=>window.__audioQa.voices)
    await page.waitForTimeout(650)
    assert.equal(await page.evaluate(()=>window.__audioQa.voices),muted,'Muted music kept scheduling')
    await page.getByRole('button',{name:'Back to Shadow Chat',exact:true}).click()
    await page.getByRole('button',{name:'Open Shadow Circuit',exact:true}).waitFor()
    if(name!=='desktop')await page.setViewportSize({width:390,height:844})
    const card=page.getByRole('button',{name:'Open Shadow Circuit',exact:true})
    await card.locator('img').evaluate(img=>img.decode())
    await card.screenshot({path:`${out}/${name}-picker-card.png`})
    await page.screenshot({path:`${out}/${name}-picker.png`})
    assert.deepEqual(errors,[])
    results.push({name,status:'PASS',controls,musicGestureGate:audioSupported?'PASS':'API_UNAVAILABLE',musicMute:audioSupported?'PASS':'API_UNAVAILABLE',pauseSuspends:audioSupported?'PASS':'API_UNAVAILABLE',physicalDevice:false})
  }catch(error){results.push({name,status:'FAIL',error:error.message});process.exitCode=1}finally{await browser.close()}
}
await writeFile(`${out}/report.json`,JSON.stringify(results,null,2))
console.log(JSON.stringify(results,null,2))
