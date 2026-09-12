'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Volume2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MemberAvatar } from '@/components/social/MemberAvatar'

type MutedUser = { id:string; username:string; display_name?:string|null; avatar_url?:string|null }

export function MutedUsersList({ currentUserId, initialMuted }: { currentUserId:string; initialMuted:MutedUser[] }) {
  const [muted,setMuted]=useState(initialMuted)
  const [pending,setPending]=useState<string|null>(null)
  const [failed,setFailed]=useState<string|null>(null)
  const supabase=useMemo(()=>createClient(),[])

  async function unmute(id:string){
    setPending(id); setFailed(null)
    const {error}=await supabase.from('feed_suppressions').delete().match({user_id:currentUserId,target_type:'author',target_id:id})
    if(error) setFailed(id)
    else setMuted(current=>current.filter(user=>user.id!==id))
    setPending(null)
  }

  if(!muted.length) return <div className="ss-settings-card py-10 text-center"><Volume2 size={24} className="mx-auto mb-3 text-zinc-600"/><p className="text-sm font-medium text-zinc-400">No muted accounts</p></div>

  return <div className="ss-settings-card !p-0 divide-y divide-white/[.07] overflow-hidden">{muted.map(user=><div key={user.id} className="flex items-center gap-3 px-4 py-3"><Link href={`/profile/${user.username}`} className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"><MemberAvatar src={user.avatar_url} name={user.display_name||user.username} size={40}/><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user.display_name||user.username}</p><p className="truncate text-xs text-zinc-500">@{user.username}</p></div></Link><button type="button" onClick={()=>void unmute(user.id)} disabled={pending===user.id} className="ss-settings-secondary shrink-0 disabled:opacity-40">{pending===user.id?'Restoring…':failed===user.id?'Try again':'Unmute'}</button></div>)}</div>
}
