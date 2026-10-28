import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {nbaPublicCaptureSelection} from '../src/lib/nbaPublicCaptureControl.ts'

async function fixture(denied=false){
  const requests:Request[]=[]
  const source=await readFile(new URL('../src/app/the-paint/public/capture/route.ts',import.meta.url),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const result={exports:{} as {POST:(request:Request)=>Promise<Response>}}
  const imports:Record<string,unknown>={
    'next/server':{NextResponse:{json:Response.json}},
    '@/lib/paintAccess':{requirePaintAdmin:async()=>denied?{error:Response.json({error:'Admin access required'},{status:403})}:{}},
    '@/lib/nbaPublicCaptureControl':{nbaPublicCaptureSelection},
    '@/app/api/cron/poll-pikkit-nba-picks/route':{GET:async(request:Request)=>{requests.push(request);return Response.json({accepted:true})}},
  }
  new Function('require','module','exports','process',code)((id:string)=>{assert.ok(id in imports,id);return imports[id]},result,result.exports,{env:{CRON_SECRET:'fixture-private'}})
  return {requests,post:(body:unknown)=>result.exports.POST(new Request('https://fixture.test/the-paint/public/capture',{method:'POST',body:JSON.stringify(body)}))}
}
test('batch entry preserves admin authorization and rejects mixed inputs',async()=>{
  const denied=await fixture(true);assert.equal((await denied.post({games:[123,456]})).status,403);assert.equal(denied.requests.length,0)
  const f=await fixture();assert.equal((await f.post({game:123,games:[456]})).status,400);assert.equal(f.requests.length,0)
})
test('single and batch requests delegate once to the same guarded cloud collector',async()=>{
  const f=await fixture();assert.equal((await f.post({game:123})).status,200)
  assert.equal(new URL(f.requests[0].url).search,'?game=123')
  assert.equal((await f.post({games:[123,456]})).status,200)
  assert.equal(new URL(f.requests[1].url).search,'?games=123%2C456')
  assert.equal(f.requests[1].headers.get('x-slipsurge-trigger'),'admin-nba-public')
  assert.equal(f.requests.length,2)
})
