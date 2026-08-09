'use client'

import { CometCard } from '@/components/ui/comet-card'

export interface AchievementCard {
  id: string
  name: string
  description: string
  icon_url: string
  card_image_url: string | null
}

export function AchievementsSection({ achievements }: { achievements: AchievementCard[] }) {
  if (achievements.length === 0) return null

  return (
    <section className="ss-profile-achievements">
      <div className="ss-profile-achievements-heading">
        <div>
          <p>COLLECTION</p>
          <h2>Badges and achievements</h2>
        </div>
        <span>{achievements.length} earned</span>
      </div>
      <div className="ss-achievement-grid">
        {achievements.map(achievement => (
          <CometCard key={achievement.id} className="ss-achievement-comet">
            <article className={`ss-achievement-card${achievement.card_image_url ? ' has-art' : ''}`}>
              {achievement.card_image_url && (
                <img src={achievement.card_image_url} alt="" className="ss-achievement-card-art" />
              )}
              <div className="ss-achievement-card-content">
                <span className="ss-achievement-icon"><img src={achievement.icon_url} alt="" /></span>
                <div>
                  <h3>{achievement.name}</h3>
                  <p>{achievement.description}</p>
                </div>
              </div>
            </article>
          </CometCard>
        ))}
      </div>
    </section>
  )
}
