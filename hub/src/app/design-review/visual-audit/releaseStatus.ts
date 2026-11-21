export type ReleaseRecord = { state: 'Live'; commit: string; deploymentId: string; verifiedAt: string; url: string }
export type ReleaseItem = { status: string; release?: ReleaseRecord | null }
export function releaseStatus(item: ReleaseItem) {
  if (item.status === 'In progress' || item.status === 'Queued') return item.status
  if (item.release?.state === 'Live') return 'Live'
  return item.status === 'Review ready' || item.status === 'Approved' ? 'Ready to deploy' : item.status
}
