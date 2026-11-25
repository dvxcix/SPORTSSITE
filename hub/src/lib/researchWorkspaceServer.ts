import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { canViewMlb } from '@/lib/mlbViewerAccess'

export async function loadResearchWorkspace(supabase: SupabaseClient, userId: string, { includeSharedLibrary = true } = {}) {
  const showMlb = await canViewMlb(supabase, userId)

  const db = supabase
  const [workspaceResult, notesResult] = await Promise.all([
    db.from('research_workspaces').select('id,user_id,name,description,sport,watchlist_item_ids,mlb_matrix_ids,nfl_matrix_ids,created_at,updated_at').order('updated_at', { ascending: false }),
    db.from('research_notes').select('id,title,body,sport,game_id,tags,pinned,created_at,updated_at').eq('user_id', userId).order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
  ])
  const workspaces = workspaceResult.data ?? []
  const workspaceIds = workspaces.map(workspace => workspace.id)
  const evidenceResult = workspaceIds.length
    ? await db.from('research_workspace_items').select('id,workspace_id,added_by,item_type,title,source_path,payload,created_at').in('workspace_id', workspaceIds).order('created_at', { ascending: false })
    : { data: [] }
  const sharedWatchlistIds = includeSharedLibrary ? [...new Set(workspaces.flatMap(workspace => workspace.watchlist_item_ids ?? []))] : []
  const sharedMlbMatrixIds = includeSharedLibrary ? [...new Set(workspaces.flatMap(workspace => workspace.mlb_matrix_ids ?? []))] : []
  const sharedNflMatrixIds = includeSharedLibrary ? [...new Set(workspaces.flatMap(workspace => workspace.nfl_matrix_ids ?? []))] : []
  const admin = createAdminClient()
  const watchlistFields = 'id,sport,game_pk,game_date,mlb_id,player_name,team,position,bats,headshot_url,prop_key,prop_label,line,book,odds,odds_by_book,notes,status,created_at,updated_at'
  const matrixFields = 'id,name,color,element_code'
  const [ownWatchlist, sharedWatchlist, ownMlb, sharedMlb, ownNfl, sharedNfl] = await Promise.all([
    admin.from('watchlist_items').select(watchlistFields).eq('user_id', userId).neq('status', 'archived').order('created_at', { ascending: false }),
    sharedWatchlistIds.length ? admin.from('watchlist_items').select(watchlistFields).in('id', sharedWatchlistIds) : Promise.resolve({ data: [] }),
    showMlb ? admin.from('matrices').select(matrixFields).eq('user_id', userId).order('priority').order('created_at') : Promise.resolve({ data: [] }),
    showMlb && sharedMlbMatrixIds.length ? admin.from('matrices').select(matrixFields).in('id', sharedMlbMatrixIds) : Promise.resolve({ data: [] }),
    admin.from('nfl_matrices').select(matrixFields).eq('user_id', userId).order('priority').order('created_at'),
    sharedNflMatrixIds.length ? admin.from('nfl_matrices').select(matrixFields).in('id', sharedNflMatrixIds) : Promise.resolve({ data: [] }),
  ])
  const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(row => [row.id, row])).values()]
  const watchlistItems = unique([...(ownWatchlist.data ?? []), ...(sharedWatchlist.data ?? [])]).filter(item => showMlb || item.sport?.toUpperCase() !== 'MLB')
  const mlbMatrices = unique([...(ownMlb.data ?? []), ...(sharedMlb.data ?? [])])
  const nflMatrices = unique([...(ownNfl.data ?? []), ...(sharedNfl.data ?? [])])

  return { showMlb, workspaces, watchlistItems, mlbMatrices, nflMatrices,
    notes: (notesResult.data ?? []).filter(note => showMlb || note.sport?.toUpperCase() !== 'MLB'),
    evidence: (evidenceResult.data ?? []).filter(item => showMlb || (item.payload as { sport?: string } | null)?.sport === 'NFL'),
    available: [workspaceResult, notesResult, evidenceResult, ownWatchlist, sharedWatchlist, ownMlb, sharedMlb, ownNfl, sharedNfl].every(result => !('error' in result) || !result.error),
  }
}
