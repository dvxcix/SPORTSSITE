import { redirect } from 'next/navigation'
/** Community and Groups share one membership destination. Existing links remain valid. */
export default function CommunityPage() { redirect('/groups') }
