import 'server-only'
import { getPaintSchedule } from './nbaPaintData'
import { nbaFullBoardCutoffs } from './nbaFullBoardCutoffsData'
import { nbaSharedCache } from './nbaSharedCache'
import { nbaOddsBoardPhaseHeader,nbaOddsBoardPhaseSignature,type NbaOddsBoardPhase } from './nbaOddsBoardPhase'

/** The existing process-local cache sits in front of the shared 15s lease, so
 * thousands of member polls do not each read the durable cutoff tables. */
export async function getNbaOddsBoardPhase(date:string):Promise<{header:string;expiresAt:number}> {
  const schedule=await getPaintSchedule(date)
  if(schedule.date!==date||!schedule.complete)throw new Error('NBA phase unavailable')
  const scheduleKey=nbaOddsBoardPhaseSignature(schedule.games)
  if(scheduleKey==null)throw new Error('NBA phase unavailable')
  const cached=await nbaSharedCache(`odds-board-phase:v1:${date}:${scheduleKey}`,15,0,async():Promise<NbaOddsBoardPhase>=>{
    const checkedAt=Date.now()
    const games=await nbaFullBoardCutoffs(schedule.games),signature=nbaOddsBoardPhaseSignature(games)
    if(signature==null)throw new Error('NBA phase unavailable')
    return {date,signature,checkedAt}
  },25)
  const fetchedAt=Date.parse(cached.fetchedAt)
  if(!Number.isFinite(fetchedAt))throw new Error('NBA phase unavailable')
  return {header:nbaOddsBoardPhaseHeader(cached.value),expiresAt:fetchedAt+15000}
}
export async function getNbaOddsBoardPhaseHeader(date:string):Promise<string> { return (await getNbaOddsBoardPhase(date)).header }
