// Isolated PostgreSQL/WASM RPC tests. No network, app credentials or live data.
// Install the pinned development-only runtime outside the app:
// npm install --prefix output/checkers-sql-runtime --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.3.16
// --baseline runs the same expectations without the continuation migration.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { applyCheckersSqlOverrides } from './shadow-checkers-sql-overrides.mjs'

const {PGlite}=await import(pathToFileURL(resolve('output/checkers-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js')).href)
const baseline=process.argv.includes('--baseline')
const output=`output/shadow-checkers/sql-${baseline?'baseline':'continuation'}-${Date.now()}`
await mkdir(output,{recursive:true})
const report={baseline,scope:'Real PostgreSQL SQL/PLpgSQL and checkers migrations in an isolated single connection. Minimal users/auth.uid fixture; no GoTrue, REST, Realtime, notifications or concurrent-transaction proof.',migrations:[],checks:[]}
const db=await PGlite.create()
const ids=[1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`)
let assertions=0
function check(value,message){assert(value,message);assertions++}
async function rows(sql,args=[]){return (await db.query(sql,args)).rows}
async function rpc(user,name,args=[]){
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||''])
 await db.exec('set role authenticated')
 try{return (await rows(`select to_jsonb(public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')})) as value`,args))[0].value}
 finally{await db.exec('reset role')}
}
async function rejects(user,name,args,pattern){await assert.rejects(()=>rpc(user,name,args),pattern);assertions++}
async function fresh(character='obsidian-sentinel'){
 await db.exec('truncate public.users cascade')
 for(const id of ids)await db.query('insert into public.users(id) values($1)',[id])
 const created=await rpc(ids[0],'create_shadow_checkers_match',[character,'cinematic'])
 await rpc(ids[1],'join_shadow_checkers_match',[created.sessionId,'amber-vow'])
 return created
}
async function match(id){return (await rows('select * from public.shadow_checkers_matches where id=$1',[id]))[0]}
async function run(name,fn){try{const before=assertions;await fn();report.checks.push({name,status:'passed',assertions:assertions-before})}catch(error){report.checks.push({name,status:'failed',error:String(error)})}}
try{
 report.postgres=(await rows('select version() as version'))[0].version
 await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated;
  create table public.users(id uuid primary key, admin_role text);
  create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
 `)
 const migrations=['20260511213509_shadow_war_games.sql','20260512212357_shadow_checkers_domain.sql','20260512215800_shadow_checkers_rematch_queue.sql','20260513234318_shadow_checkers_board_skin_admin_cancel.sql']
 const names=new Set()
 async function loadMigration(name){const sql=await readFile(`supabase/migrations/${name}`,'utf8');await db.exec(sql);for(const match of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g))if(match[1].includes('shadow_checkers'))names.add(match[1]);report.migrations.push({name,sha256:createHash('sha256').update(sql).digest('hex')})}
 for(const name of migrations)await loadMigration(name)
 report.overrides=await applyCheckersSqlOverrides(db,names,'20260513234318_shadow_checkers_board_skin_admin_cancel.sql','20260925053123_shadow_checkers_continuation_integrity.sql')
 if(!baseline)for(const name of (await readdir('supabase/migrations')).filter(name=>name.endsWith('_shadow_checkers_continuation_integrity.sql')))await loadMigration(name)
 await run('winning move settles statistics and crown once',async()=>{
  const initial=await fresh()
  const board=(await match(initial.matchId)).board_state
  board.pieces=[{id:'silver',owner:'player_one',row:2,col:1,king:false},{id:'black',owner:'player_two',row:1,col:2,king:false}]
  await db.query('update public.shadow_checkers_matches set board_state=$1 where id=$2',[JSON.stringify(board),initial.matchId])
  await rejects(ids[1],'submit_shadow_checkers_move',[initial.matchId,'black',JSON.stringify([{row:1,col:2},{row:2,col:3}])],/Not your turn/)
  await rpc(ids[0],'submit_shadow_checkers_move',[initial.matchId,'silver',JSON.stringify([{row:2,col:1},{row:0,col:3}])])
  const ended=await match(initial.matchId)
  check(ended.status==='completed'&&ended.winner_id===ids[0]&&ended.win_reason==='all_pieces_captured','Final capture must award the correct winner')
  const stats=(await rows('select * from public.shadow_checkers_stats where user_id=$1',[ids[0]]))[0]
  check(stats.wins===1&&stats.total_games===1&&stats.captures_made===1&&stats.kings_crowned===1,'Capture and crown totals must settle once')
  const loser=(await rows('select * from public.shadow_checkers_stats where user_id=$1',[ids[1]]))[0]
  check(loser.losses===1&&loser.wins===0&&loser.total_games===1,'Loser totals must settle once')
  check((await rows('select id from public.users where checkers_crown')).map(r=>r.id).join()===ids[0],'Exactly the leader holds the crown')
  await rejects(ids[0],'submit_shadow_checkers_move',[initial.matchId,'silver',JSON.stringify([{row:0,col:3},{row:1,col:2}])],/not active|Active match not found/i)
  check((await rows('select wins from public.shadow_checkers_stats where user_id=$1',[ids[0]]))[0].wins===1,'Replay cannot award another win')
 })
 await run('primary admin keeps statistics while crown rotates to a non-admin',async()=>{
  const initial=await fresh()
  await db.query("update public.users set admin_role='admin' where id=$1",[ids[0]])
  await rpc(ids[1],'resign_shadow_checkers_match',[initial.matchId])
  check((await rows('select wins from public.shadow_checkers_stats where user_id=$1',[ids[0]]))[0].wins===1,'Admin wins remain in statistics')
  check((await rows('select id from public.users where checkers_crown')).map(r=>r.id).join()===ids[1],'Crown belongs to the highest ranked eligible non-admin')
 })
 await run('rematch keeps cosmetics, roles and one continuation on retries',async()=>{
  const initial=await fresh()
  await rpc(ids[1],'resign_shadow_checkers_match',[initial.matchId])
  await rejects(ids[2],'rematch_shadow_checkers_match',[initial.matchId],/Only players/)
  await rejects(null,'rematch_shadow_checkers_match',[initial.matchId],/Not authenticated/)
  const next=await rpc(ids[0],'rematch_shadow_checkers_match',[initial.matchId])
  const replay=await rpc(ids[1],'rematch_shadow_checkers_match',[initial.matchId])
  check(next.matchId===replay.matchId,'Both players and retries must share one continuation')
  const result=await match(next.matchId)
  check(result.board_skin==='cinematic','Rematch must preserve the selected board')
  check(result.player_one_id===ids[0]&&result.player_two_id===ids[1]&&result.current_turn_user_id===ids[0],'Rematch keeps both seats and opening turn')
  check(result.player_one_character_key==='obsidian-sentinel'&&result.player_two_character_key==='amber-vow'&&result.board_state.pieces.length===24,'Rematch preserves characters and resets all 24 pieces')
  check((await rows('select count(*)::int as count from public.shadow_checkers_matches'))[0].count===2,'Retry cannot create a second rematch')
 })
 await run('next challenger resolves character collision and carries FIFO queue across wins',async()=>{
  const initial=await fresh('veil-rogue')
  await rpc(ids[2],'queue_shadow_checkers_match',[initial.sessionId,'veil-rogue'])
  await rpc(ids[3],'queue_shadow_checkers_match',[initial.sessionId,'cinder-crown'])
  await rpc(ids[1],'resign_shadow_checkers_match',[initial.matchId])
  await rejects(ids[0],'rematch_shadow_checkers_match',[initial.matchId],/queued challenger/i)
  await rejects(ids[1],'start_shadow_checkers_next_challenger',[initial.matchId],/Only the winner/)
  const next=await rpc(ids[0],'start_shadow_checkers_next_challenger',[initial.matchId])
  const result=await match(next.matchId)
  check(result.board_skin==='cinematic','Next challenger must preserve the selected board')
  check(result.player_one_id===ids[0]&&result.player_two_id===ids[2],'First queued player is seated with the winner')
  check(result.player_one_character_key==='veil-rogue'&&result.player_two_character_key!=='veil-rogue','Fallback character must differ from the winner')
  const queue=await rows("select * from public.game_session_queue where session_id=$1 and status in ('queued','invited') order by position,created_at",[next.sessionId])
  check(queue.length===1&&queue[0].user_id===ids[3]&&queue[0].metadata.characterKey==='cinder-crown','Unseated challengers and cosmetics must follow the active table')
  const replay=await rpc(ids[0],'start_shadow_checkers_next_challenger',[initial.matchId])
  check(replay.matchId===next.matchId,'Retry must not consume another challenger')
  await rpc(ids[0],'resign_shadow_checkers_match',[next.matchId])
  const third=await rpc(ids[2],'start_shadow_checkers_next_challenger',[next.matchId])
  const continued=await match(third.matchId)
  check(continued.player_one_id===ids[2]&&continued.player_two_id===ids[3],'The new winner meets the next queued challenger')
  check(continued.player_one_character_key===result.player_two_character_key&&continued.player_two_character_key==='cinder-crown','Winner cosmetics survive a seat change')
 })
 await run('players cannot directly edit boards or result statistics',async()=>{
  const initial=await fresh()
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[0]])
  await db.exec('set role authenticated')
  try{
   await assert.rejects(()=>db.query("update public.shadow_checkers_matches set winner_id=$1 where id=$2",[ids[0],initial.matchId]),/permission denied/)
   await assert.rejects(()=>db.query('insert into public.shadow_checkers_stats(user_id,wins) values($1,999)',[ids[0]]),/permission denied/)
   assertions+=2
  }finally{await db.exec('reset role')}
 })
 await run('missing historical players fail closed and continuation RPCs require authenticated access',async()=>{
  const initial=await fresh()
  await rpc(ids[1],'resign_shadow_checkers_match',[initial.matchId])
  await db.query('update public.shadow_checkers_matches set player_two_id=null where id=$1',[initial.matchId])
  await rejects(ids[2],'rematch_shadow_checkers_match',[initial.matchId],/Only players/)
  await rejects(ids[0],'rematch_shadow_checkers_match',[initial.matchId],/Both players/)
  await db.query('update public.shadow_checkers_matches set winner_id=null where id=$1',[initial.matchId])
  await rejects(ids[2],'start_shadow_checkers_next_challenger',[initial.matchId],/Only the winner/)
  const privileges=await rows("select p.proname,has_function_privilege('anon',p.oid,'execute') as anonymous,has_function_privilege('authenticated',p.oid,'execute') as authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rematch_shadow_checkers_match','start_shadow_checkers_next_challenger')")
  check(privileges.length===2&&privileges.every(p=>!p.anonymous&&p.authenticated),'Continuation RPCs must grant execution only to authenticated users')
 })
 report.status=report.checks.every(check=>check.status==='passed')?'passed':'failed'
 report.assertions=assertions
 if(report.status==='failed')process.exitCode=1
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1}
finally{await db.close();report.closed=true;await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report}))}
