import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { nbaReadSelection, nbaSelectedPlayers } from '@/lib/nbaMarketSelection'
import { NextRequest, NextResponse } from 'next/server'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintGame } from '@/lib/nbaPaintData'
import { getNbaResearchDefense, getNbaResearchMarketContext } from '@/lib/nbaResearchResources'
import { resolveNbaResearchBundle } from '@/lib/nbaResearchBundle'
import { nbaEmptyMarketContext } from '@/lib/nbaMarketSignal'
import { nbaMarketSupportView, nbaPlayerMarketSignals } from '@/lib/nbaMarketSignal'
import { nbaGamePace,nbaPosition,nbaSlipSurgeScore } from '@/lib/nbaIntelligence'
import { nbaReference,nbaPeriod,PAINT_MARKETS,type PaintMarket } from '@/lib/nbaPaint'
import { nbaMarketRanks } from '@/lib/nbaMarketMetrics'
export const maxDuration = 120
export async function GET(request: NextRequest) {
  const gate = await requirePaintAccess(); if (gate.error) return gate.error
  const mode = nbaOddsMode(request.nextUrl.searchParams.get('mode'))
  const id = request.nextUrl.searchParams.get('game')
  const market=request.nextUrl.searchParams.get('market')??'points',book=request.nextUrl.searchParams.get('book')??'all',side=request.nextUrl.searchParams.get('side')??'over'
  if (!id || !/^\d{1,10}$/.test(id) || !PAINT_MARKETS.some(item=>item.key===market) || !/^[a-z0-9_]{1,30}$/.test(book) || !['over','under'].includes(side)) return NextResponse.json({ error: 'Invalid matchup' }, { status: 400 })
  try {
    const initial = await getPaintBoard(await getPaintGame(Number(id)), mode)
    const { board: rawBoard, value: { defense, marketContext, unavailable } } = await resolveNbaResearchBundle(initial, mode, async board => {
      const unavailable: string[] = []
      let defenseTimer:ReturnType<typeof setTimeout>|undefined
      const defenseLoad=Promise.race([
        getNbaResearchDefense(board,mode),
        new Promise<never>((_resolve,reject)=>{defenseTimer=setTimeout(()=>reject(new Error('Defense context unavailable')),18_000)}),
      ]).catch(()=>{unavailable.push('Defense context');return {ready:false,season:board.sampleSeason,before:board.game.date,teams:board.teams,profiles:[],games:0,rows:0,fetchedAt:null,stale:false}}).finally(()=>{if(defenseTimer)clearTimeout(defenseTimer)})
      const [defense,marketContext]=await Promise.all([defenseLoad,getNbaResearchMarketContext(board,mode).catch(()=>{unavailable.push('Market context');return nbaEmptyMarketContext(board.game.id,board.fetchedAt,board.game.datetime??null,'No saved market context for this matchup',mode)})])
      return { defense, marketContext, unavailable: unavailable.sort() }
    })
    const board = {...rawBoard,players:nbaSelectedPlayers(rawBoard.players,market,nbaReadSelection(request.nextUrl.searchParams))}
    const ranks=nbaMarketRanks(board.players,market as PaintMarket,book,'all',{gameId:board.game.id,beforeDate:board.game.date})
    const scores=board.players.map(player=>{
      const opponent=player.team.id===board.game.home_team.id?board.game.visitor_team.id:board.game.home_team.id
      const matchup=defense.profiles.find(profile=>profile.teamId===opponent&&profile.position===nbaPosition(player.position)&&profile.market===market)
      const offer=nbaReference(player.props,market,book,side as 'over'|'under')
      const score=nbaSlipSurgeScore(player,market as PaintMarket,board.game.date,matchup,nbaGamePace(board),offer?{offer,side:side as 'over'|'under',context:marketContext}:undefined)
      const mm=board.statsComplete&&(!nbaPeriod(market)||board.periodStatsComplete!==false)?ranks.get(player.id)?.mm??null:null
      const marketSignals=nbaPlayerMarketSignals({playerId:player.id,gameId:board.game.id,market:market as PaintMarket,book,side:side as 'over'|'under',props:player.props,context:marketContext})
      return {playerId:player.id,score:unavailable.length?null:score.score,offer:offer??null,mm,minutes:score.minutes,production:score.production,newTeam:score.newTeam,marketSupport:nbaMarketSupportView(score.marketSupport),marketSignals:nbaMarketSupportView(marketSignals)}
    })
    return NextResponse.json({...defense,scores,market,book,side,mode,unavailable}, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return NextResponse.json({ error: 'Defense research could not load. Try again shortly.' }, { status: 503 }) }
}
