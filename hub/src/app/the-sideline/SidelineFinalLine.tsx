import type { NflPublicResult } from '@/lib/nflPublicResults'
import { nflSidelineResult, type SidelineResultIdentity } from '@/lib/nflSidelineResult'
import styles from './sidelineBoard.module.css'

export function SidelineFinalLine({ result, player, finished, market }: { result:NflPublicResult|null; player:SidelineResultIdentity; finished:boolean; market?:string }) {
  if (!finished) return null
  const values = nflSidelineResult(result, player, market)
  return <span className={styles.playerFinal} data-nfl-final aria-label={`${player.name} final: ${values.length ? values.map(item=>`${item.value} ${item.label}`).join(', ') : result ? 'stat unavailable' : 'results pending'}`}>
    <span>Final</span>{values.length ? values.map(item=><strong key={item.label}>{item.value} <span>{item.label}</span></strong>) : <span>{result ? 'stat unavailable' : 'results pending'}</span>}
  </span>
}
