import { nbaName, type PaintGame, type PaintRoster } from './nbaPaint'
import { nbaPregameOpen } from './nbaOddsMode'
import { nbaRosterPortraits } from './nbaPlayerPortraits'
import type { NbaBoardPlayer } from './nbaFullOddsBoard'

type RosterPlayer = PaintRoster & { headshot?:string|null }
type TeamArtwork = { headshots:Map<string,string|null> }

/** Use shared team artwork only before tip; the archived roster owns the
 * portrait after tip. A crossed request must re-resolve the frozen board. */
export async function nbaFullBoardPlayers(
  game:PaintGame, roster:RosterPlayer[], open:boolean, hasPrices:boolean,
  loadArtwork:(abbreviation:string)=>Promise<TeamArtwork>,
):Promise<NbaBoardPlayer[]> {
  const teams=open&&hasPrices?[game.home_team,game.visitor_team]:[]
  const images=await Promise.all(teams.map(team=>loadArtwork(team.abbreviation).catch(()=>null)))
  if(open&&!nbaPregameOpen(game))throw new Error('NBA game crossed its cutoff')
  const portraits=new Map(teams.map((team,index)=>[team.id,nbaRosterPortraits(roster.filter(player=>player.team.id===team.id),images[index]?.headshots??new Map())]))
  const names=new Map<string,number>()
  for(const player of roster){const key=JSON.stringify([player.team.id,nbaName(`${player.first_name} ${player.last_name}`)]);names.set(key,(names.get(key)??0)+1)}
  return roster.map(player=>{
    const name=nbaName(`${player.first_name} ${player.last_name}`)
    const archived=typeof player.headshot==='string'?player.headshot:null
    const headshot=open&&names.get(JSON.stringify([player.team.id,name]))===1?(portraits.get(player.team.id)?.get(player.id)??null):open?null:archived
    return {gameId:game.id,id:player.id,first_name:player.first_name,last_name:player.last_name,position:player.position,team:player.team,headshot}
  })
}
