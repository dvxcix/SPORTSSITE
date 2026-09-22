import { NflAccessBoundary } from './NflAccessBoundary'

export default function SidelineLayout({ children }: { children: React.ReactNode }) {
  return <NflAccessBoundary>{children}</NflAccessBoundary>
}
