'use client'
import { useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Loader2, ShieldCheck, Upload, X } from 'lucide-react'
import { CreatorDialog } from './CreatorDialog'
import { SafeImage } from '@/components/ui/SafeImage'
import { sportLogoUrl } from '@/lib/sportLogos'
import { uploadMedia } from '@/lib/uploadMedia'
import { CREATOR_SPORTS, CREATOR_TAGS, type CreatorStore, type CreatorStoreDraft } from '@/lib/creatorStorefront'
import type { CreatorPaymentState } from '@/lib/creatorCommerce'
import styles from './creatorStoreSetup.module.css'

const Verification = dynamic(() => import('./CreatorWalletEmbed').then(module => module.CreatorWalletEmbed), { ssr: false, loading: () => <p role="status">Loading secure verification…</p> })
type Product = { id:string; title:string; description?:string|null; price:number; product_type:string; billing_period_days?:number|null; whop_plan_id?:string|null;status?:string }
export function CreatorStoreSetup({ store, profile, products, mlbAccess, testAccount, onClose, onSaved }: { store:CreatorStore|null; profile:{username:string;display_name?:string|null;bio?:string|null;avatar_url?:string|null;banner_url?:string|null}; products:Product[]; mlbAccess:boolean; testAccount:boolean; onClose:()=>void; onSaved:(store:CreatorStore)=>void }) {
 const [form,setForm]=useState<CreatorStoreDraft>({name:store?.name||profile.display_name||profile.username,bio:store?.bio||profile.bio||'',logo_url:store?.logo_url||profile.avatar_url||null,cover_url:store?.cover_url||profile.banner_url||null,sports:store?.sports||[],tags:store?.tags||[],access_mode:store?.access_mode||'free',setup_step:store?.status==='published'&&!store.has_draft?0:store?.setup_step||0,product_id:store?.product_id||null})
 const [current,setCurrent]=useState(store),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tag,setTag]=useState(''),[verification,setVerification]=useState(false),[payment,setPayment]=useState<CreatorPaymentState|null>(null)
 const [offer,setOffer]=useState({price:'24',billingDays:30,productType:'membership'})
 const requestId=useRef<string|null>(null),heading=useRef<HTMLHeadingElement>(null)
 const step=form.setup_step,steps=form.access_mode==='paid'?[0,1,2,3,4]:[0,1,2,4]
 const titles=['Make it yours','Find your people','Choose your membership','Connect payments','Ready for your members?']
 async function persist(next:CreatorStoreDraft,action='save') {
  const response=await fetch('/api/creator/storefront',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...next,action}),signal:AbortSignal.timeout(35000)})
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Your store could not be saved.')
  setCurrent(data.store);onSaved(data.store);return data.store as CreatorStore
 }
 async function saveExit(){if(busy)return;setBusy(true);setError('');try{await persist(form);onClose()}catch(cause){setError(cause instanceof Error?cause.message:'Please try again.')}finally{setBusy(false)}}
 async function upload(file:File,kind:'logo'|'cover'){
  setBusy(true);setError('');try{const result=await uploadMedia(file,kind==='logo'?'avatars':'banners');if('error'in result)throw new Error(result.error);setForm(value=>({...value,[kind==='logo'?'logo_url':'cover_url']:result.publicUrl}))}catch(cause){setError(cause instanceof Error?cause.message:'Upload failed.')}finally{setBusy(false)}
 }
 async function checkPayments(){const response=await fetch('/api/creator/status',{cache:'no-store',signal:AbortSignal.timeout(35000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Your payment account could not be checked.');setPayment(data);return data as CreatorPaymentState}
 async function connect(){setBusy(true);setError('');try{const response=await fetch('/api/creator/whop-onboard?embedded=1',{method:'POST',signal:AbortSignal.timeout(55000)}),data=await response.json();if(!response.ok)throw new Error(data.error||'Payment setup could not be opened.');setPayment(data.state);setVerification(!data.state?.canCharge)}catch(cause){setError(cause instanceof Error?cause.message:'Try again.')}finally{setBusy(false)}}
 async function createCommunity(){const response=await fetch('/api/creator/storefront/community',{method:'POST',signal:AbortSignal.timeout(35000)}),data=await response.json();if(!response.ok)throw new Error(data.error||'Your community could not be created.');return data.group}
 async function advance(){
  if(busy)return
  if(step===0&&(form.name.trim().length<2||form.bio.trim().length<10)){setError('Add a store name and an introduction of at least 10 characters.');return}
  if(step===1&&!form.sports.length){setError('Choose at least one sport so members can find you.');return}
  if(step===2&&form.access_mode==='paid'&&!form.product_id&&(!Number.isFinite(Number(offer.price))||Number(offer.price)<1||Number(offer.price)>10000)){setError('Enter a membership price from $1 to $10,000.');return}
  setBusy(true);setError('')
  try{
   if(step===4){await persist(form,'publish');onClose();return}
   let next={...form,setup_step:step===2&&form.access_mode==='free'?4:step+1}
   if(step===2&&form.access_mode==='free'){await persist(form);const group=await createCommunity();setCurrent(value=>value?{...value,community_id:group.id}:value)}
   if(step===3){
    const readiness=await checkPayments();if(!readiness.canCharge)throw new Error('Complete verification before creating a paid membership. Your store draft is saved.')
    const selected=products.find(product=>product.id===form.product_id)
    if(!selected?.whop_plan_id){
     const price=selected?Number(selected.price):Number(offer.price)
     if(!Number.isFinite(price)||price<1||price>10000)throw new Error('Enter a price from $1 to $10,000.')
     requestId.current||=form.product_id||crypto.randomUUID()
     const response=await fetch('/api/creator/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current,title:selected?.title||form.name+' membership',description:selected?.description||form.bio,price,productType:selected?.product_type||offer.productType,billingDays:selected?.billing_period_days||offer.billingDays}),signal:AbortSignal.timeout(55000)}),data=await response.json()
     if(!response.ok){
      // A provider timeout may have left an owned draft. Link it for refresh/
      // reload recovery; the server rejects the ID if no draft was created.
      try{const recover={...next,setup_step:3,product_id:requestId.current};await persist(recover);setForm(recover)}catch{}
      throw new Error(data.error||'Your membership could not be saved. Retry to resume it.')
     }
     next={...next,product_id:data.id}
    }
    await persist(next);await createCommunity()
   }
   await persist(next);setForm(next);requestAnimationFrame(()=>{heading.current?.focus({preventScroll:true});heading.current?.closest('[data-creator-dialog-body]')?.scrollTo({top:0})})
  }catch(cause){setError(cause instanceof Error?cause.message:'Please try again.')}finally{setBusy(false)}
 }
 function addTag(value:string){const clean=value.trim();if(clean&&clean.length<=30&&form.tags.length<8&&!form.tags.includes(clean))setForm({...form,tags:[...form.tags,clean]});setTag('')}
 return <CreatorDialog title={store?.status==='published'?'Edit your store':'Create your store'} description={'Step '+(steps.indexOf(step)+1)+' of '+steps.length+' · Progress saves as you continue.'} onClose={()=>void saveExit()} busy={busy}>
  <div className={styles.wizard}>
   <div className={styles.main}>
    <ol className={styles.progress} aria-label="Store setup">{steps.map((item,index)=><li key={item} data-active={item===step} data-complete={item<step}><button aria-label={'Step '+(index+1)+': '+['Identity','Sports & tags','Membership','Payments','Preview'][item]} aria-current={item===step?'step':undefined} disabled={item>step||busy} onClick={()=>setForm({...form,setup_step:item})}>{item<step?<Check size={12}/>:index+1}</button></li>)}</ol>
    <div key={step} className={styles.step}><h2 ref={heading} tabIndex={-1}>{titles[step]}</h2>
     <fieldset disabled={busy}>
      {step===0&&<><p>A name, a face and a reason to join.</p><div className={styles.branding}><label className={styles.cover}>{form.cover_url?<SafeImage src={form.cover_url} alt="Store cover preview"/>:<span><ImagePlus size={20}/>Add a cover</span>}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,'cover');event.target.value=''}}/></label><label className={styles.logo}>{form.logo_url?<SafeImage src={form.logo_url} alt="Store logo preview"/>:<Upload size={21}/>}<input type="file" aria-label="Upload store logo" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,'logo');event.target.value=''}}/></label></div><label>Store name<input maxLength={80} value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Your research club"/></label><label>About your store<textarea rows={4} maxLength={1000} value={form.bio} onChange={event=>setForm({...form,bio:event.target.value})} placeholder="What do you cover? What can members expect?"/></label><small>Your store branding is separate from your personal profile.</small></>}
      {step===1&&<><p>Show members what you cover and how you work.</p><span className={styles.fieldLabel}>Sports you cover</span><div className={styles.sports}>{CREATOR_SPORTS.filter(sport=>mlbAccess||sport!=='MLB').map(sport=><button type="button" key={sport} aria-pressed={form.sports.includes(sport)} onClick={()=>setForm({...form,sports:form.sports.includes(sport)?form.sports.filter(item=>item!==sport):[...form.sports,sport]})}>{sportLogoUrl(sport)&&<SafeImage src={sportLogoUrl(sport)} alt=""/>}{sport}{form.sports.includes(sport)&&<Check size={13}/>}</button>)}</div><span className={styles.fieldLabel}>Your specialties <small>{form.tags.length}/8</small></span><div className={styles.tags}>{form.tags.map(value=><button type="button" key={value} aria-label={'Remove '+value} onClick={()=>setForm({...form,tags:form.tags.filter(item=>item!==value)})}>{value}<X size={12}/></button>)}</div><label className={styles.tagInput}><input aria-label="Add a specialty tag" placeholder="Add your own tag" maxLength={30} value={tag} onChange={event=>setTag(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addTag(tag)}}}/><button type="button" disabled={!tag.trim()||form.tags.length>=8} onClick={()=>addTag(tag)}>Add</button></label><div className={styles.suggestions}>{CREATOR_TAGS.filter(value=>!form.tags.includes(value)).map(value=><button key={value} type="button" disabled={form.tags.length>=8} onClick={()=>addTag(value)}>+ {value}</button>)}</div></>}
      {step===2&&<><p>Start free, or build a paid membership around your work.</p><div className={styles.choices}>{(['free','paid'] as const).map(mode=><button type="button" key={mode} aria-pressed={form.access_mode===mode} disabled={!!current?.community_id&&mode!==form.access_mode} onClick={()=>setForm({...form,access_mode:mode,product_id:mode===form.access_mode?form.product_id:null})}><span><strong>{mode==='free'?'Free community':'Paid membership'}</strong><small>{mode==='free'?'Research, picks and conversations. No payment setup required.':'Your price, member access and earnings, powered by your Whop subaccount.'}</small></span><i>{form.access_mode===mode&&<Check size={13}/>}</i></button>)}</div>{current?.community_id&&<small>Access is already configured. Manage changes in community settings.</small>}{form.access_mode==='paid'&&<><label>Membership<select value={form.product_id||''} onChange={event=>setForm({...form,product_id:event.target.value||null})}><option value="">Create a new membership</option>{products.filter(product=>product.status!=='archived').map(product=><option key={product.id} value={product.id}>{product.title}</option>)}</select></label>{!form.product_id&&<div className={styles.pricing}><label>Price · USD<input type="number" inputMode="decimal" min="1" max="10000" step="0.01" value={offer.price} onChange={event=>setOffer({...offer,price:event.target.value})}/></label><label>Access period<select value={offer.billingDays} onChange={event=>setOffer({...offer,billingDays:Number(event.target.value)})}>{[7,30,90,365].map(days=><option key={days} value={days}>{days} days</option>)}</select></label></div>}<small>Your existing Whop fees apply. No extra SlipSurge application fee.</small></>}</>}
      {step===3&&<><p>Your payments account lives under SlipSurge’s Whop platform. Verify your details here, then finish your membership.</p><div className={styles.paymentState}><ShieldCheck size={22}/><div><strong>{payment?.canCharge?'Payments are ready':'Secure creator verification'}</strong><small>{payment?.canCharge?'Your account can accept member payments.':'Whop verifies your identity and handles payments and payouts.'}</small></div></div>{!verification&&!payment?.canCharge&&<button type="button" className={styles.primary} onClick={()=>void connect()} disabled={testAccount}>Set up my payment account <ArrowRight size={14}/></button>}{verification&&<Verification intent="verification" currency="usd" onChanged={()=>void checkPayments().catch(()=>setError('Payment status could not be checked. Try again.'))} onVerify={()=>{}}/>}<button className={styles.textButton} type="button" onClick={()=>void checkPayments().catch(cause=>setError(cause.message))}>Check verification status</button>{testAccount&&<small>Financial actions are disabled for this test account.</small>}</>}
      {step===4&&<><p>Check your store before members see it.</p><div className={styles.review}><div><span>Community access</span><strong>{form.access_mode==='free'?'Free to join':'Paid membership'}</strong></div><div><span>Sports</span><strong>{form.sports.join(', ')}</strong></div><div><span>Discovery</span><strong>Creator marketplace</strong></div></div><p className={styles.note}>Publishing adds your store to discovery. SlipSurge can feature selected stores. Private research stays inside the membership’s community.</p></>}
     </fieldset>
    </div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <footer className={styles.footer}><div>{step>0&&<button type="button" className={styles.secondary} disabled={busy} onClick={()=>setForm({...form,setup_step:steps[Math.max(0,steps.indexOf(step)-1)]})}><ArrowLeft size={14}/>Back</button>}<button type="button" className={styles.textButton} disabled={busy} onClick={()=>void saveExit()}>Save & exit</button></div><button type="button" className={styles.primary} disabled={busy||step===3&&testAccount} onClick={()=>void advance()}>{busy?<Loader2 size={15} className="animate-spin"/>:null}{step===4?'Publish store':'Continue'}{!busy&&<ArrowRight size={14}/>}</button></footer>
   </div>
   <aside className={styles.preview} data-review={step===4}><span className={styles.previewLabel}>Member preview</span><div className={styles.previewCard}><div className={styles.previewCover}>{form.cover_url&&<SafeImage src={form.cover_url} alt=""/>}</div><div className={styles.previewBody}><div className={styles.previewLogo}><SafeImage src={form.logo_url} alt="" fallback={(form.name||'?')[0]}/></div><h3>{form.name||'Your store'}</h3><small>@{profile.username}</small><div className={styles.previewSports}>{form.sports.map(sport=><span key={sport}>{sportLogoUrl(sport)&&<SafeImage src={sportLogoUrl(sport)} alt=""/>}{sport}</span>)}</div><p>{form.bio||'Your research, picks and community.'}</p><div className={styles.previewTags}>{form.tags.map(value=><span key={value}>{value}</span>)}</div><div className={styles.previewAccess}><strong>{form.access_mode==='free'?'Free to join':form.product_id?products.find(product=>product.id===form.product_id)?.title||'Membership':'$'+(Number(offer.price)||0).toFixed(2)}</strong><span>{form.access_mode==='free'?'Research · Picks · Community':form.product_id?'Member access':'every '+offer.billingDays+' days'}</span></div><span className={styles.previewJoin}>{form.access_mode==='free'?'Join community':'Join membership'}<ArrowUpRightIcon/></span></div></div></aside>
  </div>
 </CreatorDialog>
}
function ArrowUpRightIcon(){return <ArrowRight size={14} aria-hidden="true"/>}
