import sharp from 'sharp'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
const source='assets-source/shadow-circuit/branding/selected'
const output='src/features/games/shadow-circuit/assets/branding'
await mkdir(output,{recursive:true})
for(const [input,name,width,quality] of [['menu-background.png','menu-background',1440,55],['logo.png','logo',500,60],['picker-banner-launcher.png','picker-banner',1440,55],['gameplay-pcb.png','gameplay-pcb',800,45]]){
  await sharp(`${source}/${input}`).resize({width}).webp({quality,effort:6}).toFile(`${output}/${name}.webp`)
}
const kit='assets-source/shadow-circuit/circuit-kit-v2'
const target='src/features/games/shadow-circuit/assets/classic'
await mkdir(target,{recursive:true})
const rows=[]
for(const name of (await readdir(kit)).filter(n=>n.endsWith('.glb'))){
  const bytes=await readFile(`${kit}/${name==='hero-explorer.glb'?'runtime-lod/':''}${name}`)
  const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),binary=28+bytes.readUInt32LE(12)
  for(const primitive of document.meshes[0].primitives)for(const semantic of ['POSITION','NORMAL']){
    const accessor=document.accessors[primitive.attributes[semantic]],view=document.bufferViews[accessor.bufferView],precision=semantic==='NORMAL'?512:4096
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
    for(let i=0;i<accessor.count;i++)for(let c=0;c<3;c++){
      const at=binary+(view.byteOffset??0)+(accessor.byteOffset??0)+i*(view.byteStride??12)+c*4
      const value=Math.round(bytes.readFloatLE(at)*precision)/precision
      bytes.writeFloatLE(value,at);min[c]=Math.min(min[c],value);max[c]=Math.max(max[c],value)
    }
    if(accessor.min)accessor.min=min
    if(accessor.max)accessor.max=max
  }
  const json=Buffer.from(JSON.stringify(document)),padding=(4-json.length%4)%4
  const padded=Buffer.concat([json,Buffer.alloc(padding,32)]),header=Buffer.from(bytes.subarray(0,20))
  const result=Buffer.concat([header,padded,bytes.subarray(binary-8)])
  result.writeUInt32LE(result.length,8);result.writeUInt32LE(padded.length,12)
  const compressed=gzipSync(result,{level:9})
  await writeFile(`${target}/${name.slice(0,-4)}.glbz`,compressed)
  rows.push({name,sourceBytes:bytes.length,runtimeBytes:compressed.length})
}
await writeFile(`${kit}/runtime-payload.json`,JSON.stringify(rows,null,2)+'\n')
console.log(JSON.stringify({models:rows.length,sourceBytes:rows.reduce((s,r)=>s+r.sourceBytes,0),runtimeBytes:rows.reduce((s,r)=>s+r.runtimeBytes,0)}))
