import { nbaName, PAINT_MARKETS, type PaintGame, type PaintMarket, type PaintRoster } from './nbaPaint'
export const NBA_PUBLIC_VERSION='nba-public-v2'
export function nbaPublicEventMatches(game:Pick<PaintGame,'date'|'visitor_team'|'home_team'>,text:string){
  const normalized=nbaName(text),[,month,day]=game.date.split('-')
  return [game.visitor_team.full_name,game.home_team.full_name].every(name=>normalized.includes(nbaName(name)))&&new RegExp(`\\b${Number(month)}/${Number(day)}\\b`).test(text)
}
export type NbaPublicRow={playerId:number;market:PaintMarket;picks:number}
export type NbaPublicCapture={gameId:number;capturedAt:string;sourceUrl:string;rows:NbaPublicRow[];unmatched:number;markets:string[];normalizationVersion?:string}
export function nbaPublicMarket(label:string):PaintMarket|null{
  const text=label.toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim()
  if(/double double/.test(text)&&!/quarter|half|\b[1-4]q\b/.test(text))return 'double_double'
  if(/triple double/.test(text)&&!/quarter|half|\b[1-4]q\b/.test(text))return 'triple_double'
  if(/first quarter|1st quarter|\b1q\b|\bq1\b/.test(text)){if(/points?|\bpts\b/.test(text)&&!/reb|ast|assist|three|3.?point|3pm/.test(text))return 'points_1q';if(/rebounds?|\breb\b/.test(text)&&!/point|pts|ast|assist/.test(text))return 'rebounds_1q';if(/assists?|\bast\b/.test(text)&&!/point|pts|reb/.test(text))return 'assists_1q';return null}
  if(/quarter|half|first|last|double|triple|\b[1-4]q\b|\bq[1-4]\b|\b[12]h\b/.test(text))return null
  if(/steal/.test(text)&&/block/.test(text))return null
  const keys=[/points?|\bpts\b/.test(text)&&'points',/rebounds?|\breb\b/.test(text)&&'rebounds',/assists?|\bast\b/.test(text)&&'assists'].filter(Boolean)
  if(keys.length>1){const key=keys.join('_');return PAINT_MARKETS.some(m=>m.key===key)?key as PaintMarket:null}
  if(/three|3.?point|3pm/.test(text))return 'threes'
  if(keys.length===1)return keys[0] as PaintMarket
  if(/steals?/.test(text))return 'steals'
  if(/blocks?/.test(text))return 'blocks'
  if(/turnovers?/.test(text))return 'turnovers'
  return null
}
export function normalizeNbaPublic(props:Record<string,Record<string,number>>,roster:PaintRoster[]){
  const found=new Map<string,NbaPublicRow>();let unmatched=0
  for(const [label,entries] of Object.entries(props)){
    const categoryMarket=nbaPublicMarket(label);if(!categoryMarket||!entries||typeof entries!=='object'||Array.isArray(entries))continue
    for(const [raw,count] of Object.entries(entries)){
      if(!Number.isSafeInteger(count)||count<0||count>10000000)continue
      // Exact normalized names after removing the exact category suffix. Never fuzzy-match.
      const cleaned=raw.replace(/\s+(Over|Under)\s+[+-]?\d+(\.\d+)?$/i,'').trim()
      const normalized=nbaName(cleaned)
      const matches=roster.flatMap(p=>{
        const name=nbaName(`${p.first_name} ${p.last_name}`)
        if(normalized===name)return [{id:p.id,market:categoryMarket}]
        if(!normalized.startsWith(name))return []
        const suffix=normalized.slice(name.length)
        const candidates:PaintMarket[]=[categoryMarket,...(['points','rebounds','assists'].includes(categoryMarket)?[`${categoryMarket}_1q` as PaintMarket]:[])]
        const market=candidates.find(market=>{
          const definition=PAINT_MARKETS.find(item=>item.key===market)!
          const aliases=market==='threes'?['Made Threes','Threes Made','Three Pointers','Three Pointers Made','3-Pointers','3-Pointers Made','3PM','3PT','3PT FG','3 Point Field Goals','Three Point Field Goals Made']:[]
          if(market.endsWith('_1q')){const base=PAINT_MARKETS.find(item=>item.key===market.slice(0,-3))!.label;aliases.push(`${base} 1st Quarter`,`${base} First Quarter`,`1st Quarter ${base}`,`1Q ${base}`,`Q1 ${base}`)}
          return [definition.label,definition.key,...aliases].flatMap(label=>[nbaName(label),nbaName(`Player ${label}`)]).includes(suffix)
        })
        return market?[{id:p.id,market}]:[]
      })
      if(matches.length!==1){unmatched++;continue}
      const {id:playerId,market}=matches[0],key=`${playerId}:${market}`,prior=found.get(key)
      // Repeated source sections aren't independent picks and must not be summed.
      if(!prior||count>prior.picks)found.set(key,{playerId,market,picks:count})
    }
  }
  return {rows:[...found.values()].sort((a,b)=>a.playerId-b.playerId||a.market.localeCompare(b.market)),unmatched}
}
