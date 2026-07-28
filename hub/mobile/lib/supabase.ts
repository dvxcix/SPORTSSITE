import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Standard Expo+Supabase pattern — @supabase/ssr (what hub/ itself uses) is
// cookie/browser-specific and doesn't apply here at all; plain
// @supabase/supabase-js with an AsyncStorage-backed session is the RN
// equivalent. detectSessionInUrl must be off (there's no browser URL to
// read a session out of), and autoRefreshToken/persistSession give the
// same "stay signed in across app restarts" behavior a web session cookie
// gives for free.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
