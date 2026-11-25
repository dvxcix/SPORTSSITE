export function creatorBrowserRouteImport(name, compile, imports) {
  switch (name) {
    case '@/lib/creatorRouteAccount':
      return compile('src/lib/creatorRouteAccount.ts', {
        'next/server': imports['next/server'],
        '@/lib/supabase/server': imports['@/lib/supabase/server'],
        '@/lib/supabase/nativeAccount': {
          requireNativeAccount: async () => { throw new Error('Cookie fixture called the native account gate') },
        },
      })
    case '@/lib/supabase/accountSettingsActor':
      return compile('src/lib/supabase/accountSettingsActor.ts', {
        'next/server': imports['next/server'],
        './server': imports['@/lib/supabase/server'],
        './nativeAccount': {
          requireNativeAccount: async () => { throw new Error('Cookie fixture called the native account gate') },
        },
      })
    case '@/lib/mlbViewerAccess':
      return { canViewMlb: async () => { throw new Error('Cookie fixture called the native visibility check') } }
    case '@/lib/nativeMedia':
      return { isOwnedNativeMedia: () => { throw new Error('Cookie fixture called the native media check') } }
    default:
      return undefined
  }
}
