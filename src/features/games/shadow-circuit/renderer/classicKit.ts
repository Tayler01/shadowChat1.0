import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Scene } from '@babylonjs/core/scene'
import { classicMaterial } from './classicMaterial'
import { decodeStaticGlb } from './staticGlb.ts'

const modelFiles=import.meta.glob('../assets/classic/*.glbz',{eager:true,query:'?url&no-inline',import:'default'}) as Record<string,string>
const aliases:Record<string,string>={'hero-explorer':'player','enemy-bug':'bug','tile-floor':'floor','tile-wall':'wall','item-chip':'chip'}
for(const [index,color] of ['blue','red','green','yellow'].entries()){aliases[`key-${color}`]=`key-${index}`;aliases[`door-${color}`]=`door-${index}`}
for(const kind of ['fireball','ball','tank','glider','teeth','walker','blob','paramecium'])aliases[`enemy-${kind}`]=kind
for(let i=0;i<4;i++)aliases[`item-boot-${i}`]=`boot-${i}`

export async function loadClassicKit(scene:Scene,templates:Map<string,Mesh>) {
  const decoded=await Promise.all(Object.entries(modelFiles).map(async([path,url])=>{
    const response=await fetch(url)
    if(!response.ok)throw new Error('A chamber model could not be loaded. Retry to continue.')
    const name=path.slice(path.lastIndexOf('/')+1,-5)
    if(!response.body)throw new Error('A chamber model was empty.')
    const bytes=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    return {name,primitives:decodeStaticGlb(bytes)}
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
