import Link from 'next/link'
import { ChevronRight, Users } from 'lucide-react'
import { MemberAvatar, type MemberRingStyle } from '@/components/social/MemberAvatar'

type GroupPreview = {
  id: string
  name: string
  updatedAt: string
  lastMessage: string
  unreadCount: number
  members: Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null; avatarRingStyle: MemberRingStyle | null; avatarRingColor: string | null }>
}

export function GroupConversationInbox({ conversations }: { conversations: GroupPreview[] }) {
  return <div className="ss-group-inbox">{conversations.map(conversation => <Link key={conversation.id} href={`/messages/group/${conversation.id}`} className="ss-conversation-row ss-group-conversation-row"><span className="ss-group-inbox-avatars">{conversation.members.slice(0, 3).map(member => <MemberAvatar key={member.id} src={member.avatarUrl} name={member.displayName || member.username} size={34} ringStyle={member.avatarRingStyle} ringColor={member.avatarRingColor}/>)}</span><span className="ss-conversation-copy"><div><strong>{conversation.name}</strong><span><Users size={10}/> {conversation.members.length}</span></div><p>{conversation.lastMessage || 'Start the conversation'}</p></span><span className="ss-conversation-meta"><span>{new Date(conversation.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>{conversation.unreadCount > 0 ? <i>{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</i> : <ChevronRight size={14}/>}</span></Link>)}</div>
}
