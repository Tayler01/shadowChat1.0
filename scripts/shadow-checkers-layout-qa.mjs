// Real React/CSS, isolated data and Unity frame: layout/action evidence only.
// Requires the local Vite server on 4195. Never creates a ranked match.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const inspect = process.argv.includes('--inspect')
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium'
const output = `output/playwright/shadow-checkers-unity/layout-${engine}-${Date.now()}`
await mkdir(output, { recursive: true })
await writeFile(`${output}/index.html`, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="height:100dvh"></div><script type="module" src="/${output}/fixture.tsx"></script></body></html>`)
await writeFile(`${output}/fixture.tsx`, `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ShadowCheckersScreen } from '/src/features/games/shadow-checkers/ShadowCheckersScreen'
import { ComfortProvider } from '/src/hooks/useComfortPreferences'
import { createInitialBoard, serializeBoard } from '/src/features/games/shadow-checkers/engine/checkers'
import '/src/index.css'
const result = new URLSearchParams(location.search).has('result')
const active = new URLSearchParams(location.search).has('active')
const waiting = new URLSearchParams(location.search).has('waiting')
const playerOne = { id:'player-one', username:'player_one', display_name:'Player One' }
const playerTwo = { id:'player-two', username:'player_two', display_name:'Player Two' }
const board = createInitialBoard()
if (result) { board.winner='player_one'; board.winReason='all_pieces_captured'; board.stats.player_one={captures:12,kings:2} }
const match = { id:'match-1', session_id:'session-1', status:result?'completed':waiting?'waiting':'active', player_one_id:playerOne.id, player_two_id:playerTwo.id, player_one:playerOne,player_two:playerTwo,player_one_character_key:'obsidian-sentinel',player_two_character_key:'amber-vow',board_skin:'classic',current_turn_user_id:playerOne.id,board_state:serializeBoard(board),move_count:31 }
window.fixtureCalls=[]
window.checkersFixture={sessions:[],matches:waiting?[match]:[],activeMatch:result||active?match:null,queue:[],moves:[],chat:[],leaderboard:[],selectedMatchId:result||active?match.id:null,loading:false,busy:null,error:null,actions:Object.fromEntries(['create','join','submitMove','resign','cancel','queue','leaveQueue','rematch','nextChallenger','postChat','selectMatch'].map(action=>[action,async(...args)=>{window.fixtureCalls.push({action,args})}]))}
createRoot(document.getElementById('root')).render(<ComfortProvider><ShadowCheckersScreen /></ComfortProvider>)
`)
const report = { engine, inspect, scope:'Real interface; mocked auth, match data, actions and Unity frame. No backend/gameplay/performance proof.', profiles:[], errors:[] }
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless:false })
try {
  for (const profile of [{width:667,height:320,scale:100},{width:667,height:320,scale:130},{width:844,height:390,scale:130},{width:915,height:412,scale:100}]) {
    const context = await browser.newContext({...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7'],viewport:{width:profile.width,height:profile.height},serviceWorkers:'block'})
    try {
      await context.route('**/*.supabase.co/**', route=>route.abort())
      for (const [path, body] of [
        ['src/hooks/useAuth.tsx','export function useAuth(){return {user:{id:"player-one",display_name:"Player One"}}}'],
        ['src/hooks/useAdminAccess.ts','export function useAdminAccess(){return {isAdmin:false}}'],
        ['src/features/games/shadow-checkers/hooks/useShadowCheckers.ts','export function useShadowCheckers(){return window.checkersFixture}'],
      ]) await context.route(`**/${path}*`, route=>route.fulfill({contentType:'text/javascript',body}))
      await context.route('**/games/shadow-checkers/unity/frame.html*', route=>route.fulfill({contentType:'text/html',body:`<!doctype html><body style="background:#19160f;color:#b9a16f">Isolated layout fixture<script>
        addEventListener('message',event=>{if(event.origin===location.origin && event.data?.type==='snapshot')parent.postMessage({version:1,type:'presented',revision:event.data.value.revision},location.origin)})
        parent.postMessage({version:1,type:'ready'},location.origin)
      </script></body>`}))
      await context.addInitScript(scale=>localStorage.setItem('shadowchat:comfort-preferences:v1',JSON.stringify({textScale:scale})),profile.scale)
      const page = await context.newPage()
      page.on('pageerror',error=>report.errors.push(error.message))
      const entry = {...profile, measurements:[]}
      report.profiles.push(entry)
      async function measure(locator, label, touch=false) {
        const geometry = await locator.evaluate(el=>{
          const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)
          return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,viewportWidth:innerWidth,viewportHeight:innerHeight,unobstructed:top===el||el.contains(top)}
        })
        entry.measurements.push({label,...geometry})
        if(!inspect) {
          assert(geometry.x>=-1 && geometry.y>=-1 && geometry.right<=geometry.viewportWidth+1 && geometry.bottom<=geometry.viewportHeight+1,`${label} outside viewport: ${JSON.stringify(geometry)}`)
          if(touch) {assert(geometry.width>=43.9 && geometry.height>=43.9,`${label}: touch target smaller than 44px`);assert(geometry.unobstructed,`${label}: obscured`)}
        }
      }
      await page.goto(`http://127.0.0.1:4195/${output}/index.html`)
      await page.waitForFunction(scale=>document.documentElement.dataset.comfortTextScale===String(scale),profile.scale)
      await page.getByRole('button',{name:'Create Public Match',exact:true}).click()
      const dialog=page.getByRole('dialog')
      await measure(dialog,'board dialog')
      for(const name of ['Cinematic','Classic']) await measure(dialog.getByRole('button',{name:new RegExp(name)}),`${name} board choice`,true)
      await dialog.getByRole('button',{name:/Cinematic/}).click()
      await measure(dialog,'character dialog')
      const characters=dialog.locator('button').filter({has:page.locator('img')})
      assert.equal(await characters.count(),8)
      for(const character of await characters.all()) await measure(character,`character ${await character.innerText()}`,true)
      await measure(dialog.getByRole('button',{name:'Close character picker'}),'close character picker',true)
      await measure(dialog.getByRole('button',{name:'Create Match',exact:true}),'create confirmation',true)
      await dialog.getByRole('button',{name:'Corvin',exact:true}).click()
      await dialog.getByRole('button',{name:'Create Match',exact:true}).click()
      await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.action==='create'))
      entry.create=await page.evaluate(()=>window.fixtureCalls.find(call=>call.action==='create'))
      assert.deepEqual(entry.create.args,['cinder-crown','cinematic'])
      await page.goto(`http://127.0.0.1:4195/${output}/index.html?active=1`)
      const menuToggle=page.getByRole('button',{name:'Open Shadow Checkers menu'})
      await measure(menuToggle,'match menu toggle',true)
      await menuToggle.click()
      const menu=page.getByRole('region',{name:'Shadow Checkers menu',exact:true})
      await measure(menu,'scrolling match menu')
      const players=menu.getByRole('region',{name:'Players at this table'})
      for(const name of ['Player One','Player Two','Kael · To move','Seren','Silver · 12 pieces','Black · 12 pieces']) await measure(players.getByText(name,{exact:true}),name)
      for(const label of ['Rules','Play Music','Hide Last Move','Hide Hints','Resign']) {
        const action=menu.getByRole('button',{name:label,exact:true})
        await action.evaluate(element=>element.scrollIntoView({block:'nearest'}))
        await measure(action,`${label} menu action`,true)
      }
      await menu.getByRole('button',{name:'Hide Hints',exact:true}).click()
      await menu.getByRole('button',{name:'Show Hints',exact:true}).waitFor()
      await menuToggle.click()
      await menu.waitFor({state:'hidden'})
      await menuToggle.click()
      await menu.getByRole('button',{name:'Resign',exact:true}).click()
      const confirmation=page.getByRole('alertdialog')
      await measure(confirmation,'resign confirmation')
      for(const label of ['Keep playing','Resign match']) await measure(confirmation.getByRole('button',{name:label,exact:true}),label,true)
      await page.waitForFunction(()=>document.activeElement?.textContent==='Keep playing')
      await page.keyboard.press('Shift+Tab')
      await page.waitForFunction(()=>document.activeElement?.textContent==='Resign match')
      await page.keyboard.press('Escape')
      await confirmation.waitFor({state:'hidden'})
      assert.equal(await menuToggle.evaluate(element=>element===document.activeElement),true,'Focus must return to the match menu')
      assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(call=>call.action==='resign').length),0)
      await menuToggle.click()
      await menu.getByRole('button',{name:'Resign',exact:true}).click()
      await confirmation.getByRole('button',{name:'Resign match',exact:true}).click()
      await confirmation.waitFor({state:'hidden'})
      entry.resign=await page.evaluate(()=>window.fixtureCalls.filter(call=>call.action==='resign'))
      assert.deepEqual(entry.resign,[{action:'resign',args:['match-1']}])
      await page.goto(`http://127.0.0.1:4195/${output}/index.html?waiting=1`)
      await page.getByRole('button',{name:'Cancel',exact:true}).click()
      await measure(confirmation,'cancel confirmation')
      for(const label of ['Keep table','Cancel table']) await measure(confirmation.getByRole('button',{name:label,exact:true}),label,true)
      await confirmation.getByRole('button',{name:'Cancel table',exact:true}).click()
      await confirmation.waitFor({state:'hidden'})
      assert.deepEqual(await page.evaluate(()=>window.fixtureCalls.filter(call=>call.action==='cancel')),[{action:'cancel',args:['match-1']}])
      await page.goto(`http://127.0.0.1:4195/${output}/index.html?result=1`)
      await page.getByRole('heading',{name:'Victory',exact:true}).waitFor()
      const result=page.getByRole('button',{name:'Dismiss match result'})
      await measure(result.locator(':scope > div'),'result card')
      for(const value of ['Reason: All pieces captured','Moves: 31','Captures: 12','Crowns: 2']) await measure(result.getByText(value,{exact:true}),value)
      if(process.argv.includes('--capture') && profile.width===844) await page.screenshot({path:`${output}/result-landscape.png`})
      await result.click()
      await page.getByRole('button',{name:'Open Shadow Checkers menu'}).click()
      await page.getByRole('button',{name:'Rematch',exact:true}).click()
      await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.action==='rematch'))
      entry.rematch=await page.evaluate(()=>window.fixtureCalls.find(call=>call.action==='rematch'))
      assert.deepEqual(entry.rematch.args,['match-1'])
    } finally {await context.close()}
  }
  assert.deepEqual(report.errors,[])
  report.status='passed'
} catch(error) {report.status='failed';report.failure=error.stack;throw error}
finally {await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({output,status:report.status,failure:report.failure}))}
