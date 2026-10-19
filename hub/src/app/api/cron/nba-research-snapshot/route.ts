import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaintBoard, getPaintSchedule } from '@/lib/nbaPaintData'
import { getNbaDefenseContext } from '@/lib/nbaIntelligenceData'
import { nbaGamePace, nbaPosition, nbaSlipSurgeScore } from '@/lib/nbaIntelligence'
import { nbaValidatedEstimate, type NbaModelReport } from '@/lib/nbaModel'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { nbaToday, nbaReference, PAINT_MARKETS } from '@/lib/nbaPaint'
export const maxDuration = 180
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const admin = createAdminClient(), token = randomUUID(), key = 'lease:nba-research-snapshot', started = Date.now()
  const { data: claimed, error: leaseError } = await admin.rpc('claim_nba_source', { p_key: key, p_token: token, p_seconds: 175 })
  if (leaseError) return NextResponse.json({ reason: 'NBA research ledger unavailable' }, { status: 503 })
  if (!claimed) return NextResponse.json({ reason: 'NBA research capture already running' }, { status: 425 })
  try {
    const { data: graded, error: gradeError } = await admin.rpc('grade_nba_research_snapshots', { p_limit: 5000 })
    if (gradeError) throw new Error('NBA research outcomes could not update')
    const { data: models, error: modelError } = await admin.from('nba_model_reports').select('report').eq('version', 'nba-rolling-v1').order('validation_season', { ascending: false }).limit(33)
    if (modelError) throw new Error('NBA research models unavailable')
    const today = nbaToday(), tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const schedules = await Promise.all([getPaintSchedule(today), getPaintSchedule(tomorrow.toISOString().slice(0, 10))])
    const games = [...new Map(schedules.flatMap(schedule => schedule.games).map(game => [game.id, game])).values()].filter(game => Date.parse(game.datetime ?? game.status) > Date.now() && Date.parse(game.datetime ?? game.status) - Date.now() < 48 * 3600000 && ['scheduled', 'unknown', undefined].includes(game.status_state))
    const { data: attempts, error: attemptsError } = await admin.from('nba_source_cache').select('key,fetched_at').in('key', games.map(game => `snapshot-attempt:v1:${game.id}`))
    if (attemptsError) throw new Error('NBA capture progress unavailable')
    games.sort((a, b) => Date.parse(attempts?.find(row => row.key === `snapshot-attempt:v1:${a.id}`)?.fetched_at ?? '1970-01-01') - Date.parse(attempts?.find(row => row.key === `snapshot-attempt:v1:${b.id}`)?.fetched_at ?? '1970-01-01'))
    const results: { game: number; inserted?: number; reason?: string }[] = []
    for (const game of games) {
      if (Date.now() - started > 60000) break
      try {
        let inserted = 0
        await nbaSharedCache(`snapshot-attempt:v1:${game.id}`, 300, 0, async () => {
          const board = await getPaintBoard(game)
          if (!board.statsComplete) throw new Error('Game-log coverage incomplete; score archive deferred')
          const context = await getNbaDefenseContext(board.sampleSeason, game.date)
          const rows = board.players.flatMap(player => PAINT_MARKETS.flatMap(market => {
            const opponent = player.team.id === game.home_team.id ? game.visitor_team.id : game.home_team.id
            const matchup = context.profiles.find(profile => profile.teamId === opponent && profile.position === nbaPosition(player.position) && profile.market === market.key)
            const signal = nbaSlipSurgeScore(player, market.key, game.date, matchup, nbaGamePace(board))
            if (signal.score == null || signal.games < 5) return []
            const sampleThrough = player.logs.map(log => log.game.date.slice(0, 10)).filter(date => date < game.date).sort().at(-1)
            if (!sampleThrough) return []
            const report = models?.map(model => model.report as NbaModelReport).find(report => report.market === market.key && report.validationThrough < game.date)
            const estimate = nbaValidatedEstimate(player.logs, market.key, game.date, report)
            const model = estimate == null ? null : { key: report!.modelKey, method: report!.method, recentWeight: report!.recentWeight, trainedThrough: report!.trainedThrough, validationThrough: report!.validationThrough, estimate }
            const features = { signal, model, logIds: player.logs.map(log => log.id), teamId: player.team.id, position: player.position, injury: player.injury, matchup: matchup ?? null, matchupSeason: context.ready ? context.season : null }
            return [{ game_id: game.id, player_id: player.id, team_id: player.team.id, market: market.key, version: signal.version, score: signal.score, sample_games: signal.games, sample_through: sampleThrough, features, fingerprint: createHash('sha256').update(JSON.stringify(features)).digest('hex'), quote: nbaReference(player.props, market.key), estimate, model_key: estimate == null ? null : report!.modelKey }]
          }))
          const { data, error } = await admin.rpc('record_nba_research_batch', { p_rows: rows })
          if (error) throw new Error(`NBA score archive write failed (${error.code})`)
          inserted = data as number
          return { inserted: data as number }
        }, 110)
        results.push({ game: game.id, inserted })
      } catch (failure) { results.push({ game: game.id, reason: failure instanceof Error ? failure.message : 'NBA score capture failed' }) }
    }
    const { error: pruneError } = await admin.rpc('prune_nba_source_cache', { p_limit: 500 })
    if (pruneError) throw new Error('NBA ephemeral cache maintenance failed')
    const failed = results.filter(result => result.reason).length
    return NextResponse.json({ graded, games: games.length, results, deferred: games.length - results.length, failed }, { status: failed ? 503 : 200 })
  } catch (failure) { return NextResponse.json({ reason: failure instanceof Error ? failure.message : 'NBA research capture failed' }, { status: 503 }) }
  finally { await admin.from('nba_source_cache').update({ lease_token: null, lease_until: null }).eq('key', key).eq('lease_token', token) }
}
export const GET = withPipelineHealth('nba-research-snapshot', run)
