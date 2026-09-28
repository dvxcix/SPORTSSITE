import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { fetchAllBdl } from '../src/lib/nflGameFeeds'
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!
assert.equal(new URL(url).hostname,'hkldweedwnxartkfhror.supabase.co')
const db=createClient(url,key,{auth:{persistSession:false}})
const {data:rows,error}=await db.from('nfl_game_feeds').select('game_id,payload,fetched_at').eq('season',2026).eq('source','bdl_plays').eq('reconciled',true).order('game_id')
assert.ifError(error)
let repaired=0
for(const row of rows??[]){
 const payload=row.payload as {game:{id:number,status_state:string};stats?:unknown[]}
 if(payload.stats?.length)continue
 assert.equal(payload.game.status_state,'final')
 const stats=await fetchAllBdl<{game:{id:number};player:{id:number}}>('stats?game_ids[]='+payload.game.id+'&per_page=100')
 assert(stats.length>0)
 assert(stats.every(s=>s.game.id===payload.game.id))
 assert.equal(new Set(stats.map(s=>s.player.id)).size,stats.length)
 if(process.argv.includes('--apply')){
  const {data,error}=await db.from('nfl_game_feeds').update({payload:{...payload,stats,statsFetchedAt:new Date().toISOString()}}).eq('game_id',row.game_id).eq('source','bdl_plays').eq('fetched_at',row.fetched_at).select('game_id')
  assert.ifError(error);if(data?.length)repaired++
 }
 console.log(JSON.stringify({game:row.game_id,stats:stats.length,applied:process.argv.includes('--apply')}))
 await new Promise(r=>setTimeout(r,350))
}
console.log(JSON.stringify({verifiedGames:rows?.length,repaired}))

