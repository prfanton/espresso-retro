import { getSupabaseClient } from '@/lib/supabase/client'

// Server-authoritative identity. Every visitor gets a real Supabase anonymous
// session (a signed JWT), so `auth.uid()` — not a self-asserted localStorage
// value — is what backs authorship, votes, and the facilitator role, and it is
// what the RLS policies enforce. The @supabase/ssr browser client persists the
// session in cookies, so the server routes see the same identity via getUser().
//
// Prerequisites (per Supabase project):
//   1. Enable Anonymous sign-ins (Authentication → Providers → Anonymous).
//   2. Optional abuse protection: enable CAPTCHA (Authentication → Attack
//      Protection, Cloudflare Turnstile) and set NEXT_PUBLIC_TURNSTILE_SITE_KEY.
//      When set, the first anonymous sign-in in a browser must carry a Turnstile
//      token (see components/auth/TurnstileWidget.tsx). Returning visitors reuse
//      the persisted session, so they are never challenged again.

/** True when Turnstile CAPTCHA is configured for anonymous sign-in. */
export const captchaEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

let cached: string | null = null
let inflight: Promise<string> | null = null

/**
 * Reports whether an anonymous session already exists for this browser, without
 * creating one. Only the very first sign-in per browser consumes a CAPTCHA
 * token, so callers use this to decide whether a challenge is needed at all.
 */
export async function hasAuthSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (cached) return true
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  return Boolean(session?.user?.id)
}

/**
 * Resolves the anonymous auth user id, signing in anonymously the first time.
 * When CAPTCHA is enabled, `captchaToken` (from Turnstile) must accompany that
 * first sign-in; it is ignored once a session already exists.
 */
export async function getAuthUserId(captchaToken?: string): Promise<string> {
  if (typeof window === 'undefined') return ''
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    const supabase = getSupabaseClient()

    const { data: { session } } = await supabase.auth.getSession()
    let userId = session?.user?.id

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously(
        captchaToken ? { options: { captchaToken } } : undefined
      )
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
