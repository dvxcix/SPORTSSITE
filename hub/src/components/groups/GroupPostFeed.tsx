'use client'
import { useEffect, useRef, useState } from 'react'
import { PostCardClient } from '@/components/social/PostCardClient'
import { useRouter } from 'next/navigation'
import type { Post } from '@/lib/supabase/types'

export function GroupPostFeed({groupId,picks,initialPosts,initialCursor,initialHasMore}:{groupId:string;picks:boolean;initialPosts:Post[];initialCursor:string|null;initialHasMore:boolean}) {
 const [posts,setPosts]=useState(initialPosts),[cursor,setCursor]=useState(initialCursor),[hasMore,setHasMore]=useState(initialHasMore),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const pending=useRef<AbortController|null>(null)
 const router=useRouter()
 useEffect(()=>()=>{pending.current?.abort();pending.current=null},[])
 async function load(){
  if(pending.current||!cursor||!hasMore)return
  const controller=new AbortController();pending.current=controller;setBusy(true);setError('')
  try{
   const response=await fetch(`/api/groups/${groupId}/posts?view=${picks?'picks':'posts'}&cursor=${encodeURIComponent(cursor)}`,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
   if(response.status===401||response.status===403){setPosts([]);setHasMore(false);setError('Your community access changed. Refresh to review your membership.');router.refresh();return}
   const body=await response.json()
   if(!response.ok)throw new Error(body.error||'Could not load more posts.')
   if(!Array.isArray(body.posts))throw new Error('Posts could not be read.')
   setPosts(previous=>{const known=new Set(previous.map(post=>post.id));return [...previous,...body.posts.filter((post:Post)=>!known.has(post.id))]})
   setCursor(body.nextCursor);setHasMore(body.hasMore===true)
  }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Could not load more posts.')}
  finally{if(pending.current===controller){pending.current=null;setBusy(false)}}
 }
 return <div>{posts.map((post,index)=>post.author?<PostCardClient key={post.id} post={{...post,author:post.author}} index={index}/>:null)}{!posts.length&&!hasMore&&<p role="status" className="px-5 py-10 text-center text-sm text-[var(--text-2)]">{picks?'No picks posted yet.':'No posts yet. Start the conversation.'}</p>}{hasMore&&<div className="p-4 text-center"><button type="button" disabled={busy} onClick={load} className="min-h-11 rounded-lg border border-[var(--border)] px-5 text-sm font-semibold text-[var(--text-1)]">{busy?'Loading…':picks?'More picks':'More posts'}</button></div>}{error&&<p role="alert" className="px-5 py-3 text-sm text-[var(--red)]">{error}</p>}</div>
}
