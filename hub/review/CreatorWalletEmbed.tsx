'use client'
import { useState } from 'react'
import { useTheme } from '../src/components/theme/ThemeProvider'
import styles from '../src/components/creator/creatorWallet.module.css'
/** Local-only alias. No provider frames, tokens, bank details or money movement. */
export function CreatorWalletEmbed({intent,currency,onVerify}:{intent:'withdraw'|'verification';currency:string;onChanged:()=>void;onVerify:()=>void}){
 const {theme}=useTheme(),[review,setReview]=useState(false)
 return <div className={styles.embed}><p className={styles.notice}>Illustrative local review · {theme}. No financial action will be submitted.</p>{intent==='withdraw'?<><label className={styles.verificationKind}>Amount ({currency.toUpperCase()})<input aria-label="Illustrative withdrawal amount" type="number" defaultValue="100" style={{padding:12,width:140,border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text-1)'}}/></label><dl className={styles.details}><div><dt>Destination</dt><dd>Review bank •• 1234</dd></div><div><dt>Estimated fee</dt><dd>$0.50</dd></div><div><dt>Estimated arrival</dt><dd>2–3 business days</dd></div></dl><button className={styles.primary} style={{marginTop:24}} onClick={()=>setReview(true)}>Review transfer</button>{review&&<p role="status" className={styles.detailNote}>Preview complete. No withdrawal was created.</p>}<button className={styles.quiet} onClick={onVerify}>Preview verification</button></>:<><label className={styles.verificationKind}>Verify as<select><option>An individual</option><option>A registered business</option></select></label><div className={styles.embedState}>Identity and business verification form preview. No personal information is collected.</div></>}</div>
}
