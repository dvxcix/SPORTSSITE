import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicResearchPreview } from '@/lib/publicResearchPreviewData'
import { isPreviewSport, PREVIEW_CONFIG, PREVIEW_SPORTS, readPreviewContext } from '@/lib/publicResearchPreview'
import { ResearchPreviewClient } from './ResearchPreviewClient'

type Props = {
  params: Promise<{ sport: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamicParams = false
export function generateStaticParams() {
  return PREVIEW_SPORTS.map(sport => ({ sport }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport } = await params
  if (!isPreviewSport(sport)) notFound()
  const config = PREVIEW_CONFIG[sport]
  return {
    title: 'Free ' + config.label + ' Odds Preview | SlipSurge',
    description: 'Explore a real ' + config.title.toLowerCase() + ' ladder with saved pregame prices and movement in ' + config.workspace + '.',
    alternates: { canonical: '/preview/' + sport },
  }
}

export default async function ResearchPreviewPage({ params, searchParams }: Props) {
  const { sport } = await params
  if (!isPreviewSport(sport)) notFound()
  const [preview, query] = await Promise.all([getPublicResearchPreview(sport), searchParams])
  const context = readPreviewContext({ ...query, preview: sport })
  const initial = context?.game === preview.board.game.id && context.date === preview.board.game.date ? context : null
  return <ResearchPreviewClient key={sport + ':' + preview.board.game.id} sport={sport} preview={preview} initial={initial} />
}
