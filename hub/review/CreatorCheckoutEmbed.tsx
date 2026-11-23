'use client'
import Link from 'next/link'
import {useTheme} from '../src/components/theme/ThemeProvider'
import styles from '../src/components/creator/creatorCheckout.module.css'
/** Private build alias. Never imports Whop or submits a real payment. */
export function CreatorCheckoutEmbed({productId}:{configurationId:string;productId:string;purchaseUrl:string}){
 const {theme}=useTheme()
 return <div className={styles.review}><h3>Secure checkout preview</h3><p>Illustrative local review · {theme} theme. No payment is collected.</p><label>Email<input type="email" placeholder="you@example.com"/></label><label>Card information<input placeholder="Review only — no card details" disabled/></label><Link className={styles.retry} href={'/creators/access/complete?product='+productId+'&status=canceled'}>Preview canceled return</Link></div>
}
