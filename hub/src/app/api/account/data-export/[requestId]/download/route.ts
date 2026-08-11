import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'

async function readRows(admin: ReturnType<typeof createAdminClient>, table: string, select: string, column: string, userId: string) {
  const rows: unknown[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from(table).select(select).eq(column, userId).range(from, from + pageSize - 1)
    if (error) return { rows, failed: true }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { rows, failed: false }
  }
}

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { requestId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return Response.json({ error: 'Export is not available' }, { status: 404 })
  }
  const admin = createAdminClient()
  const { data: exportRequest, error: requestError } = await admin.from('data_export_requests')
    .select('id,status,expires_at').eq('id', requestId).eq('user_id', user.id).maybeSingle()
  if (requestError) return safeApiError('data-export-download-request', requestError, 'Export is not available', 404)
  if (!exportRequest || exportRequest.status !== 'ready') return Response.json({ error: 'Export is not available' }, { status: 404 })
  if (exportRequest.expires_at && new Date(exportRequest.expires_at) < new Date()) {
    return Response.json({ error: 'Export link has expired. Request a new copy.' }, { status: 410 })
  }

  const sources = [
    { key: 'posts', table: 'posts', column: 'author_id', select: 'id,author_id,content,media_urls,post_type,sport,game_pk,pick_data,visibility,is_premium,reaction_count,comment_count,repost_count,view_count,created_at,updated_at,group_id,page_id,poll_data,book,wager_amount,potential_payout,combined_odds,bookmark_count,reaction_summary,creator_product_id,preview_text' },
    { key: 'comments', table: 'comments', column: 'author_id', select: 'id,post_id,author_id,parent_id,content,reaction_count,created_at,updated_at' },
    { key: 'picks', table: 'picks', column: 'user_id', select: 'id,user_id,post_id,sport,game_pk,game_date,pick_type,team,player_name,line,odds,book,units,result,graded_at,notes,created_at,mlb_id,creator_product_id' },
    { key: 'bookmarks', table: 'bookmarks', column: 'user_id', select: 'id,user_id,post_id,created_at' },
    { key: 'following', table: 'follows', column: 'follower_id', select: 'follower_id,following_id,created_at' },
    { key: 'followers', table: 'follows', column: 'following_id', select: 'follower_id,following_id,created_at' },
    { key: 'group_memberships', table: 'group_members', column: 'user_id', select: 'id,group_id,user_id,role,joined_at' },
    { key: 'notifications', table: 'notifications', column: 'user_id', select: 'id,user_id,actor_id,type,target_id,target_type,data,read,created_at,message,body,link' },
    { key: 'creator_applications', table: 'creator_applications', column: 'user_id', select: 'id,user_id,status,bio,social_links,sports,why_creator,sample_picks,follower_count_at_apply,reviewed_at,rejection_reason,created_at,updated_at' },
    { key: 'creator_products', table: 'creator_products', column: 'creator_id', select: 'id,creator_id,title,description,product_type,billing_period_days,price,currency,platform_fee_amount,status,purchase_url,created_at,updated_at' },
    { key: 'creator_entitlements', table: 'creator_entitlements', column: 'user_id', select: 'id,user_id,creator_id,product_id,status,current_period_end,created_at,updated_at' },
  ] as const
  const [profileResult, authResult, ...collections] = await Promise.all([
    admin.from('users').select('id,email,username,display_name,bio,avatar_url,banner_url,sport_preferences,is_verified,is_active_member,follower_count,following_count,pick_record,favorite_teams,website,twitter_handle,location,created_at,updated_at,is_private,allow_dms,notification_settings,subscription_price,favorite_sports,onboarding_complete,social_links,sportsbooks,favorite_players,verified_identities,onboarding_completed_at,tier,tier_status,tier_current_period_end,beta_access_active,hide_win_rate,tier_purchased_at,tier_cancel_at_period_end,dugout_column_prefs,discord_username,creator_commerce_status,creator_commerce_updated_at').eq('id', user.id).maybeSingle(),
    admin.auth.admin.getUserById(user.id),
    ...sources.map(source => readRows(admin, source.table, source.select, source.column, user.id)),
  ])
  if (profileResult.error || authResult.error) {
    return safeApiError('data-export-account-read', profileResult.error ?? authResult.error, 'Could not generate data export.')
  }
  const data: Record<string, unknown> = {}
  const warnings: string[] = []
  sources.forEach((source, index) => {
    const result = collections[index]
    data[source.key] = result.rows
    if (result.failed) warnings.push(`${source.key} could not be included.`)
  })

  const payload = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      auth: {
        email: authResult.data.user?.email ?? null,
        created_at: authResult.data.user?.created_at ?? null,
        last_sign_in_at: authResult.data.user?.last_sign_in_at ?? null,
        identities: authResult.data.user?.identities?.map(identity => ({ provider: identity.provider, created_at: identity.created_at })) ?? [],
      },
      profile: profileResult.data,
    },
    data,
    warnings,
  }

  await admin.from('data_export_requests').update({ status: 'delivered' }).eq('id', requestId)
  const filename = `slipsurge-data-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
