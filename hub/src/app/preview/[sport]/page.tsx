import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isPreviewSport, PREVIEW_CONFIG, PREVIEW_SPORTS } from '@/lib/publicResearchPreview'
import { resolvePublicWorkspace } from '@/lib/publicWorkspaceData'
import { withPublicWorkspace } from '@/lib/publicWorkspaceScope'
import PaintPage from '@/app/the-paint/page'
import SidelinePage from '@/app/the-sideline/page'
import { PublicWorkspaceFrame } from '@/components/marketing/PublicWorkspaceFrame'

type Props = {
  params: Promise<{ sport: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const dynamicParams = false
export const dynamic = 'force-dynamic'
export const maxDuration = 120
export function generateStaticParams() {
  return PREVIEW_SPORTS.map(sport => ({ sport }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sport } = await params
  if (!isPreviewSport(sport)) notFound()
  const config = PREVIEW_CONFIG[sport]
  return {
    title: 'Free ' + config.label + ' Game Preview | SlipSurge',
    description: 'Use ' + config.workspace + ' with one matchup unlocked: the actual boards, player drawers, charts and research.',
    alternates: { canonical: '/preview/' + sport },
  }
}

export default async function ResearchPreviewPage({ params, searchParams }: Props) {
  const { sport } = await params
  if (!isPreviewSport(sport)) notFound()
  const query = await searchParams
  const scope = await resolvePublicWorkspace(sport)
  const search = Promise.resolve({ ...query, preview: sport, game: scope.game, date: scope.date })
  const workspace = await withPublicWorkspace(scope, () => sport === 'nba'
    ? PaintPage({ searchParams: search })
    : SidelinePage({ searchParams: search }))
  return <PublicWorkspaceFrame sport={sport} game={scope.game} date={scope.date}>{workspace}</PublicWorkspaceFrame>
}
