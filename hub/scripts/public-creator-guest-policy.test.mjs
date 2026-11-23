import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration=readFileSync('supabase/migrations/20261123210640_public_creator_guest_post_policy.sql','utf8')
const creator='00000000-0000-4000-8000-000000000001'
const member='00000000-0000-4000-8000-000000000002'
const group='00000000-0000-4000-8000-000000000003'
const original=`CASE WHEN ((SELECT auth.uid()) IS NULL) THEN (group_id IS NULL)
 ELSE ((group_id IS NULL) OR (author_id=(SELECT auth.uid())) OR (private.can_view_group(group_id,(SELECT auth.uid()))
 AND (EXISTS (SELECT 1 FROM groups g WHERE ((g.id=posts.group_id) AND (((g.access_type='free'::text) AND g.is_public)
 OR private.is_group_member(g.id,(SELECT auth.uid())))))))) END`

async function fixture(){
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;
    grant usage on schema auth,private to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function private.can_view_group(uuid,uuid) returns boolean language sql stable as $$select $2='${member}'::uuid$$;
    create function private.is_group_member(uuid,uuid) returns boolean language sql stable as $$select $2='${member}'::uuid$$;
    revoke execute on function private.can_view_group(uuid,uuid),private.is_group_member(uuid,uuid) from public,anon;
    grant execute on function private.can_view_group(uuid,uuid),private.is_group_member(uuid,uuid) to authenticated;
    create table users(id uuid primary key,is_private boolean);
    create table groups(id uuid primary key,access_type text,is_public boolean);
    create table posts(id integer primary key,author_id uuid,group_id uuid,creator_product_id uuid,visibility text,sport text);
    insert into users values('${creator}',false);
    insert into groups values('${group}','paid',false);
    insert into posts values
      (1,'${creator}',null,null,'public','NBA'),
      (2,'${creator}',null,null,'private','NBA'),
      (3,'${creator}','${group}',null,'public','NBA'),
      (4,'${creator}',null,'${group}','public','NBA'),
      (5,'${creator}',null,null,'followers','NBA'),
      (6,'${creator}',null,null,'public','MLB');
    grant select on posts,groups,users to anon,authenticated;
    alter table posts enable row level security;
    create policy "Fixture public visibility" on posts for select to anon,authenticated using (
      author_id=(select auth.uid()) or (creator_product_id is null and visibility='public' and not exists(select 1 from users where users.id=posts.author_id and users.is_private)));
    create policy "Private posts are owner-only" on posts as restrictive for select to anon,authenticated using (visibility is distinct from 'private' or author_id=(select auth.uid()));
    create policy "Fixture off-season" on posts as restrictive for select to anon,authenticated using(sport<>'MLB');
    create policy "Community posts require current group access" on posts as restrictive for select to anon,authenticated using (${original});`)
  const hash=(await db.query(`select md5(qual) as value from pg_policies where policyname='Community posts require current group access'`)).rows[0].value
  assert.equal(hash,'e16fed290d16f99191a0538d93f6c483','local predicate matches reviewed live predicate')
  return db
}

test('guest post read reproduces revoked-helper failure; repair restores only public non-community posts',async()=>{
  const db=await fixture()
  try{
    await db.exec('set role anon')
    await assert.rejects(db.query('select id from posts'),/permission denied for function is_group_member/)
    await db.exec('reset role');await db.exec(migration)
    await db.exec('set role anon')
    assert.deepEqual((await db.query('select id from posts order by id')).rows,[{id:1}])
    await db.exec('reset role')
    assert.equal((await db.query(`select has_function_privilege('anon','private.is_group_member(uuid,uuid)','execute') as allowed`)).rows[0].allowed,false)
    assert.equal((await db.query(`select has_function_privilege('anon','private.can_view_group(uuid,uuid)','execute') as allowed`)).rows[0].allowed,false)
  }finally{await db.close()}
})

test('authenticated predicate and owner/member/outsider group visibility remain unchanged',async()=>{
  const db=await fixture()
  try{
    const before=(await db.query(`select qual from pg_policies where policyname='Community posts require current group access'`)).rows[0].qual
    async function visible(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);return (await db.query('select id from posts order by id')).rows}
    const records=[];for(const id of [creator,member,'00000000-0000-4000-8000-000000000004'])records.push(await visible(id))
    await db.exec('reset role');await db.exec(migration)
    assert.equal((await db.query(`select qual from pg_policies where policyname='Community posts require current group access'`)).rows[0].qual,before)
    for(const [index,id] of [creator,member,'00000000-0000-4000-8000-000000000004'].entries())assert.deepEqual(await visible(id),records[index])
    assert.ok(records[1].some(row=>row.id===3));assert.ok(!records[2].some(row=>row.id===3))
  }finally{await db.close()}
})

test('migration rejects changed predicate or replay instead of weakening access',async()=>{
  const db=await fixture()
  try{
    await db.exec('alter policy "Community posts require current group access" on posts using (false)')
    await assert.rejects(db.exec(migration),/preflight changed/)
    assert.equal((await db.query(`select count(*)::int as count from pg_policies where policyname='Guests read non-community posts'`)).rows[0].count,0)
  }finally{await db.close()}
})
