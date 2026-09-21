import {chromium,webkit} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const out='output/playwright/shadow-circuit-terrain'
await mkdir(out,{recursive:true});const report=[]
const upper=Array(1024).fill(1),lower=Buffer.alloc(1024),word=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b}
for(let y=12;y<=20;y++)for(let x=12;x<=20;x++)upper[y*32+x]=0
for(const [x,y,tile] of [[14,14,21],[18,14,41],[16,14,50],[14,16,18],[18,16,13],[14,18,20],[18,18,19],[16,17,110]])upper[y*32+x]=tile
const title=Buffer.from('TERRAIN VISUAL CHECK\0'),extra=Buffer.concat([Buffer.from([3,title.length]),title])
const body=Buffer.concat([word(1),word(0),word(0),word(1),word(1024),Buffer.from(upper),word(1024),lower,word(extra.length),extra])
const fixture=`${out}/visual-fixture.dat`
await writeFile(fixture,Buffer.concat([Buffer.from([0xac,0xaa,2,0]),word(1),word(body.length),body]))
for(const [name,type] of [['android',chromium],['iphone',webkit]]){
  if(process.env.CIRCUIT_TERRAIN_BROWSER&&process.env.CIRCUIT_TERRAIN_BROWSER!==name)continue
  const browser=await type.launch({headless:name!=='android',...(name==='android'?{channel:'chromium',args:['--use-angle=swiftshader']}: {})})
  let page
  try{
    page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,reducedMotion:'reduce'})
    const errors=[],models=new Set();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().endsWith('.glbz')&&r.ok())models.add(r.url())})
    await page.addInitScript(()=>{const fetch=window.fetch.bind(window);window.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);return u.hostname.endsWith('.supabase.co')&&!u.pathname.startsWith('/storage/v1/object/public/game-assets/')?Promise.resolve(new Response(u.pathname.startsWith('/auth/')?'{}':'[]',{headers:{'content-type':'application/json'}})):fetch(input,init)}})
    await page.goto('http://127.0.0.1:4174/?view=games&localPreview=shadow-circuit')
    await page.getByText('ORIGINAL CAMPAIGN · 149 LEVELS',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Codes',exact:true}).click()
    await page.getByRole('textbox',{name:'Code or level password'}).fill(name==='android'?'ECBQ':'FXQO')
    await page.getByRole('button',{name:'Apply',exact:true}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).click({timeout:45000})
    await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]').dataset.screen==='playing')
    await page.screenshot({path:`${out}/${name}-original-${name==='android'?3:7}.png`})
    const root=page.getByTestId('shadow-circuit')
    if(await root.getAttribute('data-screen')==='playing')await page.getByRole('button',{name:'Pause game',exact:true}).click({timeout:1500}).catch(async e=>{if(await root.getAttribute('data-screen')!=='paused')throw e})
    await page.getByRole('button',{name:'Main menu',exact:true}).click()
    await page.getByRole('button',{name:'Levels',exact:true}).click()
    await page.locator('input[type=file]').setInputFiles(fixture)
    await page.getByRole('button',{name:/TERRAIN VISUAL CHECK/}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).click({timeout:45000})
    await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]').dataset.screen==='playing')
    await page.getByRole('button',{name:'Focus',exact:true}).click()
    await page.getByLabel('Camera tilt',{exact:true}).fill('0.001')
    await page.screenshot({path:`${out}/${name}-focus.png`})
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    await page.screenshot({path:`${out}/${name}-terrain.png`})
    assert.equal(models.size,61);assert.deepEqual(errors,[])
    report.push({name,status:'PASS',originalLevel:name==='android'?3:7,downloadedModels:models.size,fixture:true,physicalDevice:false})
  }catch(e){await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});report.push({name,status:'FAIL',error:e.message});process.exitCode=1}
  finally{await browser.close()}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
