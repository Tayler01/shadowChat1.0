import { Engine } from '@babylonjs/core/Engines/engine'
import { followCamera } from './followCamera'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Camera } from '@babylonjs/core/Cameras/camera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { loadClassicKit } from './classicKit'
import { trackMotion, sampleMotion, type Motion } from './actorMotion.ts'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/instancedMesh'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { playerOf } from '../core/simulation.ts'
import type { CircuitLevel, CircuitState } from '../core/types.ts'

export type SceneOptions = { reducedMotion: boolean; quality: 'balanced' | 'battery'; onContextLost: () => void }
export type CircuitScene = {
  update: (state: CircuitState) => void; frame: (now: number, moving: boolean) => void
  rotate: (heading: number) => void; resize: () => void; dispose: () => void
  introduce: (progress: number | null) => void
  view: (tilt: number, zoom: number) => void
  configure: (settings: Pick<SceneOptions,'quality'|'reducedMotion'>) => void
  metrics: () => { meshes: number; vertices: number; fps: number; width: number; height: number }
}

export async function createCircuitScene(canvas: HTMLCanvasElement, level: CircuitLevel, initial: CircuitState, options: SceneOptions): Promise<CircuitScene> {
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' })
  if (!context) throw new Error('This device could not open WebGL 2. Try closing another 3D app and retry.')
  const engine = new Engine(context, true, { preserveDrawingBuffer: false, stencil: false, doNotHandleContextLost: false })
  const configure=(settings:Pick<SceneOptions,'quality'|'reducedMotion'>)=>{
    options={...options,...settings}
    engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,options.quality==='battery'?1:1.5))
  }
  try {
  configure(options)
  const scene = new Scene(engine)
  scene.skipPointerMovePicking=true
  // DAT columns grow east. Right-handed viewing keeps east on screen-right
  // from the initial southern camera position.
  scene.useRightHandedSystem = true
  scene.clearColor = new Color4(.09, .16, .10, 1)
  const player = playerOf(initial)
  const cameraTarget = (x:number,z:number) => new Vector3(level.width<9?(level.width-1)/2:Math.max(4,Math.min(level.width-5,x)),.1,level.height<9?(level.height-1)/2:Math.max(4,Math.min(level.height-5,z)))
  const center = cameraTarget(player.cell % level.width, Math.floor(player.cell / level.width))
  const camera = new ArcRotateCamera('circuit-camera', Math.PI / 2, .64, 11.8, center, scene)
  camera.mode=Camera.ORTHOGRAPHIC_CAMERA
  camera.orthoLeft=-4.5;camera.orthoRight=4.5;camera.orthoTop=4.5;camera.orthoBottom=-4.5
  camera.fov = .76; camera.minZ = .1; camera.maxZ = 75
  const templates=new Map<string,Mesh>()
  const tileKey=(tile:number):string|null=>{
    if([1,0x2c,5].includes(tile))return tile===5||tile===0x2c?null:'wall'
    if(tile===30||tile===31)return 'blue-wall'
    if(tile===37)return 'toggle-closed';if(tile===38)return 'toggle-open'
    if([6,7,8,9,48].includes(tile))return `thin-${tile}`
    if(tile===2)return 'chip';if(tile===3)return 'water';if(tile===4)return 'fire'
    if(tile===12)return 'ice';if(tile>=26&&tile<=29)return `ice-${tile}`;if([13,18,19,20,50].includes(tile))return `force-${tile}`
    if(tile===21)return 'exit';if(tile>=22&&tile<=25)return `door-${tile-22}`
    if(tile>=100&&tile<=103)return `key-${tile-100}`;if(tile>=104&&tile<=107)return `boot-${tile-104}`
    if(tile===34)return 'socket';if(tile===41)return 'teleport';if(tile===11)return 'dirt';if(tile===47)return 'hint'
    if([35,36,39,40].includes(tile))return `button-${tile}`
    if(tile===42)return 'bomb';if(tile===43)return 'trap';if(tile===49)return 'cloner'
    if(tile===33)return 'thief';if(tile===45)return 'gravel';if(tile===46)return 'popup'
    return null
  }
  await loadClassicKit(scene,templates)
  const tiles=new Map<number,{tile:number;mesh:AbstractMesh}>();const actors=new Map<number,AbstractMesh>()
  for(let cell=0;cell<level.top.length;cell++) {
    const instance=templates.get('floor')!.createInstance(`floor-${cell}`);instance.position.set(cell%level.width,0,Math.floor(cell/level.width))
    instance.isPickable=false;instance.freezeWorldMatrix()
  }
  let state=initial;let last=0;let visualTime=0;let disposed=false
  let introduction:number|null=null;let heading=0;let tilt=.64;let zoom=4.5
  const motions=new Map<number,Motion>()
  const update=(next:CircuitState)=>{
    state=next
    next.top.forEach((tile,cell)=>{
      const current=tiles.get(cell);if(current?.tile===tile)return
      if(current){current.mesh.dispose();tiles.delete(cell)}
      const key=tileKey(tile);if(!key)return
      const template=templates.get(key)!;const mesh=template.createInstance(`tile-${cell}`)
      mesh.position.x=cell%level.width;mesh.position.z=Math.floor(cell/level.width)
      if(['water','fire','ice','force','teleport','button','dirt','hint'].includes(key))mesh.position.y=.01
      mesh.isPickable=false;mesh.freezeWorldMatrix()
      tiles.set(cell,{tile,mesh})
    })
    for(const actor of next.actors){
      let mesh=actors.get(actor.id)
      if(!actor.alive){mesh?.setEnabled(false);continue}
      if(!mesh){mesh=templates.get(actor.kind)!.createInstance(`actor-${actor.id}`);mesh.position.set(actor.cell%level.width,0,Math.floor(actor.cell/level.width));actors.set(actor.id,mesh)}
      mesh.setEnabled(true)
      motions.set(actor.id,trackMotion(motions.get(actor.id),actor,next.tick,visualTime))
    }
  }
  update(initial)
  const contextObserver=engine.onContextLostObservable.add(()=>options.onContextLost())
  return {
    update,configure,
    introduce(progress){introduction=progress},
    view(nextTilt,nextZoom){tilt=Math.max(.25,Math.min(1.12,nextTilt));zoom=Math.max(2.5,Math.min(6,nextZoom))},
    frame(now,moving){
      if(disposed)return
      const dt=last?Math.min((now-last)/1000,.05):.016;last=now
      if(moving)visualTime+=dt*1000
      for(const actor of state.actors){
        const mesh=actors.get(actor.id);if(!mesh||!actor.alive)continue
        const position=sampleMotion(motions.get(actor.id)!,level.width,visualTime,options.reducedMotion)
        mesh.position.x=position.x;mesh.position.z=position.z;mesh.rotation.y=position.angle
        mesh.position.y=actor.kind==='glider'?.2:actor.kind==='player'&&moving&&!options.reducedMotion?Math.sin(now*.016)*.018:0
      }
      const actor=actors.get(playerOf(state).id)
      // Preserve the chosen orbit when following; assigning target rebuilds it from the old camera position.
      if(actor){
        const target=cameraTarget(actor.position.x,actor.position.z)
        if(introduction!==null&&introduction<1&&!options.reducedMotion){
          const p=introduction, settle=Math.max(0,(p-.52)/.48), ease=settle*settle*(3-2*settle)
          const front=Math.PI/2-actor.rotation.y+.35
          const end=Math.PI/2+heading*Math.PI/2
          const nearestEnd=front+Math.atan2(Math.sin(end-front),Math.cos(end-front))
          camera.alpha=(front+p*.85)*(1-ease)+nearestEnd*ease
          camera.beta=1.08+(tilt-1.08)*ease
          const size=1.55+(zoom-1.55)*ease
          camera.orthoLeft=-size;camera.orthoRight=size;camera.orthoTop=size;camera.orthoBottom=-size
          followCamera(camera,Vector3.Lerp(new Vector3(actor.position.x,.58,actor.position.z),target,ease))
        }else{
          camera.alpha=Math.PI/2+heading*Math.PI/2;camera.beta=tilt
          camera.orthoLeft=-zoom;camera.orthoRight=zoom;camera.orthoTop=zoom;camera.orthoBottom=-zoom
          followCamera(camera,target)
        }
      }
      scene.render()
    },
    rotate(next){heading=next;camera.alpha=Math.PI/2+heading*Math.PI/2;scene.render()},
    resize(){engine.resize()},
    metrics:()=>({meshes:scene.meshes.length,vertices:scene.getTotalVertices(),fps:engine.getFps(),width:engine.getRenderWidth(),height:engine.getRenderHeight()}),
    dispose(){if(disposed)return;disposed=true;engine.onContextLostObservable.remove(contextObserver);scene.dispose();engine.dispose()},
  }
  }catch(error){engine.dispose();throw error}
}
