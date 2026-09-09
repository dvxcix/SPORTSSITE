import type { SidelineOddsBoard } from './nflOddsTypes'
type Value = string | number | boolean | null | Value[]
export type PackedOdds = { encoding: 'sideline-v1'; shapes: string[][]; data: Value }
/** Lossless JSON shape dictionary: retain every market, send repeated keys once. */
export function packSidelineBoard(board: SidelineOddsBoard): PackedOdds {
  const shapes:string[][]=[],ids=new Map<string,number>()
  const encode=(value:unknown):Value=>{
    if(value==null)return null
    if(Array.isArray(value))return [1,...value.map(encode)]
    if(typeof value==='object'){
      const entries=Object.entries(value).filter(([,v])=>v!==undefined),keys=entries.map(([k])=>k),signature=JSON.stringify(keys)
      let id=ids.get(signature);if(id==null){id=shapes.length;shapes.push(keys);ids.set(signature,id)}
      return [0,id,...entries.map(([,v])=>encode(v))]
    }
    return value as string|number|boolean
  }
  return {encoding:'sideline-v1',shapes,data:encode(board)}
}
export function unpackSidelineBoard(value: PackedOdds | SidelineOddsBoard): SidelineOddsBoard {
  if(!('encoding' in value))return value
  const decode=(item:Value):unknown=>{
    if(!Array.isArray(item))return item
    if(item[0]===1)return item.slice(1).map(decode)
    const keys=value.shapes[Number(item[1])]
    if(!keys)throw new Error('Invalid market payload')
    return Object.fromEntries(keys.map((key,i)=>[key,decode(item[i+2])]))
  }
  return decode(value.data) as SidelineOddsBoard
}
