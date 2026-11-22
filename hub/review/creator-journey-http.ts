import {NextRequest,NextResponse} from 'next/server'
import {authUser,reviewProfile,table,tables,type ReviewRole} from './database'
import {readFeedCursor} from '../src/lib/feedPagination'
/** Private in-memory QA only. Imported solely by the guarded review adapter. */
export async function creatorJourneyHttp(request:NextRequest,role:ReviewRole){
 const path=request.nextUrl.pathname,user=authUser(role),profile=reviewProfile(role)
 const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-SlipSurge-Review':'local-fixtures-only'}})
 if(path==='/api/creator/members')return json({members:table('creator_entitlements').filter(row=>row.creator_id===user?.id).map(row=>({...row,product:table('creator_products').find(product=>product.id===row.product_id),member:table('users').find(member=>member.id===row.user_id)}))})
 if(path==='/api/admin/creator-fees')return json({rows:[{label:'platform processing',percentage:2,fixed:null,source:'Illustrative review'}],checkedAt:new Date().toISOString()})
 if(/^\/api\/creator\/products\/[^/]+\/restore$/.test(path))return json({state:'link_required'})
 if(/^\/api\/groups\/[^/]+\/discord\/claim$/.test(path))return json({ok:true})
 if(/^\/api\/groups\/[^/]+\/discord$/.test(path)){
  const groupId=path.split('/')[3]
  if(request.method==='GET'&&request.nextUrl.searchParams.has('guildId'))return json({guildId:request.nextUrl.searchParams.get('guildId'),guildName:'NBA Lounge',roles:[{id:'123456789012345679',name:'Court members'}]})
  if(request.method==='GET')return json({configured:true,applicationId:null,integration:table('creator_discord_integrations').find(row=>row.group_id===groupId&&row.enabled)||null})
  if(request.method==='POST'){const body=await request.json();const row=table('creator_discord_integrations').find(row=>row.group_id===groupId);if(row)Object.assign(row,{guild_id:body.guildId,role_id:body.roleId,invite_url:body.inviteUrl,enabled:true});return json({ok:true})}
  if(request.method==='DELETE'){const row=table('creator_discord_integrations').find(row=>row.group_id===groupId);if(row)row.enabled=false;return json({ok:true})}
 }
 if(path==='/api/review/mutation'&&request.method==='POST'){
  if(!user)return json({error:'Sign in required.'},401)
  const input=await request.json(),allowed=['posts','messages','comments','group_member_preferences','group_channel_preferences']
  if(!allowed.includes(input.table)||!['insert','upsert','update','delete'].includes(input.operation))return json({error:'Fixture operation unavailable.'},400)
  const rows=table(input.table),matches=(row:any)=>(input.filters||[]).every(([key,value]:[string,unknown])=>row[key]===value)
  let changed:any[]=[]
  if(['insert','upsert'].includes(input.operation)){
   changed=(Array.isArray(input.payload)?input.payload:[input.payload]).map((item:any)=>({id:crypto.randomUUID(),created_at:new Date().toISOString(),...item,...(input.table==='messages'?{sender:profile}:{author:profile})}))
   for(const row of changed){const existing=input.operation==='upsert'?rows.find(item=>item.id===row.id):null;if(existing)Object.assign(existing,row);else rows.push(row)}
  }else{changed=rows.filter(matches);if(input.operation==='update')changed.forEach(row=>Object.assign(row,input.payload));else tables[input.table]=rows.filter(row=>!matches(row))}
  return json({rows:changed})
 }
 const enroll=(group:any,join:boolean)=>{for(const [name,key,id]of[['group_members','group_id',group.id],['channel_members','channel_id',group.channel_id]]){if(!id)continue;const rows=table(name),index=rows.findIndex(row=>row[key]===id&&row.user_id===user?.id);if(join&&index<0)rows.push({[key]:id,user_id:user?.id,role:'member',joined_at:new Date().toISOString()});if(!join&&index>=0)rows.splice(index,1)}}
 const entitled=(productId:string)=>table('creator_entitlements').find(row=>row.product_id===productId&&row.user_id===user?.id&&['active','trialing'].includes(row.status)&&!row.admin_revoked_at&&(!row.current_period_end||Date.parse(row.current_period_end)>Date.now()))
 if(path==='/api/review/membership'&&request.method==='POST'){
  if(!user)return json({error:'Sign in required.'},401)
  const input=await request.json(),group=table('groups').find(row=>row.id===input.p_group_id)
  if(!group)return json({error:'Community unavailable.'},404)
  if(input.p_join&&group.access_type==='paid'&&!entitled(group.creator_product_id))return json({error:'Current paid membership required.'},403)
  enroll(group,input.p_join);return json({member:input.p_join})
 }
 if(path==='/api/groups/invitations/respond'&&request.method==='POST'){
  if(!user)return json({error:'Sign in required.'},401)
  const input=await request.json(),invite=table('group_invites').find(row=>row.id===input.inviteId&&row.invited_user_id===user.id),group=table('groups').find(row=>row.id===invite?.group_id)
  if(!invite||!group)return json({error:'Invitation unavailable.'},404)
  if(input.accept&&group.access_type==='paid'&&!entitled(group.creator_product_id))return json({error:'Current paid membership required.'},409)
  invite.status=input.accept?'accepted':'declined';if(input.accept)enroll(group,true)
  return json({accepted:input.accept,slug:group.slug})
 }
 if(path==='/api/admin/platform-settings'&&request.method==='PATCH')return json({error:'Creator fees are managed in Whop.'},410)
 if(path==='/api/admin/creators/manage'&&request.method==='POST'){
  if(role!=='admin')return json({error:'Admin access required.'},403)
  const input=await request.json()
  if(input.action==='check_creator'){const row=table('users').find(row=>row.id===input.id);if(row)Object.assign(row,{creator_commerce_status:'ready',creator_commerce_updated_at:new Date().toISOString()})}
  if(input.action==='set_product_status'){const row=table('creator_products').find(row=>row.id===input.id);if(row)row.status=input.status}
  if(['revoke_entitlement','restore_entitlement'].includes(input.action)){const row=table('creator_entitlements').find(row=>row.id===input.id);if(row)Object.assign(row,{status:input.action==='revoke_entitlement'?'revoked':'active',admin_revoked_at:input.action==='revoke_entitlement'?new Date().toISOString():null})}
  return json({ok:true})
 }
 if(/^\/api\/groups\/[0-9a-f-]+\/posts$/.test(path)&&request.method==='GET'){
  const groupId=path.split('/')[3],q=request.nextUrl.searchParams
  try{const cursor=readFeedCursor(q.get('cursor'));let rows=table('posts').filter(row=>row.group_id===groupId&&(q.get('view')!=='picks'||['pick','parlay'].includes(row.post_type)))
   if(cursor.posts==='done')rows=[];else if(cursor.posts){const at=cursor.posts.at,id=cursor.posts.id;rows=rows.filter(row=>row.created_at<at||row.created_at===at&&id&&row.id<id)}
   rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));const hasMore=rows.length>20,posts=rows.slice(0,20),last=posts.at(-1)
   return json({posts,nextCursor:hasMore&&last?JSON.stringify({v:1,posts:{at:last.created_at,id:last.id},reposts:'done'}):null,hasMore})
  }catch{return json({error:'Invalid cursor.'},400)}
 }
 if(/^\/api\/creator\/products\/[^/]+\/access$/.test(path)){
  const id=path.split('/')[4],access=entitled(id),group=table('groups').find(row=>row.creator_product_id===id),member=table('creator_entitlements').find(row=>row.product_id===id&&row.user_id===user?.id)
  return json({active:!!access,status:member?.status||'pending',destination:access&&group?'/groups/'+group.slug:null,name:group?.name||null})
 }
 return null
}
