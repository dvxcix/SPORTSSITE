import type { SupabaseClient } from '@supabase/supabase-js'
import { POST_WITH_AUTHOR, type FeedPost } from './feedQuery'
import { readFeedCursor, feedCursorFilter } from './feedPagination'
import { getBlockedEitherWayIds } from './blocks'
import { attachUserReactions } from './queries'
import { hydrateVisibleAuthorRecords } from './visiblePickRecords'

export async function groupFeedPage(client:SupabaseClient,groupId:string,options:{picks:boolean;userId?:string;hideMlb:boolean;cursor?:string|null}) {
 const cursor=readFeedCursor(options.cursor)
 if(cursor.posts==='done')return {posts:[],nextCursor:null,hasMore:false}
 let query=client.from('posts').select(POST_WITH_AUTHOR).eq('group_id',groupId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(21)
 if(options.picks)query=query.in('post_type',['pick','parlay'])
 if(cursor.posts){const expression=feedCursorFilter(cursor.posts);query=expression?query.or(expression):query.lt('created_at',cursor.posts.at)}
 const [{data,error},blocked]=await Promise.all([query.abortSignal(AbortSignal.timeout(10000)),options.userId?getBlockedEitherWayIds(client,options.userId):Promise.resolve([])])
 if(error||!Array.isArray(data))throw new Error('Community posts could not be loaded.')
 const raw=data.slice(0,20) as FeedPost[],hasMore=data.length>20,last=raw.at(-1)
 const nextCursor=hasMore&&last?JSON.stringify({v:1,posts:{at:last.created_at,id:last.id},reposts:'done'}):null
 const hidden=new Set(blocked)
 const visible=raw.filter(post=>!hidden.has(post.author_id)&&(!options.hideMlb||post.sport?.toUpperCase()!=='MLB'))
 const posts=await attachUserReactions((await hydrateVisibleAuthorRecords(client,visible)).posts,options.userId)
 return {posts,nextCursor,hasMore}
}
