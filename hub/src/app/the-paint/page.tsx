import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePaintAccess } from '@/lib/paintAccess'
import { getPaintBoard, getPaintSchedule } from '@/lib/nbaPaintData'
import { PaintBoardClient } from './PaintBoardClient'
import styles from './paint.module.css'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const metadata: Metadata = { title: 'ThePaint • SlipSurge', robots: { index: false, follow: false, nocache: true } }
export default async function PaintPage({ searchParams }: { searchParams: Promise<{ date?: string; game?: string }> }) {
  const gate = await requirePaintAccess()
  if (gate.error) notFound()
  const params = await searchParams
  const data = await (async () => { try {
    const schedule = await getPaintSchedule(params.date)
    const selected = schedule.games.find(g => String(g.id) === params.game) ?? schedule.games[0]
    const board = selected ? await getPaintBoard(selected) : null
    return { schedule, board, selected }
  } catch { return null } })()
  if (!data) return <section className={styles.empty}><span>NBA</span><h1>ThePaint</h1><p>NBA data is temporarily unavailable.</p><a href="/the-paint">Try again</a></section>
  return <PaintBoardClient key={data.selected?.id ?? data.schedule.date} initial={data.board} games={data.schedule.games} days={data.schedule.days} date={data.schedule.date} />
}
