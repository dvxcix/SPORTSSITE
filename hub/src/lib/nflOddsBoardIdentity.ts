import { normalizeNflPlayerName } from './nflPlayerName'
import { nflOddsBoardTeam, type NflOddsBoardFrame, type NflOddsBoardQuote } from './nflOddsBoard'

// Player artwork is copied only from an already-saved pregame frame. It is
// keyed to the exact game, team, ID and name; it is never looked up from a
// current roster when a game has started.
export type NflBoardIdentity = [gameId:string, playerId:number, name:string, team:string, headshot:string|null, fallbacks:string[]]
export const nflBoardIdentityKey = (gameId:string, playerId:number, team:string, name:string) => JSON.stringify([gameId,playerId,team,normalizeNflPlayerName(name)])

// Only the same public image hosts already used by Sideline identities are
// allowed; saved provider fields may otherwise contain arbitrary URLs.
export function nflBoardImage(value:unknown):string|null {
  if(typeof value!=='string'||value.length>512)return null
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&['static.www.nfl.com','a.espncdn.com'].includes(url.hostname)?value:null } catch { return null }
}

export function nflBoardIdentities(gameId:string, teams:string[], frames:NflOddsBoardFrame[], quotes:NflOddsBoardQuote[]):NflBoardIdentity[] {
  const wanted=new Set(quotes.map(q=>nflBoardIdentityKey(q.gameId,q.playerId,q.team,q.player))), found=new Map<string,NflBoardIdentity>()
  for(const frame of [...frames].sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt)))for(const player of frame.board.players){
    if(!Number.isSafeInteger(player.id)||player.id<=0||typeof player.name!=='string'||!player.name||typeof player.team!=='string')continue
    const team=nflOddsBoardTeam(teams,player.team)
    if(!team)continue
    const key=nflBoardIdentityKey(gameId,player.id,team,player.name)
    if(!wanted.has(key)||found.has(key))continue
    const sources=[...new Set([player.headshot,...(Array.isArray(player.headshotFallbacks)?player.headshotFallbacks.slice(0,4):[])].map(nflBoardImage).filter((value):value is string=>!!value))]
    if(sources.length)found.set(key,[gameId,player.id,player.name,team,sources[0],sources.slice(1)])
  }
  return [...found.values()]
}
