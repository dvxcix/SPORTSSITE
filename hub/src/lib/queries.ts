import { createClient } from './supabase/server'
import type { Post, Channel, Message, Notification, User } from './supabase/types'

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null
  const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  return data
}

export async function getFeedPosts(limit = 20, offset = 0): Promise<Post[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(`*, author:users(id,username,display_name,avatar_url,is_verified,account_type,pick_record)`)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return data ?? []
}

export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_type', 'public')
    .order('is_pinned', { ascending: false })
    .order('member_count', { ascending: false })
  return data ?? []
}

export async function getChannelMessages(channelId: string, limit = 50): Promise<Message[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select(`*, sender:users(id,username,display_name,avatar_url,is_verified,account_type)`)
    .eq('channel_id', channelId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data ?? []
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select(`*, actor:users(id,username,display_name,avatar_url)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  return data ?? []
}

export async function getUserProfile(username: string): Promise<User | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('users').select('*').eq('username', username).single()
  return data
}

export async function getUserPosts(userId: string): Promise<Post[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(`*, author:users(id,username,display_name,avatar_url,is_verified,account_type,pick_record)`)
    .eq('author_id', userId)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}

export async function getLeaderboard(sport = 'MLB', limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id,username,display_name,avatar_url,is_verified,pick_record,account_type')
    .order('pick_record->>wins', { ascending: false })
    .limit(limit)
  return data ?? []
}
