import { PageState } from '@/components/layout/PageState'

export default function NotFound() {
  return (
    <PageState
      title="That page is not here"
      message="The link may be outdated, or the page may have moved."
      actionLabel="Go to the Feed"
      actionHref="/feed"
    />
  )
}
