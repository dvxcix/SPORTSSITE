import {authUser,reviewProfile,reviewRole,table,tables,persistReviewTables,type ReviewRole} from './database'
import {seedReviewSports} from './seed-sports'
seedReviewSports()
/* Query-compatible in-memory adapter. No URL, API key or network client exists. */
class Query {
 filters:Array<(row:any)=>boolean>=[];one=false;limitBy=100;offset=0;operation='read';payload:any;sorts:Array<[string,boolean]>=[]
 constructor(public name:string,public role:ReviewRole='member',private rolePromise?:Promise<ReviewRole>){}
 select(_columns?:string,options?:any){if(options?.head)this.limitBy=0;return this}
 eq(k:string,v:any){this.filters.push(row=>row[k]===v);return this}
 neq(k:string,v:any){this.filters.push(row=>row[k]!==v);return this}
 in(k:string,values:any[]){this.filters.push(row=>values.includes(row[k]));return this}
 is(k:string,v:any){this.filters.push(row=>(row[k]??null)===v);return this}
 not(_k:string,_op:string,_v:any){return this}
 or(_filter:string){return this}
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
  if(this.name==='creator_applications'&&this.role!=='creator')all=[]
  if(this.name==='users')all=all.map(row=>row.id===authUser(this.role)?.id?{...row,...reviewProfile(this.role)}:row)
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
  for(const [key,asc]of this.sorts)rows.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''))*(asc?1:-1))
  const count=rows.length;rows=rows.slice(this.offset,this.offset+this.limitBy)
  return {data:this.one?rows[0]??null:rows,error:null,count,status:200,statusText:'OK'}
 }
 then(resolve:any,reject?:any){return this.result().then(resolve,reject)}
}
export function createClient(_url?:any,_key?:any,options?:any):any{
 const role=reviewRole(options?.cookies),user=authUser(role),session=user?{user,access_token:'design-review-not-a-credential',refresh_token:'design-review-not-a-credential',expires_in:3600,token_type:'bearer'}:null
 const ok=(data:any={})=>Promise.resolve({data,error:null})
 const client:any={
  from:(name:string)=>new Query(name,role,options?.rolePromise),
  rpc:(name:string,_params?:any)=>name==='get_member_mastery'?ok({points:640,level:3,totals:{posts:12,picks:18,wins:11,replies:28,following:8,communities:3,notes:14},missions:[{key:'review-research',title:'Build your research routine',current:3,target:5,period:'daily',points:40},{key:'review-community',title:'Join the conversation',current:2,target:3,period:'weekly',points:60}],achievements:['first_signal','research_routine']}):new Query(name.includes('feed')?'posts':name.includes('notification')?'notifications':name.includes('group')?'groups':'__review_rpc',role),
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
