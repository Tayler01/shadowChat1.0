import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {parseLegacyDat,normalizeLegacyLevel} from '../../src/features/games/shadow-circuit/content/legacyDat.ts'
import {tileVisual} from '../../src/features/games/shadow-circuit/renderer/tileVisual.ts'
const bytes=readFileSync('assets-source/shadow-circuit/original-authorized/chips.dat')
const hash=createHash('sha256').update(bytes).digest('hex')
const pack=parseLegacyDat(bytes),rows=[],counts={},failures=[]
const catalog=JSON.parse(readFileSync('assets-source/shadow-circuit/circuit-kit-v2/manifest.json','utf8')).assets.map(a=>a.id)
const modelId=visual=>visual.startsWith('door-')?`door-${['blue','red','green','yellow'][Number(visual.slice(5))]}`:visual.startsWith('key-')?`key-${['blue','red','green','yellow'][Number(visual.slice(4))]}`:visual.startsWith('boot-')?`item-${visual}`:visual==='chip'?'item-chip':visual==='wall'?'tile-wall':`terrain-${visual}`
for(const raw of pack.levels){
  const level=normalizeLegacyLevel(raw,hash,'mscc-original'),tiles={}
  for(const [layer,cells] of [['top',level.top],['bottom',level.bottom]])cells.forEach((tile,cell)=>{
    const visual=tileVisual(tile)
    if(!visual&&![0,5,44].includes(tile))failures.push({level:level.number,layer,cell,tile,reason:'Unmapped terrain'})
    if(visual&&!catalog.includes(modelId(visual)))failures.push({level:level.number,layer,cell,tile,reason:'Missing model'})
    if([13,18,19,20,50,21,41,26,27,28,29,6,7,8,9,48].includes(tile)){
      tiles[tile]=(tiles[tile]??0)+1;counts[tile]=(counts[tile]??0)+1
    }
  })
  for(const link of [...level.traps,...level.clones])if(link.button<0||link.button>=1024||link.target<0||link.target>=1024)failures.push({level:level.number,reason:'Out-of-bounds mechanism link'})
  rows.push({level:level.number,title:level.title,tiles})
}
const report={campaignHash:hash,levels:rows.length,counts,failures,scope:'All normalized top/bottom terrain mappings and directional-model references; not full level solution or exact MS rules certification.',rows}
mkdirSync('output/shadow-circuit/terrain-audit',{recursive:true})
writeFileSync('output/shadow-circuit/terrain-audit/report.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,rows:undefined},null,2))
if(failures.length)process.exitCode=1
