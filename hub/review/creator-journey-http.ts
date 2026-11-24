import {NextRequest,NextResponse} from 'next/server'
import {authUser,reviewProfile,table,tables,type ReviewRole} from './database'
import {readFeedCursor} from '../src/lib/feedPagination'
import {storeDraft,ownerStore,storePublishIssue} from '../src/lib/creatorStorefront'
/** Private in-memory QA only. Imported solely by the guarded review adapter. */
export async function creatorJourneyHttp(request:NextRequest,role:ReviewRole){
 const path=request.nextUrl.pathname,user=authUser(role),profile=reviewProfile(role)
 const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','X-SlipSurge-Review':'local-fixtures-only'}})
 if(path==='/api/creator/storefront'&&request.method==='POST'){
  if(!user)return json({error:'Sign in required.'},401)
  const body=await request.json();let draft
  try{draft=storeDraft(body)}catch(cause){return json({error:cause instanceof Error?cause.message:'Invalid draft.'},400)}
  let row=table('creator_storefronts').find(row=>row.creator_id===user.id)
  if(body.action==='publish'){const issue=storePublishIssue({...draft,community_id:row?.community_id||null});if(issue)return json({error:issue},409)}
  if(!row){row={creator_id:user.id,...draft,status:'draft',community_id:null,featured:false,featured_rank:100,draft:null,updated_at:new Date().toISOString()};table('creator_storefronts').push(row)}
  if(row.status==='published'&&body.action!=='publish')row.draft=draft;else {if(row.access_mode!==draft.access_mode||row.product_id!==draft.product_id)row.community_id=null;Object.assign(row,draft,{draft:null,status:body.action==='publish'?'published':'draft'})}
  if(body.action==='publish'){const group=table('groups').find(group=>group.id===row.community_id);if(group)Object.assign(group,{is_public:row.access_mode==='free',name:row.name,avatar_url:row.logo_url,banner_url:row.cover_url});const product=table('creator_products').find(product=>product.id===row.product_id);if(product)product.status='active'}
  return json({store:ownerStore(row)})
 }
 if(path==='/api/creator/storefront/community'){
  const store=table('creator_storefronts').find(row=>row.creator_id===user?.id);if(!user||!store)return json({error:'Save your store first.'},409)
  const body=await request.json().catch(()=>({})),owned=table('groups').filter(group=>group.owner_id===user.id&&group.access_type===store.access_mode&&(group.creator_product_id??null)===(store.access_mode==='paid'?store.product_id:null))
  let group=owned.find(group=>group.id===(body.communityId&&body.communityId!=='new'?body.communityId:store.community_id))
  if(!group&&!body.communityId&&owned.length===1)group=owned[0]
  if(!group&&body.communityId&&body.communityId!=='new')return json({error:'Choose an owned matching community.'},403)
  if(!group){group={id:crypto.randomUUID(),slug:'club-'+user.id.replaceAll('-',''),owner_id:user.id,name:store.name,description:store.bio,sport:store.sports[0],is_public:false,access_type:store.access_mode,creator_product_id:store.product_id,avatar_url:store.logo_url,banner_url:store.cover_url,member_count:1,created_at:new Date().toISOString()};table('groups').push(group);table('group_members').push({group_id:group.id,user_id:user.id,role:'owner'});store.community_id=group.id}
  store.community_id=group.id
  return json({group})
 }
 if(path==='/api/creator/whop-onboard'&&request.nextUrl.searchParams.get('embedded')==='1')return json({embedded:true,state:{state:'ready',canCharge:true,canPayout:true,actions:[]}})
 if(path==='/api/admin/creators/promotions'){
  if(role!=='admin')return json({error:'Admin required.'},403)
  const body=await request.json(),row=table('creator_storefronts').find(row=>row.creator_id===body.creatorId&&row.status==='published');if(!row)return json({error:'Published store required.'},409)
  Object.assign(row,{featured:body.featured,featured_rank:body.rank});return json({ok:true})
 }
 if(path==='/api/creator/wallet'){
  if(!user)return json({error:'Sign in required.'},401)
  const after=request.nextUrl.searchParams.has('after')
  return json({balances:[{currency:'usd',available:1842.75,pending:216,reserved:48},{currency:'eur',available:124.5,pending:24,reserved:0}],payouts:(after?['completed','failed']:['processing','completed','completed','failed']).map((status,index)=>({id:'wdrl_review'+(after?'more':'')+index,amount:String([300,500,240,80][index]||75),net:String([299.5,499.5,239.5,79.5][index]||74.5),fee:'0.25',markup:'0.25',feePaidBy:'self',currency:'usd',status,createdAt:new Date(Date.now()-(index+(after?10:1))*86400000).toISOString(),arrival:status==='processing'?new Date(Date.now()+2*86400000).toISOString():null})),nextCursor:after?null:'review-next',checkedAt:new Date().toISOString(),canPayout:true,state:'ready',balanceError:false,historyError:false})
 }
 if(path==='/api/creator/members')return json({members:table('creator_entitlements').filter(row=>row.creator_id===user?.id).map(row=>({...row,product:table('creator_products').find(product=>product.id===row.product_id),member:table('users').find(member=>member.id===row.user_id)}))})
 if(path==='/api/creator/scheduled-posts'){
  if(!user)return json({error:'Sign in required.'},401)
  const rows=table('creator_scheduled_posts')
  if(request.method==='DELETE'){const id=request.nextUrl.searchParams.get('id'),index=rows.findIndex(row=>row.id===id&&row.creator_id===user.id);if(index<0)return json({error:'Draft not found.'},404);rows.splice(index,1);return json({ok:true})}
  if(request.method==='POST'||request.method==='PATCH'){
   const body=await request.json(),existing=rows.find(row=>row.id===body.id&&row.creator_id===user.id)
   if(request.method==='PATCH'&&!existing)return json({error:'Post not found.'},404)
   if(body.action==='cancel'){existing.status='canceled';return json({ok:true})}
   if(body.groupId&&!table('groups').some(group=>group.id===body.groupId&&group.owner_id===user.id))return json({error:'Choose one of your communities.'},403)
   if(!body.content?.trim()||!Number.isFinite(Date.parse(body.scheduledFor)))return json({error:'Add your post and a valid publishing time.'},400)
   const post={id:existing?.id||crypto.randomUUID(),creator_id:user.id,group_id:body.groupId||null,content:body.content,post_type:body.postType||'text',sport:body.sport||null,visibility:body.visibility||'public',scheduled_for:body.scheduledFor,status:body.draft?'draft':'scheduled',published_post_id:null,attempts:0,created_at:existing?.created_at||new Date().toISOString()}
   if(existing)Object.assign(existing,post);else rows.push(post)
   return json({post},request.method==='POST'?201:200)
  }
 }
 if(path==='/api/admin/creator-fees')return json({rows:[{label:'platform processing',percentage:2,fixed:null,source:'Illustrative review'}],checkedAt:new Date().toISOString()})
 if(/^\/api\/creator\/products\/[^/]+\/restore$/.test(path))return json({state:'link_required'})
 if(/^\/api\/creator\/products\/[^/]+\/checkout$/.test(path)){
  if(!user)return json({error:'Sign in to purchase access.'},401)
  return json({checkoutConfigurationId:'ch_reviewonly',url:'https://whop.com/checkout/review-only'})
 }
 if(path==='/api/admin/discord/creator-health')return json({configured:true,connected:true,name:'SlipSurge · private review',publicBot:true,requiresCodeGrant:false,interactionsReady:true,activeRoleMappings:2,pendingDeliveries:0,missingCommands:[]})
 if(/^\/api\/groups\/[^/]+\/discord\/claim$/.test(path))return json({ok:true,connected:role!=='member'||request.method==='POST',ready:request.method==='POST',guildName:'NBA Lounge',roles:['Court members','Research'],inviteUrl:null})
 if(/^\/api\/groups\/[^/]+\/discord\/actions$/.test(path)){
  const body=await request.json()
  if(body.action==='channels')return json({channels:[{id:'123456789012345688',name:'member-access'},{id:'123456789012345689',name:'general'}]})
  if(body.action==='create_role')return json({role:{id:'123456789012345690',name:body.name}})
  return json({ok:true,url:'https://discord.com/channels/123456789012345678/123456789012345688/123456789012345691'})
 }
 if(/^\/api\/groups\/[^/]+\/discord$/.test(path)){
  const groupId=path.split('/')[3]
  if(request.method==='GET'&&request.nextUrl.searchParams.has('servers'))return json({servers:[{id:'123456789012345678',name:'NBA Lounge'},{id:'123456789012345687',name:'My NFL server'}]})
  if(request.method==='GET'&&request.nextUrl.searchParams.has('guildId'))return json({guildId:request.nextUrl.searchParams.get('guildId'),guildName:'NBA Lounge',canCreateRoles:true,roles:[{id:'123456789012345679',name:'Court members'},{id:'123456789012345680',name:'Research'}]})
  if(request.method==='GET'){const integrations=table('creator_discord_integrations').filter(row=>row.group_id===groupId&&row.enabled),group=table('groups').find(row=>row.id===groupId),product=table('creator_products').find(row=>row.id===group?.creator_product_id);return json({configured:true,connected:true,installUrl:null,integrations,integration:integrations[0]||null,access:{name:group?.name||'Private review community',slug:group?.slug||'nba-lounge',type:group?.access_type||'free',product:product?{title:product.title,status:product.status}:null}})}
  if(request.method==='POST'){const body=await request.json();table('creator_discord_integrations').filter(row=>row.group_id===groupId).forEach(row=>row.enabled=false);for(const id of body.roleIds||[])table('creator_discord_integrations').push({id:crypto.randomUUID(),group_id:groupId,guild_id:body.guildId,guild_name:'NBA Lounge',role_id:id,role_name:id==='123456789012345679'?'Court members':id==='123456789012345680'?'Research':'New role',invite_url:body.inviteUrl||null,enabled:true});return json({ok:true})}
  if(request.method==='DELETE'){table('creator_discord_integrations').filter(row=>row.group_id===groupId).forEach(row=>row.enabled=false);return json({ok:true})}
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
