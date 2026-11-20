import { nbaPrice, type PaintProp } from './nbaPaint'
import { impliedProbability } from './nbaMarketMetrics'
import type { PaintFrame } from './nbaMovement'

/** The price chart follows one exact N+ contract; O/U charts show observed reference lines. */
export function nbaMovementChartPoints(frames:PaintFrame[], references:{at:string;line:number}[], contract?:PaintProp) {
  if (!frames.length) return []
  const first=Date.parse(frames[0].captured_at), last=Date.parse(frames.at(-1)!.captured_at)
  return frames.map(frame=>{
    const point=references.find(item=>item.at===frame.captured_at)
    const quote=contract?frame.props.find(item=>item.game_id===contract.game_id&&item.player_id===contract.player_id&&item.vendor===contract.vendor&&item.prop_type===contract.prop_type&&item.market.type===contract.market.type&&Number(item.line_value)===Number(contract.line_value)&&nbaPrice(item)!=null):undefined
    const probability=quote?impliedProbability(nbaPrice(quote)):null
    return {
      label:new Date(frame.captured_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET',
      value:contract?(probability==null?null:probability*100):point?.line??null,
      x:(Date.parse(frame.captured_at)-first)/Math.max(1,last-first),
    }
  })
}
