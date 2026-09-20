import { chromium, webkit } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { AUTHORED_LEVELS } from '../../src/features/games/shadow-circuit/content/authoredLevels.ts'
import { expandRoute } from './replay.mjs'
const base=process.env.SHADOW_CIRCUIT_QA_URL??'http://127.0.0.1:4174'
const directory=`output/playwright/shadow-circuit-${Date.now()}`
await mkdir(directory,{recursive:true})
const report=[]
const solutions=JSON.parse(await readFile('tools/shadow-circuit/authored-solutions.json','utf8')).routes
for(const [name,browserType,size] of [['chromium',chromium,{width:844,height:390}],['webkit',webkit,{width:844,height:390}]]) {
  if(process.env.SHADOW_CIRCUIT_QA_BROWSER&&name!==process.env.SHADOW_CIRCUIT_QA_BROWSER)continue
  const browser=await browserType.launch({headless:true,...(name==='chromium'?{channel:'chromium',args:['--use-angle=swiftshader']}: {})})
  const context=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,deviceScaleFactor:1})
  // This local game check must not exercise the live host backend. Authenticated
  // chat/RLS integration requires the repository's separate two-account smoke.
  await context.route(url=>(url.hostname.endsWith('.supabase.co')&&!url.pathname.startsWith('/storage/v1/object/public/game-assets/')),route=>route.fulfill({
    status:200,contentType:'application/json',body:route.request().url().includes('/auth/')?'{}':'[]',
    headers:{'access-control-allow-origin':new URL(base).origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-allow-headers':route.request().headers()['access-control-request-headers']??'authorization,apikey,content-type,x-client-info'},
  }))
  await context.addInitScript(()=>{
    // WebKit can cancel intercepted unload RPCs before the route handler runs.
    // Stub host fetches before app boot; keep game assets and IndexedDB real.
    const originalFetch=globalThis.fetch.bind(globalThis)
    globalThis.fetch=(input,init)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href)
      return (url.hostname.endsWith('.supabase.co')&&!url.pathname.startsWith('/storage/v1/object/public/game-assets/'))?Promise.resolve(new Response(url.pathname.startsWith('/auth/')?'{}':'[]',{headers:{'content-type':'application/json'}})):originalFetch(input,init)
    }
    const resources={buffer:new Set(),texture:new Set(),program:new Set(),shader:new Set(),framebuffer:new Set(),renderbuffer:new Set()}
    for(const klass of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext]) {
      if(!klass)continue
      for(const type of Object.keys(resources)) {
        const suffix=type[0].toUpperCase()+type.slice(1)
        const create=klass.prototype[`create${suffix}`];const remove=klass.prototype[`delete${suffix}`]
        if(!create||!remove)continue
        klass.prototype[`create${suffix}`]=function(...args){const resource=create.apply(this,args);if(resource)resources[type].add(resource);return resource}
        klass.prototype[`delete${suffix}`]=function(resource){resources[type].delete(resource);return remove.call(this,resource)}
      }
    }
    globalThis.__circuitQaResources=()=>Object.fromEntries(Object.entries(resources).map(([type,items])=>[type,items.size]))
  })
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];const requests=[];const consoleErrors=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()))
  const result={browser:name,physicalDevice:false,hostBackend:'stubbed; no authenticated host coverage',renderer:name==='chromium'?'software SwiftShader':'WebKit default',status:'IN_PROGRESS',errors,consoleErrors}
  try{
    await page.goto(`${base}/?view=games&localPreview=shadow-circuit`,{waitUntil:'domcontentloaded'})
    const root=page.getByTestId('shadow-circuit');await root.waitFor({timeout:30000})
    await page.getByRole('button',{name:'Levels',exact:true}).waitFor()
    await page.screenshot({path:`${directory}/${name}-menu.png`})
    assert.equal(requests.some(url=>url.includes('vendor-babylon')),false,'Engine loaded before entering a chamber')
    await page.getByRole('button',{name:'Levels',exact:true}).click()
    await page.getByRole('button',{name:/01.*The Circuit Vestibule/}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).waitFor({timeout:30000})
    await page.getByRole('button',{name:'Enter chamber',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-screen')==='playing')
    await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-screen')==='playing')
    const initial=await root.getAttribute('data-cell')
    await page.getByRole('button',{name:'Move right',exact:true}).tap()
    await page.waitForFunction(cell=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-cell')!==cell,initial)
    result.initialCell=initial;result.movedCell=await root.getAttribute('data-cell')
    await page.screenshot({path:`${directory}/${name}-playing.png`})
    await page.getByRole('button',{name:'Pause game',exact:true}).click()
    const tick=await root.getAttribute('data-tick');await page.waitForTimeout(350)
    assert.equal(await root.getAttribute('data-tick'),tick,'Paused simulation advanced')
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    await page.getByRole('button',{name:'Focus',exact:true}).click()
    await page.getByRole('button',{name:'Rotate camera right',exact:true}).click()
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    await page.setViewportSize({width:390,height:844})
    await page.getByText('Rotate to explore',{exact:true}).waitFor()
    await page.screenshot({path:`${directory}/${name}-portrait.png`})
    await page.setViewportSize(size)
    await page.getByRole('button',{name:'Resume expedition',exact:true}).waitFor()
    await page.getByRole('button',{name:'Main menu',exact:true}).click()
    await page.getByRole('button',{name:'Continue expedition',exact:true}).waitFor()
    result.resourcesAfterExit=await page.evaluate(()=>globalThis.__circuitQaResources())
    assert.ok(Object.values(result.resourcesAfterExit).every(value=>value===0),'Game left live WebGL resources after menu exit')
    await page.reload({waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'Continue expedition',exact:true}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).waitFor()
    assert.equal(await root.getAttribute('data-cell'),result.movedCell,'Reload did not restore saved cell')
    result.reloadRestored=true
    if(process.env.SHADOW_CIRCUIT_QA_FULL==='true') {
      await page.getByRole('button',{name:'Enter chamber',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-screen')==='playing')
      await page.getByRole('button',{name:'Pause game',exact:true}).click()
      await page.getByRole('button',{name:'Main menu',exact:true}).click()
      result.inputOnlyClears=[]
      for(const solution of solutions) {
        const level=AUTHORED_LEVELS.find(level=>level.id===solution.levelId)
        await page.getByRole('button',{name:'Levels',exact:true}).click()
        await page.getByRole('button',{name:new RegExp(level.title)}).click()
        await page.getByRole('button',{name:'Enter chamber',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-screen')==='playing')
        let expected=level.actors.find(actor=>actor.kind==='player').cell
        for(const direction of expandRoute(solution.steps)) {
          expected+=[-level.width,1,level.width,-1][direction]
          await page.getByRole('button',{name:`Move ${['up','right','down','left'][direction]}`,exact:true}).tap()
          await page.waitForFunction(cell=>document.querySelector('[data-testid="shadow-circuit"]')?.getAttribute('data-cell')===String(cell),expected)
        }
        await page.getByText('Circuit complete',{exact:true}).waitFor()
        await page.getByText('Result saved on this device',{exact:true}).waitFor()
        await page.screenshot({path:`${directory}/${name}-complete-${level.number}.png`})
        result.inputOnlyClears.push(level.id)
        await page.getByRole('button',{name:'Return to menu',exact:true}).click()
      }
      await page.getByRole('button',{name:'Records',exact:true}).click()
      assert.equal(await page.locator('.circuit-record').count(),3,'Expected one result per completed run')
    }
    assert.deepEqual(errors,[])
    result.status='PASS';result.engineLazy=true;result.pauseStable=true;result.rotatePaused=true;result.checkpointAvailable=true
  }catch(error){result.status='FAIL';result.reason=error.message;result.screen=await page.locator('body').innerText({timeout:2000}).catch(()=>'(page unavailable)');await page.screenshot({path:`${directory}/${name}-failure.png`,timeout:3000}).catch(()=>undefined)}
  finally{report.push(result);await browser.close()}
}
await writeFile(`${directory}/report.json`,JSON.stringify({base,report},null,2))
console.log(JSON.stringify({directory,report},null,2))
if(report.some(r=>r.status!=='PASS'))process.exitCode=1
