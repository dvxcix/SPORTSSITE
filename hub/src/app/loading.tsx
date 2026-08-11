import { PageState } from '@/components/layout/PageState'

export default function Loading() {
  return (
    <PageState
      kind="loading"
      title="Loading SlipSurge"
      message="Preparing the latest data, research, and community activity."
    />
  )
}
