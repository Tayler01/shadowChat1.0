import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('content policy runs as real PostgreSQL roles on prospective table writes',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.messages(id integer primary key,owner_id text,content text,likes integer default 0,message_type text default 'text');
      create table public.dm_messages(like public.messages including all);
      create table public.shadow_pin_images(id integer primary key,owner_id text,title text,description text,source_url text,likes integer default 0);
      create table public.shadow_pin_categories(id integer primary key,owner_id text,title text,description text,likes integer default 0);
      create table public.shadow_pin_comments(id integer primary key,owner_id text,body text,likes integer default 0);
      insert into messages values(1,'member','i will kill you',0);
      grant usage on schema public to authenticated,service_role;
      grant select,insert,update on all tables in schema public to authenticated,service_role;
    `)
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261028120650_member_content_filter.sql',import.meta.url),'utf8'))
    for(const table of ['messages','dm_messages','shadow_pin_images','shadow_pin_categories','shadow_pin_comments']){
      await db.exec(`alter table ${table} enable row level security;
        create policy owner on ${table} to authenticated using(owner_id=current_setting('test.member')) with check(owner_id=current_setting('test.member'));
        create policy producer on ${table} to service_role using(true) with check(true);`)
    }
    await db.exec(`set role authenticated;set test.member='member'`)
    const denied=async(sql,params=[],code='PT422')=>{
      await assert.rejects(()=>db.query(sql,params),e=>e.code===code)
    }
    for(const text of ['I WILL KILL YOU','I\u200b will\u00a0kill you','Ｉ ｗｉｌｌ ｋｉｌｌ ｙｏｕ','i.will.kill.you','go kill yourself','you should kill yourself','i will rape you']){
      await denied('insert into messages(id,owner_id,content) values(2,$1,$2)',['member',text])
    }
    for(const type of ['file','video']){
      await denied('insert into messages(id,owner_id,content,message_type) values(2,$1,$2,$3)',
        ['member',JSON.stringify({name:'safe.mp4',caption:'i\nwill kill you'}),type])
      await denied('insert into messages(id,owner_id,content,message_type) values(2,$1,$2,$3)',
        ['member','{"name":"go \\u006bill yourself","caption":"safe"}',type])
    }
    for(const text of ['I will kill your weeds','Yourself is one word','I am getting help for thoughts of suicide','That was a damn good day','Please report threats to the moderators','https://shadowchat-safety-test.invalid.attacker.example','https://shadowchat-safety-test.invalid@good.example']){
      await db.query('insert into messages(id,owner_id,content) values(2,$1,$2)',['member',text]);await db.exec('reset role;delete from messages where id=2;set role authenticated')
    }
    // Precise token matching is not semantic analysis: quoted threats also reject.
    await denied('insert into messages(id,owner_id,content) values(2,$1,$2)',['member','Someone said "go kill yourself".'])
    for(const link of ['https://shadowchat-safety-test.invalid/path','https://sub.shadowchat-safety-test.invalid','https://good.example@shadowchat-safety-test.invalid:443/','www.shadowchat-safety-test.invalid','//shadowchat-safety-test.invalid.','https://%73hadowchat-safety-test%2einvalid/']){
      await denied('insert into messages(id,owner_id,content) values(2,$1,$2)',['member',link])
    }
    // A text-to-file conversion must not turn escaped JSON into an unchecked caption.
    await db.query('insert into messages(id,owner_id,content) values(6,$1,$2)', ['member','{"caption":"go \\u006bill yourself"}'])
    await denied("update messages set message_type='file' where id=6")
    assert.equal((await db.query('select message_type from messages where id=6')).rows[0].message_type,'text')
    // Unchanged historical text is not rescreened during reactions/other edits.
    await db.exec('update messages set likes=1 where id=1')
    await db.exec("update messages set content=content where id=1")
    await db.exec("update messages set content='A safe replacement' where id=1")
    await denied("update messages set content='go kill yourself' where id=1")
    assert.equal((await db.query('select content from messages where id=1')).rows[0].content,'A safe replacement')
    for(const [table,column] of [['dm_messages','content'],['shadow_pin_images','title'],['shadow_pin_images','description'],['shadow_pin_images','source_url'],['shadow_pin_categories','title'],['shadow_pin_categories','description'],['shadow_pin_comments','body']]){
      await denied(`insert into ${table}(id,owner_id,${column}) values(3,'member',$1)`,[column==='source_url'?'https://shadowchat-safety-test.invalid':'go kill yourself'])
      assert.equal((await db.query(`select count(*)::integer as n from ${table} where id=3`)).rows[0].n,0)
    }
    await denied("insert into messages values(4,'another','A safe text',0)",[],'42501')
    await denied('select * from content_filter_private.rules',[],'42501')
    await denied("select content_filter_private.normalized_text('test')",[],'42501')
    await denied('insert into messages(id,owner_id,content) values(2,$1,$2)',['member','x'.repeat(65537)],'PT413')
    await denied('insert into messages(id,owner_id,content) values(2,$1,$2)',['member','https://good.example '.repeat(129)],'PT413')
    await db.exec('reset role;set role service_role')
    await denied("insert into dm_messages values(5,'service-post','go kill yourself',0)")
    await db.exec("insert into dm_messages values(5,'service-post','Allowed system text',0)")
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::integer as n from content_filter_private.rule_audit')).rows[0].n,5)
    await db.exec("update content_filter_private.rules set enabled=false where id='filter_acceptance_domain'")
    assert.equal((await db.query('select count(*)::integer as n from content_filter_private.rule_audit')).rows[0].n,6)
  }finally{await db.close()}
})
