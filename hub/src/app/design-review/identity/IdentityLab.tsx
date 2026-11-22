'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MemberAvatar, type MemberRingStyle } from '@/components/social/MemberAvatar'
import { UserBadges } from '@/components/social/UserBadges'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { MarketMovement, PickCount } from '@/components/research/ResearchMetrics'
import type { Badge } from '@/lib/badges'
import styles from './identity.module.css'

const art = '/design-review/identity/'
const badges: Badge[] = [
  { id:'review-ultimate', name:'Ultimate', icon_url:art+'ultimate.webp', description:'Original SlipSurge Ultimate artwork.' },
  { id:'review-beta', name:'Beta Tester', icon_url:art+'beta.webp', description:'Original SlipSurge Beta Tester artwork.' },
]
const rings: MemberRingStyle[] = ['none','solid','surge','pulse','orbit']

export function IdentityLab() {
  const [reducedMotion,setReducedMotion] = useState(false)
  return <div className={styles.page} data-motion={reducedMotion?'reduce':'normal'}>
    <header className={styles.header}><div><Link href="/design-review/visual-audit">← Review checklist</Link><h1>Avatars & badges</h1><p>Existing artwork, every ring style, both themes. These examples use local copies of the live artwork.</p></div><ThemeToggle/></header>
    <section className={styles.section}><h2>In context</h2><div className={styles.examples}>
      <div className={styles.member}><MemberAvatar src={art+'avatar.jpg'} name="ParlayParty" tone="ultimate" ringStyle="pulse" size={44} online/><div><div className={styles.name}><strong>ParlayParty</strong><UserBadges userId="identity-review" badges={badges} interactive/></div><small>NBA · Community</small></div></div>
      <div className={styles.member}><MemberAvatar name="New member" ringStyle="none" size={44}/><div><strong>New member</strong><small>Initials fallback</small></div></div>
    </div></section>
    <section className={styles.section}><h2>Ring styles</h2><p>Photos stay unchanged when the theme changes. Only their surrounding surfaces adapt.</p><label className={styles.motion}><input type="checkbox" checked={reducedMotion} onChange={event=>setReducedMotion(event.target.checked)}/>Preview reduced motion</label><div className={styles.rings}>{rings.map(ring=><div key={ring}><span>{ring}</span><div>{[32,44,72,112].map(size=><MemberAvatar key={size} src={art+'avatar.jpg'} name={`${ring} ${size}`} tone="ultimate" ringStyle={ring} size={size}/>)}</div></div>)}</div></section>
    <section className={styles.section}><h2>Tiers & custom colours</h2><div className={styles.tones}>{(['default','creator','advanced','ultimate'] as const).map(tone=><div key={tone}><MemberAvatar src={art+'avatar.jpg'} name={tone} tone={tone} ringStyle="surge" size={56}/><span>{tone}</span></div>)}<div><MemberAvatar name="Custom ring" ringColor="#be65e9" ringStyle="orbit" size={56}/><span>Custom colour</span></div></div><div className={styles.chips}>{['ultimate','beta','advanced','basic','creator'].map(tone=><span key={tone} className={`ss-member-chip is-${tone}`}>{tone}</span>)}</div></section>
    <section className={styles.section}><h2>Badge artwork</h2><p>Tap the badge group to read every description and see the original artwork.</p><div className={styles.badges}>{[14,16,18,20].map(size=><div key={size}><small>{size}px custom artwork</small><UserBadges userId="identity-review" size={size} badges={badges} interactive/></div>)}</div></section>
    <section className={styles.section}><h2>Unavailable images</h2><div className={styles.examples}><div className={styles.member}><MemberAvatar src="/design-review/identity/missing-avatar.jpg" name="Jordan Lee" ringStyle="solid" size={44}/><span>Photo fallback</span></div><UserBadges userId="identity-review" size={20} badges={[{id:'missing',name:'Unavailable badge',icon_url:'/design-review/identity/missing-badge.webp',description:'Fallback remains labelled when artwork cannot load.'}]}/></div></section>
    <section className={styles.section}><h2>Market symbols</h2><div className={styles.symbols}><PickCount value={71} observed/><PickCount value={3} estimated/><PickCount value={0}/><PickCount value={null}/><MarketMovement value={2.4}/><MarketMovement value={-0.3}/><MarketMovement value={0}/><MarketMovement value={null}/></div></section>
  </div>
}
