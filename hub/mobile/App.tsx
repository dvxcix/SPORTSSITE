import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Button, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { TIER_LABEL } from '@slipsurge/core/tiers'
import { supabase } from './lib/supabase'
import { apiFetch } from './lib/api'

// Auth foundation for the mobile app — same @supabase/supabase-js session
// hub/'s own bearer-token auth path (requireTier.ts) now knows how to
// validate. The "Call hub API" button below is a live round-trip proof:
// sign in here, hit a real tier-gated hub route, and see whichever real
// response comes back (200 with data, or a real 401/403) — not a mock.
export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiResult, setApiResult] = useState<string | null>(null)
  const [callingApi, setCallingApi] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function signIn() {
    setSigningIn(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(err.message)
    setSigningIn(false)
  }

  async function signOut() {
    setApiResult(null)
    await supabase.auth.signOut()
  }

  async function callHubApi() {
    setCallingApi(true)
    setApiResult(null)
    try {
      const res = await apiFetch('/api/dugout/data')
      const body = await res.text()
      setApiResult(`${res.status}: ${body.slice(0, 200)}`)
    } catch (e: any) {
      setApiResult(`Request failed: ${e?.message ?? String(e)}`)
    } finally {
      setCallingApi(false)
    }
  }

  if (loadingSession) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>SlipSurge</Text>
      <Text style={styles.subtitle}>Shared tiers: {Object.values(TIER_LABEL).join(', ')}</Text>

      {session ? (
        <View style={styles.block}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.value}>{session.user.email}</Text>
          <View style={styles.spacer} />
          <Button title={callingApi ? 'Calling…' : 'Call hub API'} onPress={callHubApi} disabled={callingApi} />
          {apiResult && <Text style={styles.result}>{apiResult}</Text>}
          <View style={styles.spacer} />
          <Button title="Sign out" onPress={signOut} color="#FF4D6A" />
        </View>
      ) : (
        <View style={styles.block}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button title={signingIn ? 'Signing in…' : 'Sign in'} onPress={signIn} disabled={signingIn || !email || !password} />
        </View>
      )}

      <StatusBar style="light" />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06070A', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '900', color: '#F0F2F8' },
  subtitle: { fontSize: 12, color: '#8891A8', marginTop: 4, marginBottom: 24, textAlign: 'center' },
  block: { width: '100%', maxWidth: 320, gap: 10 },
  input: {
    borderWidth: 1, borderColor: '#1B1E28', backgroundColor: '#0C0E13', color: '#F0F2F8',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  label: { fontSize: 12, color: '#8891A8' },
  value: { fontSize: 16, color: '#F0F2F8', fontWeight: '700' },
  result: { fontSize: 12, color: '#8891A8', marginTop: 8 },
  error: { fontSize: 13, color: '#FF4D6A' },
  spacer: { height: 12 },
})
