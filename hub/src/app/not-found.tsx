import { PageState } from '@/components/layout/PageState'

export default function NotFound() {
  return <PageState title="Page not found" message="The page may have moved or is no longer available." actionLabel="Return home" actionHref="/" />
}
