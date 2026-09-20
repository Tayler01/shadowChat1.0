import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import { classicMaterial } from './classicMaterial'
import { decodeStaticGlb } from './staticGlb.ts'
import manifest from '../content/assetManifest.json'
import { fetchAsset } from '../content/fetchAsset.ts'

const aliases:Record<string,string>={'hero-explorer':'player','enemy-bug':'bug','tile-floor':'floor','tile-wall':'wall','item-chip':'chip'}
for(const [index,color] of ['blue','red','green','yellow'].entries()){aliases[`key-${color}`]=`key-${index}`;aliases[`door-${color}`]=`door-${index}`}
for(const kind of ['fireball','ball','tank','glider','teeth','walker','blob','paramecium'])aliases[`enemy-${kind}`]=kind
for(let i=0;i<4;i++)aliases[`item-boot-${i}`]=`boot-${i}`

for(const kind of ['exit','socket','teleport','water','ice','fire','dirt','block','hint','bomb','trap','cloner','toggle-open','toggle-closed','blue-wall','popup','thief','gravel'])aliases[`terrain-${kind}`]=kind
for(const [kind,tiles] of [['ice',[26,27,28,29]],['thin',[6,7,8,9,48]],['force',[13,18,19,20,50]],['button',[35,36,39,40]]] as const)for(const tile of tiles)aliases[`terrain-${kind}-${tile}`]=`${kind}-${tile}`

export async function loadClassicKit(scene:Scene,templates:Map<string,Mesh>) {
  const decoded=await Promise.all(manifest.models.map(async asset=>{
    const compressed=await fetchAsset(asset)
    const bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    return {name:asset.id,primitives:decodeStaticGlb(bytes)}
  }))
  if(decoded.length!==Object.keys(aliases).length||decoded.some(model=>!aliases[model.name]))throw new Error('The classic model kit is incomplete.')
  const materials=new Map<string,ReturnType<typeof classicMaterial>>()
  for(const {name,primitives} of decoded) {
    const parts=primitives.map((primitive,index)=>{
      const mesh=new Mesh(`${name}-${index}`,scene),data=new VertexData()
      data.positions=primitive.positions;data.normals=primitive.normals;data.indices=primitive.indices;data.applyToMesh(mesh)
      const key=[...primitive.color,primitive.metallic,primitive.roughness].join(',')
      let material=materials.get(key)
      if(!material){material=classicMaterial(scene,`kit-${materials.size}`,new Color3(...primitive.color.slice(0,3) as [number,number,number]).toGammaSpace(),0,primitive.metallic,primitive.roughness);materials.set(key,material)}
      mesh.material=material
      return mesh
    })
    const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!
    mesh.name=name;mesh.isVisible=false
    const alias=aliases[name]
    templates.get(alias)?.dispose();templates.set(alias,mesh)
  }
}
