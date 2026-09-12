import { redirect } from 'next/navigation'
import { Layers3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { ResearchWorkspaceClient } from '@/components/research/ResearchWorkspaceClient'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/workspace')

  const db = supabase
  const [watchlistResult, mlbResult, nflResult, workspaceResult, notesResult] = await Promise.all([
    db.from('watchlist_items').select('id,sport,game_pk,game_date,mlb_id,player_name,team,position,bats,headshot_url,prop_key,prop_label,line,book,odds,odds_by_book,notes,status,created_at,updated_at').eq('user_id', user.id).neq('status', 'archived').order('created_at', { ascending: false }),
    db.from('matrices').select('id,name,color,element_code').eq('user_id', user.id).order('priority').order('created_at'),
    db.from('nfl_matrices').select('id,name,color,element_code').eq('user_id', user.id).order('priority').order('created_at'),
    db.from('research_workspaces').select('id,name,sport,watchlist_item_ids,mlb_matrix_ids,nfl_matrix_ids,created_at,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }),
    db.from('research_notes').select('id,title,body,sport,game_id,tags,pinned,created_at,updated_at').eq('user_id', user.id).order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
  ])

  return <ProductPageShell>
    <ProductHero
      icon={<Layers3 size={23} />}
      eyebrow="Private research"
      title="Workspace"
      description="Compare saved markets, organize Matrices, and keep game notes together."
      status={`${watchlistResult.data?.length ?? 0} saved markets`}
    />
    <ResearchWorkspaceClient
      userId={user.id}
      initialItems={watchlistResult.data ?? []}
      initialMlbMatrices={mlbResult.data ?? []}
      initialNflMatrices={nflResult.data ?? []}
      initialWorkspaces={workspaceResult.data ?? []}
      initialNotes={notesResult.data ?? []}
    />
  </ProductPageShell>
}
