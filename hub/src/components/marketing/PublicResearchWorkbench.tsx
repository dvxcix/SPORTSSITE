import { getPublicResearchPreview } from '@/lib/publicResearchPreviewData'
import { ResearchShowcase } from './ResearchShowcase'
import styles from './PublicResearchWorkbench.module.css'

export async function PublicResearchWorkbench() {
  const [nba, nfl] = await Promise.all([getPublicResearchPreview('nba'), getPublicResearchPreview('nfl')])
  return <ResearchShowcase previews={{ nba, nfl }} />
}

export function PublicResearchWorkbenchLoading() {
  return <div className={styles.loading} role="status" aria-label="Loading NBA and NFL research previews">
    <div className={styles.toolbar}><strong>The Court <span>·</span> The Sideline</strong><span>Loading saved sportsbook prices…</span></div>
    <div className={styles.rows} aria-hidden="true">{[0,1,2].map(row=><div key={row}><i/><span/><b/><b/><b/></div>)}</div>
  </div>
}
