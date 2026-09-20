import { Engine } from '@babylonjs/core/Engines/engine'
import { followCamera } from './followCamera'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Camera } from '@babylonjs/core/Cameras/camera'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import type { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { classicMaterial } from './classicMaterial'
import { loadClassicKit } from './classicKit'
import { trackMotion, sampleMotion, type Motion } from './actorMotion.ts'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/instancedMesh'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { playerOf } from '../core/simulation.ts'
import type { CircuitLevel, CircuitState } from '../core/types.ts'

export type SceneOptions = { reducedMotion: boolean; quality: 'balanced' | 'battery'; onContextLost: () => void }
export type CircuitScene = {
  update: (state: CircuitState) => void; frame: (now: number, moving: boolean) => void
  rotate: (heading: number) => void; resize: () => void; dispose: () => void
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
  const cameraTarget = (x:number,z:number) => new Vector3(Math.max(4,Math.min(level.width-5,x)),.1,Math.max(4,Math.min(level.height-5,z)))
  const center = cameraTarget(player.cell % level.width, Math.floor(player.cell / level.width))
  const camera = new ArcRotateCamera('circuit-camera', Math.PI / 2, .52, 11.8, center, scene)
  camera.mode=Camera.ORTHOGRAPHIC_CAMERA
  camera.orthoLeft=-4.5;camera.orthoRight=4.5;camera.orthoTop=4.5;camera.orthoBottom=-4.5
  camera.fov = .76; camera.minZ = .1; camera.maxZ = 75
  const material=(name:string,hex:string,glow=0)=>classicMaterial(scene,name,Color3.FromHexString(hex),glow)
  const stone=material('gray-tile','#b9b9b9'),gold=material('brushed-steel','#d5d7d8'),wall=material('gray-wall','#898989')
  const colors=[material('cyan-blue','#17c9e2',.06),material('red','#e63934',.06),material('green','#22cb35',.06),material('yellow','#f1e31b',.06)]
  const water=material('water','#05acd8',.08),fire=material('flame','#ff7725',.12),ice=material('ice','#83edee',.08),purple=material('teleport','#1256f6',.1)
  const templates=new Map<string,Mesh>()
  const box=(key:string,m:ShaderMaterial,w:number,h:number,d:number,y:number)=>{
    const mesh=CreateBox(key,{width:w,height:h,depth:d},scene);mesh.position.y=y;mesh.material=m;return mesh
  }
  const cylinder=(key:string,m:ShaderMaterial,diameter:number,height:number,y:number)=>{
    const mesh=CreateCylinder(key,{diameter,height,tessellation:12},scene);mesh.position.y=y;mesh.material=m;return mesh
  }
  const merge=(key:string,pieces:Mesh[])=>{
    const mesh=Mesh.MergeMeshes(pieces,true,true,undefined,false,true)!
    mesh.name=key;mesh.isVisible=false;templates.set(key,mesh);return mesh
  }
  const floor=box('floor',stone,.965,.22,.965,-.13);floor.isVisible=false;templates.set('floor',floor)
  merge('wall',[box('wall-base',stone,.98,.15,.98,.05),box('wall-body',wall,.91,.46,.91,.29),box('wall-cap',gold,.94,.045,.94,.54)])
  merge('chip',[cylinder('chip-rim',gold,.46,.09,.23),box('chip-core',colors[3],.22,.12,.22,.32)])
  merge('exit',Array.from({length:7},(_,i)=>box(`exit-ring-${i}`,i%2?colors[0]:purple,.9-i*.12,.025,.9-i*.12,.035+i*.027)))
  // The first proof uses explicit geometric representations; Blender exports replace these in P04.
  for(let color=0;color<4;color++) {
    merge(`key-${color}`,[cylinder('ring',colors[color],.28,.12,.28),box('key-stem',gold,.1,.12,.48,.28)])
    merge(`door-${color}`,[box('door',stone,.88,1.1,.28,.5),box('seal',colors[color],.35,.35,.33,.66),box('door-top',gold,.94,.08,.32,1.08)])
    const bootMaterial=[ice,fire,ice,colors[2]][color]
    const leftSole=box('sole-left',bootMaterial,.19,.12,.56,.12);leftSole.position.x=-.13
    const rightSole=box('sole-right',bootMaterial,.19,.12,.56,.12);rightSole.position.x=.13
    const leftShaft=box('shaft-left',bootMaterial,.17,.25,.19,.25);leftShaft.position.set(-.13,.25,-.13)
    const rightShaft=box('shaft-right',bootMaterial,.17,.25,.19,.25);rightShaft.position.set(.13,.25,-.13)
    merge(`boot-${color}`,[leftSole,rightSole,leftShaft,rightShaft])
  }
  merge('socket',[box('socket',stone,.86,.8,.3,.4),cylinder('socket-emblem',gold,.3,.08,.88)])
  merge('block',[box('block-base',gold,.8,.08,.8,.05),box('block',wall,.73,.67,.73,.4),box('block-top',gold,.77,.06,.77,.76)])
  const head=CreateSphere('head',{diameter:.34,segments:8},scene);head.position.y=.83;head.material=gold
  const visor=box('visor',ice,.25,.1,.08,.87);visor.position.z=.16
  const pack=box('backpack',gold,.33,.35,.16,.49);pack.position.z=-.2
  merge('player',[cylinder('coat',stone,.4,.48,.45),head,visor,pack,box('feet',gold,.38,.15,.28,.12)])
  for(const [kind,mat] of [['bug',colors[1]],['fireball',fire],['ball',purple],['tank',colors[0]],['glider',ice],['teeth',wall],['walker',gold],['blob',colors[2]],['paramecium',purple]] as const) {
    const body=CreateSphere(kind,{diameter:.6,segments:8},scene);body.position.y=.38;body.material=mat
    merge(kind,[body,box(`${kind}-direction`,gold,.15,.12,.2,.52)])
  }
  for(const [key,mat] of [['water',water],['fire',fire],['ice',ice],['force',colors[3]],['teleport',purple],['button',colors[2]],['dirt',gold],['hint',ice]] as const) {
    const mesh=box(key,mat,.85,.04,.85,.01);mesh.isVisible=false;templates.set(key,mesh)
  }
  const dark=material('marking','#18201b'),brown=material('earth','#986338'),white=material('arrow-white','#eef3e8')
  const replace=(key:string,pieces:Mesh[])=>{templates.get(key)?.dispose();return merge(key,pieces)}
  replace('hint',[cylinder('hint-disc',colors[3],.62,.045,.09),
    ...[[0,-.17,.21,.07],[.14,-.06,.07,.17],[.06,.06,.16,.07],[0,.13,.07,.11],[0,.27,.07,.07]].map(([x,z,w,d])=>{const m=box('question-mark',dark,w,.022,d,.13);m.position.x=x;m.position.z=z;return m})])
  replace('socket',[box('chip-socket',gold,.88,.20,.86,.11),box('chip-socket-hole',dark,.38,.035,.52,.23),
    ...[-1,1].flatMap(sign=>[-.24,0,.24].map(z=>{const m=box('socket-pin',colors[3],.11,.04,.09,.25);m.position.x=sign*.3;m.position.z=z;return m}))])
  replace('block',[box('dirt-block',brown,.82,.65,.82,.32),box('dirt-block-top',brown,.85,.05,.85,.67)])
  replace('dirt',[box('earth',brown,.95,.035,.95,.03)])
  replace('water',[box('water-surface',water,.98,.025,.98,.025),...[-.3,0,.3].map(z=>{const m=box('water-wave',ice,.65,.015,.035,.045);m.position.z=z;return m})])
  replace('fire',[-.23,0,.23].flatMap((x,i)=>{
    const flame=CreateCylinder('flame',{diameterTop:0,diameterBottom:.32,height:.44+(i%2)*.17,tessellation:7},scene);flame.position.set(x,.26,-.15+i*.15);flame.material=fire
    const core=CreateCylinder('flame-core',{diameterTop:0,diameterBottom:.2,height:.26,tessellation:7},scene);core.position.set(x,.18,-.05+i*.15);core.material=colors[3];return [flame,core]
  }))
  for(const [tile,angle] of [[13,Math.PI],[18,0],[19,-Math.PI/2],[20,Math.PI/2],[50,0]]){
    const pieces=[box('conveyor',dark,.96,.03,.96,.025)]
    for(const z of [-.26,.18])for(const sign of [-1,1]){const m=box('chevron',colors[2],.46,.025,.13,.05);m.rotation.y=-sign*Math.PI/4;m.position.set(sign*.14,.055,z);pieces.push(m)}
    const arrow=merge(`force-${tile}`,pieces);arrow.bakeTransformIntoVertices(Matrix.RotationY(angle))
  }
  const edgePieces=(directions:number[],mat:ShaderMaterial)=>directions.map(d=>{const m=box('edge',mat,d%2?.055:.96,.23,d%2?.96:.055,.15);m.position.x=d===1?.46:d===3?-.46:0;m.position.z=d===0?-.46:d===2?.46:0;return m})
  for(const [tile,edges] of [[6,[0]],[7,[3]],[8,[2]],[9,[1]],[48,[1,2]]] as const)merge(`thin-${tile}`,edgePieces([...edges],dark))
  for(const [tile,edges] of [[26,[1,2]],[27,[2,3]],[28,[0,3]],[29,[0,1]]] as const)merge(`ice-${tile}`,[box('corner-ice',ice,.96,.04,.96,.03),...edgePieces([...edges],stone)])
  for(const [tile,mat] of [[35,colors[2]],[36,colors[1]],[39,brown],[40,colors[0]]] as const)merge(`button-${tile}`,[cylinder('button-base',dark,.48,.05,.06),cylinder('button-top',mat,.37,.09,.1)])
  const bomb=CreateSphere('bomb',{diameter:.42,segments:12},scene);bomb.position.y=.26;bomb.material=dark
  merge('bomb',[bomb,box('fuse',fire,.06,.18,.06,.51)])
  merge('trap',[box('trap-pit',dark,.7,.02,.7,.04),...edgePieces([0,1,2,3],brown)])
  merge('cloner',[box('cloner-base',gold,.9,.13,.9,.09),box('cloner-top',purple,.7,.025,.7,.17),box('cloner-mark',white,.1,.025,.42,.2)])
  merge('toggle-open',[box('toggle-open-frame',colors[2],.86,.02,.86,.035),box('toggle-open-center',stone,.7,.025,.7,.055)])
  merge('toggle-closed',[box('toggle-closed',colors[2],.88,.42,.88,.24)])
  merge('blue-wall',[box('blue-wall',water,.94,.46,.94,.27)])
  merge('popup',[box('popup-base',gold,.85,.04,.85,.03),box('popup-cross',dark,.09,.015,.52,.06)])
  merge('thief',[cylinder('thief',dark,.62,.04,.05),box('thief-mask',white,.45,.025,.12,.09)])
  merge('gravel',Array.from({length:9},(_,i)=>{const m=box('gravel-stone',gold,.12,.07,.13,.06);m.position.x=(i%3-1)*.23;m.position.z=(Math.floor(i/3)-1)*.23;return m}))
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
      if(actor)followCamera(camera,cameraTarget(actor.position.x,actor.position.z))
      scene.render()
    },
    rotate(heading){camera.alpha=Math.PI/2+heading*Math.PI/2;scene.render()},
    resize(){engine.resize()},
    metrics:()=>({meshes:scene.meshes.length,vertices:scene.getTotalVertices(),fps:engine.getFps(),width:engine.getRenderWidth(),height:engine.getRenderHeight()}),
    dispose(){if(disposed)return;disposed=true;engine.onContextLostObservable.remove(contextObserver);scene.dispose();engine.dispose()},
  }
  }catch(error){engine.dispose();throw error}
}
