import { NextResponse } from 'next/server'
import { getBlockedEitherWayIds, isAccountId } from '@/lib/blocks'
import { canViewMlb } from '@/lib/mlbViewerAccess'
import { nativeSavedMarket } from '@/lib/nativeWatchlist'
import { nativeMlbResearchWatchlist } from '@/lib/nativeMlbResearchWatchlist'
import { getTeamLogoPngUrl, MLB_TEAM_COLORS, MLB_TEAM_SECONDARY_COLORS } from '@slipsurge/core/mlbTeamColors'
import { loadResearchWorkspace } from '@/lib/researchWorkspaceServer'
import { isSlateEdgeEvidence } from '@/lib/slateEdgeEvidence'
import { sportTeamColors, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const respond = (data: unknown, status = 200) => NextResponse.json(data, { status, headers })
const unavailable = () => respond({ error: 'Research library is temporarily unavailable' }, 503)
const confirmed = (error?: unknown | null) => error ? unavailable() : respond({ ok: true })
const validId = (value: unknown): value is string => typeof value === 'string' && isAccountId(value)
const range = (value: unknown, length: number): string | null => typeof value === 'string' && value.length <= length ? value.trim() : null
const ids = (value: unknown, maximum: number): string[] | null => Array.isArray(value) && value.length <= maximum && value.every(validId) ? [...new Set(value)] : null

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  const params = new URL(request.url).searchParams
  const workspace = params.get('workspace')
  try {
    if (workspace) {
      if (!isAccountId(workspace)) return respond({ error: 'Invalid workspace' }, 400)
      const access = await supabase.from('research_workspaces').select('id,name,user_id').eq('id', workspace).maybeSingle()
      if (access.error) return unavailable()
      if (!access.data) return respond({ error: 'Workspace unavailable' }, 404)
      const search = params.get('q')?.trim()
      if (search != null) {
        if (access.data.user_id !== userId) return respond({ error: 'Workspace owner required' }, 403)
        if (search.length < 2 || search.length > 64) return respond({ users: [] })
        const blocked = await getBlockedEitherWayIds(supabase, userId)
        const pattern = JSON.stringify(`%${search.replace(/[\\%_]/g, '\\$&')}%`)
        let query = supabase.from('users').select('id,username,display_name,avatar_url,is_verified').neq('id', userId)
          .or(`username.ilike.${pattern},display_name.ilike.${pattern}`).order('follower_count', { ascending: false }).limit(12)
        if (blocked.length) query = query.not('id', 'in', `(${blocked.join(',')})`)
        const result = await query
        return result.error ? unavailable() : respond({ users: result.data ?? [] })
      }
      const [members, comments, presence] = await Promise.all([
        supabase.from('research_workspace_members').select('user_id,role,users!research_workspace_members_user_id_fkey(username,display_name,avatar_url)').eq('workspace_id', workspace).order('created_at').limit(100),
        supabase.from('research_workspace_comments').select('id,user_id,body,created_at,users!research_workspace_comments_user_id_fkey(username,display_name,avatar_url)').eq('workspace_id', workspace).order('created_at', { ascending: false }).limit(60),
        supabase.from('research_workspace_presence').select('user_id').eq('workspace_id', workspace).gte('last_seen_at', new Date(Date.now() - 90_000).toISOString()).limit(100),
      ])
      if ([members, comments, presence].some(row => row.error)) return unavailable()
      return respond({ ...access.data, owner: access.data.user_id === userId, members: members.data ?? [], comments: comments.data ?? [],
        activeIds: (presence.data ?? []).map(row => row.user_id) })
    }

    // Raw legacy watchlist IDs are not proof that the item owner shared them.
    // The native library exposes the member's own saved markets and the
    // workspace evidence rows that already carry an explicit access policy.
    const [result, memberships] = await Promise.all([
      loadResearchWorkspace(supabase, userId, { includeSharedLibrary: false }),
      supabase.from('research_workspace_members').select('workspace_id,role').eq('user_id', userId),
    ])
    const { available, watchlistItems, evidence, workspaces, ...library } = result
    if (!available || memberships.error) return unavailable()
    const editing = new Set(memberships.data?.filter(row => row.role === 'editor').map(row => row.workspace_id))
    return respond({ ...library, workspaces: workspaces.map(workspace => ({ ...workspace, canEdit: workspace.user_id === userId || editing.has(workspace.id) })),
      items: watchlistItems.map(item => ({ ...item,
      offers: Object.entries(item.odds_by_book ?? {}).flatMap(([book, value]) => {
        const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null
        return amount != null && Number.isFinite(amount) ? [{ book, price: amount }] : []
      }),
      teamLogo: item.sport?.toLowerCase() === 'mlb' ? getTeamLogoPngUrl(item.team) : sportTeamLogoUrl(item.sport, item.team),
      colors: item.sport?.toLowerCase() === 'mlb' && item.team
        ? [MLB_TEAM_COLORS[item.team.toUpperCase()], MLB_TEAM_SECONDARY_COLORS[item.team.toUpperCase()]].filter(Boolean)
        : sportTeamColors(item.sport, item.team),
    })), evidence: evidence.flatMap(item => {
      const value = item.payload
      return isSlateEdgeEvidence(value) ? [{ id: item.id, workspaceId: item.workspace_id, title: item.title, capturedAt: value.capturedAt,
        name: value.snapshot.name, team: value.snapshot.team, sport: value.sport ?? 'MLB', score: value.snapshot.score, mm: value.snapshot.mm ?? null,
        teamLogo: sportTeamLogoUrl(value.sport ?? 'MLB', value.snapshot.team) }] : []
    }) })
  } catch {
    return unavailable()
  }
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { supabase, userId } = account
  try {
    const raw = await request.text()
    if (raw.length > 23_000) return respond({ error: 'Research change is too large' }, 400)
    const action = JSON.parse(raw)
    if (!action || typeof action !== 'object' || Array.isArray(action)) return respond({ error: 'Invalid research action' }, 400)
    const id = validId(action.id) ? action.id : null
    if (action.kind === 'workspace-create') {
      const name = range(action.title, 64)
      if (!id || !name) return respond({ error: 'Choose a workspace name' }, 400)
      const result = await supabase.from('research_workspaces').insert({ id, name, user_id: userId, sport: 'MULTI' })
      if (result.error?.code === '23505') {
        const previous = await supabase.from('research_workspaces').select('id').eq('user_id', userId).eq('id', id).eq('name', name).maybeSingle()
        return previous.data ? confirmed() : respond({ error: 'That workspace name is already used' }, 409)
      }
      return confirmed(result.error)
    }

    if (action.kind === 'note-create' || action.kind === 'note-edit') {
      const title = range(action.title, 100), body = range(action.body, 10_000)
      const sport = typeof action.sport === 'string' ? action.sport : null
      if (!id || !title || body === null || (sport && !['MLB', 'NFL', 'NBA'].includes(sport))) return respond({ error: 'Check your note' }, 400)
      if (sport === 'MLB' && !await canViewMlb(supabase, userId)) return respond({ error: 'Sport unavailable' }, 403)
      if (action.kind === 'note-edit') {
        return confirmed((await supabase.from('research_notes').update({ title, body }).eq('id', id).eq('user_id', userId)).error)
      }
      const game_id = range(action.game, 120), identity = { id, user_id: userId, title, body, sport, game_id }
      const result = await supabase.from('research_notes').insert(identity)
      if (result.error?.code === '23505') {
        const previous = await supabase.from('research_notes').select('id').eq('id', id).eq('user_id', userId).eq('title', title).eq('body', body).maybeSingle()
        return previous.data ? confirmed() : respond({ error: 'This note draft is already saved' }, 409)
      }
      return confirmed(result.error)
    }

    if (!id) return respond({ error: 'Invalid research action' }, 400)
    if (action.kind === 'watchlist-delete') return confirmed((await supabase.from('watchlist_items').delete().eq('id', id).eq('user_id', userId)).error)
    if (action.kind === 'watchlist-save') {
      const prior = await supabase.from('watchlist_items').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
      if (prior.error) return unavailable()
      if (prior.data) return confirmed()
      const market = action.mlbQuote == null ? await nativeSavedMarket(action.market) : await nativeMlbResearchWatchlist(request, action.mlbQuote)
      if ('response' in market && market.response) return market.response
      if ('error' in market && market.error) return respond({ error: market.error }, market.status)
      const result = await supabase.from('watchlist_items').insert({ ...market.value, id, user_id: userId })
      if (result.error?.code === '23505') {
        const saved = await supabase.from('watchlist_items').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
        return saved.data ? confirmed() : unavailable()
      }
      return confirmed(result.error)
    }
    if (action.kind === 'note-delete') return confirmed((await supabase.from('research_notes').delete().eq('id', id).eq('user_id', userId)).error)
    if (action.kind === 'note-pin' && typeof action.enabled === 'boolean') {
      return confirmed((await supabase.from('research_notes').update({ pinned: action.enabled }).eq('id', id).eq('user_id', userId)).error)
    }
    if (action.kind === 'workspace-delete') return confirmed((await supabase.from('research_workspaces').delete().eq('id', id).eq('user_id', userId)).error)
    if (action.kind === 'workspace-save') {
      const selected = ids(action.items, 4), baseline = ids(action.baseline, 4), selectedNfl = ids(action.nfl, 100), selectedMlb = ids(action.mlb, 100)
      if (!selected || !baseline || !selectedNfl || !selectedMlb) return respond({ error: 'Choose valid markets and matrices' }, 400)
      const work = await supabase.from('research_workspaces').select('watchlist_item_ids,nfl_matrix_ids,mlb_matrix_ids,updated_at').eq('id', id).maybeSingle()
      if (work.error) return unavailable()
      if (!work.data) return respond({ error: 'Workspace unavailable' }, 404)
      if (work.data.updated_at !== action.updatedAt) return respond({ error: 'This workspace changed. Refresh it and try again.' }, 409)

      const own = await loadResearchWorkspace(supabase, userId, { includeSharedLibrary: false })
      if (!own.available) return unavailable()
      const ownedMarkets = new Set(own.watchlistItems.map(row => row.id))
      const ownedNfl = new Set(own.nflMatrices.map(row => row.id)), ownedMlb = new Set(own.mlbMatrices.map(row => row.id))
      if ([...baseline, ...selected].some(value => !ownedMarkets.has(value)) || selectedNfl.some(value => !ownedNfl.has(value)) || selectedMlb.some(value => !ownedMlb.has(value))) {
        return respond({ error: 'A market or matrix is unavailable' }, 403)
      }
      const union = (existing: string[], edited: string[], visible: Set<string>) => [...new Set([...existing.filter(value => !visible.has(value)), ...edited])]
      return confirmed((await supabase.rpc('save_research_workspace_board', {
        p_workspace_id: id, p_watchlist_item_ids: union(work.data.watchlist_item_ids ?? [], selected, new Set(baseline)),
        p_nfl_matrix_ids: union(work.data.nfl_matrix_ids ?? [], selectedNfl, ownedNfl),
        p_mlb_matrix_ids: union(work.data.mlb_matrix_ids ?? [], selectedMlb, ownedMlb),
      })).error)
    }
    if (action.kind === 'heartbeat') {
      return confirmed((await supabase.from('research_workspace_presence').upsert({ workspace_id: id, user_id: userId, last_seen_at: new Date().toISOString() }, { onConflict: 'workspace_id,user_id' })).error)
    }
    if (action.kind === 'comment') {
      const body = range(action.body, 5000), message = validId(action.message) ? action.message : null
      if (!body || !message) return respond({ error: 'Check your comment' }, 400)
      const identity = { id: message, workspace_id: id, user_id: userId, body }
      const result = await supabase.from('research_workspace_comments').insert(identity)
      if (result.error?.code === '23505') {
        const previous = await supabase.from('research_workspace_comments').select('id').match(identity).maybeSingle()
        return previous.data ? confirmed() : respond({ error: 'Comment could not be confirmed' }, 409)
      }
      return confirmed(result.error)
    }
    if (action.kind === 'invite') {
      const username = range(action.username, 80)
      if (!username || !/^[A-Za-z0-9._-]+$/.test(username) || !['viewer', 'editor'].includes(action.role)) return respond({ error: 'Choose a member and role' }, 400)
      return confirmed((await supabase.rpc('invite_research_workspace_member', { p_workspace_id: id, p_username: username, p_role: action.role })).error)
    }
    if (action.kind === 'remove' && validId(action.user)) {
      return confirmed((await supabase.rpc('remove_research_workspace_member', { p_workspace_id: id, p_user_id: action.user })).error)
    }
    return respond({ error: 'Invalid research action' }, 400)
  } catch (error) {
    return error instanceof SyntaxError ? respond({ error: 'Invalid research action' }, 400) : unavailable()
  }
}
