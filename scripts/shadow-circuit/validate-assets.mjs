import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import validator from 'gltf-validator'
const root=path.resolve(process.argv[2]??'assets-source/shadow-circuit/classic-kit')
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'))
const rows=[]
for(const asset of manifest.assets) {
  if(!/^[a-z0-9-]+$/.test(asset.id))throw new Error('Unsafe asset identifier')
  const bytes=await readFile(path.join(root,`${asset.id}.glb`))
  const validation=await validator.validateBytes(new Uint8Array(bytes),{uri:`${asset.id}.glb`,maxIssues:100})
  const document=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())
  const triangles=document.meshes.flatMap(mesh=>mesh.primitives).reduce((total,primitive)=>total+document.accessors[primitive.indices].count/3,0)
  const hash=createHash('sha256').update(bytes).digest('hex')
  const failures=[]
  if(hash!==asset.sha256)failures.push('Export digest differs from manifest')
  if(validation.issues.numErrors)failures.push('Khronos validation errors')
  if(triangles!==asset.triangles||triangles>asset.triangleCeiling)failures.push('Triangle count or budget mismatch')
  if(document.buffers.some(buffer=>buffer.uri))failures.push('Unexpected external buffer')
  rows.push({id:asset.id,triangles,bytes:bytes.length,sha256:hash,status:failures.length?'FAIL':'PASS_STATIC',failures,validation})
}
await mkdir('output/shadow-circuit/p04',{recursive:true})
await writeFile('output/shadow-circuit/p04/asset-validation.json',JSON.stringify({validator:validator.version(),rows},null,2))
console.log(JSON.stringify({assets:rows.length,bytes:rows.reduce((sum,row)=>sum+row.bytes,0),results:rows.map(({id,status,triangles,validation})=>({id,status,triangles,errors:validation.issues.numErrors,warnings:validation.issues.numWarnings})),runtime:'CHECK_SEPARATELY',animations:'NOT_CREATED'},null,2))
if(rows.some(row=>row.status==='FAIL'))process.exitCode=1
