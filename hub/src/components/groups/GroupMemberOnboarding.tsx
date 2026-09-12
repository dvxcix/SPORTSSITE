'use client'

import { useMemo, useState } from 'react'
import { BellRing, Check, ChevronLeft, ChevronRight, Hash, Loader2, Settings2, Sparkles } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import styles from './GroupMemberOnboarding.module.css'

export type GroupOnboardingChannel = {
  id: string
  name: string
  description?: string | null
  icon?: string | null
}

export type GroupOnboardingPreferences = {
  notificationLevel: 'all' | 'highlights' | 'mentions' | 'muted'
  flair: string
  channelIds: string[]
  completed: boolean
  rulesAccepted: boolean
}

const NOTIFICATION_OPTIONS = [
  { value: 'all', label: 'All activity', detail: 'Every new post and message' },
  { value: 'highlights', label: 'Highlights', detail: 'Important activity and live moments' },
  { value: 'mentions', label: 'Mentions only', detail: 'Direct mentions and replies' },
  { value: 'muted', label: 'Muted', detail: 'No community notifications' },
] as const

export function GroupMemberOnboarding({
  groupId,
  groupName,
  rules,
  channels,
  initialPreferences,
  autoOpen = false,
}: {
  groupId: string
  groupName: string
  rules?: string | null
  channels: GroupOnboardingChannel[]
  initialPreferences: GroupOnboardingPreferences
  autoOpen?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(autoOpen)
  const [step, setStep] = useState(0)
  const [rulesAccepted, setRulesAccepted] = useState(initialPreferences.rulesAccepted)
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    initialPreferences.channelIds.length > 0 ? initialPreferences.channelIds : channels.map(channel => channel.id),
  )
  const [notificationLevel, setNotificationLevel] = useState(initialPreferences.notificationLevel)
  const [flair, setFlair] = useState(initialPreferences.flair)
  const [completed, setCompleted] = useState(initialPreferences.completed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function close() {
    if (saving) return
    setOpen(false)
    setStep(0)
    setError('')
    if (autoOpen) router.replace(pathname, { scroll: false })
  }

  function toggleChannel(channelId: string) {
    setSelectedChannels(current => current.includes(channelId)
      ? current.filter(id => id !== channelId)
      : [...current, channelId])
  }

  async function save() {
    if (!rulesAccepted || saving) return
    setSaving(true)
    setError('')
    const { error: saveError } = await supabase.rpc('save_group_member_onboarding', {
      p_group_id: groupId,
      p_rules_accepted: rulesAccepted,
      p_notification_level: notificationLevel,
      p_flair: flair.trim() || null,
      p_channel_ids: selectedChannels,
    })
    if (saveError) {
      setError('Your community preferences could not be saved. Try again.')
      setSaving(false)
      return
    }
    setCompleted(true)
    setSaving(false)
    setOpen(false)
    setStep(0)
    if (autoOpen) router.replace(pathname, { scroll: false })
    router.refresh()
  }

  const stepTitle = step === 0 ? 'Community rules' : step === 1 ? 'Choose your channels' : 'Make it yours'

  return (
    <>
      <button
        type="button"
        className={completed ? styles.preferencesButton : styles.setupButton}
        onClick={() => setOpen(true)}
      >
        {completed ? <Settings2 size={14} /> : <Sparkles size={14} />}
        {completed ? 'Preferences' : 'Finish setup'}
      </button>

      {open && (
        <Modal onClose={close} maxWidth={560} label={`${groupName} community setup`} showClose>
          <div className={styles.modal}>
            <header className={styles.header}>
              <span className={styles.eyebrow}>{groupName}</span>
              <h2>{stepTitle}</h2>
              <ol className={styles.progress} aria-label="Community setup progress">
                {[0, 1, 2].map(index => (
                  <li key={index} className={index <= step ? styles.progressActive : undefined} aria-current={index === step ? 'step' : undefined}>
                    <span>{index < step ? <Check size={12} /> : index + 1}</span>
                  </li>
                ))}
              </ol>
            </header>

            <div className={styles.body}>
              {step === 0 && (
                <section className={styles.step}>
                  <div className={styles.rulesCard}>
                    <p>{rules?.trim() || 'SlipSurge community standards apply.'}</p>
                  </div>
                  <label className={styles.acceptRow}>
                    <input type="checkbox" checked={rulesAccepted} onChange={event => setRulesAccepted(event.target.checked)} />
                    <span><strong>I agree to follow the community rules</strong><small>Moderators can remove content or members who break them.</small></span>
                  </label>
                </section>
              )}

              {step === 1 && (
                <section className={styles.step}>
                  <p className={styles.stepLead}>Choose what appears first when you open this community.</p>
                  <div className={styles.channelList}>
                    {channels.length === 0 ? (
                      <div className={styles.emptyChannels}>No channels are available yet.</div>
                    ) : channels.map(channel => {
                      const checked = selectedChannels.includes(channel.id)
                      return (
                        <label key={channel.id} className={checked ? `${styles.channelRow} ${styles.channelSelected}` : styles.channelRow}>
                          <span className={styles.channelIcon}>{channel.icon || <Hash size={16} />}</span>
                          <span className={styles.channelCopy}><strong>{channel.name}</strong>{channel.description && <small>{channel.description}</small>}</span>
                          <input type="checkbox" checked={checked} onChange={() => toggleChannel(channel.id)} />
                        </label>
                      )
                    })}
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className={styles.step}>
                  <div className={styles.field}>
                    <label htmlFor={`group-flair-${groupId}`}>Community flair <span>Optional</span></label>
                    <input
                      id={`group-flair-${groupId}`}
                      value={flair}
                      maxLength={32}
                      onChange={event => setFlair(event.target.value)}
                      placeholder="e.g. Props analyst"
                    />
                    <small>{flair.length}/32</small>
                  </div>
                  <fieldset className={styles.notifications}>
                    <legend><BellRing size={15} /> Notifications</legend>
                    {NOTIFICATION_OPTIONS.map(option => (
                      <label key={option.value} className={notificationLevel === option.value ? styles.notificationSelected : undefined}>
                        <input
                          type="radio"
                          name={`group-notifications-${groupId}`}
                          value={option.value}
                          checked={notificationLevel === option.value}
                          onChange={() => setNotificationLevel(option.value)}
                        />
                        <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                      </label>
                    ))}
                  </fieldset>
                </section>
              )}

              {error && <p className={styles.error} role="alert">{error}</p>}
            </div>

            <footer className={styles.footer}>
              {step > 0 ? (
                <button type="button" className={styles.backButton} onClick={() => setStep(current => current - 1)} disabled={saving}>
                  <ChevronLeft size={15} /> Back
                </button>
              ) : <span />}
              {step < 2 ? (
                <button type="button" className={styles.nextButton} onClick={() => setStep(current => current + 1)} disabled={step === 0 && !rulesAccepted}>
                  Continue <ChevronRight size={15} />
                </button>
              ) : (
                <button type="button" className={styles.nextButton} onClick={save} disabled={saving || !rulesAccepted}>
                  {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save preferences</>}
                </button>
              )}
            </footer>
          </div>
        </Modal>
      )}
    </>
  )
}
