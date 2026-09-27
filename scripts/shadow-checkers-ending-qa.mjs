// Production screen + actual Unity player + engine. Only auth/data transport is
// local, so winning these fixtures cannot change server rankings or match data.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const iphone=process.argv.includes('--webkit')
const selectedScenario=process.argv.find(value=>value.startsWith('--scenario='))?.split('=')[1]
assert(!selectedScenario || ['capture','king','reduced'].includes(selectedScenario),'Unknown ending scenario')
const output=`output/playwright/shadow-checkers-unity/ending-${iphone?'webkit':'chromium'}-${Date.now()}`
await mkdir(output,{recursive:true})
await writeFile(`${output}/index.html`,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="height:100dvh"></div><script type="module" src="/${output}/fixture.tsx"></script></body></html>`)
await writeFile(`${output}/fixture.tsx`,`
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {ShadowCheckersScreen} from '/src/features/games/shadow-checkers/ShadowCheckersScreen'
import {ComfortProvider} from '/src/hooks/useComfortPreferences'
import {createInitialBoard,serializeBoard,applyMove} from '/src/features/games/shadow-checkers/engine/checkers'
import '/src/index.css'
const king=new URLSearchParams(location.search).get('scenario')==='king'
function initial(){const board=createInitialBoard();board.pieces=king?[
 {id:'silver',owner:'player_one',row:2,col:1,king:false},{id:'black-1',owner:'player_two',row:1,col:2,king:false}
]:[{id:'silver',owner:'player_one',row:5,col:0,king:false},{id:'black-1',owner:'player_two',row:4,col:1,king:false},{id:'black-2',owner:'player_two',row:2,col:3,king:false}];return board}
window.fixtureCalls=[]
function Workshop(){
 const [board,setBoard]=useState(initial)
 const playerOne={id:'player-one',display_name:'Player One'},playerTwo={id:'player-two',display_name:'Player Two'}
 const match={id:'ending-match',session_id:'ending-session',status:board.winner?'completed':'active',player_one_id:playerOne.id,player_two_id:playerTwo.id,player_one:playerOne,player_two:playerTwo,player_one_character_key:'obsidian-sentinel',player_two_character_key:'amber-vow',board_skin:'cinematic',current_turn_user_id:board.winner?null:playerOne.id,board_state:serializeBoard(board),move_count:board.moveNumber}
 const actions=Object.fromEntries(['create','join','resign','cancel','queue','leaveQueue','rematch','nextChallenger','postChat','selectMatch'].map(action=>[action,async(...args)=>window.fixtureCalls.push({action,args})]))
 actions.submitMove=async(id,piece,path)=>{const next=applyMove(board,board.turn,piece,path).state;window.fixtureCalls.push({action:'submitMove',winner:next.winner});window.winningSnapshotAt=performance.now();setBoard(next)}
 window.checkersFixture={sessions:[],matches:[match],activeMatch:match,queue:[],moves:[],chat:[],leaderboard:[],selectedMatchId:match.id,loading:false,busy:null,error:null,actions}
 return <ShadowCheckersScreen/>
}
createRoot(document.getElementById('root')).render(<ComfortProvider><Workshop/></ComfortProvider>)
`)
const report={scope:'Production React screen, actual Unity WebGL and rules; isolated auth/data/actions, no ranked settlement.',engine:iphone?'webkit':'chromium',manifest:JSON.parse(await readFile('public/games/shadow-checkers/unity/build-manifest.json','utf8')),checks:[]}
const browser=await (iphone?webkit:chromium).launch({headless:false,...(iphone&&process.platform==='win32'?{ignoreDefaultArgs:['--disable-accelerated-compositing']}:{})})
try{
 for(const scenario of selectedScenario?[selectedScenario]:['capture','king','reduced']){
  const context=await browser.newContext({...devices[iphone?'iPhone 13':'Pixel 7'],viewport:{width:844,height:390},serviceWorkers:'block'})
  try{
   await context.route('**/*.supabase.co/**',route=>route.abort())
   for(const [path,body] of [
    ['src/hooks/useAuth.tsx','export function useAuth(){return {user:{id:"player-one"}}}'],
    ['src/hooks/useAdminAccess.ts','export function useAdminAccess(){return {isAdmin:false}}'],
    ['src/features/games/shadow-checkers/hooks/useShadowCheckers.ts','export function useShadowCheckers(){return window.checkersFixture}'],
   ])await context.route(`**/${path}*`,route=>route.fulfill({contentType:'text/javascript',body}))
   await context.addInitScript(reduced=>{
    localStorage.setItem('shadowchat:comfort-preferences:v1',JSON.stringify({motion:reduced?'none':'full'}))
    window.endingEvents=[];window.projection=null;window.pauseAt=null;window.didPause=false;window.resultAt=null
    addEventListener('message',event=>{
     if(event.origin!==location.origin||event.data?.version!==1)return
     if(event.data.type==='projection')window.projection=event.data
     if(['presented','cinematic','sound','square'].includes(event.data.type))window.endingEvents.push({...event.data,time:performance.now()})
     if(event.data.type==='cinematic'&&event.data.stage===window.pauseAt&&!window.didPause){window.didPause=true;document.querySelector('iframe').contentWindow.postMessage({version:1,type:'paused',value:true},location.origin)}
    })
    addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{
     if(window.resultAt===null&&document.querySelector('[aria-label="Dismiss match result"]'))window.resultAt=performance.now()
    }).observe(document.body,{subtree:true,childList:true}))
   },scenario==='reduced')
   const page=await context.newPage();const errors=[]
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000)
   await page.goto(`http://127.0.0.1:4195/${output}/index.html?scenario=${scenario==='reduced'?'king':scenario}`)
   await page.locator('iframe[data-ready=true]').waitFor({timeout:180000})
   await page.waitForFunction(()=>window.endingEvents.some(e=>e.type==='presented'&&e.revision===window.projection?.revision))
   await page.bringToFront();await page.waitForTimeout(750)
   if(process.argv.includes('--capture') && scenario==='capture') {
    await page.getByRole('button',{name:'Open Shadow Checkers menu'}).click()
    await page.getByRole('region',{name:'Players at this table'}).waitFor()
    await page.screenshot({path:`${output}/player-menu.png`})
    await page.getByRole('button',{name:'Open Shadow Checkers menu'}).click()
   }
   const tap=async(row,col)=>{
    const point=await page.evaluate(({row,col})=>window.projection.squares.find(p=>p.row===row&&p.col===col),{row,col})
    const rect=await page.locator('iframe').boundingBox()
    await page.touchscreen.tap(rect.x+point.x*rect.width,rect.y+point.y*rect.height)
   }
   if(scenario==='capture') {
    await page.getByRole('button',{name:'Open Shadow Checkers menu'}).click()
    const beforeDismiss=await page.evaluate(()=>({revision:window.projection.revision,squares:window.endingEvents.filter(event=>event.type==='square').length}))
    // Touch the visible player's checker behind the open menu. This first tap
    // must dismiss the menu without reaching the iframe or selecting a piece.
    await tap(5,0)
    await page.waitForTimeout(350)
    const afterDismiss=await page.evaluate(()=>({revision:window.projection.revision,squares:window.endingEvents.filter(event=>event.type==='square').length}))
    report.menuDismissal={closed:!await page.getByRole('region',{name:'Shadow Checkers menu',exact:true}).isVisible(),before:beforeDismiss,after:afterDismiss}
    assert(report.menuDismissal.closed,'A board tap outside the menu must dismiss it')
    assert.deepEqual(afterDismiss,beforeDismiss,'Dismissing the menu must not send a square or select a checker')
    await page.getByRole('button',{name:'Open Shadow Checkers menu'}).click()
    await page.getByRole('button',{name:'Resign',exact:true}).click()
    await page.getByRole('alertdialog',{name:'Leave this contest?'}).waitFor()
    await page.getByRole('button',{name:'Keep playing',exact:true}).click()
    assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(call=>call.action==='resign').length),0,'Dismissing resignation must preserve the match')
    report.resignationDismissed=true
   }
   const oldRevision=await page.evaluate(()=>window.projection.revision)
   await tap(scenario==='capture'?5:2,scenario==='capture'?0:1)
   await page.waitForFunction(revision=>window.projection.revision!==revision,oldRevision)
   if(scenario!=='reduced')await page.evaluate(stage=>window.pauseAt=stage,scenario==='king'?'kinging':'move')
   await tap(scenario==='capture'?1:0,scenario==='capture'?4:3)
   await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.action==='submitMove'&&call.winner==='player_one'))
   if(scenario!=='reduced'){
    await page.waitForFunction(()=>window.didPause)
    await page.waitForTimeout(1400)
    assert.equal(await page.getByRole('button',{name:'Dismiss match result'}).count(),0,'A paused winning animation must remain visible')
    assert.equal(await page.evaluate(()=>window.endingEvents.filter(e=>e.type==='presented'&&e.time>window.winningSnapshotAt).length),0,'No presentation acknowledgement while paused')
    await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({version:1,type:'paused',value:false},location.origin))
   }
   await page.getByRole('heading',{name:'Victory',exact:true}).waitFor()
   const timing=await page.evaluate(()=>({winningSnapshotAt:window.winningSnapshotAt,resultAt:window.resultAt,events:window.endingEvents.filter(e=>e.time>window.winningSnapshotAt)}))
   const presented=timing.events.find(e=>e.type==='presented')
   assert(presented&&timing.resultAt>=presented.time,'Result must follow presentation acknowledgement')
   if(scenario!=='reduced'){
    const lastSound=Math.max(...timing.events.filter(e=>e.type==='sound').map(e=>e.time))
    assert(presented.time>lastSound,'Result must follow final landing/capture/crown sound')
   }
   await page.getByRole('button',{name:'Dismiss match result'}).click()
   await page.getByRole('button',{name:'Open Shadow Checkers menu'}).click()
   await page.getByRole('button',{name:'Rematch',exact:true}).click()
   await page.waitForFunction(()=>window.fixtureCalls.some(call=>call.action==='rematch'&&call.args[0]==='ending-match'))
   assert.deepEqual(errors,[])
   report.checks.push({scenario,errors,timing,rematchDispatched:true})
  }finally{await context.close()}
 }
 report.status='passed'
}catch(error){report.status='failed';report.error=String(error);throw error}
finally{await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({output,status:report.status,error:report.error}))}
