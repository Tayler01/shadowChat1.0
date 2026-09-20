import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowDown, ArrowRight, ArrowUp, Compass, Crown, KeyRound, Pause, Play, LayoutGrid, LockKeyhole, RotateCcw, Settings, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { useLandscapeGate } from '../shared/useLandscapeGate'
import { AUTHORED_LEVELS } from './content/authoredLevels.ts'
import { normalizeLegacyLevel, parseLegacyDat } from './content/legacyDat.ts'
import { cloneState, createState, playerOf, restore, snapshot, step } from './core/simulation.ts'
import { CLEAN_ASSISTS, screenDirection, type AssistOptions, type CircuitLevel, type CircuitState, type Direction } from './core/types.ts'
import { SimulationClock } from './core/clock.ts'
import { IntentBuffer, padSector } from './input/intentBuffer.ts'
import { DEFAULT_SETTINGS, loadProfile, saveCheckpoint, saveResult, saveSettings, unlockLevel, type CircuitSettings, type DeviceProfile } from './persistence/deviceStore.ts'
import type { CircuitScene } from './renderer/circuitScene'
import { isLevelOpen, levelIdentity, passwordMatch } from './content/progression.ts'
import { CircuitAudio } from './audio/circuitAudio'
import './ui/circuit.css'
import './ui/classic.css'
import './ui/brand.css'
import menuBackground from './assets/branding/menu-background.webp'
import brandLogo from './assets/branding/logo.webp'
import { enterCircuitLandscape, leaveCircuitLandscape } from './ui/landscape'

type Screen = 'menu' | 'levels' | 'intro' | 'loading' | 'playing' | 'paused' | 'focus' | 'results' | 'dead' | 'settings' | 'guide' | 'records' | 'codes' | 'credits' | 'error' | 'restart'
type Props = { onExit: () => void }
const KEY_DIRECTIONS:Record<string,Direction>={ArrowUp:0,w:0,ArrowRight:1,d:1,ArrowDown:2,s:2,ArrowLeft:3,a:3}
const INITIAL = createState(AUTHORED_LEVELS[0])
const ORIGINAL_HASH='b0a68f21642447385512e0ed9386a4a13a4f7e9a38f909da772104d8e6b5c1fb'
async function decodePack(bytes:Uint8Array<ArrayBuffer>) {
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
  return parseLegacyDat(bytes).levels.map(r=>normalizeLegacyLevel(r,hash,hash===ORIGINAL_HASH?'mscc-original':'imported'))
}

export function ShadowCircuitScreen(props:Props) {
  const { user }=useAuth()
  const owner=user?`user:${user.id}`:'guest:device'
  return <CircuitSession key={owner} owner={owner} {...props}/>
}

function CircuitSession({owner,onExit}:Props&{owner:string}) {
  const {effectivePreferences:comfort}=useComfortPreferences()
  const portrait=useLandscapeGate()
  const [screen,setScreen]=useState<Screen>('menu')
  const [level,setLevel]=useState(AUTHORED_LEVELS[0]);const [state,setState]=useState(INITIAL)
  const [levels,setLevels]=useState(AUTHORED_LEVELS);const [settings,setSettings]=useState<CircuitSettings>(DEFAULT_SETTINGS)
  const [profile,setProfile]=useState<DeviceProfile|null>(null);const [saveStatus,setSaveStatus]=useState('Opening device save…')
  const [error,setError]=useState('');const [loading,setLoading]=useState('Opening the 3D engine…')
  const [passwordTarget,setPasswordTarget]=useState<CircuitLevel|null>(null)
  const [musicName,setMusicName]=useState('Circuit Steps')
  const [heading,setHeading]=useState(0);const [codes,setCodes]=useState('');const [notice,setNotice]=useState('')
  const [assists,setAssists]=useState<AssistOptions>({...CLEAN_ASSISTS});const [returnTo,setReturnTo]=useState<Screen>('menu')
  const root=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);const scene=useRef<CircuitScene|null>(null)
  const live=useRef(state);const mode=useRef(screen);const levelRef=useRef(level);const input=useRef(new IntentBuffer());const clock=useRef(new SimulationClock())
  const runId=useRef<string>(crypto.randomUUID());const savedTick=useRef(-1);const lastHud=useRef(0);const history=useRef<CircuitState[]>([])
  const audio=useRef(new CircuitAudio())
  const loadGeneration=useRef(0);const padPointer=useRef<number|null>(null);const padDirection=useRef<Direction|null>(null)
  const callbacks=useRef({owner,onExit,settings,comfort});callbacks.current={owner,onExit,settings,comfort}
  const setMode=useCallback((next:Screen)=>{input.current.clear();padPointer.current=null;padDirection.current=null;clock.current.reset();mode.current=next;setScreen(next);if(next!=='playing')audio.current.pause()},[])
  useEffect(()=>{audio.current.configure({sfx:settings.sfx&&comfort.gameSfx,music:settings.music&&comfort.gameMusic})},[settings.sfx,settings.music,comfort.gameSfx,comfort.gameMusic])
  useEffect(()=>{scene.current?.configure({quality:settings.quality,reducedMotion:comfort.motion!=='full'})},[settings.quality,comfort.motion])

  useEffect(()=>{let active=true;void loadProfile(owner).then(p=>{if(!active)return;setProfile(p);setSettings(p.settings);setSaveStatus('Saved on this device')}).catch(()=>{if(active)setSaveStatus('Device save unavailable — this session can still be played.')});return()=>{active=false}},[owner])
  useEffect(()=>{
    if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)||new URLSearchParams(location.search).get('privateCampaign')!=='mscc')return
    const controller=new AbortController()
    void fetch('/__shadow-circuit-private/chip01.mid',{cache:'no-store',signal:controller.signal}).then(async response=>{if(response.ok){audio.current.loadMidi(await response.arrayBuffer());setMusicName('Original CHIP01.MID · browser synthesis')}}).catch(()=>undefined)
    void fetch('/__shadow-circuit-private/chips.dat',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('Start the private original-campaign preview to open your local copy.')
      const imported=await decodePack(new Uint8Array(await response.arrayBuffer()))
      if(!controller.signal.aborted){setLevels([...imported,...AUTHORED_LEVELS]);setNotice('Your original 149-level campaign is loaded locally. Exact Windows behavior is still being verified.')}
    }).catch(cause=>{if(!controller.signal.aborted)setNotice(cause instanceof Error?cause.message:'Local campaign could not be opened.')})
    return()=>controller.abort()
  },[])

  const persist=useCallback(async()=>{
    const current=live.current
    if(!current.started||current.outcome!=='playing')return
    try{await saveCheckpoint(owner,{levelId:levelRef.current.id,runId:runId.current,state:snapshot(current)});setSaveStatus('Saved on this device')}
    catch{setSaveStatus('Device save unavailable — keep this session open.')}
  },[owner])
  const pause=useCallback((reason?:string)=>{
    if(mode.current!=='playing')return
    setMode('paused');if(reason)setNotice(reason);void persist()
  },[persist,setMode])

  useEffect(()=>{
    const intents=input.current
    const visibility=()=>{if(document.hidden)pause('Paused while you were away. Resume when you are ready.')}
    const blur=()=>{input.current.clear();pause('Paused after leaving the game.')}
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',blur);window.addEventListener('blur',blur)
    return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',blur);window.removeEventListener('blur',blur);intents.clear()}
  },[pause])
  useEffect(()=>{if(portrait)pause('Rotate to landscape, then choose Resume.')},[portrait,pause])

  useEffect(()=>{
    const simulationClock=clock.current
    let frame=0;let lastRender=0
    const render=(now:number)=>{
      frame=requestAnimationFrame(render)
      if(mode.current==='playing') {
        const result=clock.current.advance(now)
        if(result.stalled){pause('Paused after a long frame interruption.');return}
        for(let i=0;i<result.ticks;i++) {
          const previous=live.current;const player=playerOf(previous)
          const intent=previous.tick>=player.readyAt?input.current.take():null
          const next=step(levelRef.current,previous,intent===null?null:screenDirection(intent,heading))
          if(next.moves!==previous.moves&&previous.assists.undo)history.current.push(cloneState(previous))
          history.current=history.current.filter(s=>next.elapsed-s.elapsed<=600).slice(-150)
          live.current=next;scene.current?.update(next)
          audio.current.play(next.events)
          if(next.outcome!=='playing'){
            setState(next);setMode(next.outcome==='won'?'results':'dead')
            if(next.outcome==='won')void saveResult(owner,{runId:runId.current,levelId:levelRef.current.id,contentHash:next.contentHash,ruleset:next.rulesetVersion,elapsed:next.elapsed,moves:next.moves,assisted:next.assisted}).then(()=>loadProfile(owner)).then(p=>{setProfile(p);setSaveStatus('Result saved on this device')}).catch(()=>setSaveStatus('Result could not be saved on this device.'))
            break
          }
        }
        if(now-lastHud.current>100){setState(live.current);lastHud.current=now}
        if(live.current.started&&live.current.tick-savedTick.current>=20){savedTick.current=live.current.tick;void persist()}
      }
      if(scene.current&&!document.hidden&&(mode.current==='playing'||now-lastRender>150)){
        if(callbacks.current.settings.quality==='battery'&&now-lastRender<32)return
        scene.current.frame(now,mode.current==='playing');lastRender=now
      }
    }
    frame=requestAnimationFrame(render)
    return()=>{cancelAnimationFrame(frame);simulationClock.reset()}
  },[heading,owner,pause,persist,setMode])

  useEffect(()=>{const controller=audio.current;return()=>{loadGeneration.current=-1;scene.current?.dispose();scene.current=null;controller.dispose();leaveCircuitLandscape()}},[])
  useEffect(()=>{const resize=()=>scene.current?.resize();const observer=new ResizeObserver(resize);if(root.current)observer.observe(root.current);window.visualViewport?.addEventListener('resize',resize);return()=>{observer.disconnect();window.visualViewport?.removeEventListener('resize',resize)}},[])

  const launch=async(selected:CircuitLevel,checkpoint?:string)=>{
    if(portrait)void enterCircuitLandscape()
    const generation=++loadGeneration.current
    setError('');setNotice('');setLevel(selected);levelRef.current=selected;setMode('loading');setLoading('Opening the 3D engine…')
    scene.current?.dispose();scene.current=null;history.current=[];savedTick.current=-1;setHeading(0)
    try {
      const next=checkpoint?restore(selected,checkpoint):createState(selected,0x53484457,assists)
      if(!checkpoint)runId.current=crypto.randomUUID()
      live.current=next;setState(next)
      const {createCircuitScene}=await import('./renderer/circuitScene')
      if(generation!==loadGeneration.current||!canvas.current)return
      setLoading('Preparing the chamber…')
      const runtime=await createCircuitScene(canvas.current,selected,next,{reducedMotion:comfort.motion!=='full',quality:settings.quality,onContextLost:()=>{pause('The 3D display was interrupted. Your run is paused.');setError('The 3D display was interrupted. Retry restores the last checkpoint.');setMode('error')}})
      if(generation!==loadGeneration.current){runtime.dispose();return}
      scene.current=runtime;runtime.resize();runtime.frame(performance.now(),false);setMode('intro')
    }catch(cause){setError(cause instanceof Error?cause.message:typeof cause==='string'?cause:'The chamber could not be opened.');setMode('error')}
  }
  const start=()=>{if(portrait){setNotice('Turn your phone sideways to enter the chamber.');return}setNotice('');setMode('playing');void audio.current.unlock({sfx:settings.sfx&&comfort.gameSfx,music:settings.music&&comfort.gameMusic});root.current?.focus()}
  const exit=async()=>{loadGeneration.current++;setMode('paused');await persist();onExit()}
  const menu=async()=>{await persist();scene.current?.dispose();scene.current=null;setMode('menu');void loadProfile(owner).then(setProfile).catch(()=>undefined)}
  const openPage=(next:Screen)=>{setReturnTo(scene.current?'paused':'menu');setMode(next)}
  const updateSettings=(patch:Partial<CircuitSettings>)=>{const next={...settings,...patch};setSettings(next);void saveSettings(owner,next).catch(()=>setSaveStatus('Settings could not be saved.'))}
  const undo=()=>{
    const previous=history.current.pop();if(!previous||!live.current.assists.undo)return
    previous.assisted=true;previous.assists={...live.current.assists};live.current=previous;setState(previous);scene.current?.update(previous);input.current.clear();clock.current.reset();void persist()
  }
  const applyCode=async()=>{
    const code=codes.trim().toUpperCase();setCodes('')
    if(passwordTarget){
      if(!passwordMatch(levels,code,passwordTarget).length){setNotice('That password does not unlock this level.');return}
      try{await unlockLevel(owner,levelIdentity(passwordTarget));setProfile(await loadProfile(owner));setPasswordTarget(null);setMode('levels');setNotice('Level unlocked. Choose it to begin.')}catch{setNotice('Unlock could not be saved. Please retry.')}
      return
    }
    const next={...assists}
    if(code==='TIMEOUT')next.timerOff=true
    else if(code==='SECONDCHANCE')next.undo=true
    else if(code==='POCKETKEYS')next.pocketKeys=true
    else if(code==='RESETCODES'){setAssists({...CLEAN_ASSISTS});setNotice('Code defaults cleared for future attempts. This attempt keeps its existing assistance.');return}
    else if(code==='SHADOWPASS'){for(const chamber of levels.filter(l=>l.source==='authored'))await unlockLevel(owner,levelIdentity(chamber));setProfile(await loadProfile(owner));setNotice('Test chambers unlocked. No clears or records were awarded.');return}
    else {
      const matches=passwordMatch(levels,code)
      if(matches.length===1){await unlockLevel(owner,levelIdentity(matches[0]));setProfile(await loadProfile(owner));void launch(matches[0]);return}
      setNotice(matches.length>1?'That password matches several levels. Choose the intended level in Chambers.':'Code not recognized.');return
    }
    setAssists(next);setNotice('Assist enabled for the next new attempt. Current Classic records are preserved.')
  }
  const importPack=async(file:File|undefined)=>{
    if(!file)return
    if(file.size>16*1024*1024){setNotice('Choose a DAT or CCL file smaller than 16 MiB.');return}
    try{
      const imported=await decodePack(new Uint8Array(await file.arrayBuffer()))
      setLevels([...imported,...AUTHORED_LEVELS]);setNotice(`${imported.length} imported levels are available for this session. Rules compatibility and solutions are unverified; the file stays on this device.`)
    }catch(cause){setNotice(cause instanceof Error?cause.message:'That pack could not be opened.')}
  }
  const liveScene=['intro','playing','paused','focus','dead','results','restart'].includes(screen)
  const panel=(title:string,children:React.ReactNode)=><section className="circuit-panel" aria-label={title}><div className="circuit-panel-heading"><div><p className="circuit-eyebrow">Shadow Circuit</p><h2>{title}</h2></div><button aria-label="Back" onClick={()=>setMode(returnTo)}><X size={20}/></button></div>{children}</section>
  const menuButton=(label:string,action:()=>void,primary=false)=><button className={primary?'circuit-primary':'circuit-action'} onClick={action}>{label}<ArrowRight size={18}/></button>
  const currentIndex=levels.findIndex(l=>l.id===level.id)

  return <div ref={root} tabIndex={-1} className={`circuit-root ${comfort.contrast==='high'?'circuit-high-contrast':''}`} style={{'--circuit-control':settings.largeControls||comfort.touchTarget==='large'?'60px':'52px'} as CSSProperties}
    data-testid="shadow-circuit" data-screen={screen} data-cell={playerOf(state).cell} data-tick={state.tick}
    onKeyDown={e=>{
      if((e.target as HTMLElement).closest('input,textarea,select'))return
      if(e.key==='Escape'){e.preventDefault();if(mode.current==='playing')pause();else if(mode.current==='paused')start();return}
      if(mode.current!=='playing')return
      const direction=KEY_DIRECTIONS[e.key]
      if(direction!==undefined){e.preventDefault();if(!e.repeat)input.current.press(-1,direction)}
      else if(e.key.toLowerCase()==='f'){e.preventDefault();setMode('focus');void persist()}
      else if(e.key.toLowerCase()==='r'){e.preventDefault();setMode('restart')}
      else if(e.key.toLowerCase()==='u')undo()
    }} onKeyUp={e=>{if(KEY_DIRECTIONS[e.key]!==undefined)input.current.release(-1)}}>
    <canvas ref={canvas} className="circuit-canvas" aria-label="Shadow Circuit 3D chamber" style={{visibility:scene.current?'visible':'hidden'}}/>
    {!liveScene&&<div className="circuit-menu-atmosphere" aria-hidden="true"><img src={menuBackground} alt=""/></div>}
    <div className="circuit-topline"><button onClick={()=>void exit()} aria-label="Back to Shadow Chat"><ArrowLeft size={18}/><span>Shadow Chat</span></button><span className="circuit-edition">CIRCUIT / EXPEDITION</span>{liveScene?<button aria-label="Pause game" onClick={()=>pause()}><Pause size={18}/></button>:<span className="circuit-edition">01</span>}</div>
    {screen==='menu'&&<main className="circuit-title circuit-brand-menu">
      <h1><img className="circuit-brand-logo" src={brandLogo} alt="Shadow Circuit — A Shadow Chat Game"/></h1>
      <div className="circuit-menu-actions">
        <button className="circuit-launch circuit-launch-primary" aria-label={profile?.checkpoint&&levels.some(l=>l.id===profile.checkpoint?.levelId)?'Continue expedition':'Play'} onClick={()=>{const c=profile?.checkpoint; if(c&&levels.some(l=>l.id===c.levelId)){runId.current=c.runId;void launch(levels.find(l=>l.id===c.levelId)!,c.state)}else void launch(levels[0])}}><Play fill="currentColor"/><span>{profile?.checkpoint&&levels.some(l=>l.id===profile.checkpoint?.levelId)?'CONTINUE':'PLAY'}</span></button>
        <button className="circuit-launch" aria-label="Levels" onClick={()=>setMode('levels')}><LayoutGrid fill="currentColor"/><span>LEVELS</span></button>
        <button className="circuit-launch" onClick={()=>openPage('settings')}><Settings fill="currentColor"/><span>SETTINGS</span></button>
      </div>
      <nav className="circuit-brand-links" aria-label="More game options"><button onClick={()=>openPage('guide')}>Guide</button><button onClick={()=>openPage('records')}>Records</button><button onClick={()=>{setPasswordTarget(null);openPage('codes')}}>Codes</button><button onClick={()=>openPage('credits')}>Credits</button></nav>
    </main>}
    {screen==='levels'&&panel('Choose a chamber',<><p className="circuit-copy">Finish a chamber to unlock the next. Tap a padlock to enter an original level password.</p><div className="circuit-level-list">{levels.map(l=>{const open=isLevelOpen(l,levels,profile);return <button key={l.id} className={open?'':'circuit-level-locked'} aria-label={open?undefined:`Unlock level ${l.number}: ${l.title}`} onClick={()=>{if(open)void launch(l);else {setPasswordTarget(l);setCodes('');setReturnTo('levels');setMode('codes')}}}><span className="circuit-level-number">{String(l.number).padStart(2,'0')}</span><span><strong>{l.title}</strong><small>{open?(l.source==='authored'?'Shadow test chamber':l.campaignId==='mscc-original'?'Original Windows campaign':'Imported campaign'):'Complete the previous level or enter its password'}</small></span>{open?<ArrowRight size={18}/>:<LockKeyhole size={22} aria-label="Enter level password"/>}</button>})}</div><label className="circuit-file">Open a local DAT / CCL pack<input type="file" accept=".dat,.ccl" onChange={e=>void importPack(e.target.files?.[0])}/></label><p className="circuit-copy">Local packs stay on this device. Select your DAT file again after reloading, or use the private preview for the supplied original campaign.</p></>)}
    {screen==='loading'&&<div className="circuit-overlay circuit-loading"><div className="circuit-modal" role="status" aria-live="polite"><img src={brandLogo} alt="Shadow Circuit"/><h2>{loading}</h2><div className="circuit-loader" aria-label="Loading"><span/></div><p>Connecting the chamber. Preparing models and lighting.</p><button onClick={()=>void menu()}>Cancel</button></div></div>}
    {screen==='intro'&&<div className="circuit-overlay"><div className="circuit-modal"><p className="circuit-eyebrow">Chamber {String(level.number).padStart(2,'0')}</p><h2>{level.title}</h2><p>Collect {state.chips} chips. Find the exit.<br/>{level.timeLimit?`${level.timeLimit} seconds`:'Untimed · take your time'}</p><div className="circuit-mode">{state.assisted?'ASSIST EXPEDITION':'CLASSIC EXPEDITION'}</div>{menuButton(portrait?'Rotate to landscape':'Enter chamber',start,true)}<p className="circuit-copy">D-pad or WASD / arrows · F to focus · Escape to pause</p></div></div>}
    {liveScene&&<><div className="circuit-hud"><div><div className="circuit-level-counter">LEVEL <b>{String(level.number).padStart(3,'0')}</b></div><span className="circuit-eyebrow">{level.title}</span><strong><Sparkles size={20}/>{state.chips}<small>CHIPS LEFT</small></strong></div><div className="circuit-inventory"><span className="circuit-time"><small>TIME</small><b>{level.timeLimit&&!state.assists.timerOff?String(Math.max(0,level.timeLimit-Math.floor(state.elapsed/20))).padStart(3,'0'):'∞'}</b></span>{state.keys.map((count,i)=><span key={i} className={`circuit-key circuit-key-${i}`} title={`${['Blue','Red','Green','Yellow'][i]} keys: ${count}`}><KeyRound aria-hidden="true"/> {count}</span>)}{state.boots.some(Boolean)&&<span className="circuit-boots" title="Boots">{state.boots.map((on,i)=>on?['💧','♨','❄','↟'][i]:'').join(' ')}</span>}</div></div>
      {screen==='playing'&&<div className={`circuit-controls ${settings.mirror?'circuit-mirror':''}`}><div className="circuit-pad" role="group" aria-label="Movement controls"
        onPointerDown={e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-direction]');if(!button||padPointer.current!==null)return;const d=Number(button.dataset.direction) as Direction;if(input.current.press(e.pointerId,d)){padPointer.current=e.pointerId;padDirection.current=d;e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault()}}}
        onPointerMove={e=>{if(padPointer.current!==e.pointerId)return;const rect=e.currentTarget.getBoundingClientRect();const d=padSector((e.clientX-rect.left-rect.width/2)/(rect.width/2),(e.clientY-rect.top-rect.height/2)/(rect.height/2),padDirection.current);if(d!==padDirection.current){input.current.steer(e.pointerId,d);padDirection.current=d}}}
        onPointerUp={e=>{input.current.release(e.pointerId);if(padPointer.current===e.pointerId){padPointer.current=null;padDirection.current=null}}}
        onPointerCancel={()=>{input.current.clear();padPointer.current=null;padDirection.current=null}}
        onLostPointerCapture={()=>{if(padPointer.current!==null){input.current.clear();padPointer.current=null;padDirection.current=null}}}>
        {[ArrowUp,ArrowRight,ArrowDown,ArrowLeft].map((Icon,i)=><button key={i} data-direction={i} className={`circuit-direction circuit-direction-${i}`} aria-label={`Move ${['up','right','down','left'][i]}`} onClick={e=>{if(e.detail===0){input.current.press(-2,i as Direction);input.current.release(-2)}}}><Icon size={26}/></button>)}<span className="circuit-pad-center">◆</span></div><div className="circuit-aux"><button onClick={()=>{setMode('focus');void persist()}}><Compass size={22}/><span>Focus</span></button>{state.assists.undo&&<button onClick={undo} disabled={!history.current.length}><RotateCcw size={20}/><span>Undo</span></button>}</div></div>}
      {state.assisted&&<span className="circuit-assist-badge">ASSIST MODE</span>}</>}
    {(screen==='paused'||screen==='focus'||screen==='restart')&&<div className="circuit-overlay"><div className="circuit-modal"><p className="circuit-eyebrow">Time stands still</p><h2>{screen==='focus'?'Find your perspective':screen==='restart'?'Begin this chamber again?':'Expedition paused'}</h2>
      {screen==='focus'&&<div className="circuit-row"><button aria-label="Rotate camera left" onClick={()=>{const h=(heading+3)%4;setHeading(h);scene.current?.rotate(h)}}>↶ 90°</button><span>{['NORTH','EAST','SOUTH','WEST'][heading]}</span><button aria-label="Rotate camera right" onClick={()=>{const h=(heading+1)%4;setHeading(h);scene.current?.rotate(h)}}>90° ↷</button></div>}
      {screen==='restart'?<>{menuButton('Restart chamber',()=>void launch(level),true)}{menuButton('Keep this attempt',()=>setMode('paused'))}</>:<>{menuButton('Resume expedition',start,true)}{menuButton('Restart chamber',()=>setMode('restart'))}<div className="circuit-menu-links"><button onClick={()=>openPage('settings')}>Settings</button><button onClick={()=>openPage('guide')}>Help</button><button onClick={()=>void menu()}>Main menu</button></div></>}
      <p className="circuit-copy">{saveStatus}</p></div></div>}
    {(screen==='results'||screen==='dead')&&<div className="circuit-overlay"><div className="circuit-modal">{screen==='results'?<Crown className="circuit-gold" size={38}/>:<RotateCcw className="circuit-gold" size={32}/>}<p className="circuit-eyebrow">{screen==='results'?(state.assisted?'Assist clear':'Clean clear'):'Every route is a lesson'}</p><h2>{screen==='results'?'Circuit complete':state.reason}</h2><p>{state.moves} steps · {(state.elapsed/20).toFixed(1)} active seconds</p>{screen==='results'&&levels[currentIndex+1]&&menuButton('Next chamber',()=>void launch(levels[currentIndex+1]),true)}{menuButton(screen==='dead'?'Try again':'Replay chamber',()=>void launch(level),screen==='dead')}{menuButton('Return to menu',()=>void menu())}<p className="circuit-copy">{saveStatus}</p></div></div>}
    {screen==='settings'&&panel('Make it yours',<div className="circuit-settings"><label>Music<input type="checkbox" checked={settings.music} onChange={e=>updateSettings({music:e.target.checked})}/></label><label>Sound effects<input type="checkbox" checked={settings.sfx} onChange={e=>updateSettings({sfx:e.target.checked})}/></label><label>Mirror thumb controls<input type="checkbox" checked={settings.mirror} onChange={e=>updateSettings({mirror:e.target.checked})}/></label><label>Larger D-pad<input type="checkbox" checked={settings.largeControls} onChange={e=>updateSettings({largeControls:e.target.checked})}/></label><label>Rendering<select value={settings.quality} onChange={e=>updateSettings({quality:e.target.value as CircuitSettings['quality']})}><option value="balanced">Balanced</option><option value="battery">Battery · 30 fps</option></select></label><p className="circuit-copy">Shadow Chat Comfort: {comfort.motion} motion · {comfort.textScale}% text. Comfort sound choices always take priority. Rendering changes apply immediately. {musicName}. Music begins when you enter a chamber and pauses with the game.</p><label className="circuit-file">Load your original MIDI music<input type="file" accept=".mid,.midi" onChange={e=>{const file=e.target.files?.[0];if(file&&file.size<=2000000)void file.arrayBuffer().then(bytes=>{audio.current.loadMidi(bytes);setMusicName(file.name+' · browser synthesis')}).catch(()=>setNotice('That MIDI file could not be opened.'))}}/></label><button onClick={()=>updateSettings(DEFAULT_SETTINGS)}>Restore game defaults</button></div>)}
    {screen==='playing'&&state.top[playerOf(state).cell]===47&&level.hint&&<aside className="circuit-hint">{level.hint}</aside>}
    {screen==='guide'&&panel('Field guide',<><p className="circuit-copy">{level.hint}</p><div className="circuit-guide"><article><Sparkles/><h3>Complete the circuit</h3><p>Collect the required chips. The socket opens at zero. Walk into the exit gateway to finish.</p></article><article><KeyRound/><h3>Keys and locked doors</h3><p>Only a matching key opens a colored lock. Blue, red and yellow keys open one lock each. A green key opens every green lock and stays in your inventory.</p></article><article><ShieldCheck/><h3>Prepare for hazards</h3><p>Flippers protect against water; fire boots against flame. Skates and suction boots stop forced movement. Thieves remove boots.</p></article><article><Compass/><h3>Think before moving</h3><p>Push blocks into water to make dirt. Ice keeps you sliding. Use Focus to pause and rotate. There is no jump or diagonal shortcut.</p></article></div><p className="circuit-copy">Imported levels use a development rules profile. Exact Windows timing and every legacy interaction still require compatibility verification.</p></>)}
    {screen==='records'&&panel('Your expedition',<><p className="circuit-copy">Private records on this device. Cloud synchronization is not active.</p><div className="circuit-level-list">{profile?.results.length?profile.results.map(r=><div className="circuit-record" key={r.runId}><strong>{levels.find(l=>l.id===r.levelId)?.title??'Imported chamber'}</strong><span>{r.assisted?'Assist':'Clean'} · {r.moves} steps · {(r.elapsed/20).toFixed(1)}s</span></div>):<p>No completed chambers yet. Your first clear begins the story.</p>}</div></>)}
    {screen==='codes'&&panel(passwordTarget?`Unlock ${passwordTarget.title}`:'Codes & passwords',<><p className="circuit-copy">Original level passwords unlock that chamber without awarding a clear. Codes are not case-sensitive.</p><form onSubmit={e=>{e.preventDefault();void applyCode().catch(()=>setNotice('Could not save this code. Please retry.'))}} className="circuit-code-form"><input aria-label="Code or level password" value={codes} maxLength={32} autoCapitalize="characters" autoComplete="off" onChange={e=>setCodes(e.target.value)}/><button type="submit">Apply</button></form>{!passwordTarget&&<dl className="circuit-codes"><dt>TIMEOUT</dt><dd>Disable the timer next attempt.</dd><dt>SECONDCHANCE</dt><dd>Enable bounded undo next attempt.</dd><dt>POCKETKEYS</dt><dd>Begin with keys and boots.</dd><dt>RESETCODES</dt><dd>Clear defaults for future attempts.</dd></dl>}</>)}
    {screen==='credits'&&panel('Built for Shadow Chat',<><p className="circuit-copy">Shadow Circuit is an independently implemented 3D puzzle expedition. Babylon.js 9.27.1: Apache-2.0. Original test chambers and artwork are authored for this project.</p><p className="circuit-copy">Chip’s Challenge inspired the target puzzle roles; no original campaign, sprites, audio or Nintendo assets are bundled. CCLP1 is community content, not the original Windows campaign.</p><a href="https://bitbusters.club/cclp1/" target="_blank" rel="noreferrer">Community source and credits ↗</a></>)}
    {screen==='error'&&<div className="circuit-overlay"><div className="circuit-modal"><h2>The circuit needs a moment</h2><p role="alert">{error}</p>{menuButton('Retry from this checkpoint',()=>void launch(level,snapshot(live.current)),true)}{menuButton('Back to menu',()=>void menu())}</div></div>}
    {notice&&screen!=='playing'&&<div className="circuit-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {portrait&&screen!=='codes'&&screen!=='settings'&&screen!=='levels'&&screen!=='guide'&&screen!=='records'&&screen!=='credits'&&<div className="circuit-rotate"><Compass size={36}/><h2>A wider view awaits</h2><p>Turn your phone sideways for the chamber.<br/>Your expedition is paused.</p><button onClick={()=>void enterCircuitLandscape()}>Enable landscape</button><button onClick={()=>void exit()}>Back to games</button></div>}
  </div>
}
