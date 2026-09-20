import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseLegacyDat, normalizeLegacyLevel } from '../../src/features/games/shadow-circuit/content/legacyDat.ts'
const input=process.argv[2],campaign=process.argv[4]??'cclp1-community',output=process.argv[5]??'output/shadow-circuit/p02'
if(!input) throw new Error('Usage: node scripts/shadow-circuit/content-audit.mjs <local DAT> [python-raw-json]')
const bytes=readFileSync(input);const hash=createHash('sha256').update(bytes).digest('hex');const pack=parseLegacyDat(bytes)
const oracle=process.argv[3]?JSON.parse(readFileSync(process.argv[3],'utf8')):null
const rows=[];let parity=true
for(const raw of pack.levels) {
  if(oracle) {
    const source=oracle.levels[raw.recordIndex]
    if(!source || JSON.stringify(raw.upper)!==JSON.stringify(source.upper) || JSON.stringify(raw.lower)!==JSON.stringify(source.lower)
      || raw.number!==source.sourceLevelNumber || raw.timeLimit!==source.timeLimitSeconds || raw.requiredChips!==source.requiredChips
      || JSON.stringify(raw.fields.map(f=>[f.type,Buffer.from(f.raw).toString('hex')]))!==JSON.stringify(source.optionalFields.map(f=>[f.type,f.rawHex])))parity=false
  }
  try { const level=normalizeLegacyLevel(raw,hash,campaign);rows.push({recordIndex:raw.recordIndex,number:raw.number,title:level.title,actors:level.actors.length,traps:level.traps.length,clones:level.clones.length,semantic:'PASS_DEVELOPMENT_PROFILE',solution:'NOT_RUN',compatibility:'NOT_VERIFIED',warnings:level.warnings}) }
  catch(error) { rows.push({recordIndex:raw.recordIndex,number:raw.number,semantic:'BLOCKED',reason:error.message,solution:'NOT_RUN',compatibility:'NOT_VERIFIED'}) }
}
const result={campaign,sourceHash:hash,records:pack.levels.length,pythonParity:oracle?parity:'NOT_RUN',normalized:rows.filter(r=>r.semantic==='PASS_DEVELOPMENT_PROFILE').length,rows,redistributionApproved:false}
mkdirSync(output,{recursive:true});writeFileSync(`${output}/content-audit.json`,JSON.stringify(result,null,2))
console.log(JSON.stringify({...result,rows:undefined},null,2))
if(oracle&&!parity)process.exitCode=1
