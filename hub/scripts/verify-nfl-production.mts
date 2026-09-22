// Read-only production reconciliation. Run with the project's configured env.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Configured Supabase server credentials required')
if (new URL(url).hostname !== 'hkldweedwnxartkfhror.supabase.co') throw new Error('Unexpected project; refusing verification')
const db = createClient(url, key, { auth: { persistSession: false } })
const season = Number(process.argv[2] ?? 2026)
async function all(table: string, columns: string) {
  const rows: any[] = []
  for (let offset = 0; ; offset += 500) {
    const {data,error} = await db.from(table).select(columns).eq('season',season).eq('season_type','REG').range(offset,offset+499)
    if(error) throw error
    rows.push(...data)
    if(data.length<500) return rows
  }
}
const source=readFileSync(new URL('../src/app/the-sideline/boardAnalysis.ts',import.meta.url),'utf8')
const exports: Record<string,(...args:any[])=>any>={}
runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{
  if(name.includes('supabase/admin')) return {createAdminClient:()=>db}
  if(name.includes('nflOdds')) return {getNflBdlCurrentSeasonStats:async()=>[]} // PBP path, no external feed
  if(name.includes('nflSample')) return {nflSampleReference:(season:number)=>({season,phase:'REG',label:season+' regular season'})}
  return {}
},console})
const [plays,stats]=await Promise.all([
  all('nfl_pbp','game_id,week,posteam,defteam,play_type,play_deleted,two_point_attempt,pass_attempt,rush_attempt,complete_pass,sack,pass_touchdown,rush_touchdown,yards_gained,receiving_yards,passing_yards,rushing_yards,air_yards,yardline_100,receiver_player_id,receiver_player_name,rusher_player_id,rusher_player_name,passer_player_id,passer_player_name,lateral_receiver_player_id:raw->>lateral_receiver_player_id,lateral_receiver_player_name:raw->>lateral_receiver_player_name,lateral_receiving_yards:raw->>lateral_receiving_yards,td_player_id:raw->>td_player_id'),
  all('nfl_player_stats','player_id,game_id,recent_team,week,targets,receptions,receiving_yards,receiving_tds,carries,rushing_yards,rushing_tds,attempts,completions,passing_yards,passing_tds,receiving_air_yards,target_share,air_yards_share,red_zone_targets,red_zone_carries,red_zone_target_share,red_zone_carry_share'),
])
const canon=(team:string)=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[team]??team)
const pairs=[...new Set(stats.map(s=>s.game_id+':'+s.recent_team))]
let checked=0
let airChecked=0
const mismatches:any[]=[]
for(const pair of pairs){
  const [gameId,team]=pair.split(':')
  const rows=exports.buildPlayers([],[],[],plays.filter(p=>p.game_id===gameId),[{abbr:canon(team),name:team,color:'#000',logo:null}],new Map(),new Map(),[],[],[])
  for(const s of stats.filter(s=>s.game_id===gameId&&s.recent_team===team)){
    if(!(s.targets+s.carries+s.attempts)) continue // sack-only participant, no ordinary volume
    const row=rows.find((r:any)=>r.id===s.player_id)
    assert.ok(row,`Missing board player ${s.player_id} ${gameId}`)
    const expected={
      targets:s.targets,receptions:s.receptions,receivingYards:Number(s.receiving_yards),
      carries:s.carries,rushingYards:Number(s.rushing_yards),passAttempts:s.attempts,completions:s.completions,
      passingYards:Number(s.passing_yards),passingTouchdowns:s.passing_tds,
      touchdowns:s.receiving_tds+s.rushing_tds,redZoneTargets:s.red_zone_targets,redZoneCarries:s.red_zone_carries,
    }
    for(const [field,value] of Object.entries(expected))if(row[field]!==value)mismatches.push({gameId,id:s.player_id,field,board:row[field],stored:value})
    if(s.targets>0&&s.receiving_air_yards!=null){
      assert.equal(row.totalAirYards,Number(s.receiving_air_yards))
      assert.equal(row.airYards,Math.round(Number(s.receiving_air_yards)/s.targets*10)/10)
      airChecked++
    }
    checked++
  }
}
console.log(JSON.stringify({season,games:new Set(stats.map(s=>s.game_id)).size,storedRows:stats.length,checkedPlayers:checked,airChecked,mismatches},null,2))
assert.equal(mismatches.length,0,'Stored production and rendered board disagree')

const {data:games,error:gamesError}=await db.from('nfl_schedule').select('game_id,season,week,gameday,away_team,home_team').eq('season',season).eq('week',2).eq('game_type','REG')
if(gamesError)throw gamesError
const lenses:any[]=[]
for(let offset=0;offset<games.length;offset+=4){
  await Promise.all(games.slice(offset,offset+4).map(async g=>{
    const team=(abbr:string)=>({abbr,name:abbr,color:'#000',logo:null})
    const lens=await exports.getSidelineBoardLens({id:g.game_id,season:g.season,week:g.week,gameday:g.gameday,gameType:'REG',away:team(g.away_team),home:team(g.home_team)},[],'regular')
    assert.equal(lens.status,'calculated',g.game_id)
    assert.ok(lens.windows.l1.plays>0,g.game_id+' has no L1 plays')
    assert.ok(lens.windows.l1.weeks.every((week:number)=>week<2),g.game_id+' leaked current/future week')
    assert.ok(lens.windows.l1.players.length>0,g.game_id+' has no L1 players')
    lenses.push({game:g.game_id,plays:lens.windows.l1.plays,players:lens.windows.l1.players.length})
  }))
}
console.log(JSON.stringify({verifiedPregameLenses:lenses.length,allL1UsePriorWeek:true,lenses},null,2))
