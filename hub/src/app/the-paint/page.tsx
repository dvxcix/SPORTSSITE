import type { Metadata } from 'next'
import { nbaOddsMode } from '@/lib/nbaOddsMode'
import { NbaAccessFallback } from '@/components/nba/NbaAccessFallback'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintSchedule } from '@/lib/nbaPaintData'
import { PaintBoardClient } from './PaintBoardClient'
import styles from './paint.module.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
export const metadata: Metadata = { title: 'The Court • SlipSurge', robots: { index: false, follow: false, nocache: true } }
export default async function PaintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await requirePaintAccess()
  if (gate.error) return <NbaAccessFallback status={gate.error.status} />
  const params = await searchParams
  const mode = nbaOddsMode(params.mode)
  const retry=`/the-paint?${new URLSearchParams(Object.entries(params).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))}`
  const data = await (async () => { try {
    const schedule = await getPaintSchedule(typeof params.date === 'string' ? params.date : undefined)
    const selected = schedule.games.find(g => String(g.id) === params.game) ?? schedule.games[0]
    const board = selected ? await getPaintBoard(selected, mode) : null
    return { schedule, board, selected }
  } catch(error) { console.error('[The Court] page unavailable',{reason:error instanceof Error&&/^NBA /.test(error.message)?error.message.slice(0,180):'NBA source request failed'});return null } })()
  if (!data) return <section className={styles.empty}><span>NBA</span><h1>The Court</h1><p>NBA data is temporarily unavailable.</p><a href={retry}>Try again</a></section>
  // A global tool link can change the query while keeping the same game.
  // Remount for requested research context so its initial view/quote is respected.
  const contextKey = ['mode','view','market','book','side','player','panel','line','type','metric'].map(key => typeof params[key] === 'string' ? params[key] : '').join(':')
  return <PaintBoardClient key={`${data.selected?.id ?? data.schedule.date}:${contextKey}`} initial={data.board} initialMode={mode} games={data.schedule.games} days={data.schedule.days} date={data.schedule.date} />
}
