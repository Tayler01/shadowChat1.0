import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, Compass, Crown, KeyRound, Pause, Play, LayoutGrid, LockKeyhole, RotateCcw, Settings, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { useLandscapeGate } from '../shared/useLandscapeGate'
import assetManifest from './content/assetManifest.json'
import { fetchAsset } from './content/fetchAsset.ts'
import { AUTHORED_LEVELS } from './content/authoredLevels.ts'
import { normalizeLegacyLevel, parseLegacyDat } from './content/legacyDat.ts'
import { cloneState, createState, playerOf, restore, snapshot, step } from './core/simulation.ts'
import { CLEAN_ASSISTS, screenDirection, type AssistOptions, type CircuitLevel, type CircuitState, type Direction } from './core/types.ts'
import { SimulationClock } from './core/clock.ts'
import { TouchPad, type PadIntent } from './input/TouchPad'
import { CameraSurface } from './input/CameraSurface'
import { DEFAULT_CAMERA, moveCamera, MIN_TILT, MAX_TILT, type CameraDelta } from './input/cameraGesture.ts'
import { IntentBuffer } from './input/intentBuffer.ts'
import { DEFAULT_SETTINGS, loadProfile, saveCheckpoint, saveResult, saveSettings, unlockLevel, type CircuitSettings, type DeviceProfile } from './persistence/deviceStore.ts'
import type { CircuitScene } from './renderer/circuitScene'
import { isLevelOpen, levelIdentity, passwordMatch } from './content/progression.ts'
import { FLYOVER_MS, introductionAt } from './renderer/levelIntroduction.ts'
import { CircuitAudio } from './audio/circuitAudio'
import './ui/circuit.css'
import './ui/classic.css'
import './ui/brand.css'
import menuBackground from './assets/branding/menu-background.webp'
import brandLogo from './assets/branding/logo.webp'
import { enterCircuitLandscape, leaveCircuitLandscape } from './ui/landscape'

type Screen = 'menu' | 'levels' | 'intro' | 'cinematic' | 'countdown' | 'loading' | 'playing' | 'paused' | 'focus' | 'results' | 'dead' | 'settings' | 'guide' | 'records' | 'codes' | 'credits' | 'error' | 'restart'
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
  const [countdown,setCountdown]=useState(3)
  const introStart=useRef(0);const introLast=useRef(0)
  const [musicName,setMusicName]=useState('Original CHIP01.MID · General MIDI recording')
  const [musicTrack,setMusicTrack]=useState<'chip01.mp3'|'chip02.mp3'>('chip01.mp3')
  const [campaignReady,setCampaignReady]=useState(false)
  const [codes,setCodes]=useState('');const [notice,setNotice]=useState('')
  const [assists,setAssists]=useState<AssistOptions>({...CLEAN_ASSISTS});const [returnTo,setReturnTo]=useState<Screen>('menu')
  const root=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);const scene=useRef<CircuitScene|null>(null)
  const live=useRef(state);const mode=useRef(screen);const levelRef=useRef(level);const input=useRef(new IntentBuffer());const clock=useRef(new SimulationClock())
  const runId=useRef<string>(crypto.randomUUID());const savedTick=useRef(-1);const lastHud=useRef(0);const history=useRef<CircuitState[]>([])
  const audio=useRef(new CircuitAudio())
  const loadGeneration=useRef(0)
  const [cameraView,setCameraView]=useState({...DEFAULT_CAMERA});const cameraViewRef=useRef(cameraView)
  const callbacks=useRef({owner,onExit,settings,comfort});callbacks.current={owner,onExit,settings,comfort}
  const setMode=useCallback((next:Screen)=>{input.current.clear();clock.current.reset();mode.current=next;setScreen(next);if(!['playing','cinematic','countdown'].includes(next))audio.current.pause()},[])
  const changeCamera=useCallback((delta:CameraDelta,reset=false)=>{
    const next=reset?{...DEFAULT_CAMERA}:moveCamera(cameraViewRef.current,delta)
    cameraViewRef.current=next;setCameraView(next);scene.current?.rotate(next.heading);scene.current?.view(next.tilt,next.zoom)
  },[])
  const resetCamera=useCallback(()=>changeCamera({},true),[changeCamera])
  const movementIntent=({phase,pointer,direction}:PadIntent)=>{if(phase==='start')input.current.press(pointer,direction);else if(phase==='steer')input.current.steer(pointer,direction);else if(phase==='end')input.current.release(pointer);else input.current.clear()}
  useEffect(()=>{audio.current.configure({sfx:settings.sfx&&comfort.gameSfx,music:settings.music&&comfort.gameMusic})},[settings.sfx,settings.music,comfort.gameSfx,comfort.gameMusic])
  useEffect(()=>{scene.current?.configure({quality:settings.quality,reducedMotion:comfort.motion!=='full'})},[settings.quality,comfort.motion])

  useEffect(()=>{let active=true;void loadProfile(owner).then(p=>{if(!active)return;setProfile(p);setSettings(p.settings);setSaveStatus('Saved on this device')}).catch(()=>{if(active)setSaveStatus('Device save unavailable — this session can still be played.')});return()=>{active=false}},[owner])
  useEffect(()=>{audio.current.loadRecording(assetManifest.original[musicTrack])},[musicTrack])
  useEffect(()=>{
    const controller=new AbortController()
    void fetchAsset(assetManifest.original['chips.dat'],controller.signal).then(async bytes=>{
      const imported=await decodePack(new Uint8Array(bytes))
      if(!controller.signal.aborted){setLevels([...imported,...AUTHORED_LEVELS]);setCampaignReady(true)}
    }).catch(()=>{if(!controller.signal.aborted){setCampaignReady(true);setNotice('The original campaign could not be downloaded. Test chambers remain available; reload to retry.')}})
    return()=>controller.abort()
  },[])

  const persist=useCallback(async()=>{
    const current=live.current
    if(!current.started||current.outcome!=='playing')return
    try{await saveCheckpoint(owner,{levelId:levelRef.current.id,runId:runId.current,state:snapshot(current)});setSaveStatus('Saved on this device')}
    catch{setSaveStatus('Device save unavailable — keep this session open.')}
  },[owner])
  const pause=useCallback((reason?:string)=>{
    if(mode.current==='cinematic'||mode.current==='countdown'){scene.current?.introduce(null);setMode('intro');if(reason)setNotice(reason);return}
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
      if(mode.current==='cinematic'||mode.current==='countdown'){
        if(now-introLast.current>500){pause('Introduction paused. Enter the chamber when you are ready.');return}
        introLast.current=now
        const intro=introductionAt(now-introStart.current,callbacks.current.comfort.motion!=='full')
        scene.current?.introduce(intro.progress)
        setCountdown(intro.count)
        if(intro.phase!==mode.current){setMode(intro.phase);if(intro.phase==='playing')scene.current?.introduce(null)}
      }
      if(mode.current==='playing') {
        const result=clock.current.advance(now)
        if(result.stalled){pause('Paused after a long frame interruption.');return}
        for(let i=0;i<result.ticks;i++) {
          const previous=live.current;const player=playerOf(previous)
          const intent=previous.tick>=player.readyAt?input.current.take():null
          const next=step(levelRef.current,previous,intent===null?null:screenDirection(intent,cameraViewRef.current.heading))
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
      if(scene.current&&!document.hidden&&(['playing','cinematic','countdown'].includes(mode.current)||now-lastRender>150)){
        if(callbacks.current.settings.quality==='battery'&&now-lastRender<32)return
        scene.current.frame(now,mode.current==='playing');lastRender=now
      }
    }
    frame=requestAnimationFrame(render)
    return()=>{cancelAnimationFrame(frame);simulationClock.reset()}
  },[owner,pause,persist,setMode])

  useEffect(()=>{const controller=audio.current;return()=>{loadGeneration.current=-1;scene.current?.dispose();scene.current=null;controller.dispose();leaveCircuitLandscape()}},[])
  useEffect(()=>{const resize=()=>scene.current?.resize();const observer=new ResizeObserver(resize);if(root.current)observer.observe(root.current);window.visualViewport?.addEventListener('resize',resize);return()=>{observer.disconnect();window.visualViewport?.removeEventListener('resize',resize)}},[])

  const launch=async(selected:CircuitLevel,checkpoint?:string)=>{
    if(portrait)void enterCircuitLandscape()
    const generation=++loadGeneration.current
    setError('');setNotice('');setLevel(selected);levelRef.current=selected;setMode('loading');setLoading('Opening the 3D engine…')
    scene.current?.dispose();scene.current=null;history.current=[];savedTick.current=-1;resetCamera()
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
    }catch(cause){if(generation!==loadGeneration.current)return;setError(cause instanceof Error?cause.message:typeof cause==='string'?cause:'The chamber could not be opened.');setMode('error')}
  }
  const start=()=>{if(portrait){setNotice('Turn your phone sideways to enter the chamber.');return}setNotice('');if(mode.current==='intro'){introStart.current=performance.now();introLast.current=introStart.current;setCountdown(3);setMode(comfort.motion==='full'?'cinematic':'countdown')}else setMode('playing');void audio.current.unlock({sfx:settings.sfx&&comfort.gameSfx,music:settings.music&&comfort.gameMusic});root.current?.focus()}
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
  const liveScene=['intro','cinematic','countdown','playing','paused','focus','dead','results','restart'].includes(screen)
  const panel=(title:string,children:React.ReactNode)=><section className="circuit-panel" aria-label={title}><div className="circuit-panel-heading"><div><img className="circuit-panel-logo" src={brandLogo} alt="Shadow Circuit"/><h2>{title}</h2></div><button aria-label="Back" onClick={()=>setMode(returnTo)}><X size={20}/></button></div>{children}</section>
  const menuButton=(label:string,action:()=>void,primary=false)=><button className={primary?'circuit-primary':'circuit-action'} onClick={action}>{label}<ArrowRight size={18}/></button>
  const currentIndex=levels.findIndex(l=>l.id===level.id)

  return <div ref={root} tabIndex={-1} className={`circuit-root ${comfort.contrast==='high'?'circuit-high-contrast':''}`} style={{'--circuit-control':settings.largeControls||comfort.touchTarget==='large'?'60px':'52px'} as CSSProperties}
    data-testid="shadow-circuit" data-screen={screen} data-cell={playerOf(state).cell} data-tick={state.tick} data-elapsed={state.elapsed} data-model-kit="reference-terrain-v3" data-large-controls={settings.largeControls||comfort.touchTarget==='large'} data-heading={cameraView.heading} data-zoom={cameraView.zoom} data-tilt={cameraView.tilt}
    onKeyDown={e=>{
      if((e.target as HTMLElement).closest('input,textarea,select'))return
      if(e.key==='Escape'){e.preventDefault();if(['playing','cinematic','countdown'].includes(mode.current))pause();else if(mode.current==='paused')start();return}
      if(mode.current!=='playing')return
      const direction=KEY_DIRECTIONS[e.key]
      if(direction!==undefined){e.preventDefault();if(!e.repeat)input.current.press(-1,direction)}
      else if(e.key.toLowerCase()==='f'){e.preventDefault();setMode('focus');void persist()}
      else if(e.key.toLowerCase()==='r'){e.preventDefault();setMode('restart')}
      else if(e.key.toLowerCase()==='u')undo()
    }} onKeyUp={e=>{if(KEY_DIRECTIONS[e.key]!==undefined)input.current.release(-1)}}>
    <canvas ref={canvas} className="circuit-canvas" aria-label="Shadow Circuit 3D chamber" style={{visibility:scene.current?'visible':'hidden'}}/>
    {!liveScene&&<div className="circuit-menu-atmosphere" aria-hidden="true"><img src={menuBackground} alt=""/></div>}
    <div className={`circuit-topline ${liveScene?'circuit-game-topline':''}`}><button onClick={()=>void exit()} aria-label="Back to Shadow Chat"><ArrowLeft size={18}/><span>Shadow Chat</span></button><span className="circuit-edition">CIRCUIT / EXPEDITION</span>{liveScene&&<div className="circuit-hud"><div><div className="circuit-level-counter">LEVEL <b>{String(level.number).padStart(3,'0')}</b></div><span className="circuit-eyebrow">{level.title}</span><strong><Sparkles size={20}/>{state.chips}<small>CHIPS LEFT</small></strong></div><div className="circuit-inventory"><span className="circuit-time"><small>TIME</small><b>{level.timeLimit&&!state.assists.timerOff?String(Math.max(0,level.timeLimit-Math.floor(state.elapsed/20))).padStart(3,'0'):'∞'}</b></span>{state.keys.map((count,i)=><span key={i} className={`circuit-key circuit-key-${i}`} title={`${['Blue','Red','Green','Yellow'][i]} keys: ${count}`}><KeyRound aria-hidden="true"/> {count}</span>)}{state.boots.some(Boolean)&&<span className="circuit-boots" title="Boots">{state.boots.map((on,i)=>on?['💧','♨','❄','↟'][i]:'').join(' ')}</span>}</div></div>}{liveScene?<button aria-label="Pause game" onClick={()=>pause()}><Pause size={18}/></button>:<span className="circuit-edition">01</span>}</div>
    {screen==='menu'&&<main className="circuit-title circuit-brand-menu">
      <h1><img className="circuit-brand-logo" src={brandLogo} alt="Shadow Circuit — A Shadow Chat Game"/></h1>
      <p className="circuit-campaign-status">{levels.some(l=>l.campaignId==='mscc-original')?'ORIGINAL CAMPAIGN · 149 LEVELS':campaignReady?'TEST CHAMBERS':'LOADING ORIGINAL CAMPAIGN'}</p>
      <div className="circuit-menu-actions">
        <button disabled={!campaignReady} className="circuit-launch circuit-launch-primary" aria-label={profile?.checkpoint&&levels.some(l=>l.id===profile.checkpoint?.levelId)?'Continue expedition':'Play'} onClick={()=>{const c=profile?.checkpoint; if(c&&levels.some(l=>l.id===c.levelId)){runId.current=c.runId;void launch(levels.find(l=>l.id===c.levelId)!,c.state)}else void launch(levels[0])}}><Play fill="currentColor"/><span>{profile?.checkpoint&&levels.some(l=>l.id===profile.checkpoint?.levelId)?'CONTINUE':campaignReady?'PLAY':'LOADING'}</span></button>
        <button className="circuit-launch" aria-label="Levels" onClick={()=>setMode('levels')}><LayoutGrid fill="currentColor"/><span>LEVELS</span></button>
        <button className="circuit-launch" onClick={()=>openPage('settings')}><Settings fill="currentColor"/><span>SETTINGS</span></button>
      </div>
      <nav className="circuit-brand-links" aria-label="More game options"><button onClick={()=>openPage('guide')}>Guide</button><button onClick={()=>openPage('records')}>Records</button><button onClick={()=>{setPasswordTarget(null);openPage('codes')}}>Codes</button><button onClick={()=>openPage('credits')}>Credits</button></nav>
    </main>}
    {screen==='levels'&&panel('Choose a chamber',<><p className="circuit-copy">Finish a chamber to unlock the next. Tap a padlock to enter an original level password.</p><div className="circuit-level-list">{levels.map(l=>{const open=isLevelOpen(l,levels,profile);return <button key={l.id} className={open?'':'circuit-level-locked'} aria-label={open?undefined:`Unlock level ${l.number}: ${l.title}`} onClick={()=>{if(open)void launch(l);else {setPasswordTarget(l);setCodes('');setReturnTo('levels');setMode('codes')}}}><span className="circuit-level-number">{String(l.number).padStart(2,'0')}</span><span><strong>{l.title}</strong><small>{open?(l.source==='authored'?'Shadow test chamber':l.campaignId==='mscc-original'?'Original Windows campaign':'Imported campaign'):'Complete the previous level or enter its password'}</small></span>{open?<ArrowRight size={18}/>:<LockKeyhole size={22} aria-label="Enter level password"/>}</button>})}</div><label className="circuit-file">Open a local DAT / CCL pack<input type="file" accept=".dat,.ccl" onChange={e=>void importPack(e.target.files?.[0])}/></label><p className="circuit-copy">The original 149-level campaign is included for this personal test. Additional local packs stay on this device; select them again after reloading.</p></>)}
    {screen==='loading'&&<div className="circuit-overlay circuit-loading"><div className="circuit-modal" role="status" aria-live="polite"><img src={brandLogo} alt="Shadow Circuit"/><h2>{loading}</h2><div className="circuit-loader" aria-label="Loading"><span/></div><p>Connecting the chamber. Preparing models and lighting.</p><button onClick={()=>void menu()}>Cancel</button></div></div>}
    {screen==='intro'&&<div className="circuit-overlay"><div className="circuit-modal"><p className="circuit-eyebrow">Chamber {String(level.number).padStart(2,'0')}</p><h2>{level.title}</h2><p>Collect {state.chips} chips. Find the exit.<br/>{level.timeLimit?`${level.timeLimit} seconds`:'Untimed · take your time'}</p><div className="circuit-mode">{state.assisted?'ASSIST EXPEDITION':'CLASSIC EXPEDITION'}</div>{menuButton(portrait?'Rotate to landscape':'Enter chamber',start,true)}<p className="circuit-copy">Move with the {settings.leftHanded?'left':'right'} D-pad or WASD / arrows. Drag the {settings.leftHanded?'right':'left'} half to look around; pinch to zoom. F to focus · Escape to pause</p></div></div>}
    {(screen==='cinematic'||screen==='countdown')&&<div className="circuit-introduction" aria-live="polite">{screen==='cinematic'?<><span className="circuit-intro-title">{level.title}</span><button onClick={()=>{introStart.current=performance.now()-FLYOVER_MS}}>Skip flyover</button></>:<div className="circuit-countdown"><b>{countdown}</b><span>GET READY</span></div>}</div>}
    {liveScene&&<>
      {screen==='playing'&&<CameraSurface onChange={changeCamera} onReset={resetCamera} leftHanded={settings.leftHanded}/>}
      {screen==='playing'&&<div className={`circuit-controls ${settings.leftHanded?'circuit-mirror':''}`}>
        <div className="circuit-movement-console"><span className="circuit-control-label">MOVE</span><TouchPad onIntent={movementIntent}/></div>

        <div className="circuit-aux"><button onClick={()=>{setMode('focus');void persist()}}><Compass size={20}/><span>Focus</span></button>{state.assists.undo&&<button onClick={undo} disabled={!history.current.length}><RotateCcw size={20}/><span>Undo</span></button>}</div>
      </div>}
      {state.assisted&&<span className="circuit-assist-badge">ASSIST MODE</span>}</>}
    {(screen==='paused'||screen==='focus'||screen==='restart')&&<div className="circuit-overlay"><div className="circuit-modal"><p className="circuit-eyebrow">Time stands still</p><h2>{screen==='focus'?'Find your perspective':screen==='restart'?'Begin this chamber again?':'Expedition paused'}</h2>
      {screen==='focus'&&<div className="circuit-camera-settings">
        <label>Orbit <input aria-label="Camera orbit" type="range" min="0" max="4" step=".001" value={cameraView.heading} onChange={e=>changeCamera({turn:Number(e.target.value)-cameraViewRef.current.heading})}/></label>
        <label>Tilt <input aria-label="Camera tilt" type="range" min={MIN_TILT} max={MAX_TILT} step=".001" value={cameraView.tilt} onChange={e=>changeCamera({tilt:Number(e.target.value)-cameraViewRef.current.tilt})}/></label>
        <label>Zoom <input aria-label="Camera zoom" type="range" min="2.5" max="6" step=".01" value={cameraView.zoom} onChange={e=>changeCamera({zoomRatio:Number(e.target.value)/cameraViewRef.current.zoom})}/></label>
        <button onClick={resetCamera}>Reset camera</button>
      </div>}

      {screen==='restart'?<>{menuButton('Restart chamber',()=>void launch(level),true)}{menuButton('Keep this attempt',()=>setMode('paused'))}</>:<>{menuButton('Resume expedition',start,true)}{menuButton('Restart chamber',()=>setMode('restart'))}<div className="circuit-menu-links"><button onClick={()=>openPage('settings')}>Settings</button><button onClick={()=>openPage('guide')}>Help</button><button onClick={()=>void menu()}>Main menu</button></div></>}
      <p className="circuit-copy">{saveStatus}</p></div></div>}
    {(screen==='results'||screen==='dead')&&<div className="circuit-overlay"><div className="circuit-modal">{screen==='results'?<Crown className="circuit-gold" size={38}/>:<RotateCcw className="circuit-gold" size={32}/>}<p className="circuit-eyebrow">{screen==='results'?(state.assisted?'Assist clear':'Clean clear'):'Every route is a lesson'}</p><h2>{screen==='results'?'Circuit complete':state.reason}</h2><p>{state.moves} steps · {(state.elapsed/20).toFixed(1)} active seconds</p>{screen==='results'&&levels[currentIndex+1]&&menuButton('Next chamber',()=>void launch(levels[currentIndex+1]),true)}{menuButton(screen==='dead'?'Try again':'Replay chamber',()=>void launch(level),screen==='dead')}{menuButton('Return to menu',()=>void menu())}<p className="circuit-copy">{saveStatus}</p></div></div>}
    {screen==='settings'&&panel('Make it yours',<div className="circuit-settings"><label>Music<input type="checkbox" checked={settings.music} onChange={e=>updateSettings({music:e.target.checked})}/></label><label>Original soundtrack<select aria-label="Original soundtrack" value={musicTrack} onChange={e=>{const track=e.target.value as typeof musicTrack;setMusicTrack(track);setMusicName(`Original ${track.slice(0,6).toUpperCase()}.MID · General MIDI recording`)}}><option value="chip01.mp3">CHIP01 · Original track 1</option><option value="chip02.mp3">CHIP02 · Original track 2</option></select></label><label>Sound effects<input type="checkbox" checked={settings.sfx} onChange={e=>updateSettings({sfx:e.target.checked})}/></label><label>Left-handed layout<input type="checkbox" checked={settings.leftHanded} onChange={e=>updateSettings({leftHanded:e.target.checked})}/></label><label>Larger D-pad<input type="checkbox" checked={settings.largeControls} onChange={e=>updateSettings({largeControls:e.target.checked})}/></label><label>Rendering<select value={settings.quality} onChange={e=>updateSettings({quality:e.target.value as CircuitSettings['quality']})}><option value="balanced">Balanced</option><option value="battery">Battery · 30 fps</option></select></label><p className="circuit-copy">Shadow Chat Comfort: {comfort.motion} motion · {comfort.textScale}% text. Comfort sound choices always take priority. Rendering changes apply immediately. {musicName}. Music begins when you enter a chamber and pauses with the game.</p><label className="circuit-file">Load your original MIDI music<input type="file" accept=".mid,.midi" onChange={e=>{const file=e.target.files?.[0];if(file&&file.size<=2000000)void file.arrayBuffer().then(bytes=>{audio.current.loadMidi(bytes);setMusicName(file.name+' · browser synthesis')}).catch(()=>setNotice('That MIDI file could not be opened.'))}}/></label><button onClick={()=>updateSettings(DEFAULT_SETTINGS)}>Restore game defaults</button></div>)}
    {screen==='playing'&&state.top[playerOf(state).cell]===47&&level.hint&&<aside className="circuit-hint">{level.hint}</aside>}
    {screen==='guide'&&panel('Field guide',<><p className="circuit-copy">{level.hint}</p><div className="circuit-guide"><article><Sparkles/><h3>Complete the circuit</h3><p>Collect the required chips. The socket opens at zero. Walk into the exit gateway to finish.</p></article><article><KeyRound/><h3>Keys and locked doors</h3><p>Only a matching key opens a colored lock. Blue, red and yellow keys open one lock each. A green key opens every green lock and stays in your inventory.</p></article><article><ShieldCheck/><h3>Prepare for hazards</h3><p>Flippers protect against water; fire boots against flame. Skates and suction boots stop forced movement. Thieves remove boots.</p></article><article><Compass/><h3>Think before moving</h3><p>Push blocks into water to make dirt. Ice keeps you sliding. Drag the camera half to orbit or tilt; pinch to zoom. Use Focus to pause and adjust or reset the view. There is no jump or diagonal shortcut.</p></article></div><p className="circuit-copy">Imported levels use a development rules profile. Exact Windows timing and every legacy interaction still require compatibility verification.</p></>)}
    {screen==='records'&&panel('Your expedition',<><p className="circuit-copy">Private records on this device. Cloud synchronization is not active.</p><div className="circuit-level-list">{profile?.results.length?profile.results.map(r=><div className="circuit-record" key={r.runId}><strong>{levels.find(l=>l.id===r.levelId)?.title??'Imported chamber'}</strong><span>{r.assisted?'Assist':'Clean'} · {r.moves} steps · {(r.elapsed/20).toFixed(1)}s</span></div>):<p>No completed chambers yet. Your first clear begins the story.</p>}</div></>)}
    {screen==='codes'&&panel(passwordTarget?`Unlock ${passwordTarget.title}`:'Codes & passwords',<><p className="circuit-copy">Original level passwords unlock that chamber without awarding a clear. Codes are not case-sensitive.</p><form onSubmit={e=>{e.preventDefault();void applyCode().catch(()=>setNotice('Could not save this code. Please retry.'))}} className="circuit-code-form"><input aria-label="Code or level password" value={codes} maxLength={32} autoCapitalize="characters" autoComplete="off" onChange={e=>setCodes(e.target.value)}/><button type="submit">Apply</button></form>{!passwordTarget&&<dl className="circuit-codes"><dt>TIMEOUT</dt><dd>Disable the timer next attempt.</dd><dt>SECONDCHANCE</dt><dd>Enable bounded undo next attempt.</dd><dt>POCKETKEYS</dt><dd>Begin with keys and boots.</dd><dt>RESETCODES</dt><dd>Clear defaults for future attempts.</dd></dl>}</>)}
    {screen==='credits'&&panel('Built for Shadow Chat',<><p className="circuit-copy">Shadow Circuit is an independently implemented 3D puzzle expedition. Babylon.js 9.27.1: Apache-2.0. Original test chambers and artwork are authored for this project.</p><p className="circuit-copy">This personal testing build includes the original Windows campaign and CHIP01 / CHIP02 music supplied by the owner, with permission confirmed September 20, 2026. The MIDI scores are rendered with FluidSynth and GeneralUser GS by S. Christian Collins; instrument sound varies from the original MIDI device.</p><a href="https://bitbusters.club/cclp1/" target="_blank" rel="noreferrer">Community source and credits ↗</a></>)}
    {screen==='error'&&<div className="circuit-overlay"><div className="circuit-modal"><h2>The circuit needs a moment</h2><p role="alert">{error}</p>{menuButton('Retry from this checkpoint',()=>void launch(level,snapshot(live.current)),true)}{menuButton('Back to menu',()=>void menu())}</div></div>}
    {notice&&screen!=='playing'&&<div className="circuit-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={16}/></button></div>}
    {portrait&&screen!=='codes'&&screen!=='settings'&&screen!=='levels'&&screen!=='guide'&&screen!=='records'&&screen!=='credits'&&<div className="circuit-rotate"><div className="circuit-rotate-console"><img src={brandLogo} alt="Shadow Circuit"/><Compass size={36} aria-hidden="true"/><h2>Rotate to explore</h2><p>Turn your phone sideways.<br/>Your chamber will wait for you.</p><button className="circuit-primary" onClick={()=>void enterCircuitLandscape()}>Enable landscape<ArrowRight size={20}/></button><button className="circuit-action" onClick={()=>void exit()}>Back to games<ArrowLeft size={20}/></button></div></div>}
  </div>
}
