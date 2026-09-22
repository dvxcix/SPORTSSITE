// Read-only integration audit against the configured feeds/database. No mutations.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const output = await build({
  stdin: { contents: "export { getSidelineLens } from './src/app/the-sideline/analysis'; export { getNflPublicResults } from './src/lib/nflPublicResultsServer'", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', tsconfig: 'tsconfig.json',
  plugins: [{ name: 'standalone-server-runtime', setup(builder) {
    builder.onResolve({ filter: /^(server-only|next\/cache)$/ }, args => ({ path: args.path, namespace: 'runtime' }))
    builder.onLoad({ filter: /.*/, namespace: 'runtime' }, args => ({ contents: args.path === 'server-only' ? '' : 'export const unstable_cache=(fn)=>fn' }))
  } }],
})
const module = { exports: {} as Record<string, (...args: any[]) => Promise<any>> }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: schedule, error } = await db.from('nfl_schedule').select('*').eq('season', 2026).in('week', [2, 3]).in('home_team', ['LA', 'GB']).order('week')
assert.ifError(error)
for (const row of schedule ?? []) {
  const game = { id: row.game_id, season: row.season, week: row.week, gameType: row.game_type, gameday: row.gameday,
    gametime: row.gametime, stadium: row.stadium, roof: row.roof, surface: row.surface,
    away: { abbr: row.away_team, name: row.away_team, color: '#123', logo: null }, home: { abbr: row.home_team, name: row.home_team, color: '#456', logo: null } }
  const lens = await module.exports.getSidelineLens(game, false)
  assert.equal(lens.status, 'calculated', row.game_id + ' must have a pregame sample')
  assert(lens.players.length > 0)
  for (const player of lens.players) for (const log of player.gameLog) assert(Number(log.gameId.split('_')[1]) < row.week, `${row.game_id}: leaked ${log.gameId}`)
  const results = await module.exports.getNflPublicResults(game, null)
  console.log(JSON.stringify({ game: row.game_id, pregamePlayers: lens.players.length, pregamePlays: lens.plays, maxGames: Math.max(...lens.players.map((p: any) => p.games)), resultStatus: results.status, resultPlayers: results.players.length, firstTd: results.firstTd?.name, examples: results.players.filter((p: any) => /Adams|Nabers|Robinson/.test(p.name)) }))
}
