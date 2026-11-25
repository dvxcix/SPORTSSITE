import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Plus, ShieldCheck } from 'lucide-react'
import { authVisibilityUnavailable } from '@/lib/blocks'
import { MessageInbox } from '@/components/social/MessageInbox'
import { CommunityNav, CommunityMore } from '@/components/community/CommunityNav'
import { ProductAction, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import { GroupConversationInbox } from '@/components/chat/GroupConversationInbox'
import { loadMessageInbox } from '@/lib/messageInboxServer'
import styles from './messages.module.css'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) throw new Error('Messages are temporarily unavailable')
  if (!user) redirect('/auth/login?next=/messages')

  const { conversations, groupConversations } = await loadMessageInbox(supabase, user.id)

  return (
    <ProductPageShell narrow className={`ss-messages-page ${styles.page}`}>
      <CommunityNav />
      <header className="ss-community-heading"><h1>Messages</h1><div><ProductAction href="/messages/new"><Plus size={15}/> New message</ProductAction><CommunityMore /></div></header>

      {groupConversations.length > 0 && <><ProductSectionHeader title="Group conversations" meta={`${groupConversations.length} group${groupConversations.length === 1 ? '' : 's'}`}/><ProductPanel className="ss-messages-inbox-shell"><GroupConversationInbox conversations={groupConversations}/></ProductPanel></>}

      <ProductSectionHeader title="Inbox" meta={`${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`}/>
      <ProductPanel className="ss-messages-inbox-shell">
        <div className="ss-messages-section-heading"><span><ShieldCheck size={12} /> Private</span></div>
        <MessageInbox conversations={conversations} currentUserId={user.id} />
      </ProductPanel>
    </ProductPageShell>
  )
}
