import { redirect } from 'next/navigation'
import { Layers3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProductHero, ProductPageShell } from '@/components/product/ProductPage'
import { ResearchWorkspaceClient } from '@/components/research/ResearchWorkspaceClient'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/workspace')

  const db = supabase
  const [workspaceResult, notesResult] = await Promise.all([
    db.from('research_workspaces').select('id,user_id,name,description,sport,watchlist_item_ids,mlb_matrix_ids,nfl_matrix_ids,created_at,updated_at').order('updated_at', { ascending: false }),
    db.from('research_notes').select('id,title,body,sport,game_id,tags,pinned,created_at,updated_at').eq('user_id', user.id).order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
  ])
  const workspaces = workspaceResult.data ?? []
  const sharedWatchlistIds = [...new Set(workspaces.flatMap(workspace => workspace.watchlist_item_ids ?? []))]
  const sharedMlbMatrixIds = [...new Set(workspaces.flatMap(workspace => workspace.mlb_matrix_ids ?? []))]
  const sharedNflMatrixIds = [...new Set(workspaces.flatMap(workspace => workspace.nfl_matrix_ids ?? []))]
  const admin = createAdminClient()
  const watchlistFields = 'id,sport,game_pk,game_date,mlb_id,player_name,team,position,bats,headshot_url,prop_key,prop_label,line,book,odds,odds_by_book,notes,status,created_at,updated_at'
  const matrixFields = 'id,name,color,element_code'
  const [ownWatchlist, sharedWatchlist, ownMlb, sharedMlb, ownNfl, sharedNfl] = await Promise.all([
    admin.from('watchlist_items').select(watchlistFields).eq('user_id', user.id).neq('status', 'archived').order('created_at', { ascending: false }),
    sharedWatchlistIds.length ? admin.from('watchlist_items').select(watchlistFields).in('id', sharedWatchlistIds) : Promise.resolve({ data: [] }),
    admin.from('matrices').select(matrixFields).eq('user_id', user.id).order('priority').order('created_at'),
    sharedMlbMatrixIds.length ? admin.from('matrices').select(matrixFields).in('id', sharedMlbMatrixIds) : Promise.resolve({ data: [] }),
    admin.from('nfl_matrices').select(matrixFields).eq('user_id', user.id).order('priority').order('created_at'),
    sharedNflMatrixIds.length ? admin.from('nfl_matrices').select(matrixFields).in('id', sharedNflMatrixIds) : Promise.resolve({ data: [] }),
  ])
  const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()]
  const watchlistItems = unique([...(ownWatchlist.data ?? []), ...(sharedWatchlist.data ?? [])])
  const mlbMatrices = unique([...(ownMlb.data ?? []), ...(sharedMlb.data ?? [])])
  const nflMatrices = unique([...(ownNfl.data ?? []), ...(sharedNfl.data ?? [])])

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
      initialItems={watchlistItems}
      initialMlbMatrices={mlbMatrices}
      initialNflMatrices={nflMatrices}
      initialWorkspaces={workspaces}
      initialNotes={notesResult.data ?? []}
    />
  </ProductPageShell>
}
