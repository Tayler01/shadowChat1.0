// Compare production TypeScript rules against verbatim server SQL in isolated
// PostgreSQL. Runtime setup is documented in shadow-checkers-sql-qa.mjs.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { transform } from 'esbuild'
import assert from 'node:assert/strict'
import { applyCheckersSqlOverrides } from './shadow-checkers-sql-overrides.mjs'

const sourcePath='src/features/games/shadow-checkers/engine/checkers.ts'
const sqlPath='supabase/migrations/20260512212357_shadow_checkers_domain.sql'
const source=await readFile(sourcePath,'utf8'),sql=await readFile(sqlPath,'utf8')
const compiled=await transform(source,{loader:'ts',format:'esm',target:'es2020'})
const engine=await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`)
const {PGlite}=await import(pathToFileURL(resolve('output/checkers-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js')).href)
const output=`output/shadow-checkers/rules-parity-${Date.now()}`
await mkdir(output,{recursive:true})
const report={status:'running',scope:'TypeScript vs actual PostgreSQL rule-function parity. Timestamps/order of piece storage normalized; every game-relevant field compared. No hosted matches or network.',sourcePath,sqlPath,sourceHash:createHash('sha256').update(source).digest('hex'),sqlHash:createHash('sha256').update(sql).digest('hex'),moves:0,captures:0,multiJumps:0,promotions:0,kingMoves:0,rejections:0,games:[]}
const db=await PGlite.create()
function normalized(value){const copy=JSON.parse(JSON.stringify(value,(key,value)=>key==='createdAt'?undefined:value));if(copy.state)copy.state.pieces.sort((a,b)=>a.id.localeCompare(b.id));else if(copy.pieces)copy.pieces.sort((a,b)=>a.id.localeCompare(b.id));return copy}
async function server(state,player,move){return (await db.query('select public.shadow_checkers_apply_move_state($1::jsonb,$2,$3,$4::jsonb) as result',[JSON.stringify(state),player,move.pieceId,JSON.stringify(move.path)])).rows[0].result}
async function rejectBoth(state,player,move,label){
 assert.throws(()=>engine.applyMove(state,player,move.pieceId,move.path),undefined,`${label}: client accepted`)
 await assert.rejects(()=>server(state,player,move),undefined,`${label}: server accepted`)
 report.rejections++
}
async function applyBoth(state,move,context){
 report.lastCase={...context,state,move}
 const client=engine.applyMove(state,state.turn,move.pieceId,move.path)
 const database=await server(state,state.turn,move)
 assert.deepEqual(normalized(database),normalized(client),`Rule disagreement in ${JSON.stringify(context)}`)
 report.moves++;report.captures+=move.captures.length;report.multiJumps+=Number(move.captures.length>1);report.promotions+=Number(move.crowned)
 report.kingMoves+=Number(state.pieces.find(p=>p.id===move.pieceId).king)
 return client.state
}
try{
 report.postgres=(await db.query('select version() as version')).rows[0].version
 const start=sql.indexOf('CREATE OR REPLACE FUNCTION public.shadow_checkers_is_playable_square(')
 const end=sql.indexOf('CREATE OR REPLACE FUNCTION public.shadow_checkers_update_stats_and_crown(')
 assert(start>=0&&end>start,'Rules migration boundaries changed')
 const rules=sql.slice(start,end)
 const names=new Set([...rules.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map(match=>match[1]))
 await db.exec(rules)
 report.overrides=await applyCheckersSqlOverrides(db,names,'20260512212357_shadow_checkers_domain.sql')
 report.ruleBodies=(await db.query("select proname,md5(trim(replace(prosrc,E'\\r\\n',E'\\n'))) as body_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('shadow_checkers_initial_board','shadow_checkers_apply_move_state') order by proname")).rows
 const initial=(await db.query('select public.shadow_checkers_initial_board() as board')).rows[0].board
 assert.deepEqual(normalized(initial),normalized(engine.createInitialBoard()),'Initial boards disagree')
 for(let seed=1;seed<=24;seed++){
  let state=engine.createInitialBoard(),random=seed*7919
  const game={seed,moves:[]};report.games.push(game)
  for(let ply=0;ply<400&&!state.winner;ply++){
   const legal=engine.getLegalMoves(state,state.turn)
   assert(legal.length>0,'A move must have detected a blocked opponent')
   random^=random<<13;random^=random>>>17;random^=random<<5
   const move=legal[(random>>>0)%legal.length]
   if(ply%10===0)await rejectBoth(state,engine.opponentOf(state.turn),move,'wrong turn')
   if(move.captures.length>1)await rejectBoth(state,state.turn,{...move,path:move.path.slice(0,-1)},'unfinished multi-jump')
   if(ply%20===0)await rejectBoth(state,state.turn,{...move,path:[move.path[0],{row:8,col:8}]},'outside board')
   if(move.captures.length){
    const piece=state.pieces.filter(p=>p.owner===state.turn).flatMap(p=>(p.king?[-1,1]:[state.turn==='player_one'?-1:1]).flatMap(dr=>[-1,1].map(dc=>({pieceId:p.id,path:[{row:p.row,col:p.col},{row:p.row+dr,col:p.col+dc}]})))).find(m=>{const end=m.path[1];return engine.isPlayableSquare(end.row,end.col)&&!state.pieces.some(p=>p.row===end.row&&p.col===end.col)})
    if(piece)await rejectBoth(state,state.turn,piece,'ignored mandatory capture')
   }
   game.moves.push({pieceId:move.pieceId,path:move.path})
   state=await applyBoth(state,move,{seed,ply})
  }
  game.winner=state.winner;game.reason=state.winReason;game.plies=game.moves.length
 }
 checkCoverage()
 delete report.lastCase
 report.status='passed'
}catch(error){report.status='failed';report.failure=error.stack;process.exitCode=1}
finally{await db.close();report.closed=true;await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({output,status:report.status,moves:report.moves,captures:report.captures,multiJumps:report.multiJumps,promotions:report.promotions,kingMoves:report.kingMoves,rejections:report.rejections,finishedGames:report.games.filter(g=>g.winner).length,failure:report.failure}))}

function checkCoverage(){
 assert(report.games.filter(g=>g.winner).length>=12,'Insufficient completed-game coverage')
 assert(report.multiJumps>=5&&report.promotions>=10&&report.kingMoves>=20&&report.rejections>=50,'Insufficient special-move/rejection coverage')
}
