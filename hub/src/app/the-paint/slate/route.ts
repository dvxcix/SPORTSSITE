import { nbaOddsMode, nbaPregameOpen, nbaLiveOpen } from '@/lib/nbaOddsMode'
import { nbaReadSelection, nbaSelectedPlayers } from '@/lib/nbaMarketSelection'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { nbaSharedCache } from '@/lib/nbaSharedCache'
import { getPaintBoard, getPaintSchedule, refreshPaintBoardPrices } from '@/lib/nbaPaintData'
import { nbaPeriod, nbaDate, PAINT_MARKETS, type PaintBoard, type PaintMarket } from '@/lib/nbaPaint'
import { getNbaResearchDefense, getNbaResearchModels, getNbaResearchMarketContext } from '@/lib/nbaResearchResources'
import { nbaSlateRows } from '@/lib/nbaSlate'
import { nbaMarketSupport, nbaMarketSupportView, nbaPlayerMarketSignals } from '@/lib/nbaMarketSignal'
import { nbaContextualScore } from '@/lib/nbaIntelligence'
import { getNbaOddsGame } from '@/lib/nbaOddsClockData'
import { captureNbaSlatePools, getNbaSlateRanks, getNbaLegacySlateRows } from '@/lib/nbaSlateFreezeData'
import { nbaSlateFrozenHeat } from '@/lib/nbaSlateHeat'
import { nbaSlateFailure, nbaSlateTimer, type NbaSlateStage } from '@/lib/nbaSlateDiagnostics'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const date = request.nextUrl.searchParams.get('date'), market = request.nextUrl.searchParams.get('market'), book = request.nextUrl.searchParams.get('book') ?? 'all', side = request.nextUrl.searchParams.get('side') ?? 'over'
  if (!date || nbaDate(date) !== date || !PAINT_MARKETS.some(item => item.key === market) || !/^[a-z0-9_]{1,30}$/.test(book) || !['over', 'under'].includes(side)) return NextResponse.json({ error: 'Invalid NBA slate filters' }, { status: 400 })
  const selection=nbaReadSelection(request.nextUrl.searchParams)
  let stage: NbaSlateStage = 'schedule'
  const timer = nbaSlateTimer()
  const enter = (next: NbaSlateStage) => { timer.enter(next); stage = next }
  try {
    const rawSchedule = await getPaintSchedule(date)
    const schedule = { ...rawSchedule, games: await Promise.all(rawSchedule.games.map(game => getNbaOddsGame(game))) }
    const phaseKey = schedule.games.map(game => `${game.id}:${game.datetime ?? game.status}:${nbaPregameOpen(game) ? 'p' : nbaLiveOpen(game) ? 'l' : 'c'}`).sort().join('|')
    // The loader builds the complete, unfiltered research universe. Book,
    // side, market, period and contract selection are applied only after the
    // shared load, so they must not cause duplicate reads and archive writes.
    // Completeness for the selected period is computed for each response.
    enter('shared-cache')
    const cached = await nbaSharedCache(`slate:v13:${mode}:${date}:${phaseKey}`, 30, 0, async () => {
      enter('boards')
      const started = Date.now(), boards: PaintBoard[] = [], failed: number[] = [], closedAtLoad=new Set<number>()
      const games = schedule.games.slice(0, 16)
      for (let offset = 0; offset < games.length; offset += 3) {
        if (Date.now() - started > 60000) { failed.push(...games.slice(offset).map(game => game.id)); break }
        await Promise.all(games.slice(offset, offset + 3).map(async game => { try { const closed=mode==='pregame'&&!nbaPregameOpen(game);boards.push(await getPaintBoard(game, mode));if(closed)closedAtLoad.add(game.id) } catch { failed.push(game.id) } }))
      }
      if (games.length && !boards.length) throw new Error('No NBA boards available')
      enter('models')
      const modelResults = await Promise.allSettled(boards.map(board => getNbaResearchModels(board, mode)))
      const reportMap = new Map(boards.map((board, index) => { const result = modelResults[index]; return [board.game.id,result.status==='fulfilled'?result.value:[]] as const }))
      const modelMissing=new Set(boards.filter((_,index)=>modelResults[index].status==='rejected').map(board=>board.game.id))
      enter('defense')
      const contexts = await Promise.allSettled(boards.map(async board=>({gameId:board.game.id,...await getNbaResearchDefense(board,mode)})))
      const defenseMap=new Map(contexts.flatMap(result=>result.status==='fulfilled'?[[result.value.gameId,result.value] as const]:[]))
      const defenseMissing=new Set(boards.filter((_,index)=>contexts[index].status==='rejected').map(board=>board.game.id))
      // Early games may have waited on a cold later game. Attach quotes only
      // after research is assembled: 30s source TTL + 30s result TTL, no stale fallback.
      enter('prices')
      const pricedMap = new Map((await Promise.all(boards.map(board => refreshPaintBoardPrices(board, mode)))).map(board=>[board.game.id,board]))
      // A pool written for a later anchor must contain the final research of
      // every peer that closed while its boards/models/prices were loading.
      // This runs only in the cache loader, not on each warm response.
      if(mode==='pregame')for(let pass=0;pass<games.length;pass++){
        const closing=games.filter(game=>!nbaPregameOpen(game)&&!closedAtLoad.has(game.id))
        if(!closing.length)break
        await Promise.all(closing.map(async game=>{
          closedAtLoad.add(game.id)
          try{
            const board=await getPaintBoard(game,'pregame');pricedMap.set(game.id,board)
            const failedIndex=failed.indexOf(game.id);if(failedIndex>=0)failed.splice(failedIndex,1)
            const [models,defense]=await Promise.allSettled([getNbaResearchModels(board,'pregame'),getNbaResearchDefense(board,'pregame')])
            reportMap.set(game.id,models.status==='fulfilled'?models.value:[])
            if(models.status==='fulfilled')modelMissing.delete(game.id);else modelMissing.add(game.id)
            if(defense.status==='fulfilled'){defenseMap.set(game.id,{gameId:game.id,...defense.value});defenseMissing.delete(game.id)}
            else{defenseMap.delete(game.id);defenseMissing.add(game.id)}
          }catch{pricedMap.delete(game.id);reportMap.delete(game.id);defenseMap.delete(game.id);if(!failed.includes(game.id))failed.push(game.id)}
        }))
      }
      const pricedBoards=[...pricedMap.values()],reports=[...reportMap].map(([gameId,reports])=>({gameId,reports})),defense=[...defenseMap.values()]
      const fullComplete = schedule.complete && !failed.length && pricedBoards.length === schedule.games.length && pricedBoards.every(board => board.statsComplete)
      enter('archive')
      if (mode === 'pregame') await captureNbaSlatePools(schedule.games, pricedBoards, fullComplete && !modelMissing.size, undefined, reports)
      enter('cache-commit')
      return { date: schedule.date, games: schedule.games.length, loaded: pricedBoards.length, failed, defenseMissing:[...defenseMissing], defenseUnavailable:pricedBoards.filter(board=>!defenseMap.get(board.game.id)?.ready).length, boards: pricedBoards, reports, defense }
    }, 120)
    // Keep expensive production research cached, but re-check freshness and the
    // selected exact quote for every response. A warm slate cannot extend a boost.
    enter('market-context')
    const contextResults=await Promise.allSettled(cached.value.boards.map(board=>getNbaResearchMarketContext({ ...board, game: schedule.games.find(game=>game.id===board.game.id)??board.game }, mode)))
    enter('prices')
    const initialBoards = await Promise.all(cached.value.boards.map(board => refreshPaintBoardPrices({ ...board, game: schedule.games.find(game => game.id === board.game.id) ?? board.game }, mode)))
    const finalize = async () => {
      const boards = new Map(initialBoards.map(board=>[board.game.id,board]))
      const reports = new Map(cached.value.reports.map(item=>[item.gameId,item.reports]))
      const defense = new Map(cached.value.defense.map(item=>[item.gameId,item]))
      const marketContexts = new Map(contextResults.flatMap(result=>result.status==='fulfilled'?[[result.value.gameId,result.value] as const]:[]))
      const contextUnavailable = new Set(cached.value.boards.filter((_,index)=>contextResults[index].status==='rejected').map(board=>board.game.id))
      const defenseMissing = new Set(cached.value.defenseMissing), failed = new Set(cached.value.failed), closedResolved = new Set<number>()
      // Every game can cross once. Re-resolve final research after the slow
      // work, then retry if a different game crosses during archive reads.
      // A missing final board is never replaced by a cached pre-tip response.
      for (let pass=0;pass<=schedule.games.length;pass++) {
        timer.enterFinalize('closed-research')
        if(mode==='pregame') await Promise.all(schedule.games.slice(0,16).filter(game=>!nbaPregameOpen(game)&&!closedResolved.has(game.id)).map(async game=>{
          closedResolved.add(game.id)
          try {
            const board=await getPaintBoard(game,'pregame')
            boards.set(game.id,board);failed.delete(game.id)
            const [modelResult,defenseResult,contextResult]=await Promise.allSettled([getNbaResearchModels(board,'pregame'),getNbaResearchDefense(board,'pregame'),getNbaResearchMarketContext(board,'pregame')])
            reports.set(game.id,modelResult.status==='fulfilled'?modelResult.value:[])
            if(defenseResult.status==='fulfilled'){defense.set(game.id,{gameId:game.id,...defenseResult.value});defenseMissing.delete(game.id)}
            else {defense.delete(game.id);defenseMissing.add(game.id)}
            if(contextResult.status==='fulfilled'){marketContexts.set(game.id,contextResult.value);contextUnavailable.delete(game.id)}
            else {marketContexts.delete(game.id);contextUnavailable.add(game.id)}
          } catch {
            boards.delete(game.id);reports.delete(game.id);defense.delete(game.id);marketContexts.delete(game.id);failed.add(game.id)
          }
        }))
        const pricedBoards=[...boards.values()]
        const complete=schedule.complete&&!failed.size&&pricedBoards.length===schedule.games.length&&pricedBoards.every(board=>board.statsComplete&&(!nbaPeriod(market!)||board.periodStatsComplete===true))
        timer.enterFinalize('frozen-ranks')
        const frozen=await getNbaSlateRanks(schedule.games,pricedBoards,market as PaintMarket,book,selection,mode,complete,side as 'over'|'under')
        const missing=[...new Set([...frozen.unavailable,...[...failed].filter(id=>closedResolved.has(id))])]
        timer.enterFinalize('legacy-reads')
        const legacyResults=mode==='pregame'?await Promise.allSettled(schedule.games.filter(game=>missing.includes(game.id)).map(async game=>({gameId:game.id,saved:await getNbaLegacySlateRows(game,market as PaintMarket,book,side as 'over'|'under',selection)}))):[]
        const legacy=legacyResults.flatMap(result=>result.status==='fulfilled'&&result.value.saved?[{gameId:result.value.gameId,saved:result.value.saved}]:[])
        if(mode==='pregame'&&schedule.games.slice(0,16).some(game=>!nbaPregameOpen(game)&&!closedResolved.has(game.id)))continue
        return {pricedBoards,reports:[...reports].map(([gameId,reports])=>({gameId,reports})),defense:[...defense.values()],marketContexts:[...marketContexts.values()],contextUnavailable:[...contextUnavailable],defenseMissing:[...defenseMissing],failed:[...failed].filter(id=>!legacy.some(entry=>entry.gameId===id)),complete,frozen,legacy,missing}
      }
      throw new Error('NBA slate phase could not settle')
    }
    enter('finalize')
    const {pricedBoards,reports,defense,marketContexts,contextUnavailable,defenseMissing,failed,complete,frozen,legacy,missing}=await finalize().finally(() => timer.endFinalize())
    enter('render')
    for (const entry of legacy) frozen.observedAt[entry.gameId]=entry.saved.observedAt
    const unavailable=missing.filter(gameId=>!legacy.some(entry=>entry.gameId===gameId))
    const baseRows = nbaSlateRows(pricedBoards.map(board => ({ ...board, players: nbaSelectedPlayers(board.players, market!, selection) })), market as PaintMarket, book, side as 'over' | 'under', complete, [], defense, [], { ranks: frozen.ranks, reports })
    const rows=baseRows.filter(row=>!legacy.some(entry=>entry.gameId===row.game.id)).map(row=>{
      const {player,game,market:rowMarket,offer,estimate,mm,average,hit,gap,fetchedAt,issues}=row
      const missingScore=mode==='pregame'&&!nbaPregameOpen(game)&&(defenseMissing.includes(game.id)||contextUnavailable.includes(game.id))
      const safe={player,game,market:rowMarket,offer,estimate,mm,average,hit,gap,fetchedAt,researchObservedAt:frozen.observedAt[game.id],frozenHeat:mode==='pregame'&&!nbaPregameOpen(game)?nbaSlateFrozenHeat(row,frozen.heatDomains[game.id]):undefined,issues:[...issues,...(unavailable.includes(game.id)?['Pregame slate comparison was not captured; MM unavailable']:[]),...(contextUnavailable.includes(game.id)?['Pregame market context was not captured; market signals unavailable']:[]),...(missingScore?['Complete pregame score inputs were not captured; score unavailable']:[])]}
      const contextual=nbaContextualScore(row.baseScore,row.player.id,row.market,row.game.date,{offer:row.offer,side:side as 'over'|'under',context:marketContexts.find(context=>context.gameId===row.game.id)??null})
      const marketSignals=nbaPlayerMarketSignals({playerId:row.player.id,gameId:row.game.id,market:row.market,book,side:side as 'over'|'under',props:row.signalOffers,context:marketContexts.find(context=>context.gameId===row.game.id)??null})
      return {...safe,score:missingScore?null:contextual.score,marketSupport:nbaMarketSupportView(contextual.marketSupport),marketSignals:nbaMarketSupportView(marketSignals)}
    })
    for (const entry of legacy) for (const row of entry.saved.value.rows) {
      const {player,game,market:rowMarket,offer,estimate,mm,average,hit,gap,fetchedAt,score}=row
      // These exact rows were computed before this anchor tipped. Preserve all
      // original metrics, including the original contract; never retrofit a
      // missing historical context with today's receipts or model reports.
      rows.push({player,game,market:rowMarket,offer,estimate,mm,average,hit,gap,fetchedAt,score,researchObservedAt:entry.saved.observedAt,frozenHeat:nbaSlateFrozenHeat(row,entry.saved.value.heatDomains),issues:[...row.issues,'Recovered original pregame slate snapshot'],marketSupport:nbaMarketSupportView(row.marketSupport??nbaMarketSupport()),marketSignals:nbaMarketSupportView({...nbaMarketSupport(),reason:'Market signals were not captured with this original slate snapshot'})})
    }
    rows.sort((a,b)=>(b.score??-1)-(a.score??-1)||(b.mm??0)-(a.mm??0))
    const { boards: _boards, reports: _reports, defense: _defense, ...summary } = cached.value
    return NextResponse.json({ ...summary, complete, failed, loaded:new Set([...pricedBoards.map(board=>board.game.id),...legacy.map(entry=>entry.gameId)]).size,defenseMissing,defenseUnavailable:pricedBoards.filter(board=>!defense.find(context=>context.gameId===board.game.id)?.ready).length, rows, mode, frozenMmUnavailable: unavailable, frozenMmObservedAt: frozen.observedAt, recoveredSlateGames:legacy.map(entry=>entry.gameId), fetchedAt: cached.fetchedAt, stale: cached.stale }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { console.error('[The Court] slate unavailable', nbaSlateFailure(stage, error)); return NextResponse.json({ error: 'NBA slate could not load. Try again shortly.' }, { status: 503 }) }
  finally { const slow = timer.finish(); if (slow) console.info('[The Court] slow slate', slow) }
}
