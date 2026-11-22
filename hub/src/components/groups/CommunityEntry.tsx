import Link from 'next/link'
import { LockKeyhole, Users } from 'lucide-react'
import { ProductHero, ProductPageShell, ProductPanel } from '@/components/product/ProductPage'
import { CommunityNav } from '@/components/community/CommunityNav'
import { GroupInviteResponse } from './GroupInviteResponse'
import type { CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'

export function CommunityEntry({entry,signedIn}:{entry:CommunityDirectoryEntry;signedIn:boolean}) {
 const paid=entry.access_type==='paid'
 return <ProductPageShell><CommunityNav/><Link href="/groups" className="mb-5 inline-flex min-h-11 items-center text-sm text-[var(--text-2)]">Back to communities</Link><ProductHero icon={<Users size={22}/>} title={entry.name} description={entry.description||'Community posts, picks and conversations.'}/><ProductPanel padded className="mt-6 grid gap-5"><div className="flex items-center gap-2 text-sm text-[var(--text-2)]"><LockKeyhole size={16}/>{paid?'Membership access':'Invitation only'}</div><div><h2 className="text-lg font-semibold text-[var(--text-1)]">{paid?'Join the member community':'Your invitation is ready'}</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-2)]">{paid?'Posts, picks and group chats open with a current membership. Review the offer before joining.':'Accept your invitation to see the posts, picks and group chats.'}</p></div>{paid&&entry.creator_product_id&&<Link href={`/creators/offers/${entry.creator_product_id}`} className="inline-flex min-h-11 w-fit items-center rounded-lg bg-[var(--accent-fill)] px-4 text-sm font-semibold text-[var(--accent-fg)]">View membership{entry.price!=null?` · $${entry.price.toFixed(2)}`:''}</Link>}{entry.invitationId&&signedIn&&<GroupInviteResponse inviteId={entry.invitationId}/>} {!signedIn&&<Link href={`/auth/login?next=${encodeURIComponent(`/groups/${entry.slug}`)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)]">Already a member? Sign in</Link>}</ProductPanel></ProductPageShell>
}
