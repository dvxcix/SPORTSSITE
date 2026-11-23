'use client'

import { AdminKeyValueSettings, type SettingField } from './AdminKeyValueSettings'

const SETTINGS_FIELDS: SettingField[] = [
  { key: 'site_name', label: 'Site name', type: 'text', default: 'SlipSurge' },
  { key: 'site_tagline', label: 'Tagline', type: 'text', default: 'The Social Hub for Sports & Betting' },
  { key: 'site_email', label: 'Contact email', type: 'email', default: '' },
  { key: 'allow_registration', label: 'Allow new registrations', type: 'toggle', default: true },
  { key: 'email_verification', label: 'Require email verification', type: 'toggle', default: false },
  { key: 'maintenance_mode', label: 'Maintenance mode', type: 'toggle', default: false, hint: 'Controls the member-facing maintenance screen.' },
  { key: 'max_post_length', label: 'Maximum post length', type: 'number', default: 500 },
  { key: 'posts_per_page', label: 'Posts per page', type: 'number', default: 30 },
]

export function AdminGeneralSettings() {
  return <AdminKeyValueSettings fields={SETTINGS_FIELDS} />
}
