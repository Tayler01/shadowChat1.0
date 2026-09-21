import {chromium,webkit} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const out='output/playwright/shadow-circuit-gestures'
await mkdir(out,{recursive:true})
const results=[]
for(const [name,type,viewport] of [['desktop',chromium,{width:1672,height:941}],['android',chromium,{width:844,height:390}],['iphone',webkit,{width:844,height:390}],['large',chromium,{width:844,height:390}],['narrow',chromium,{width:667,height:375}]]){
  if(process.env.CIRCUIT_POLISH_BROWSER&&name!==process.env.CIRCUIT_POLISH_BROWSER)continue
  const browser=await type.launch({headless:process.env.CIRCUIT_HEADED!=='true',...(type===chromium?{channel:'chromium',args:['--use-angle=swiftshader']}: {})})
  let page
  try{
    page=await browser.newPage({viewport,hasTouch:true,isMobile:name!=='desktop',reducedMotion:'reduce'})
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    await page.addInitScript(()=>{
      const originalFetch=window.fetch.bind(window)
      window.fetch=(input,init)=>{
        const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href)
        return url.hostname.endsWith('.supabase.co')&&!url.pathname.startsWith('/storage/v1/object/public/game-assets/')?Promise.resolve(new Response(url.pathname.startsWith('/auth/')?'{}':'[]',{headers:{'content-type':'application/json'}})):originalFetch(input,init)
      }
    })
    if(name==='large')await page.addInitScript(()=>localStorage.setItem('shadowchat:comfort-preferences:v1',JSON.stringify({version:1,preset:'custom',touchTarget:'large',textScale:130,motion:'reduced'})))
    await page.goto('http://127.0.0.1:4174/?view=games&localPreview=shadow-circuit')
    const root=page.getByTestId('shadow-circuit')
    await page.getByText('ORIGINAL CAMPAIGN · 149 LEVELS',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Play',exact:true}).click()
    await page.getByRole('button',{name:'Enter chamber',exact:true}).click({timeout:45000})
    await page.waitForFunction(()=>document.querySelector('[data-testid="shadow-circuit"]').dataset.screen==='playing')
    const surface=page.locator('.circuit-camera-surface'),pad=page.getByRole('group',{name:'Movement controls',exact:true})
    const area=await surface.boundingBox(),padBox=await pad.boundingBox()
    const header=await page.locator('.circuit-game-topline').evaluate(e=>{
      const parts=[...e.children].filter(c=>getComputedStyle(c).display!=='none').map(c=>{const r=c.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}})
      const hud=e.querySelector('.circuit-hud')
      return {parts,overflow:hud.scrollWidth>hud.clientWidth+1}
    })
    assert.equal(header.overflow,false,'HUD contents overflow')
    assert.equal(header.parts.length,3)
    assert.ok(header.parts.every((r,i)=>r.left>=0&&r.right<=viewport.width&&Math.abs(r.top-header.parts[0].top)<1&&Math.abs(r.height-header.parts[0].height)<1&&(i===0||r.left-header.parts[i-1].right>=7)),'Header spacing or alignment failed')
    assert.equal(area.x,0);assert.equal(area.width,viewport.width/2);assert.equal(area.height,viewport.height)
    assert.ok(padBox.x>viewport.width/2,'Movement must be on right')
    assert.equal(await page.locator('.circuit-camera-console,.circuit-zoom').count(),0)
    const view=()=>root.evaluate(e=>({heading:Number(e.dataset.heading),tilt:Number(e.dataset.tilt),zoom:Number(e.dataset.zoom),tick:Number(e.dataset.tick)}))
    const x=area.width*.3,y=area.height*.6
    await page.screenshot({path:`${out}/${name}-layout.png`})
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+31,y+23,{steps:12})
    const small=await view();assert.ok(small.heading>0&&small.heading<1&&small.heading%1!==0)
    assert.ok(small.tilt>.64)
    await page.mouse.move(viewport.width*.7,y,{steps:15});await page.mouse.up()
    const stable=await view();assert.ok(stable.heading>small.heading)
    await page.waitForTimeout(200);assert.equal((await view()).heading,stable.heading)
    for(const target of [-1000,2000]){
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,target,{steps:15});await page.mouse.up()
      assert.ok(Math.abs((await view()).tilt-(target<0?.001:Math.PI/2))<1e-6)
    }
    await page.getByRole('button',{name:'Focus',exact:true}).click()
    await page.getByRole('button',{name:'Reset camera',exact:true}).click()
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    await page.mouse.move(viewport.width*.6,y);await page.mouse.down();await page.mouse.move(viewport.width*.65,y+20);await page.mouse.up()
    assert.equal((await view()).heading,0)
    // Original rules start the game clock on the first movement.
    if(type===webkit&&await root.getAttribute('data-screen')==='paused'){
      await page.getByText('Paused after a long frame interruption.',{exact:true}).waitFor()
      console.log(`${name}: explicit resume after software-renderer stall`)
      await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    }
    await page.getByRole('button',{name:'Move right',exact:true}).tap()
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="shadow-circuit"]').dataset.tick)>0)
    const tickBefore=(await view()).tick
    if(type===chromium){
      const cdp=await page.context().newCDPSession(page)
      const point=(id,x,y)=>({id,x,y,radiusX:5,radiusY:5,force:1})
      const moveBox=await page.getByRole('button',{name:'Move right',exact:true}).boundingBox()
      const movement=point(3,moveBox.x+moveBox.width/2,moveBox.y+moveBox.height/2)
      const a=point(1,area.width*.2,y),b=point(2,area.width*.6,y)
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b,movement]})
      await page.waitForTimeout(120)
      for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[a,{...b,x:b.x+i*4},movement]})
      assert.ok((await view()).zoom<4.5);assert.equal((await view()).heading,0)
      assert.equal(await page.getByRole('button',{name:'Move right',exact:true}).getAttribute('aria-pressed'),'true')
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
      await page.waitForFunction(()=>document.querySelectorAll('.circuit-direction[aria-pressed="true"]').length===0)
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[b]})
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,x:b.x+12}]})
      await page.waitForFunction(()=>Number(document.querySelector('[data-testid="shadow-circuit"]').dataset.heading)>0)
      assert.ok((await view()).heading<1)
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
      await cdp.detach()
    }else{
      // Windows WebKit has no multi-touch injector. Only this part uses synthetic pointer events.
      if(await root.getAttribute('data-screen')==='paused'){
        await page.getByText('Paused after a long frame interruption.',{exact:true}).waitFor()
        console.log(`${name}: recovered the frame-stall pause before synthetic pinch`)
        await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
      }
      await surface.evaluate(e=>{
        const fire=(type,id,x,y)=>e.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}))
        const capture=e.setPointerCapture;e.setPointerCapture=()=>{}
        fire('pointerdown',1,70,200);fire('pointerdown',2,170,200);fire('pointermove',2,210,200)
        fire('pointerup',1,70,200);fire('pointermove',2,220,200);fire('pointercancel',2,220,200)
        e.setPointerCapture=capture
      })
      assert.ok((await view()).zoom<4.5);assert.ok((await view()).heading>0)
    }
    await page.waitForTimeout(200)
    assert.ok((await view()).tick>tickBefore,'Camera changes must not reset the simulation clock')
    await page.screenshot({path:`${out}/${name}-controls.png`})
    if(await root.getAttribute('data-screen')==='paused'){
      await page.getByText('Paused after a long frame interruption.',{exact:true}).waitFor()
      console.log(`${name}: screenshot triggered frame-stall protection; confirmed paused`)
    }else await page.getByRole('button',{name:'Pause game',exact:true}).click()
    await surface.waitFor({state:'detached'})
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByLabel('Left-handed layout',{exact:true}).check()
    await page.getByRole('button',{name:'Back',exact:true}).click()
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    assert.equal((await surface.boundingBox()).x,viewport.width/2);assert.ok((await pad.boundingBox()).x<viewport.width/2)
    await page.getByRole('button',{name:'Pause game',exact:true}).click()
    await page.getByRole('button',{name:'Settings',exact:true}).click()
    await page.getByLabel('Left-handed layout',{exact:true}).uncheck()
    await page.getByRole('button',{name:'Back',exact:true}).click()
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    const final=await view()
    await page.setViewportSize({width:390,height:844})
    await page.getByText('Rotate to explore',{exact:true}).waitFor();await surface.waitFor({state:'detached'})
    await page.setViewportSize(viewport)
    await page.getByRole('button',{name:'Resume expedition',exact:true}).click()
    assert.equal((await view()).heading,final.heading);assert.deepEqual(errors,[])
    results.push({name,status:'PASS',freeOrbit:true,fullTiltRange:true,independentThumbs:type===chromium,pinch:type===chromium?'browser touch input':'synthetic PointerEvent path',lifecycle:true,physicalDevice:false})
  }catch(error){console.error(name,error.stack);await page?.screenshot({path:`${out}/${name}-failure.png`}).catch(()=>{});results.push({name,status:'FAIL',error:error.message});process.exitCode=1}
  finally{await browser.close()}
}
await writeFile(`${out}/report.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2))
