import {chromium,webkit} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const out='output/playwright/shadow-circuit-progression'
await mkdir(out,{recursive:true})
const report=[]
for(const [name,type] of [['android',chromium],['iphone',webkit]]){
  const browser=await type.launch({headless:true})
  try{
    const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true})
    await page.route(url=>url.hostname.endsWith('.supabase.co'),route=>route.fulfill({contentType:'application/json',body:route.request().url().includes('/auth/')?'{}':'[]'}))
    await page.goto('http://127.0.0.1:4175/?view=games&localPreview=shadow-circuit')
    await page.getByRole('button',{name:'Levels',exact:true}).click()
    await page.getByRole('button',{name:'Unlock level 2: A Bridge of Stone',exact:true}).click()
    await page.getByRole('textbox',{name:'Code or level password'}).fill('wrong')
    await page.getByRole('button',{name:'Apply',exact:true}).click()
    await page.getByText('That password does not unlock this level.',{exact:true}).waitFor()
    await page.getByRole('textbox',{name:'Code or level password'}).fill('brdg')
    await page.getByRole('button',{name:'Apply',exact:true}).click()
    await page.getByRole('button',{name:/^02 A Bridge of Stone/}).waitFor()
    await page.reload()
    await page.getByRole('button',{name:'Levels',exact:true}).click()
    await page.getByRole('button',{name:/^02 A Bridge of Stone/}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Unlock level 3: The Frost Conduit',exact:true}).count(),1)
    await page.screenshot({path:`${out}/${name}-levels.png`})
    await page.getByRole('button',{name:'Back',exact:true}).click()
    await page.setViewportSize({width:390,height:844})
    await page.getByRole('button',{name:'Enable landscape',exact:true}).waitFor()
    await page.screenshot({path:`${out}/${name}-rotation-gate.png`})
    report.push({name,status:'PASS',wrongCodeRejected:true,passwordPersisted:true,laterLevelStillLocked:true,portraitGate:true,physicalDevice:false})
  }catch(error){report.push({name,status:'FAIL',error:error.message});process.exitCode=1}finally{await browser.close()}
}
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
