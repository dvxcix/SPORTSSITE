import type { PreviewContext, PreviewSport, ResearchPreview } from './publicResearchPreview'
import { PUBLIC_PREVIEW_EXAMPLES } from './publicResearchPreviewExamples'

/** Keep a landing-page selection on the same already-public saved matchup. */
export function preservePublicPreviewContext(sport:PreviewSport, current:ResearchPreview, context:PreviewContext|null):ResearchPreview {
  const example=PUBLIC_PREVIEW_EXAMPLES[sport]
  if(context?.sport!==sport || context.game!==example.game.id || context.date!==example.game.date)return current
  return {...current,board:example}
}
