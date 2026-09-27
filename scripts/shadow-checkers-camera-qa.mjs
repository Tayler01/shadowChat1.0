import { chromium, webkit, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const iphone=process.argv.includes('--webkit')
const output=`output/playwright/shadow-checkers-unity/camera-${iphone?'webkit':'chromium'}-${Date.now()}`
await mkdir(output,{recursive:true})
const report={engine:iphone?'webkit':'chromium',status:'running',errors:[],checks:[]}
const browser=await (iphone?webkit:chromium).launch({headless:false,...(iphone?{ignoreDefaultArgs:['--disable-accelerated-compositing']}:{})})
try {
  const context=await browser.newContext({...devices[iphone?'iPhone 13':'Pixel 7'],viewport:{width:915,height:412},serviceWorkers:'block'})
  const page=await context.newPage()
  page.setDefaultTimeout(45000)
  page.on('pageerror',error=>report.errors.push(error.message))
  await page.addInitScript(()=>{
    window.cameraQA={projection:null,squares:0}
    window.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.data?.version!==1)return
      if(event.data.type==='projection')window.cameraQA.projection=event.data.squares
      if(event.data.type==='square')window.cameraQA.squares++
    })
  })
  await page.goto('http://127.0.0.1:4195/output/shadow-checkers-cinematic-preview.html?camera-controls')
  await page.locator('iframe[data-ready=true]').waitFor({timeout:180000})
  const reset=async()=>{
    await page.getByRole('button',{name:'Camera help',exact:true}).click()
    await page.getByRole('button',{name:'Reset table camera'}).click()
    await page.waitForTimeout(400)
  }
  await reset();await page.bringToFront();await page.waitForTimeout(750)
  const projection=()=>page.evaluate(()=>window.cameraQA.projection)
  const width=points=>Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))
  const zone=page.getByRole('group',{name:/Camera: drag/})
  let bounds=await zone.boundingBox()
  const before=await projection()
  await page.mouse.move(bounds.x+bounds.width*.35,bounds.y+bounds.height*.45)
  await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.7,bounds.y+bounds.height*.65,{steps:18});await page.mouse.up()
  await page.waitForTimeout(300)
  assert.notDeepEqual(await projection(),before,'Dragging must reach the Unity camera')
  assert.equal(await page.evaluate(()=>window.cameraQA.squares),0,'Camera drag must not select a checker')
  report.checks.push('actual pointer drag changes Unity projection without board input')
  await reset()
  await zone.focus()
  for(let step=0;step<15;step++)await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  const middleTilt=await projection()
  for(let step=0;step<10;step++)await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  assert.notDeepEqual(await projection(),middleTilt,'Tilt must continue past the old ceiling-induced plateau')
  const steepWidth=width(await projection())
  await page.keyboard.press('+');await page.keyboard.press('+');await page.keyboard.press('+')
  await page.waitForTimeout(200)
  assert(width(await projection())>steepWidth*1.04,'Zoom must still work near the ceiling')
  report.checks.push('steep tilt continues beyond 42 degrees and zoom remains responsive')
  await reset()
  const initialWidth=width(await projection())
  bounds=await zone.boundingBox()
  if(!iphone){
    const session=await context.newCDPSession(page)
    const x=bounds.x+bounds.width*.5,y=bounds.y+bounds.height*.5
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y:y-35,id:1},{x:x+25,y:y+35,id:2}]})
    for(let i=1;i<=8;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-25-i*2,y:y-35-i*3,id:1},{x:x+25+i*2,y:y+35+i*3,id:2}]})
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach()
    report.checks.push('two-finger browser touch pinch zooms the Unity camera')
  }else{
    // Playwright cannot inject a wheel into its mobile WebKit context.
    await zone.focus()
    await page.keyboard.press('+');await page.keyboard.press('+');await page.keyboard.press('+')
    report.checks.push('WebKit keyboard zoom reaches Unity; two-finger membership covered by shared gesture tests')
  }
  await page.waitForTimeout(400)
  assert(width(await projection())>initialWidth*1.04,'Zoom in must enlarge the board')
  assert.equal(await page.evaluate(()=>window.cameraQA.squares),0)
  await reset()
  for(const size of [{width:915,height:412},{width:667,height:320}]){
    await page.setViewportSize(size);await page.waitForTimeout(500)
    const left=await zone.boundingBox(),board=await page.locator('iframe').boundingBox()
    assert(Math.abs(left.x-board.x)<1,'Invisible gestures must overlay the left of the room')
    assert(Math.abs(board.width-size.width)<2,'The room must fill the entire game width')
    assert(Math.abs(left.height-board.height)<1,'Gesture area must occupy the full height')
    const appearance=await zone.evaluate(element=>{const style=getComputedStyle(element);return {text:element.textContent,background:style.backgroundColor,image:style.backgroundImage,border:style.borderRightWidth}})
    assert.deepEqual(appearance,{text:'',background:'rgba(0, 0, 0, 0)',image:'none',border:'0px'},'Gesture area must have no visible panel, labels or border')
    assert((await projection()).every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1),'Reset view must show all squares')
    assert((await projection()).filter(p=>(p.row+p.col)%2===1).every(p=>board.x+p.x*board.width>left.x+left.width),'Default playable squares must clear the invisible camera area')
    for(const name of ['Camera help','Study sound','Accessible board']){
      const b=await page.getByRole('button',{name,exact:true}).boundingBox()
      assert(b.width>=44&&b.height>=44&&b.x+b.width<=size.width&&b.y+b.height<=size.height)
    }
    report.checks.push(`${size.width}x${size.height}: invisible full-height camera overlay, full-width room, playable squares clear, 44px corner targets`)
  }
  await page.getByRole('button',{name:'Camera help',exact:true}).click()
  await page.getByRole('button',{name:'Overhead',exact:true}).click()
  await page.waitForTimeout(300)
  assert((await projection()).every(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1))
  await reset()
  await page.setViewportSize({width:915,height:412});await page.waitForTimeout(300)
  if(process.argv.includes('--capture'))await page.screenshot({path:`${output}/controls.png`})
  assert.equal(report.errors.length,0,report.errors.join('\n'))
  report.status='passed'
}catch(error){report.status='failed';report.error=String(error);throw error}
finally{await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report}))}
