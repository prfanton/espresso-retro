import { getSupabaseClient } from '@/lib/supabase/client'

// Server-authoritative identity. Every visitor gets a real Supabase anonymous
// session (a signed JWT), so `auth.uid()` — not a self-asserted localStorage
// value — is what backs authorship, votes, and the facilitator role, and it is
// what the RLS policies enforce. The @supabase/ssr browser client persists the
// session in cookies, so the server routes see the same identity via getUser().
//
// Prerequisite: Anonymous sign-ins must be enabled in the Supabase project
// (Authentication → Providers → Anonymous).

let cached: string | null = null
let inflight: Promise<string> | null = null

export async function getAuthUserId(): Promise<string> {
  if (typeof window === 'undefined') return ''
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    const supabase = getSupabaseClient()

    const { data: { session } } = await supabase.auth.getSession()
    let userId = session?.user?.id

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error || !data.user) {
        inflight = null
        throw new Error(`Anonymous sign-in failed: ${error?.message ?? 'no user returned'}`)
      }
      userId = data.user.id
    }

    cached = userId
    inflight = null
    return userId
  })()

  return inflight
}
