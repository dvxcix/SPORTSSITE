import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'

const postId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'
async function reactionFixture() {
  const state = { signedIn: true, visibility: 'public' as string | null, error: false, serviceCalls: 0 }
  const query = { select: () => query, eq: (_key:string, value:string) => { assert.equal(value,postId);return query }, maybeSingle: async()=>({data:state.visibility?{id:postId,visibility:state.visibility}:null,error:state.error?{code:'unavailable'}:null}) }
  const imports:Record<string,unknown> = {
    'next/server': {NextResponse:{json:Response.json}},
    '@/lib/supabase/server': {createClient:async()=>({auth:{getUser:async()=>({data:{user:state.signedIn?{id:actorId}:null}})},from:(table:string)=>{assert.equal(table,'posts');return query}})},
    '@/lib/supabase/admin': {createAdminClient:()=>{state.serviceCalls++;return{rpc:async(name:string,args:Record<string,string>)=>{assert.equal(name,'notify_reaction_server');assert.equal(args.p_actor_id,actorId);assert.equal(args.p_post_id,postId);return{error:null}}}}},
    '@/lib/serverRateLimit': {consumeServerRateLimit:async()=>({available:true,allowed:true})},
    '@/lib/safeApiError': {safeApiError:()=>Response.json({error:'failed'},{status:400})},
  }
  const source=await readFile(new URL('../src/app/api/posts/reaction-notification/route.ts',import.meta.url),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const loaded={exports:{} as {POST:(request:Request)=>Promise<Response>}}
  new Function('require','module','exports',code)((key:string)=>{if(!(key in imports))throw new Error('Unexpected import: '+key);return imports[key]},loaded,loaded.exports)
  const send=()=>loaded.exports.POST(new Request('https://www.slipsurge.com/api/posts/reaction-notification',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({postId,emoji:'❤️'})}))
  return {state,send}
}

test('private, inaccessible and failed-access posts never reach the service notification RPC',async()=>{
  const {state,send}=await reactionFixture()
  state.signedIn=false;assert.equal((await send()).status,401)
  state.signedIn=true;state.visibility=null;assert.equal((await send()).status,404)
  state.visibility='private';assert.equal((await send()).status,200)
  state.visibility='public';state.error=true;assert.equal((await send()).status,503)
  assert.equal(state.serviceCalls,0)
})

test('visible public and followers posts retain reaction notifications after the RLS check',async()=>{
  const {state,send}=await reactionFixture()
  for(const visibility of ['public','followers']){state.visibility=visibility;assert.equal((await send()).status,200)}
  assert.equal(state.serviceCalls,2)
})

test('service moderation previews exclude another member’s private post and its replies', async () => {
  const posts = [
    { id: 'shared', content: 'Community pick', visibility: 'public', author_id: 'other' },
    { id: 'own', content: 'My private pick', visibility: 'private', author_id: actorId },
    { id: 'hidden', content: 'Hidden private pick', visibility: 'private', author_id: 'other' },
  ]
  const comments = posts.map(post => ({ id: `reply-${post.id}`, post_id: post.id, content: `Reply to ${post.content}` }))
  const client = { from: (table: string) => {
    let rows: Record<string, unknown>[] = table === 'posts' ? [...posts] : [...comments]
    const query = {
      select: () => query,
      in: (key: string, ids: string[]) => { rows = rows.filter(row => ids.includes(String(row[key]))); return query },
      or: (filter: string) => { assert.equal(filter, `visibility.neq.private,author_id.eq.${actorId}`); rows = rows.filter(row => row.visibility !== 'private' || row.author_id === actorId); return query },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    return query
  } }
  const source = await readFile(new URL('../src/app/admin/reports/page.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} as { resolveTargets: (client: unknown, reports: unknown[], viewer: string) => Promise<Record<string, Record<string, unknown>>> } }
  new Function('require', 'module', 'exports', code + '\nexports.resolveTargets = resolveTargets;')((name: string) => name === 'react/jsx-runtime' ? jsx : {}, loaded, loaded.exports)
  const reports = [...posts.map(post => ({ target_type: 'post', target_id: post.id })), ...comments.map(comment => ({ target_type: 'comment', target_id: comment.id }))]
  const previews = await loaded.exports.resolveTargets(client, reports, actorId)
  assert.deepEqual(Object.keys(previews.post).sort(), ['own', 'shared'])
  assert.deepEqual(Object.keys(previews.comment).sort(), ['reply-own', 'reply-shared'])
  assert.equal(JSON.stringify(previews).includes('Hidden private pick'), false)
})

test('service admin dashboard omits private content and private posts from community totals', async () => {
  const posts = [
    { id: 'public', content: 'VISIBLE COMMUNITY PICK', visibility: 'public', created_at: new Date().toISOString(), author: { username: 'member' } },
    { id: 'private', content: 'SECRET PRIVATE PICK', visibility: 'private', created_at: new Date().toISOString(), author: { username: 'owner' } },
  ]
  const client = { from: (table: string) => {
    let rows: Record<string, unknown>[] = table === 'posts' ? [...posts] : []
    const query = {
      select: () => query, eq: () => query, in: () => query, gte: () => query, order: () => query,
      limit: (limit: number) => { rows = rows.slice(0, limit); return query },
      neq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] !== value); return query },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, count: rows.length, error: null }).then(resolve),
    }
    return query
  } }
  const source = await readFile(new URL('../src/app/admin/page.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const loaded = { exports: {} as { default: () => Promise<unknown> } }
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name === 'react/jsx-runtime') return jsx
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => client }
    if (name === '@/lib/pipelineRegistry') return { TRACKED_PIPELINES: [] }
    return new Proxy({}, { get: () => () => null })
  }, loaded, loaded.exports)
  const rendered = JSON.stringify(await loaded.exports.default())
  assert.equal(rendered.includes('SECRET PRIVATE PICK'), false)
  assert.equal(rendered.includes('VISIBLE COMMUNITY PICK'), true)
  assert.match(rendered, /"label":"Published posts","value":1/)
})
