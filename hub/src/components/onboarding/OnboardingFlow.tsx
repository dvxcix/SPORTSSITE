'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight } from 'lucide-react'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Golf', 'Tennis', 'Boxing', 'College Football', 'College Basketball']
const STEPS = ['Welcome', 'Your Profile', 'Favorite Sports', 'You\'re in!']

export function OnboardingFlow({ userId, initialProfile }: { userId: string; initialProfile: any }) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? '')
  const [bio, setBio] = useState(initialProfile?.bio ?? '')
  const [sports, setSports] = useState<string[]>(initialProfile?.favorite_sports ?? [])
  const [saving, setSaving] = useState(false)

  function toggleSport(s: string) {
    setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function finish() {
    setSaving(true)
    await supabase.from('users').update({
      display_name: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      favorite_sports: sports,
    }).eq('id', userId)
    router.push('/feed')
  }

  return (
    <div className="w-full max-w-md">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              i < step ? 'bg-green-500 text-black' : i === step ? 'bg-zinc-700 text-white ring-2 ring-green-500' : 'bg-zinc-900 text-zinc-600'
            }`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${i < step ? 'bg-green-500' : 'bg-zinc-800'}`} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="text-center space-y-6">
          <div>
            <p className="text-5xl mb-4">⚡</p>
            <h1 className="text-3xl font-black text-white">Welcome to <span className="text-green-400">SlipSurge</span></h1>
            <p className="text-zinc-400 mt-3">The sports betting social hub. Follow cappers, share picks, win big.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { emoji: '🏆', label: 'Follow top cappers' },
              { emoji: '🎯', label: 'Share your picks' },
              { emoji: '💰', label: 'Track your wins' },
            ].map(f => (
              <div key={f.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-2xl mb-1">{f.emoji}</p>
                <p className="text-xs text-zinc-400 font-medium">{f.label}</p>
              </div>
            ))}
          </div>
          <button onClick={() => setStep(1)}
            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black font-black py-3 rounded-xl transition-colors">
            Get Started <ChevronRight size={16} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-black text-white">Your Profile</h2>
            <p className="text-zinc-400 text-sm mt-1">How should others know you?</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5">Display Name</label>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name or handle"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none focus:border-green-500/50 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5">Bio</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people who you are — your record, strategy, teams you follow…" rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="flex-1 border border-zinc-700 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-800 transition-colors">Back</button>
            <button onClick={() => setStep(2)} className="flex-1 bg-green-500 hover:bg-green-400 text-black font-black py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-black text-white">Favorite Sports</h2>
            <p className="text-zinc-400 text-sm mt-1">Pick all that apply — we'll personalize your feed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map(s => (
              <button key={s} onClick={() => toggleSport(s)}
                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                  sports.includes(s) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}>
                {sports.includes(s) && <Check size={11} className="inline mr-1" />}{s}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 border border-zinc-700 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-800 transition-colors">Back</button>
            <button onClick={() => setStep(3)} className="flex-1 bg-green-500 hover:bg-green-400 text-black font-black py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center space-y-6">
          <div>
            <p className="text-5xl mb-4">🎉</p>
            <h2 className="text-2xl font-black text-white">You're all set!</h2>
            <p className="text-zinc-400 mt-2">Your SlipSurge profile is ready. Start exploring picks, join groups, and connect with cappers.</p>
          </div>
          <button onClick={finish} disabled={saving}
            className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-60 text-black font-black py-3 rounded-xl transition-colors">
            {saving ? 'Saving…' : 'Go to My Feed →'}
          </button>
        </div>
      )}
    </div>
  )
}
