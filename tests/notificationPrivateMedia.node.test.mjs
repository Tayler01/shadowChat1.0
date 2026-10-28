import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'
import {getPrivateNotificationPinMedia,NotificationMediaAccessDeniedError,shouldIncludeNotificationMedia} from '../supabase/functions/_shared/notification-private-media.ts'
const ids={recipient:'10000000-0000-4000-8000-000000000001',owner:'20000000-0000-4000-8000-000000000002',category:'30000000-0000-4000-8000-000000000003',pin:'40000000-0000-4000-8000-000000000004',event:'50000000-0000-4000-8000-000000000005',video:'60000000-0000-4000-8000-000000000006'}
const request={eventId:ids.event,userId:ids.recipient,imageId:ids.pin}
const config={projectUrl:'https://example.supabase.co',bunny:{libraryId:'666331',pullZoneUrl:'https://video.example.com',tokenSecurityKey:'test-secret-key-for-isolated-signing-fixture',nowSeconds:1000}}
const pin={id:ids.pin,creator_id:ids.owner,title:'Fixture',thumbnail_url:`${config.projectUrl}/storage/v1/object/public/shadow-pin/${ids.owner}/poster.webp`,image_content_type:'image/webp',provider:'upload',provider_asset_id:null}
function client(row=pin,trusted=[]){const signs=[];let checks=0;return {signs,get checks(){return checks},rpc:async name=>{checks++;return {data:name==='get_notification_pin_media_for_service'?(row?[row]:[]):trusted,error:null}},storage:{from:bucket=>({createSignedUrl:async(path,ttl,options)=>{signs.push({bucket,path,ttl,options});return {data:{signedUrl:'https://example.supabase.co/signed-fixture'},error:null}}})}}}
test('Storage signing uses fresh authorization and 600s TTL, preserving transforms',async()=>{const c=client({...pin,thumbnail_url:pin.thumbnail_url+'?width=200&resize=cover'});const r=await getPrivateNotificationPinMedia(c,request,config);assert.equal(r.thumbnailUrl,'https://example.supabase.co/signed-fixture');assert.deepEqual(c.signs,[{bucket:'shadow-pin',path:`${ids.owner}/poster.webp`,ttl:600,options:{transform:{width:200,resize:'cover'}}}]);assert.equal(c.checks,1)})
test('unauthorized recipient produces no signed or public fallback image',async()=>{const c=client(null);await assert.rejects(getPrivateNotificationPinMedia(c,request,config),NotificationMediaAccessDeniedError);assert.equal(c.signs.length,0)})
test('writable foreign-owner URL cannot become a privileged Storage signing oracle',async()=>{const c=client({...pin,thumbnail_url:pin.thumbnail_url.replace(ids.owner,ids.recipient)});assert.equal(await getPrivateNotificationPinMedia(c,request,config),null);assert.equal(c.signs.length,0)})
test('legacy derivative must match the canonical Pin id',async()=>{for(const [id,allowed] of [[ids.pin,true],[ids.event,false]]){const c=client({...pin,thumbnail_url:`${config.projectUrl}/storage/v1/object/public/shadow-pin/derivatives/images/${id}/thumbnail.webp`});const r=await getPrivateNotificationPinMedia(c,request,config);assert.equal(Boolean(r),allowed);assert.equal(c.signs.length,allowed?1:0)}})
test('Bunny poster requires trusted ownership and expires after 300s',async()=>{const row={...pin,provider:'bunny_stream',provider_asset_id:ids.video,thumbnail_url:`https://video.example.com/${ids.video}/thumbnail.jpg`};const c=client(row,[{library_id:'666331',asset_id:ids.video,owner_id:ids.owner}]);const r=await getPrivateNotificationPinMedia(c,request,config);assert.match(r.thumbnailUrl,/expires=1300/);assert.equal(c.signs.length,0);assert.equal(await getPrivateNotificationPinMedia(client(row,[{library_id:'666331',asset_id:ids.video,owner_id:ids.recipient}]),request,config),null)})
test('Bunny URL with false provider never falls through to unsigned delivery',async()=>{assert.equal(await getPrivateNotificationPinMedia(client({...pin,thumbnail_url:`https://video.example.com/${ids.video}/thumbnail.jpg`}),request,config),null)})
test('canonical external HTTPS image remains unchanged after authorization',async()=>{const c=client({...pin,thumbnail_url:'https://images.example.org/poster.png'});assert.equal((await getPrivateNotificationPinMedia(c,request,config)).thumbnailUrl,'https://images.example.org/poster.png')})
test('database errors fail closed before signing',async()=>{const c=client();c.rpc=async()=>({data:null,error:new Error('unavailable')});await assert.rejects(getPrivateNotificationPinMedia(c,request,config),/authorization is unavailable/);assert.equal(c.signs.length,0)})
test('actual SQL adapter binds event, recipient, visibility and service role',async()=>{
 const db=await PGlite.create();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth,public to anon,authenticated,service_role;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 create table public.users(id uuid primary key,active boolean default true,operator boolean default false);
 create table public.user_blocks(blocker_id uuid,blocked_id uuid);
 create table public.shadow_pin_categories(id uuid primary key,creator_id uuid,deleted_at timestamptz);
 create table public.shadow_pin_images(id uuid primary key,creator_id uuid,category_id uuid,title text,thumbnail_url text,medium_url text,image_url text,image_content_type text,provider text,provider_asset_id text,media_type text,processing_status text,deleted_at timestamptz);
 create table public.notification_events(id uuid primary key,user_id uuid,entity_id uuid,actor_id uuid,payload jsonb,read_at timestamptz,resolved_at timestamptz,type text default 'shadow_pin_post');
 create table public.shadow_pin_comments(id uuid primary key,image_id uuid,author_id uuid);
 create table public.notification_preferences(user_id uuid primary key,notifications_enabled boolean default true,notification_preview_mode text default 'full',notification_media_enabled boolean default true,shadow_pin_new_post_enabled boolean default true,shadow_pin_comment_enabled boolean default true,shadow_pin_reply_enabled boolean default true);
 create table public.notification_envelopes_v2(event_id uuid,user_id uuid,media_ref jsonb);
 create function public.is_active_member_for_service(id uuid) returns boolean language sql stable as $$select exists(select 1 from public.users u where u.id=$1 and active)$$;
 create function public.is_app_operator(id uuid) returns boolean language sql stable as $$select exists(select 1 from public.users u where u.id=$1 and operator)$$;
 grant select on all tables in schema public to service_role;
 insert into public.users(id) values('${ids.recipient}'),('${ids.owner}');
 insert into public.notification_preferences(user_id) values('${ids.recipient}');
 insert into public.shadow_pin_categories values('${ids.category}','${ids.owner}',null);
 insert into public.shadow_pin_images(id,creator_id,category_id,title,thumbnail_url,media_type,processing_status) values('${ids.pin}','${ids.owner}','${ids.category}','test','https://example.invalid/image','image','ready');
 insert into public.notification_events(id,user_id,entity_id,actor_id,payload) values('${ids.event}','${ids.recipient}','${ids.pin}','${ids.owner}','{}');`)
 await db.exec(readFileSync(new URL('../supabase/migrations/20261028121930_notification_private_media_authorization.sql',import.meta.url),'utf8'))
 const query=`select * from public.get_notification_pin_media_for_service('${ids.event}','${ids.recipient}','${ids.pin}')`
 const read=async()=>{await db.exec('set role service_role');try{return (await db.query(query)).rows}finally{await db.exec('reset role')}}
 assert.equal((await read()).length,1)
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query(query),/permission denied/);await db.exec('reset role')}
 const cases=[
 [`update notification_preferences set notifications_enabled=false`,`update notification_preferences set notifications_enabled=true`],
 [`update notification_preferences set shadow_pin_new_post_enabled=false`,`update notification_preferences set shadow_pin_new_post_enabled=true`],
 [`update notification_events set resolved_at=now()`,`update notification_events set resolved_at=null`],
 [`update notification_events set type='dm_message'`,`update notification_events set type='shadow_pin_post'`],
 [`insert into user_blocks values('${ids.recipient}','${ids.owner}')`,`delete from user_blocks`],

 [`update users set active=false where id='${ids.recipient}'`,`update users set active=true`],
 [`update users set active=false where id='${ids.owner}'`,`update users set active=true`],
 [`update notification_events set read_at=now()`,`update notification_events set read_at=null`],
 [`update notification_events set entity_id='${ids.category}'`,`update notification_events set entity_id='${ids.pin}'`],
 [`update notification_events set user_id='${ids.owner}'`,`update notification_events set user_id='${ids.recipient}'`],
 [`update shadow_pin_images set deleted_at=now()`,`update shadow_pin_images set deleted_at=null`],
 [`update shadow_pin_categories set deleted_at=now()`,`update shadow_pin_categories set deleted_at=null`],
 [`insert into user_blocks values('${ids.owner}','${ids.recipient}')`,`delete from user_blocks`],
 [`update shadow_pin_images set media_type='video',processing_status='processing'`,`update shadow_pin_images set media_type='image',processing_status='ready'`],
 ]
 for(const preference of ["notification_preview_mode='full',notification_media_enabled=true","notification_preview_mode='sender_only'","notification_preview_mode='private'","notification_preview_mode='full',notification_media_enabled=false"]){
 await db.exec('update notification_preferences set '+preference)
 assert.equal((await read()).length,1,'valid text-only target: '+preference)
 for(const [deny,undo]of cases){await db.exec(deny);assert.equal((await read()).length,0,preference+': '+deny);await db.exec(undo)}
 }
 assert.equal((await read()).length,1)
 // Canonical comment relationship, not arbitrary payload/media_ref, binds comment delivery.
 await db.exec(`insert into shadow_pin_comments values('${ids.event}','${ids.pin}','${ids.owner}'); update notification_events set type='shadow_pin_comment',entity_id='${ids.event}';`)
 assert.equal((await read()).length,1)
 await db.exec('delete from shadow_pin_comments')
 assert.equal((await read()).length,0)
 await db.exec(`update notification_events set type='shadow_pin_post',entity_id='${ids.pin}'; update shadow_pin_images set media_type='video',processing_status='processing'; update users set operator=true where id='${ids.recipient}';`)
 assert.equal((await read()).length,1,'Operator preserves existing processing visibility')
 await db.exec(`update users set operator=false; update shadow_pin_images set creator_id='${ids.recipient}';`)
 assert.equal((await read()).length,1,'Creator preserves existing processing visibility')
 }finally{await db.close()}
})


test('private and sender-only presentation never request media',()=>{
 for(const preferences of [null,undefined,{}, {notification_preview_mode:'private'}, {notification_preview_mode:'sender_only'}, {notification_preview_mode:'full',notification_media_enabled:false}])assert.equal(shouldIncludeNotificationMedia(preferences),false)
 assert.equal(shouldIncludeNotificationMedia({notification_preview_mode:'full',notification_media_enabled:true}),true)
})
test('authorized Pin with no thumbnail retains a text delivery',async()=>{assert.equal(await getPrivateNotificationPinMedia(client({...pin,thumbnail_url:null}),request,config),null)})
test('delivery retries reauthorize and re-sign rather than reuse an expiring URL',async()=>{
 const c=client();let count=0
 c.storage.from=bucket=>({createSignedUrl:async(path,ttl)=>{c.signs.push({bucket,path,ttl});return {data:{signedUrl:'https://example.supabase.co/signed?token=attempt-'+(++count)},error:null}}})
 const a=await getPrivateNotificationPinMedia(c,request,config),b=await getPrivateNotificationPinMedia(c,request,config)
 assert.notEqual(a.thumbnailUrl,b.thumbnailUrl);assert.equal(c.checks,2);assert.equal(c.signs.length,2)
})
test('revocation between attempts prevents re-signing; storage outage does not become unsigned fallback',async()=>{
 const c=client();await getPrivateNotificationPinMedia(c,request,config)
 c.rpc=async()=>({data:[],error:null})
 await assert.rejects(getPrivateNotificationPinMedia(c,request,config),NotificationMediaAccessDeniedError);assert.equal(c.signs.length,1)
 const broken=client();broken.storage.from=()=>({createSignedUrl:async()=>({data:null,error:new Error('outage')})})
 await assert.rejects(getPrivateNotificationPinMedia(broken,request,config),/signing is unavailable/)
})
test('unrecognized private Storage paths never fall through as external public images',async()=>{
 const c=client({...pin,thumbnail_url:config.projectUrl+'/storage/v1/object/sign/moderation-evidence/private.png?token=old'})
 assert.equal(await getPrivateNotificationPinMedia(c,request,config),null);assert.equal(c.signs.length,0)
})

import vm from 'node:vm'
import ts from 'typescript'
const pushSource=readFileSync(new URL('../supabase/functions/send-push/index.ts',import.meta.url),'utf8')
const recoverySource=pushSource.slice(pushSource.indexOf('const sendNotificationDeliveryRecovery ='),pushSource.indexOf('const sendPresenceActivePush ='))
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const policyContext={exports:{}}
vm.runInNewContext(transpile(readFileSync(new URL('../supabase/functions/_shared/web-push-policy.ts',import.meta.url),'utf8')),policyContext)
function recoveryHarness({enabled=true,prefs={notification_preview_mode:'full',notification_media_enabled:true},failure}={}){
 const state={authorizations:[],signs:[],deliveries:[],jobs:[]}
 const job={job_id:'job',notification_event_id:ids.event,user_id:ids.recipient,entity_id:ids.pin,actor_id:ids.owner,event_type:'shadow_pin_post',expires_at:new Date(Date.now()+600000).toISOString(),attempt_count:1,route:'/?view=shadowpin&image='+ids.pin,payload:{title:'A shared a Pin',body:'Caption',image_id:ids.pin}}
 const chain={update(){return chain},eq(){return chain},is(){return Promise.resolve({error:null})}}
 const db={rpc:async()=>({data:[job],error:null}),from:()=>chain}
 const context={exports:{},Date,Number,Math,Error,Set,JSON,NotificationMediaAccessDeniedError,shouldIncludeNotificationMedia,
  PUSH_RECOVERY_BATCH_SIZE:5,PUSH_RECOVERY_CONCURRENCY:2,
  mapWithConcurrency:async(xs,_limit,fn)=>Promise.all(xs.map(fn)),
  updateNotificationDeliveryJob:async(_db,id,change)=>state.jobs.push({id,...change}),
  getNotificationPreferences:async()=>prefs,getDeliverySuppressionReason:()=>null,isRecoveryEventPreferenceEnabled:()=>true,
  getBlockedCounterpartIds:async()=>new Set(),getTextValue:v=>typeof v==='string'?v:'',getActiveSubscriptions:async()=>[{id:'sub'}],
  isConversationMuted:async()=>false,getUnreadBadgeCount:async()=>4,privateNotificationMediaEnabled:()=>enabled,notificationMediaSigningConfig:()=>config,
  getPrivateNotificationPinMedia:async(_db,request)=>{state.authorizations.push(request);if(failure)throw failure;if(request.includeMedia===false)return null;state.signs.push(request);return {thumbnailUrl:'https://example.supabase.co/storage/v1/object/sign/shadow-pin/poster?token=fresh'+state.signs.length}},
  recoveryNotificationTag:()=>`shadowpin-${ids.pin}`,
  deliverPushToSubscriptions:async(_db,_vapid,_subscriptions,message,options)=>{state.deliveries.push({options:message.options,payload:policyContext.exports.resolveWebPushPayload(JSON.parse(message.data),options.preferences)});return {deliveredCount:1,retryableFailures:0}},
  json:v=>v,
 }
 vm.runInNewContext(transpile(recoverySource+'\nexports.run=sendNotificationDeliveryRecovery'),context)
 return {state,run:()=>context.exports.run(db,{})}
}
test('actual recovery adds fresh private media while preserving every existing envelope field',async()=>{
 const old=recoveryHarness({enabled:false}),fresh=recoveryHarness()
 await old.run();await fresh.run();await fresh.run()
 assert.equal(old.state.signs.length,0);assert.equal(fresh.state.signs.length,2)
 assert.deepEqual(JSON.parse(JSON.stringify(fresh.state.signs)),[{...request,includeMedia:true},{...request,includeMedia:true}])
 const first=JSON.parse(JSON.stringify(fresh.state.deliveries[0])),baseline=JSON.parse(JSON.stringify(old.state.deliveries[0]))
 assert.match(first.payload.image,/fresh1$/);assert.equal(first.payload.icon,first.payload.image)
 assert.match(fresh.state.deliveries[1].payload.image,/fresh2$/)
 delete first.payload.icon;delete first.payload.image;assert.deepEqual(first,baseline)
})
test('actual recovery honors preview redaction before minting a media capability',async()=>{
 for(const prefs of [{notification_preview_mode:'private'},{notification_preview_mode:'sender_only'},{notification_preview_mode:'full',notification_media_enabled:false}]){
  const h=recoveryHarness({prefs});await h.run();assert.equal(h.state.authorizations.length,1);assert.equal(h.state.signs.length,0);assert.equal(h.state.deliveries.length,1);assert.equal(h.state.deliveries[0].payload.image,undefined)
 }
})
test('actual recovery cancels denied media target before disclosing text or submitting to provider',async()=>{
 const h=recoveryHarness({failure:new NotificationMediaAccessDeniedError()});await h.run();assert.equal(h.state.deliveries.length,0);assert.equal(h.state.jobs[0].status,'cancelled')
})
test('actual recovery retries authorization infrastructure failure without public-media fallback',async()=>{
 const h=recoveryHarness({failure:new Error('authorization unavailable')});const result=await h.run();assert.equal(h.state.deliveries.length,0);assert.equal(h.state.jobs[0].status,'pending');assert.equal(result.retryable,1)
})


test('text-only helper authorizes without creating Storage or Bunny capabilities',async()=>{
 const c=client();assert.equal(await getPrivateNotificationPinMedia(c,{...request,includeMedia:false},config),null);assert.equal(c.checks,1);assert.equal(c.signs.length,0)
 await assert.rejects(getPrivateNotificationPinMedia(client(null),{...request,includeMedia:false},config),NotificationMediaAccessDeniedError)
})
test('stale targets cancel in sender-only, private, and full media-disabled recovery',async()=>{
 for(const prefs of [{notification_preview_mode:'sender_only'},{notification_preview_mode:'private'},{notification_preview_mode:'full',notification_media_enabled:false}]){
  const h=recoveryHarness({prefs,failure:new NotificationMediaAccessDeniedError()});await h.run();assert.equal(h.state.authorizations.length,1);assert.equal(h.state.signs.length,0);assert.equal(h.state.deliveries.length,0);assert.equal(h.state.jobs[0].status,'cancelled')
 }
})
