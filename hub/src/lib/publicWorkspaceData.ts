import 'server-only'
import { getPublicResearchPreview } from './publicResearchPreviewData'
import type { PreviewSport } from './publicResearchPreview'
import type { PublicWorkspaceScope } from './publicWorkspaceScope'

/** The request cannot choose its free game. The day's first scheduled matchup
 * stays the featured game after tip, using the normal frozen/Live readers. */
export async function resolvePublicWorkspace(sport: PreviewSport): Promise<PublicWorkspaceScope> {
  const preview = await getPublicResearchPreview(sport)
  const game = preview.schedule[0] ?? preview.board.game
  return { sport, game: game.id, date: game.date }
}
