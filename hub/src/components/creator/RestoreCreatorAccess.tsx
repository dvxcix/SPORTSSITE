'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Link2, Loader2 } from 'lucide-react'

export function RestoreCreatorAccess({ productId, signedIn }: { productId: string; signedIn: boolean }) {
 const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[needsLink,setNeedsLink]=useState(false)
 const next=`/creators/offers/${productId}`
 async function restore(){setBusy(true);setMessage('');try{const response=await fetch(`/api/creator/products/${productId}/restore`,{method:'POST',signal:AbortSignal.timeout(55000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Access could not be checked.');setNeedsLink(data.state==='link_required');if(data.state==='active'){setMessage('Membership verified. Your access is ready.');router.push('/creators/access/complete?product='+productId)}else setMessage(data.state==='link_required'?'Connect the Whop account you used to subscribe, then check access again.':data.state==='support_required'?'Contact SlipSurge support to review your access.':data.state==='not_found'?'No active membership found for this product on your linked Whop account.':'This membership is not available right now.')}catch(cause){setMessage(cause instanceof Error?cause.message:'Try again.')}finally{setBusy(false)}}
 return <div className="mt-5 border-t border-[var(--border)] pt-4 text-sm"><p className="text-[var(--text-2)]">Already subscribed through Whop?</p>{signedIn?<button type="button" disabled={busy} onClick={restore} className="ss-touch-control mt-2 inline-flex items-center gap-2 text-[var(--accent)] disabled:opacity-50">{busy?<Loader2 size={15} className="animate-spin"/>:<Link2 size={15}/>}Check existing access</button>:<Link className="ss-touch-control mt-2 inline-flex items-center text-[var(--accent)]" href={`/auth/login?next=${encodeURIComponent(next)}`}>Sign in to link membership</Link>}{needsLink&&<Link className="ss-touch-control flex items-center text-[var(--accent)]" href={`/auth/whop/login?mode=link&next=${encodeURIComponent(next)}`}>Connect Whop account →</Link>}{message&&<p role="status" className="mt-2 text-sm leading-6 text-[var(--text-2)]">{message}</p>}</div>
}
