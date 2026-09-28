// Real React/CSS, isolated data and Unity frame: layout/action evidence only.
// Requires the local Vite server on 4195. Never creates a ranked match.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const inspect = process.argv.includes('--inspect')
const branding = process.argv.includes('--branding')
const chatPreview = process.argv.includes('--chat-preview')
const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium'
const output = `output/playwright/shadow-checkers-unity/layout-${engine}-${Date.now()}`
await mkdir(output, { recursive: true })
await writeFile(`${output}/index.html`, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="height:100dvh"></div><script type="module" src="/${output}/fixture.tsx"></script></body></html>`)
await writeFile(`${output}/fixture.tsx`, `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { ShadowCheckersScreen } from '/src/features/games/shadow-checkers/ShadowCheckersScreen'
import { ComfortProvider } from '/src/hooks/useComfortPreferences'
import { createInitialBoard, serializeBoard } from '/src/features/games/shadow-checkers/engine/checkers'
import '/src/index.css'
import '/src/features/games/shadow-checkers/components/shadow-checkers-invitations.css'
const result = new URLSearchParams(location.search).has('result')
const active = new URLSearchParams(location.search).has('active')
const accepted = new URLSearchParams(location.search).has('accepted')
const waiting = new URLSearchParams(location.search).has('waiting')
const queued = new URLSearchParams(location.search).has('queued')
const playerOne = { id:'player-one', username:'player_one', display_name:'Player One' }
const playerTwo = { id:'player-two', username:'player_two', display_name:'Player Two' }
const board = createInitialBoard()
if (result) { board.winner='player_one'; board.winReason='all_pieces_captured'; board.stats.player_one={captures:12,kings:2} }
const match = { id:'match-1', session_id:'session-1', status:result?'completed':waiting?'waiting':'active', player_one_id:playerOne.id, player_two_id:playerTwo.id, player_one:playerOne,player_two:playerTwo,player_one_character_key:'obsidian-sentinel',player_two_character_key:'amber-vow',board_skin:'classic',current_turn_user_id:playerOne.id,board_state:serializeBoard(board),move_count:31 }
window.fixtureCalls=[]
window.failNextChat=false
window.checkersFixture={sessions:[{id:'session-1'}],matches:queued?[]:waiting?[match]:active||result?[]:[match,{...match,id:'match-2'},{...match,id:'match-3'}],activeMatch:result||active?match:null,queue:[],myQueuedSessionIds:queued?['session-completed']:[],moves:[],chat:[1,2,3,4,5].map(index=>({id:'chat-'+index,user:playerTwo,body:'Message '+index})),leaderboard:[1,2,3,4,5].map(index=>({user_id:'rank-'+index,wins:6-index,losses:index,total_games:6,user:{display_name:'Rank '+index}})),selectedMatchId:result||active?match.id:null,loading:false,busy:null,error:null,actions:Object.fromEntries(['create','join','submitMove','resign','cancel','queue','leaveQueue','rematch','nextChallenger','postChat','selectMatch'].map(action=>[action,async(...args)=>{window.fixtureCalls.push({action,args});if(action==='postChat'&&window.failNextChat){window.failNextChat=false;throw new Error('Connection lost')}}]))}
createRoot(document.getElementById('root')).render(<ComfortProvider><ShadowCheckersScreen />{accepted && createPortal(<div className="checkers-invite-accepted" role="status"><span>Player Two joined your Shadow Checkers match.</span><button type="button">Open match</button><button type="button" aria-label="Dismiss match notice">×</button></div>,document.body)}</ComfortProvider>)
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
        ['src/features/games/shadow-checkers/hooks/useShadowCheckersInvitations.ts','export function useShadowCheckersInvitations(){return {eligibleUsers:[{user_id:"player-two",display_name:"Player Two"}],outgoing:[],busy:null,error:null,send:async(...args)=>{window.fixtureCalls.push({action:"invite",args});return {direction:"outgoing"}},cancel:async()=>{}}}'],
      ]) await context.route(`**/${path}*`, route=>route.fulfill({contentType:'text/javascript',body}))
      await context.route('**/games/shadow-checkers/unity/frame.html*', route=>route.fulfill({contentType:'text/html',body:`<!doctype html><body style="background:#19160f;color:#b9a16f">Isolated layout fixture<script>
        addEventListener('message',event=>{if(event.origin!==location.origin)return;if(event.data?.type==='snapshot')parent.postMessage({version:1,type:'presented',revision:event.data.value.revision},location.origin);if(event.data?.type==='camera'&&event.data.value==='reset')parent.postMessage({version:1,type:'cinematic',busy:false},location.origin)})
        setTimeout(()=>{parent.postMessage({version:1,type:'ready'},location.origin);setTimeout(()=>parent.postMessage({version:1,type:'cinematic',busy:true,stage:'intro'},location.origin),50)},${branding ? 1500 : 0})
      </script></body>`}))
      await context.addInitScript(scale=>localStorage.setItem('shadowchat:comfort-preferences:v1',JSON.stringify({textScale:scale})),profile.scale)
      const page = await context.newPage()
      const captureBrand = async name => {
        if (branding && profile.width === 667 && profile.scale === 130) await page.screenshot({path:`${output}/brand-${name}.png`})
      }
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
      assert.equal(await page.locator('#root > div').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)','Checkers page must be black')
      await page.getByRole('img',{name:'Shadow Checkers'}).first().waitFor()
      await captureBrand('tables')
      if (branding && profile.width === 667 && profile.scale === 130) {
        await page.setViewportSize({width:320,height:667})
        const rotate = page.getByRole('dialog',{name:'Rotate phone to play'})
        await rotate.waitFor()
        assert.equal(await rotate.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(0, 0, 0)','Rotate gate must be black')
        await rotate.getByRole('img',{name:'Shadow Checkers'}).evaluate(img=>img.decode())
        await page.setViewportSize({width:profile.width,height:profile.height})
        await rotate.waitFor({state:'hidden'})
      }
      const pageSize = async () => page.evaluate(() => ({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,viewportWidth:innerWidth,viewportHeight:innerHeight}))
      const assertNoPageScroll = async label => {
        const size=await pageSize();entry.measurements.push({label,...size})
        if(!inspect) assert(size.width<=size.viewportWidth+1 && size.height<=size.viewportHeight+1,`${label}: page scroll ${JSON.stringify(size)}`)
      }
      const assertPanelFits = async label => {
        const panel=page.getByRole('tabpanel')
        const size=await panel.evaluate(el=>({clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}))
        entry.measurements.push({label,...size})
        if(!inspect) assert(size.scrollHeight<=size.clientHeight+1 && size.scrollWidth<=size.clientWidth+1,`${label}: clipped tab content ${JSON.stringify(size)}`)
      }
      const assertLastEntryFits = async (selector,label) => {
        const entryBox=await page.locator(selector).last().boundingBox()
        const panelBox=await page.getByRole('tabpanel').boundingBox()
        const details=await page.locator(selector).last().evaluate(el=>({viewport:`${innerWidth}x${innerHeight}`,landscape:matchMedia('(orientation: landscape) and (max-height: 390px)').matches,players:getComputedStyle(el.querySelector('.checkers-lobby-card-players')||el).display,children:[...el.children].map(child=>({height:child.getBoundingClientRect().height,display:getComputedStyle(child).display}))}))
        assert(entryBox && panelBox && entryBox.y>=panelBox.y-1 && entryBox.y+entryBox.height<=panelBox.y+panelBox.height+1,`${label}: last visible entry clipped ${JSON.stringify({entryBox,panelBox,details})}`)
      }
      await assertNoPageScroll('lobby page bounds')
      await assertPanelFits('first table panel fits')
      await assertLastEntryFits('[data-checkers-match-id]','first table card')
      await measure(page.getByRole('button',{name:'Create Public Match',exact:true}),'create table',true)
      await measure(page.getByRole('tab',{name:'Hall of Fame'}),'Hall of Fame tab',true)
      await page.getByRole('tab',{name:'Hall of Fame'}).click()
      await page.getByText('Rank 1').waitFor()
      await captureBrand('fame')
      assert.equal(await page.getByText('Rank 2').count(),0)
      await assertPanelFits('Hall of Fame panel fits')
      await assertLastEntryFits('[data-checkers-rank]','first Hall of Fame entry')
      await page.getByRole('button',{name:'Next page'}).click()
      await page.getByText('Rank 2').waitFor()
      await assertPanelFits('second Hall of Fame panel fits')
      await assertLastEntryFits('[data-checkers-rank]','second Hall of Fame entry')
      await assertNoPageScroll('Hall of Fame page bounds')
      await page.getByRole('tab',{name:'Players'}).click()
      const picker=page.getByRole('region',{name:'Invite a ShadowChat member'})
      const memberSelect=picker.getByRole('combobox',{name:'Invite someone online'})
      await memberSelect.evaluate(element=>element.scrollIntoView({block:'nearest'}))
      await measure(memberSelect,'invite member selection',true)
      await picker.getByRole('button',{name:'Invite'}).evaluate(element=>element.scrollIntoView({block:'nearest'}))
      await measure(picker.getByRole('button',{name:'Invite'}),'invite member action',true)
      await assertPanelFits('Players panel fits')
      await memberSelect.selectOption('player-two')
      await picker.getByRole('button',{name:'Invite'}).click()
      const invitation=page.getByRole('dialog',{name:'Choose private challenge'})
      await measure(invitation.getByRole('combobox',{name:'Invitation board'}),'invitation board choice',true)
      await measure(invitation.getByRole('combobox',{name:'Invitation character'}),'invitation character choice',true)
      await measure(invitation.getByRole('button',{name:'Send Invitation'}),'send invitation',true)
      await invitation.getByRole('combobox',{name:'Invitation board'}).selectOption('cinematic')
      await invitation.getByRole('combobox',{name:'Invitation character'}).selectOption('cinder-crown')
      await invitation.getByRole('button',{name:'Send Invitation'}).click()
      await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.action==='invite'))
      assert.deepEqual(await page.evaluate(()=>window.fixtureCalls.find(call=>call.action==='invite').args),['player-two','cinder-crown','cinematic'])
      await captureBrand('players')
      await assertNoPageScroll('Players page bounds')
      await page.getByRole('tab',{name:'Tables'}).click()
      for (const expected of ['1 / 3','2 / 3','3 / 3']) {
        assert.equal(await page.locator('text='+expected).count(),1)
        if(expected!=='3 / 3') await page.getByRole('button',{name:'Next page'}).click()
      }
      await page.getByRole('button',{name:'Previous page'}).click()
      await page.getByRole('button',{name:'Previous page'}).click()
      await assertPanelFits('paged table panel fits')
      await assertLastEntryFits('[data-checkers-match-id]','paged table card')
      await assertNoPageScroll('paged tables bounds')
      await page.goto(`http://127.0.0.1:4195/${output}/index.html?queued=1`)
      await page.getByText('Waiting for next match').waitFor()
      await assertPanelFits('completed queue panel fits')
      await assertLastEntryFits('[data-checkers-queue-session]','completed queue card')
      await measure(page.getByRole('button',{name:'Leave Queue'}),'completed queue leave',true)
      await page.getByRole('button',{name:'Leave Queue'}).click()
      await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.action==='leaveQueue'))
      assert.deepEqual(await page.evaluate(()=>window.fixtureCalls.find(call=>call.action==='leaveQueue').args),['session-completed'])
      await page.goto(`http://127.0.0.1:4195/${output}/index.html`)
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
      await page.goto(`http://127.0.0.1:4195/${output}/index.html?active=1${profile.width===915?'&accepted=1':''}`)
      if (profile.width===915) {
        const acceptedNotice=page.locator('.checkers-invite-accepted')
        const skip=page.getByRole('button',{name:'Skip room reveal'})
        await acceptedNotice.waitFor()
        await skip.waitFor()
        await measure(acceptedNotice.getByRole('button',{name:'Open match'}),'accepted match action',true)
        await measure(skip,'Skip room reveal despite accepted toast',true)
        const noticeBox=await acceptedNotice.boundingBox(),skipBox=await skip.boundingBox()
        assert(noticeBox && skipBox && noticeBox.y+noticeBox.height<skipBox.y,'accepted toast must clear bottom-right Skip control')
        await skip.click()
        await skip.waitFor({state:'hidden'})
      }
      if (branding && profile.width === 667 && profile.scale === 130) {
        await page.getByRole('img',{name:'Shadow Checkers'}).evaluate(img=>img.decode())
        await page.getByText('Preparing your table').waitFor()
      }
      await captureBrand('match')
      await assertNoPageScroll('match page bounds')
      assert.equal(await page.locator('header').count(),0,'match must have no top bar')
      const recent=page.getByRole('region',{name:'Recent match chat'})
      const feedStyle=await recent.evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,messageBackground:getComputedStyle(el.querySelector('p')).backgroundColor}))
      assert.equal(feedStyle.background,'rgba(0, 0, 0, 0)','recent messages must be plain text with no feed card')
      assert.equal(feedStyle.border,'0px','recent messages must have no feed border')
      assert.equal(feedStyle.messageBackground,'rgba(0, 0, 0, 0)','individual messages must have no bubbles')
      if (await page.getByText('Preparing your table').isVisible()) {
        assert.equal(await recent.evaluate(el=>{const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===el||el.contains(top)}),false,'Loading panel must cover the recent feed until the table is ready')
      }
      assert.equal(await recent.getByText('Message 5').count(),1)
      assert.equal(await recent.getByText('Message 1').count(),0)
      const chatToggle=page.getByRole('button',{name:'Open match chat'})
      await measure(chatToggle,'chat toggle',true)
      await chatToggle.click()
      assert.equal(await recent.count(),0,'plain text feed must clear while the compact composer is open')
      if (await page.getByText('Preparing your table').isVisible()) {
        const note = await page.getByText(/first visit may take a moment/).boundingBox()
        const composerTop = await page.getByRole('region',{name:'Match chat composer'}).boundingBox()
        assert(note && composerTop && note.y + note.height < composerTop.y,'Loading status must clear the chat composer')
      }
      await captureBrand('composer')
      const composer=page.getByRole('region',{name:'Match chat composer'})
      await measure(composer,'compact composer')
      const draft=composer.getByRole('textbox',{name:'Match message'})
      await measure(draft,'message input',true)
      const fontSize=await draft.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))
      entry.composerInputFontPx=fontSize
      assert(fontSize>=16,`focused message input below iOS no-zoom threshold: ${fontSize}px`)
      const sendButton=composer.getByRole('button',{name:'Send match message'})
      assert.equal((await sendButton.textContent()).trim(),'Send','submit action must have visible Send text')
      await measure(sendButton,'visible Send action',true)
      assert.equal(await page.evaluate(()=>visualViewport?.scale??1),1,'opening composer must not zoom viewport')
      await draft.fill('Browser chat')
      if (chatPreview) {
        await page.screenshot({path:`${output}/chat-composer-landscape.png`})
        break
      }
      await page.evaluate(platform=>{
        document.documentElement.dataset.shadowchatKeyboard='open'
        document.documentElement.dataset.shadowchatMobilePlatform=platform
      },engine==='webkit'?'ios':'android')
      await page.setViewportSize({width:profile.width,height:Math.max(240,profile.height-80)})
      await measure(draft,'message input with simulated keyboard',true)
      await measure(composer.getByRole('button',{name:'Send match message'}),'send with simulated keyboard',true)
      await assertNoPageScroll('keyboard-compressed match bounds')
      await page.setViewportSize({width:profile.width,height:profile.height})
      await page.evaluate(()=>{
        delete document.documentElement.dataset.shadowchatKeyboard
        delete document.documentElement.dataset.shadowchatMobilePlatform
      })
      await page.evaluate(()=>{window.failNextChat=true})
      await composer.getByRole('button',{name:'Send match message'}).click()
      await composer.getByRole('alert').getByText('Connection lost').waitFor()
      assert.equal(await draft.inputValue(),'Browser chat','failed send keeps draft')
      await composer.getByRole('button',{name:'Send match message'}).click()
      await composer.waitFor({state:'hidden'})
      assert.equal(await page.evaluate(()=>document.activeElement?.tagName==='INPUT'),false,'successful send dismisses keyboard focus')
      assert.equal(await page.evaluate(()=>visualViewport?.scale??1),1,'successful send must leave viewport at normal scale')
      await page.getByRole('button',{name:'Open match chat'}).click()
      await page.getByRole('button',{name:'Close match chat'}).first().click()
      await composer.waitFor({state:'hidden'})
      assert.equal(await page.evaluate(()=>visualViewport?.scale??1),1,'closing composer must leave viewport at normal scale')
      await assertNoPageScroll('match after chat bounds')
      const menuToggle=page.getByRole('button',{name:'Open Shadow Checkers menu'})
      await measure(menuToggle,'match menu toggle',true)
      await menuToggle.click()
      await captureBrand('menu')
      const menu=page.getByRole('region',{name:'Shadow Checkers menu',exact:true})
      await measure(menu,'scrolling match menu')
      const players=menu.getByRole('region',{name:'Players at this table'})
      for(const name of ['Player One','Player Two','Kael · To move','Seren','Silver · 12 pieces','Black · 12 pieces']) {
        const detail=players.getByText(name,{exact:true})
        await detail.evaluate(element=>element.scrollIntoView({block:'nearest'}))
        await measure(detail,name)
      }
      for(const label of ['Back to Shadow Checkers lobby','Rules','Camera help','Toggle accessible board','Master Sound: On','Piece Sounds: On','Chat Feed: Shown','Music: Off','Hide Last Move','Hide Hints','Resign']) {
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
