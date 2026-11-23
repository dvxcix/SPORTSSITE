'use client'

import { useMemo, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from '@/app/creators/studio/CreatorStudio.module.css'

export function CreatorProfileEditor({ onSaved, onBusy }: { onSaved: () => void; onBusy: (busy: boolean) => void }) {
  const { profile, refreshProfile } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({display_name:profile?.display_name||'',bio:profile?.bio||'',avatar_url:profile?.avatar_url||'',banner_url:profile?.banner_url||''})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function working(value: boolean) { setBusy(value); onBusy(value) }
  async function upload(file: File, kind: 'avatar' | 'banner') {
    working(true); setError('')
    try { const result=await uploadMedia(file,kind+'s'); if('error' in result)throw new Error(result.error);setForm(current=>({...current,[kind+'_url']:result.publicUrl})) }
    catch(cause){setError(cause instanceof Error?cause.message:'Image upload failed. Please try again.')}
    finally{working(false)}
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if(busy||!profile?.id)return
    working(true);setError('')
    try {
      const {error:failure}=await supabase.from('users').update({display_name:form.display_name.trim()||null,bio:form.bio.trim()||null,avatar_url:form.avatar_url||null,banner_url:form.banner_url||null}).eq('id',profile.id)
      if(failure)throw new Error('Your storefront profile could not be saved. Please try again.')
      await refreshProfile();onSaved()
    }catch(cause){setError(cause instanceof Error?cause.message:'Your profile could not be saved.')}
    finally{working(false)}
  }
  return <form className={styles.builder} onSubmit={save}><fieldset className={styles.offerFields} disabled={busy||!profile}>
    <div className={styles.profileCover}><SafeImage src={form.banner_url} alt=""/><label className={styles.uploadCover}><Upload size={15}/>Change cover<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,'banner');event.target.value=''}}/></label></div>
    <div className={styles.profilePhoto}><div><SafeImage src={form.avatar_url} alt="Profile picture preview" fallback={(form.display_name||profile?.username||'?')[0]}/></div><label className={styles.secondaryButton}><Upload size={15}/>Change photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file,'avatar');event.target.value=''}}/></label></div>
    <label><span>Display name</span><input required maxLength={80} value={form.display_name} onChange={event=>setForm({...form,display_name:event.target.value})}/></label><label><span>About your work</span><textarea maxLength={500} value={form.bio} onChange={event=>setForm({...form,bio:event.target.value})} placeholder="Introduce yourself and what you share with your community."/></label><p className={styles.setupNote}>This is your public SlipSurge profile. Your avatar effects and account settings stay in your profile settings.</p>
    </fieldset>{error&&<p role="alert" className={styles.setupError}>{error}</p>}<button disabled={busy||!profile} className={styles.primaryButton}>{busy&&<Loader2 size={16} className="animate-spin"/>}{busy?'Saving…':'Save profile'}</button></form>
}
