import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPaintBoard, getPaintSchedule, refreshPaintBoardPrices } from '@/lib/nbaPaintData'
import { getNbaResearchDefense, getNbaResearchModels, getNbaResearchMarketContext, warmNbaResearchResources } from '@/lib/nbaResearchResources'
import { nbaMarketSupportIdentity } from '@/lib/nbaMarketSignal'
import { nbaGamePace, nbaPosition, nbaSlipSurgeScore } from '@/lib/nbaIntelligence'
import { nbaValidatedEstimate, type NbaModelReport } from '@/lib/nbaModel'
import { nbaEconomicSnapshot } from '@/lib/nbaMovement'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { ensureNbaResearchPlayers } from '@/lib/nbaResearchIdentity'
import { nbaPeriod, nbaMarketLogs, nbaToday, nbaReference, PAINT_MARKETS, type PaintBoard } from '@/lib/nbaPaint'
import { getNbaOddsGame } from '@/lib/nbaOddsClockData'
import { nbaPregameOpen } from '@/lib/nbaOddsMode'
import { readNbaPregameResearch } from '@/lib/nbaPregameResearchData'
import { captureNbaSlatePools } from '@/lib/nbaSlateFreezeData'
export const maxDuration = 180
async function run(request: Request) {
  const denied = requireCronAuth(request); if (denied) return denied
  const admin = createAdminClient(), token = randomUUID(), key = 'lease:nba-research-snapshot', started = Date.now()
  const { data: claimed, error: leaseError } = await admin.rpc('claim_nba_source', { p_key: key, p_token: token, p_seconds: 175 })
  if (leaseError) return NextResponse.json({ reason: 'NBA research ledger unavailable' }, { status: 503 })
  if (!claimed) return NextResponse.json({ reason: 'NBA research capture already running' }, { status: 425 })
  let pruneAttempted = false
  try {
    const { data: graded, error: gradeError } = await admin.rpc('grade_nba_research_snapshots', { p_limit: 5000 })
    if (gradeError) throw new Error('NBA research outcomes could not update')
    const today = nbaToday(), dates=[0,1,2].map(offset=>{const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)})
    const schedules = await Promise.all(dates.map(date=>getPaintSchedule(date)))
    const games = [...new Map(schedules.flatMap(schedule => schedule.games).map(game => [game.id, game])).values()].filter(game => Date.parse(game.datetime ?? game.status) > Date.now() && Date.parse(game.datetime ?? game.status) - Date.now() < 48 * 3600000 && ['scheduled', 'unknown', undefined].includes(game.status_state))
    const { data: attempts, error: attemptsError } = await admin.from('nba_source_cache').select('key,fetched_at').in('key', games.flatMap(game => [`snapshot-attempt:v1:${game.id}`,`research-warm-attempt:v1:${game.id}`]))
    if (attemptsError) throw new Error('NBA capture progress unavailable')
    games.sort((a, b) => Date.parse(attempts?.find(row => row.key === `snapshot-attempt:v1:${a.id}`)?.fetched_at ?? '1970-01-01') - Date.parse(attempts?.find(row => row.key === `snapshot-attempt:v1:${b.id}`)?.fetched_at ?? '1970-01-01'))
    // Score attempts may all refresh in the same order. Warm rotation has its
    // own persisted clock so successful full passes cannot starve later games.
    const warmGame=[...games].sort((a,b)=>Date.parse(attempts?.find(row=>row.key===`research-warm-attempt:v1:${a.id}`)?.fetched_at??'1970-01-01')-Date.parse(attempts?.find(row=>row.key===`research-warm-attempt:v1:${b.id}`)?.fetched_at??'1970-01-01')||Date.parse(a.datetime??a.status)-Date.parse(b.datetime??b.status)||a.id-b.id)[0]
    const results: { game: number; inserted?: number; reason?: string }[] = []
    const loadedBoards = new Map<number, PaintBoard>()
    const loadedModels = new Map<number, NbaModelReport[]>()
    const warming: ReturnType<typeof warmNbaResearchResources>[] = []
    const startWarming=()=>{
      if(!warmGame||warming.length)return
      warming.push(nbaSharedCache(`research-warm-attempt:v1:${warmGame.id}`,60,0,async()=>{
        const game=await getNbaOddsGame(warmGame)
        if(!nbaPregameOpen(game))return[{resource:'matchup',status:'deferred' as const}]
        const board=loadedBoards.get(game.id)??(await readNbaPregameResearch<PaintBoard>(game,'board:v1'))?.value
        if(!board||!board.statsComplete)return[{resource:'board',status:'unavailable' as const}]
        return warmNbaResearchResources({...board,game},{deadline:started+160_000})
      },150).then(attempt=>attempt.value).catch(()=>[{resource:'warm-attempt',status:'unavailable' as const}]))
    }
    for (const game of games) {
      if (Date.now() - started > 60000) break
      try {
        let inserted = 0
        const attempt=await nbaSharedCache(`snapshot-attempt:v1:${game.id}`, 300, 0, async () => {
          try{
          const board = await getPaintBoard(game)
          loadedBoards.set(game.id, board)
          if (!board.statsComplete) throw new Error('Game-log coverage incomplete; score archive deferred')
          const [context,marketContext,models] = await Promise.all([getNbaResearchDefense(board),getNbaResearchMarketContext(board),getNbaResearchModels(board)])
          loadedModels.set(game.id,models)
          const rows = board.players.flatMap(player => PAINT_MARKETS.flatMap(market => {
            if (nbaPeriod(market.key) && board.periodStatsComplete === false) return []
            const opponent = player.team.id === game.home_team.id ? game.visitor_team.id : game.home_team.id
            const matchup = context.profiles.find(profile => profile.teamId === opponent && profile.position === nbaPosition(player.position) && profile.market === market.key)
            const quote = nbaReference(player.props, market.key)
            const signal = nbaSlipSurgeScore(player, market.key, game.date, matchup, nbaGamePace(board),quote?{offer:quote,side:'over',context:marketContext}:undefined)
            if (signal.score == null || signal.games < 5) return []
            const logs = nbaMarketLogs(player, market.key)
            const sampleThrough = logs.map(log => log.game.date.slice(0, 10)).filter(date => date < game.date).sort().at(-1)
            if (!sampleThrough) return []
            const report = models.find(report => report.market === market.key && report.validationThrough < game.date)
            const estimate = nbaValidatedEstimate(logs, market.key, game.date, report)
            const model = estimate == null ? null : { key: report!.modelKey, method: report!.method, recentWeight: report!.recentWeight, trainedThrough: report!.trainedThrough, validationThrough: report!.validationThrough, estimate }
            const features = { signal, model, logIds: logs.map(log => log.id), teamId: player.team.id, position: player.position, injury: player.injury, matchup: matchup ?? null, matchupSeason: context.ready ? context.season : null }
            const economicFeatures={...features,signal:{...signal,marketSupport:nbaMarketSupportIdentity(signal.marketSupport)}}
            return [{ game_id: game.id, player_id: player.id, team_id: player.team.id, market: market.key, version: signal.version, score: signal.score, sample_games: signal.games, sample_through: sampleThrough, features, fingerprint: createHash('sha256').update(JSON.stringify({features:economicFeatures,quote:quote?nbaEconomicSnapshot([quote])[0]:null})).digest('hex'), quote, estimate, model_key: estimate == null ? null : report!.modelKey }]
          }))
          await ensureNbaResearchPlayers(game, rows)
          const { data, error } = await admin.rpc('record_nba_research_batch', { p_rows: rows })
          if (error) throw new Error(`NBA score archive write failed (${error.code})`)
          inserted = data as number
          return { inserted: data as number }
          }catch(failure){return {reason:failure instanceof Error?failure.message:'NBA score capture failed'}}
        }, 110)
        results.push({ game: game.id, inserted, ...('reason' in attempt.value?{reason:attempt.value.reason}:{}) })
      } catch (failure) { results.push({ game: game.id, reason: failure instanceof Error ? failure.message : 'NBA score capture failed' }) }
      if(game.id===warmGame?.id)startWarming()
    }
    // Also rotate when this game's score cache was warm or the bounded pass
    // stopped earlier. This reads an existing board; it never fans out stats.
    startWarming()
    const slatePools: { date: string; loaded: number; games: number; full: number; quarter: number; reason?: string }[] = []
    for (const schedule of new Map(schedules.map(schedule => [schedule.date, schedule])).values()) {
      if (Date.now() - started > 125_000) break
      const slateGames = await Promise.all(schedule.games.map(game => getNbaOddsGame(game)))
      if (!slateGames.some(game => nbaPregameOpen(game)) || slateGames.length > 16) continue
      const boards: PaintBoard[] = []
      const models: {gameId:number;reports:NbaModelReport[]}[] = []
      const closedResolved=new Set<number>()
      const resolveClosed=async(game:typeof slateGames[number])=>{
        closedResolved.add(game.id)
        const [snapshot,report]=await Promise.all([readNbaPregameResearch<PaintBoard>(game,'board:v1'),readNbaPregameResearch<NbaModelReport[]>(game,'models:v1')])
        const old=boards.findIndex(board=>board.game.id===game.id);if(old>=0)boards.splice(old,1)
        const oldModel=models.findIndex(model=>model.gameId===game.id);if(oldModel>=0)models.splice(oldModel,1)
        if(snapshot){boards.push(await refreshPaintBoardPrices({...snapshot.value,game},'pregame'));models.push({gameId:game.id,reports:report?.value??[]})}
      }
      try {
        // Reuse already observed research; the pool pass never rebuilds stats
        // for every matchup. Prices still use the existing phase-safe reader.
        for (let offset = 0; offset < slateGames.length; offset += 3) {
          if (Date.now() - started > 140_000) break
          await Promise.all(slateGames.slice(offset, offset + 3).map(async game => {
            if(!nbaPregameOpen(game)){await resolveClosed(game);return}
            const existing = loadedBoards.get(game.id) ?? (await readNbaPregameResearch<PaintBoard>(game, 'board:v1'))?.value
            if (existing) {
              const [priced,reports]=await Promise.all([refreshPaintBoardPrices({ ...existing, game }, 'pregame'),loadedModels.get(game.id)??readNbaPregameResearch<NbaModelReport[]>(game,'models:v1').then(saved=>saved?.value??[])])
              boards.push(priced);models.push({gameId:game.id,reports})
            }
          }))
        }
        // A slow peer or price read can cross tip after the first loop. Replace
        // those cached pre-tip inputs with the authoritative final winners.
        for(let pass=0;pass<slateGames.length;pass++){
          const closing=slateGames.filter(game=>!nbaPregameOpen(game)&&!closedResolved.has(game.id))
          if(!closing.length)break
          await Promise.all(closing.map(resolveClosed))
        }
        const captured = await captureNbaSlatePools(slateGames, boards, schedule.complete && boards.length === slateGames.length,undefined,models)
        slatePools.push({ date: schedule.date, loaded: boards.length, games: slateGames.length, ...captured })
      } catch (failure) {
        slatePools.push({ date: schedule.date, loaded: boards.length, games: slateGames.length, full: 0, quarter: 0, reason: failure instanceof Error ? failure.message : 'NBA slate comparison capture failed' })
      }
    }
    const resources = (await Promise.all(warming)).flat()
    pruneAttempted = true
    const { error: pruneError } = await admin.rpc('prune_nba_source_cache', { p_limit: 500 })
    if (pruneError) throw new Error('NBA ephemeral cache maintenance failed')
    const failed = results.filter(result => result.reason).length + slatePools.filter(result => result.reason).length + resources.filter(result => result.status === 'unavailable').length
    return NextResponse.json({ graded, games: games.length, results, slatePools, resources, resourceWarmGame:warmGame?.id??null, deferred: games.length - results.length, failed }, { status: failed ? 503 : 200 })
  } catch (failure) { return NextResponse.json({ reason: failure instanceof Error ? failure.message : 'NBA research capture failed' }, { status: 503 }) }
  finally {
    // A failed grader must not indefinitely disable ephemeral-cache retention.
    if (!pruneAttempted) {
      try {
        const { error } = await admin.rpc('prune_nba_source_cache', { p_limit: 500 })
        if (error) console.error('[NBA research] cache maintenance unavailable')
      } catch { console.error('[NBA research] cache maintenance unavailable') }
    }
    await admin.from('nba_source_cache').update({ lease_token: null, lease_until: null }).eq('key', key).eq('lease_token', token)
  }
}
export const GET = withPipelineHealth('nba-research-snapshot', run)
