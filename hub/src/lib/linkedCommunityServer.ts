import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { invitedCommunityEntry, publishedPaidCommunities } from '@/lib/creatorCommunityDirectory'
import { canViewMlb } from '@/lib/mlbViewerAccess'

export async function loadLinkedCommunity(client: SupabaseClient, slug: string, userId?: string) {
  const [group, paid, invitation, showMlb] = await Promise.all([
    client.from('groups').select('id,slug,name,description,sport,avatar_url,banner_url,emoji,member_count,owner_id,creator_product_id,access_type,is_public')
      .eq('slug', slug).maybeSingle(),
    publishedPaidCommunities({ slug }),
    userId ? invitedCommunityEntry(client, slug, userId) : null,
    canViewMlb(client, userId),
  ])
  if (group.error) throw Error('Community could not be loaded')
  const published = paid[0]
  const card = group.data ?? published ?? invitation
  if (!card || !showMlb && card.sport?.trim().toUpperCase() === 'MLB') return null
  const member = group.data && userId ? await client.from('group_members').select('group_id')
    .eq('group_id', card.id).eq('user_id', userId).maybeSingle() : null
  if (member?.error) throw Error('Membership could not be loaded')
  const offer = published && published.id === card.id ? published : null
  return {
    group: {
      ...card,
      ...offer && { price: offer.price, billing_period_days: offer.billing_period_days, product_type: offer.product_type },
      ...!member?.data && invitation && invitation.id === card.id && { invitationId: invitation.invitationId },
    },
    member: Boolean(member?.data),
  }
}
