'use client'

import { useState } from 'react'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { AvatarStylePicker } from '@/components/settings/AvatarStylePicker'
import { AVATAR_DECORATIONS, avatarStyleName, type MemberRingStyle } from '@/lib/avatarStyles'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import styles from './decorations.module.css'

export function DecorationsLab() {
  const [value, setValue] = useState<MemberRingStyle>('deco:bb-swish')
  const [still, setStill] = useState(false)
  const photo = '/design-review/identity/avatar.jpg'
  return <div className={styles.page}>
    <header><div><a href="/design-review/visual-audit">Review checklist</a><h1>Avatar decorations</h1><p>50 originals · profile, feed and chat sizes · isolated preview</p></div><ThemeToggle /></header>
    <section className={styles.preview}>
      <MemberAvatar src={photo} name="ParlayParty" size={112} ringStyle={value} tone="ultimate" still={still} />
      <div><h2>{avatarStyleName(value)}</h2><p>Your photo and layout stay the same.</p><AvatarStylePicker src={photo} name="ParlayParty" value={value} onChange={setValue} /></div>
      <label><input type="checkbox" checked={still} onChange={event => setStill(event.target.checked)} />Still preview</label>
    </section>
    <section className={styles.context} aria-label="Member contexts">
      {[{label:'Feed',size:44},{label:'Chat',size:32},{label:'Account',size:26}].map(item => <div key={item.label}><MemberAvatar src={photo} name="ParlayParty" ringStyle={value} size={item.size} still={still} online /><div><strong>ParlayParty</strong><small>{item.label} · Ultimate · Beta tester</small></div></div>)}
      <div><MemberAvatar name="New member" ringStyle={value} size={44} still={still} /><div><strong>New member</strong><small>Initials fallback</small></div></div>
    </section>
    <div className={styles.gallery}>{AVATAR_DECORATIONS.map(item => <article key={item.id} data-decoration-id={item.id}>
      <div className={styles.sizes}>{[112,44,32].map(size => <MemberAvatar key={size} src={photo} name={item.name} ringStyle={`deco:${item.id}`} size={size} still={still} />)}</div>
      <button type="button" onClick={() => setValue(`deco:${item.id}`)}>{item.name}</button><small>{item.sport} · 112 / 44 / 32</small>
    </article>)}</div>
  </div>
}
