import { redirect } from 'next/navigation'
import { Layers3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { ResearchWorkspaceClient } from '@/components/research/ResearchWorkspaceClient'
import { loadResearchWorkspace } from '@/lib/researchWorkspaceServer'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/workspace')
  const { showMlb, workspaces, watchlistItems, mlbMatrices, nflMatrices, notes, evidence } = await loadResearchWorkspace(supabase, user.id)

  return <ProductPageShell>
    <ProductHero
      icon={<Layers3 size={23} />}
      eyebrow="Private research"
      title="Workspace"
      description="Compare saved markets, organize Matrices, and keep game notes together."
      status={`${watchlistItems.length} saved markets`}
    />
    <ResearchWorkspaceClient
      userId={user.id}
      showMlb={showMlb}
      initialItems={watchlistItems}
      initialMlbMatrices={mlbMatrices}
      initialNflMatrices={nflMatrices}
      initialWorkspaces={workspaces}
      initialNotes={notes}
      initialEvidenceItems={evidence}
    />
  </ProductPageShell>
}
