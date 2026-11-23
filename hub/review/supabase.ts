import {authUser,reviewProfile,reviewRole,table,tables,persistReviewTables,type ReviewRole} from './database'
import {seedReviewSports} from './seed-sports'
seedReviewSports()
/* Query-compatible in-memory adapter. No URL, API key or network client exists. */
class Query {
 filters:Array<(row:any)=>boolean>=[];filterArgs:Array<[string,unknown]>=[];one=false;limitBy=100;offset=0;operation='read';payload:any;sorts:Array<[string,boolean]>=[]
 constructor(public name:string,public role:ReviewRole='member',private rolePromise?:Promise<ReviewRole>,private service=false){}
 select(_columns?:string,options?:any){if(options?.head)this.limitBy=0;return this}
 eq(k:string,v:any){if(k.includes('.'))return this;this.filters.push(row=>row[k]===v);this.filterArgs.push([k,v]);return this}
 neq(k:string,v:any){this.filters.push(row=>row[k]!==v);return this}
 in(k:string,values:any[]){this.filters.push(row=>values.includes(row[k]));return this}
 is(k:string,v:any){this.filters.push(row=>(row[k]??null)===v);return this}
 not(_k:string,_op:string,_v:any){return this}
 or(filter:string){const cursor=filter.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.[^,]+,id\.lt\.([0-9a-f-]+)\)$/i);if(cursor)this.filters.push(row=>row.created_at<cursor[1]||row.created_at===cursor[1]&&row.id<cursor[2]);return this}
 match(value:any){for(const [k,v]of Object.entries(value))this.eq(k,v);return this}
 filter(k:string,op:string,v:any){return op==='eq'?this.eq(k,v):this}
 gt(k:string,v:any){this.filters.push(row=>row[k]>v);return this}
 gte(k:string,v:any){this.filters.push(row=>row[k]>=v);return this}
 lt(k:string,v:any){this.filters.push(row=>row[k]<v);return this}
 lte(k:string,v:any){this.filters.push(row=>row[k]<=v);return this}
 ilike(k:string,v:string){this.filters.push(row=>String(row[k]??'').toLowerCase().includes(v.replaceAll('%','').toLowerCase()));return this}
 like(k:string,v:string){return this.ilike(k,v)}
 contains(_k:string,_v:any){return this}
 overlaps(_k:string,_v:any){return this}
 order(k:string,options?:{ascending?:boolean}){this.sorts.push([k,options?.ascending!==false]);return this}
 limit(n:number){this.limitBy=n;return this}
 range(a:number,b:number){this.offset=a;this.limitBy=b-a+1;return this}
 single(){this.one=true;return this}
 maybeSingle(){this.one=true;return this}
 abortSignal(_signal:any){return this}
 throwOnError(){return this}
 csv(){return this}
 count(){return this}
 insert(value:any){this.operation='insert';this.payload=value;return this}
 upsert(value:any,_options?:any){this.operation='upsert';this.payload=value;return this}
 update(value:any){this.operation='update';this.payload=value;return this}
 delete(){this.operation='delete';return this}
 async result(){
  if(this.rolePromise)this.role=await this.rolePromise
  let all=table(this.name)
  if(this.name==='creator_applications'&&!this.service&&this.role!=='creator')all=[]
  if(this.name==='users')all=all.map(row=>row.id===authUser(this.role)?.id?{...row,...reviewProfile(this.role)}:row)
  const viewer=authUser(this.role)?.id
  const canView=(group:any)=>group&&(group.owner_id===viewer||(group.access_type||'free')==='free'&&(group.is_public||table('group_members').some(member=>member.group_id===group.id&&member.user_id===viewer))||group.access_type==='paid'&&table('creator_entitlements').some(member=>member.product_id===group.creator_product_id&&member.user_id===viewer&&['active','trialing'].includes(member.status)&&(!member.current_period_end||Date.parse(member.current_period_end)>Date.now())))
  if(!this.service&&this.name==='groups')all=all.filter(canView)
  if(!this.service&&['posts','channels','group_members'].includes(this.name))all=all.filter(row=>!row.group_id||canView(table('groups').find(group=>group.id===row.group_id)))
  if(this.name==='group_members')all=all.map(row=>({...row,group:table('groups').find(group=>group.id===row.group_id),user:table('users').find(profile=>profile.id===row.user_id)}))
  if(this.name==='creator_products')all=all.map(row=>({...row,creator:row.creator_id===viewer?reviewProfile(this.role):table('users').find(profile=>profile.id===row.creator_id)}))
  if(this.name==='creator_storefronts')all=all.filter(row=>this.service||row.status==='published'||row.creator_id===viewer).map(row=>({...row,creator:table('users').find(profile=>profile.id===row.creator_id)}))
  if(this.name==='creator_entitlements')all=all.map(row=>({...row,product:table('creator_products').find(product=>product.id===row.product_id),member:table('users').find(profile=>profile.id===row.user_id)}))
  if(this.name==='posts')all=all.map(row=>({...row,author:row.author||table('users').find(profile=>profile.id===row.author_id)}))
  if(this.name==='messages')all=all.map(row=>({...row,sender:row.sender||table('users').find(profile=>profile.id===row.sender_id)}))
  if(typeof document!=='undefined'&&this.operation!=='read'&&['posts','messages','comments','group_member_preferences','group_channel_preferences'].includes(this.name)){
   const response=await fetch('/api/review/mutation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:this.name,operation:this.operation,payload:this.payload,filters:this.filterArgs})})
   const body=await response.json()
   if(!response.ok)return {data:null,error:{message:body.error||'Local fixture action failed'}}
   if(this.operation==='insert'||this.operation==='upsert')this.payload=body.rows
  }
  let rows=all.filter(row=>this.filters.every(test=>test(row)))
  if(this.operation==='insert'||this.operation==='upsert'){rows=(Array.isArray(this.payload)?this.payload:[this.payload]).map((r:any,i:number)=>({id:r.id??'00000000-0000-4000-8000-'+String(Date.now()+i).slice(-12),created_at:new Date().toISOString(),...r}));table(this.name).push(...rows)}
  if(this.operation==='update')rows.forEach(row=>Object.assign(row,this.payload))
  if(this.operation==='delete'){
   const removed=new Set(rows.map(row=>row.id))
   if(this.name==='comments'){let changed=true;while(changed){changed=false;for(const row of all)if(removed.has(row.parent_id)&&!removed.has(row.id)){removed.add(row.id);changed=true}}}
   tables[this.name]=all.filter(row=>!removed.has(row.id))
  }
  if(this.name==='comments'){
   for(const row of rows){row.author??=table('users').find(user=>user.id===row.author_id);row.updated_at??=row.created_at;row.parent_id??=null}
   if(this.operation!=='read')for(const post of table('posts'))post.comment_count=table('comments').filter(row=>row.post_id===post.id).length
  }
  if(this.operation!=='read')persistReviewTables()
  rows.sort((a,b)=>{for(const [key,asc]of this.sorts){const difference=String(a[key]??'').localeCompare(String(b[key]??''))*(asc?1:-1);if(difference)return difference}return 0})
  const count=rows.length;rows=rows.slice(this.offset,this.offset+this.limitBy)
  return {data:this.one?rows[0]??null:rows,error:null,count,status:200,statusText:'OK'}
 }
 then(resolve:any,reject?:any){return this.result().then(resolve,reject)}
}
export function createClient(_url?:any,_key?:any,options?:any):any{
 const role=reviewRole(options?.cookies),user=authUser(role),session=user?{user,access_token:'design-review-not-a-credential',refresh_token:'design-review-not-a-credential',expires_in:3600,token_type:'bearer'}:null
 const ok=(data:any={})=>Promise.resolve({data,error:null})
 const client:any={
  from:(name:string)=>new Query(name,role,options?.rolePromise,options?.service===true),
  rpc:(name:string,params?:any)=>{
   if(name==='get_my_channel_permissions')return ok({view:true,send:true,moderate:role==='admin'||role==='creator'})
   if(name==='get_my_community_permissions')return ok({view:true,send:true,create_invites:true,manage_channels:role==='admin'||role==='creator'})
   if(name==='create_group_conversation'){
    const id=crypto.randomUUID(),at=new Date().toISOString()
    table('group_conversations').push({id,name:params.conversation_name,owner_id:user?.id,updated_at:at})
    table('group_conversation_members').push(...[user?.id,...params.invited_user_ids].map(idUser=>({conversation_id:id,user_id:idUser,role:idUser===user?.id?'owner':'member',muted:false,joined_at:at,user:table('users').find(u=>u.id===idUser)})))
    persistReviewTables();return ok(id)
   }
   if(name==='set_group_membership'){
    if(typeof document!=='undefined')return (async()=>{const response=await fetch('/api/review/membership',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});const body=await response.json();return response.ok?ok(body.member):{data:null,error:{message:body.error}}})()
    const rows=table('group_members'),index=rows.findIndex(row=>row.group_id===params.p_group_id&&row.user_id===user?.id)
    if(params.p_join&&index<0)rows.push({group_id:params.p_group_id,user_id:user?.id,role:'member',group:table('groups').find(g=>g.id===params.p_group_id)})
    if(!params.p_join&&index>=0)rows.splice(index,1)
    persistReviewTables();return ok(params.p_join)
   }
   if(name==='create_community_group'){
    if(typeof document!=='undefined'){
     return (async()=>{
     const response=await fetch('/api/review/community',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)})
     const data=await response.json()
     if(!response.ok)return {data:null,error:{message:data.error||'Fixture community could not be created'}}
     table('groups').push(data.group);table('channels').push(data.channel);table('group_members').push(data.member)
     persistReviewTables();return ok([data.result])
     })()
    }
    const id=crypto.randomUUID(),channelId=crypto.randomUUID(),channelSlug='group-'+params.p_slug
    table('groups').push({id,slug:params.p_slug,name:params.p_name,description:params.p_description,sport:params.p_sport,emoji:params.p_emoji,is_public:params.p_is_public,owner_id:user?.id,channel_id:channelId,access_type:'free',member_count:1})
    table('channels').push({id:channelId,slug:channelSlug,name:params.p_name,group_id:id,channel_type:'public',owner_id:user?.id,member_count:1})
    table('group_members').push({group_id:id,user_id:user?.id,role:'owner'})
    persistReviewTables();return ok([{group_id:id,group_slug:params.p_slug,channel_id:channelId,channel_slug:channelSlug}])
   }
   return name==='get_member_mastery'?ok({points:640,level:3,totals:{posts:12,picks:18,wins:11,replies:28,following:8,communities:3,notes:14},missions:[{key:'review-research',title:'Build your research routine',current:3,target:5,period:'daily',points:40},{key:'review-community',title:'Join the conversation',current:2,target:3,period:'weekly',points:60}],achievements:['first_signal','research_routine']}):new Query(name.includes('feed')?'posts':name.includes('notification')?'notifications':name.includes('group')?'groups':'__review_rpc',role)
  },
  auth:{
   getUser:()=>ok({user}),getSession:()=>ok({session}),getUserIdentities:()=>ok({identities:[]}),getClaims:()=>ok({claims:user?{sub:user.id,aal:'aal2'}:null}),refreshSession:()=>ok({session,user}),
   onAuthStateChange:(callback:any)=>{const id=setTimeout(()=>callback('INITIAL_SESSION',session),0);return {data:{subscription:{unsubscribe:()=>clearTimeout(id)}}}},
   signOut:()=>ok(),signInWithPassword:()=>ok({user,session}),signInWithOAuth:()=>ok({url:'/feed'}),signUp:()=>ok({user,session}),
   updateUser:()=>Promise.resolve({data:null,error:{message:'Account credentials are disabled in the private design review.'}}),resetPasswordForEmail:()=>ok(),
   mfa:{getAuthenticatorAssuranceLevel:()=>ok({currentLevel:'aal2',nextLevel:'aal2',currentAuthenticationMethods:[]}),listFactors:()=>ok({all:[],totp:[],phone:[]}),enroll:()=>ok({id:'review-factor',type:'totp',totp:{qr_code:'',secret:'EXAMPLE-NOT-A-SECRET',uri:''}}),unenroll:()=>ok(),challenge:()=>ok({id:'review-challenge'}),verify:()=>ok()},
   admin:{listUsers:()=>ok({users:table('users')}),getUserById:()=>ok({user}),deleteUser:()=>ok(),updateUserById:()=>ok({user})}
  },
  channel:()=>{const channel:any={on:()=>channel,subscribe:(fn?:any)=>{fn?.('SUBSCRIBED');return channel},unsubscribe:()=>Promise.resolve(),send:()=>Promise.resolve('ok'),track:()=>Promise.resolve('ok'),untrack:()=>Promise.resolve('ok'),presenceState:()=>({})};return channel},
  removeChannel:()=>Promise.resolve(),removeAllChannels:()=>Promise.resolve(),getChannels:()=>[],
  storage:{from:()=>({getPublicUrl:(p:string)=>({data:{publicUrl:p.startsWith('/')?p:'/review-assets/tatum.png'}}),createSignedUrl:()=>ok({signedUrl:'/review-assets/tatum.png'}),upload:()=>ok({path:'design-review-local'}),remove:()=>ok(),list:()=>ok([])})},
  functions:{invoke:()=>Promise.resolve({data:null,error:{message:'External functions are disabled in design review.'}})}
 }
 return client
}
export const createBrowserClient=createClient
export const createServerClient=createClient
export const createAdminClient=()=>createClient()
