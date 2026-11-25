import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { publicCreatorDirectory, type PublishedCreatorStore, type PublicCreatorIdentity } from './publicCreatorDirectory'

export async function loadPublicCreators(supabase: SupabaseClient) {
  const [{data:stores,error:storeError},{data,error}] = await Promise.all([supabase.from('creator_storefronts').select('creator_id,name,bio,logo_url,cover_url,sports,tags,featured,featured_rank,access_mode,creator:users!creator_storefronts_creator_id_fkey(id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,is_verified,creator_products!creator_products_creator_id_fkey(id,title,description,price,product_type,billing_period_days))').eq('status','published').eq('creator.creator_products.status','active').order('featured',{ascending:false}).order('featured_rank').limit(100),supabase
    .from('users')
    .select('id,username,display_name,avatar_url,avatar_ring_style,avatar_ring_color,banner_url,bio,follower_count,is_verified,creator_products!creator_products_creator_id_fkey!inner(id,title,description,price,product_type,billing_period_days)')
    .in('account_type', ['creator', 'admin'])
    .eq('creator_products.status', 'active')
    .order('follower_count', { ascending: false })
    .limit(48)])
  if (error||storeError) throw new Error('Creators could not be loaded. Please retry.')
  return publicCreatorDirectory((data || []) as unknown as PublicCreatorIdentity[], (stores || []) as unknown as PublishedCreatorStore[])
}
