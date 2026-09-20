import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { AUTHORED_LEVELS } from '../../src/features/games/shadow-circuit/content/authoredLevels.ts'
import { parseLegacyDat, normalizeLegacyLevel } from '../../src/features/games/shadow-circuit/content/legacyDat.ts'
import { createState, snapshot, restore } from '../../src/features/games/shadow-circuit/core/simulation.ts'
import { replay } from './replay.mjs'
const file=process.argv[2]
const bytes=file?readFileSync(file):null
const hash=bytes?createHash('sha256').update(bytes).digest('hex'):null
const levels=bytes?parseLegacyDat(bytes).levels.map(raw=>normalizeLegacyLevel(raw,hash)):AUTHORED_LEVELS
const routes=JSON.parse(readFileSync('tools/shadow-circuit/authored-solutions.json','utf8')).routes
const rows=levels.map(level=>{
  const failures=[];const cells=level.width*level.height
  if(level.top.length!==cells||level.bottom.length!==cells)failures.push('Layer size mismatch')
  if(level.actors.filter(actor=>actor.kind==='player').length!==1)failures.push('Expected one player')
  if(new Set(level.actors.map(actor=>actor.id)).size!==level.actors.length)failures.push('Duplicate actor IDs')
  for(const actor of level.actors)if(actor.cell<0||actor.cell>=cells)failures.push('Actor outside board')
  for(const link of [...level.traps,...level.clones])if([link.button,link.target].some(cell=>cell<0||cell>=cells))failures.push('Wire outside board')
  try {restore(level,snapshot(createState(level)))}catch(error){failures.push(error.message)}
  const route=routes.find(route=>route.levelId===level.id)
  const solution=route?replay(level,route):null
  return {id:level.id,number:level.number,title:level.title,structure:failures.length?'FAIL':'PASS',failures,solution:solution?.status??'NOT_RUN',legacyCompatibility:'NOT_VERIFIED',visual:'NOT_VERIFIED',physicalDevice:'NOT_RUN'}
})
mkdirSync('output/shadow-circuit/p03',{recursive:true})
writeFileSync(`output/shadow-circuit/p03/level-validation-${bytes?'imported':'authored'}.json`,JSON.stringify({sourceHash:hash,source:file??'original development chambers',rows},null,2))
console.log(JSON.stringify({levels:rows.length,structurePassed:rows.filter(row=>row.structure==='PASS').length,authoredRoutesPassed:rows.filter(row=>row.solution==='PASS_AUTHORED_DEVELOPMENT').length,legacyCompatibility:'NOT_VERIFIED',physicalDevice:'NOT_RUN'},null,2))
if(rows.some(row=>row.structure==='FAIL'||row.solution==='FAIL'))process.exitCode=1
