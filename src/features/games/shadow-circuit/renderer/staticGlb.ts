/** Deliberately bounded profile for our own Blender kit, not a general/user GLB importer.
 * One baked mesh/node, triangle primitives, POSITION/NORMAL, solid base colors.
 * Reject animation, skins, external buffers, transforms and compressed extensions.
 */
type Accessor={bufferView:number;byteOffset?:number;componentType:number;count:number;type:string;sparse?:unknown}
type GlbDocument={asset:{version:string};buffers:{byteLength:number;uri?:string}[];bufferViews:{buffer:number;byteOffset?:number;byteLength:number;byteStride?:number}[];accessors:Accessor[];nodes:Record<string,unknown>[];meshes:{primitives:{attributes:{POSITION:number;NORMAL:number};indices:number;material:number;mode?:number}[]}[];materials:{pbrMetallicRoughness?:{baseColorFactor?:number[];baseColorTexture?:unknown;metallicFactor?:number;roughnessFactor?:number}}[];animations?:unknown[];skins?:unknown[];textures?:unknown[];extensionsRequired?:string[]}
export type StaticPrimitive={positions:number[];normals:number[];indices:number[];color:number[];metallic:number;roughness:number}
export function decodeStaticGlb(bytes:ArrayBuffer):StaticPrimitive[] {
  const fail=()=>{throw new Error('Unsupported or damaged built-in model.')}
  if(bytes.byteLength<28||bytes.byteLength>2_000_000)fail()
  const view=new DataView(bytes)
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==bytes.byteLength||view.getUint32(16,true)!==0x4e4f534a)fail()
  const jsonLength=view.getUint32(12,true),binaryHeader=20+jsonLength
  if(binaryHeader+8>bytes.byteLength||view.getUint32(binaryHeader+4,true)!==0x004e4942)fail()
  const binaryStart=binaryHeader+8,binaryLength=view.getUint32(binaryHeader,true)
  if(binaryStart+binaryLength!==bytes.byteLength)fail()
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,jsonLength))) as GlbDocument
  if(doc.asset?.version!=='2.0'||doc.buffers?.length!==1||doc.buffers[0].uri||doc.buffers[0].byteLength>binaryLength||doc.nodes?.length!==1||doc.nodes[0].mesh!==0||doc.meshes?.length!==1||!doc.materials||doc.animations?.length||doc.skins?.length||doc.textures?.length||doc.extensionsRequired?.length)fail()
  if(Object.keys(doc.nodes[0]).some(key=>!['mesh','name','extras'].includes(key)))fail()
  const array=(id:number,type:string)=>{
    const accessor=doc.accessors[id],buffer=accessor&&doc.bufferViews[accessor.bufferView]
    if(!accessor||!buffer||buffer.buffer!==0||accessor.sparse||accessor.type!==type||!Number.isInteger(accessor.count)||accessor.count<1||accessor.count>100000) return fail()
    const component=accessor.componentType,components=type==='VEC3'?3:1,size=component===5123?2:4
    if(type==='VEC3'?component!==5126:![5123,5125].includes(component))return fail()
    const stride=buffer.byteStride??size*components,relative=accessor.byteOffset??0,offset=(buffer.byteOffset??0)+relative
    if(stride<size*components||offset<0||relative+(accessor.count-1)*stride+components*size>buffer.byteLength||offset+(accessor.count-1)*stride+components*size>doc.buffers[0].byteLength) return fail()
    const result:number[]=[]
    for(let n=0;n<accessor.count;n++)for(let c=0;c<components;c++) {
      const position=binaryStart+offset+n*stride+c*size
      const value=component===5126?view.getFloat32(position,true):component===5123?view.getUint16(position,true):view.getUint32(position,true)
      if(!Number.isFinite(value))fail()
      result.push(value)
    }
    return result
  }
  return doc.meshes[0].primitives.map(primitive=>{
    if((primitive.mode??4)!==4)fail()
    const positions=array(primitive.attributes.POSITION,'VEC3'),normals=array(primitive.attributes.NORMAL,'VEC3'),indices=array(primitive.indices,'SCALAR')
    const material=doc.materials[primitive.material]?.pbrMetallicRoughness
    if(!material||material.baseColorTexture||positions.length!==normals.length||indices.length%3||indices.some(i=>i>=positions.length/3))fail()
    const color=material?.baseColorFactor??[1,1,1,1]
    if(color.length!==4||color.some(v=>!Number.isFinite(v)||v<0||v>1)||color[3]!==1)fail()
    const metallic=material?.metallicFactor??1,roughness=material?.roughnessFactor??1
    if(![metallic,roughness].every(v=>Number.isFinite(v)&&v>=0&&v<=1))fail()
    return {positions,normals,indices,color,metallic,roughness}
  })
}
