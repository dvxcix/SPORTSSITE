import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { attachNflPikkitSnapshot } from '../src/lib/nflPikkit.ts'

const compiled = await build({
  entryPoints: ['src/app/the-sideline/playerIdentity.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', external: ['@supabase/supabase-js'],
  plugins: [{ name: 'identity-boundaries', setup(b) {
    b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/admin)$/ }, a => {
      if (process.argv.includes('--live') && a.path !== 'server-only') return
      return {path:a.path,namespace:'stub'}
    })
    b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const createAdminClient=()=>{throw Error("Unexpected database access")}',loader:'js'}))
  }}],
})
const mod = {exports:{} as any}
new Function('require','module','exports',compiled.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports)
const identify = mod.exports.identifySidelineBoards
const wr = {gsis_id:'00-0036912',display_name:'DeVonta Smith',short_name:'D.Smith',football_name:null,position:'WR',latest_team:'PHI',headshot:null,jersey_number:6,rookie_season:2021,last_season:2026,status:'ACT',espn_id:'4241478'}
const cb = {...wr,gsis_id:'00-0041153',display_name:'Devonta Smith',position:'CB',latest_team:'CAR',jersey_number:43,espn_id:'4594449'}
const player = {id:33939855,name:'DeVonta Smith',team:'CAR',teamId:29,position:'CB',jersey:43,markets:[{key:'receiving_yards:60',category:'receiving',offers:[{vendor:'fanduel',current:{odds:210}}]}]}
const board = {players:[player],gameLines:[],source:'snapshot'}
const phi = {season:2026,away:{abbr:'PHI'},home:{abbr:'CHI'}}
const fixed = identify(phi,[board],[wr,cb])[0].players[0]
assert.equal(fixed.team,'PHI')
assert.equal(fixed.position,'WR')
assert.equal(fixed.jersey,6)
assert.equal(fixed.gsisId,wr.gsis_id)
assert.match(fixed.headshot,/4241478/)
assert.equal(fixed.id,player.id)
assert.equal(fixed.teamId,null)
assert.deepEqual(fixed.markets,player.markets)
assert.equal(player.team,'CAR','raw capture is not mutated')
const car = identify({...phi,away:{abbr:'CAR'}},[board],[wr,cb])[0].players[0]
assert.equal(car.team,'CAR')
assert.equal(car.gsisId,cb.gsis_id)
assert.equal(car.position,'CB')
const correct = identify(phi,[{...board,players:[{...player,id:826,team:'PHI',position:'WR'}]}],[wr,cb])[0].players[0]
assert.equal(correct.gsisId,wr.gsis_id)
assert.equal(correct.id,826)
const ambiguous = identify(phi,[board],[wr,cb,{...wr,gsis_id:'00-other',latest_team:'CHI'}])[0].players[0]
assert.equal(ambiguous,player,'ambiguous candidates must not be guessed')
const transfer = identify(phi,[board],[wr])[0].players[0]
assert.equal(transfer.team,'CAR','latest roster alone must not rewrite historical teams')
console.log('PASS: same-name collision, Eagles/Carolina isolation, ambiguity, historical transfers, raw odds preservation')

if (process.argv.includes('--live')) {
  const {createClient} = await import('@supabase/supabase-js')
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
  const roster=await db.from('nfl_players').select('gsis_id,display_name,short_name,football_name,position,latest_team,headshot,jersey_number,rookie_season,last_season,status,espn_id').ilike('display_name','devonta smith')
  if(roster.error) throw roster.error
  const boards=await db.from('nfl_odds_current').select('game_id,season,away_abbr,home_abbr,board').eq('season',2026).or('away_abbr.eq.PHI,home_abbr.eq.PHI')
  if(boards.error) throw boards.error
  let checked=0
  for(const row of boards.data??[]) {
    const selected={...row.board,players:row.board.players.filter((p:any)=>p.name.toLowerCase()==='devonta smith')}
    const actual = await mod.exports.enrichSidelineOddsBoards({season:row.season,away:{abbr:row.away_abbr},home:{abbr:row.home_abbr}},[selected])
    if (row.game_id === '2026_03_PHI_CHI') {
      const picks = await db.from('nfl_pikkit_picks_current').select('snapshot').eq('game_id',row.game_id).single()
      if(picks.error) throw picks.error
      const attached = attachNflPikkitSnapshot(actual[0],picks.data.snapshot).players[0]
      const expected = picks.data.snapshot.markets.flatMap((m:any)=>m.players.filter((p:any)=>p.playerName === 'DeVonta Smith'))
      assert.ok(expected.length>0)
      assert.equal(attached.publicPicks?.length,expected.length)
      assert.deepEqual(attached.publicPicks?.map(p=>p.picks),expected.map((p:any)=>p.picks))
      console.log('Production DeVonta pick counts preserved:',attached.publicPicks?.map(p=>[p.propType,p.picks]))
    }
    for(const p of actual[0].players) {
      assert.equal(p.team,'PHI');assert.equal(p.position,'WR');assert.equal(p.gsisId,wr.gsis_id)
      assert.ok(p.headshotFallbacks.some((url:string)=>url.includes('4241478')))
      checked++
      console.log(row.game_id,p.id,p.team,p.position,p.gsisId)
    }
  }
  assert.ok(checked>=4)
  console.log('PASS: production stored boards through corrected identity path:',checked,'rows')
}
