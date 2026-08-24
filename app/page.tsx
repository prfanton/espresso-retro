'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAuthUserId, captchaEnabled, hasAuthSession } from '@/lib/utils/auth'
import { FORMATS } from '@/lib/utils/sessionFormats'
import TurnstileWidget from '@/components/auth/TurnstileWidget'

export default function HomePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState('ssc')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Assume a challenge is needed until we confirm a session already exists, so
  // a first-time visitor can never slip past a configured CAPTCHA.
  const [needCaptcha, setNeedCaptcha] = useState(captchaEnabled)
  const [captchaToken, setCaptchaToken] = useState('')
  // Bumped to remount the widget for a fresh, single-use token after a failure.
  const [captchaKey, setCaptchaKey] = useState(0)

  // Pre-fill the title with a dated default (e.g. "Team retrospective 07/24").
  // Done in an effect so the client-computed date never mismatches SSR output.
  useEffect(() => {
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    setTitle(`Team retrospective ${mm}/${dd}`)
  }, [])

  // Returning visitors already hold an anonymous session, so no challenge is
  // needed — only the first sign-in per browser consumes a token.
  useEffect(() => {
    if (!captchaEnabled) return
    let cancelled = false
    hasAuthSession().then((exists) => {
      if (!cancelled && exists) setNeedCaptcha(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function resetCaptcha() {
    setCaptchaToken('')
    setCaptchaKey((k) => k + 1)
  }

  async function handleCreate() {
    if (needCaptcha && !captchaToken) {
      setError('Please complete the verification below.')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Ensure an anonymous auth session exists so the cookie-backed server
      // route can derive facilitator_id from auth.uid() (not from the body).
      // This throws if anonymous sign-ins are disabled on the Supabase project
      // or the Supabase env vars are missing/invalid — the two prerequisites
      // documented in the README. Surfacing the real reason (below) turns an
      // otherwise silent failure into something diagnosable. When CAPTCHA is on,
      // the Turnstile token gates that first sign-in.
      await getAuthUserId(needCaptcha ? captchaToken : undefined)

      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Team Retrospective',
          format,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Session request failed (HTTP ${res.status})`)
      }
      const session = await res.json()
      router.push(`/retro/${session.id}`)
    } catch (err) {
      // Log the underlying cause so a failing deployment can be diagnosed from
      // the browser console instead of hitting an opaque generic message.
      console.error('Session creation failed:', err)
      const reason = err instanceof Error ? err.message : ''
      setError(
        reason
          ? `Could not create session: ${reason}`
          : 'Could not create session. Please try again.'
      )
      // The token was consumed by the attempt; issue a fresh one for the retry.
      if (needCaptcha) resetCaptcha()
      setLoading(false)
    }
  }

  return (
    <main className="animated-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/40 backdrop-blur-md rounded-2xl p-8 shadow-2xl border border-white/50">
          <div className="text-center mb-8">
            <img
              src="/assets/logo-espresso-retro.avif"
              alt="Espresso Retro"
              className="mx-auto mb-3 h-28 w-auto"
            />
            <img
              src="/assets/text-espresso-retro.svg"
              alt="Espresso Retro"
              className="mx-auto mb-4 h-[60px] w-auto"
            />
          </div>

          <h2 className="text-xl font-semibold text-[#2d1200] mb-6">Create a new session</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#2d1200]/70 mb-1">
                Session title <span className="text-[#2d1200]/55">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Team Retrospective"
                className="w-full px-4 py-2.5 bg-[#EDEEE6] border border-[#2d1200]/25 rounded-lg text-[#2d1200] placeholder-[#2d1200]/55 focus:outline-none focus:ring-2 focus:ring-[#B83C28] focus:border-transparent"
                maxLength={80}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#2d1200]/70 mb-1">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#EDEEE6] border border-[#2d1200]/25 rounded-lg text-[#2d1200] focus:outline-none focus:ring-2 focus:ring-[#B83C28]"
              >
                {Object.values(FORMATS).map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>

            {needCaptcha && (
              <TurnstileWidget
                key={captchaKey}
                onVerify={setCaptchaToken}
                onError={() => {
                  setCaptchaToken('')
                  setError('Verification failed. Please try again.')
                }}
                className="flex justify-center"
              />
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={loading || (needCaptcha && !captchaToken)}
              className="w-full py-3 bg-[#B83C28] hover:bg-[#9c2e1a] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Creating…' : 'Create Session'}
            </button>
          </div>
        </div>

        <p className="text-center text-[#2d1200]/60 text-sm mt-6">
          Have an invite link? Just open it directly.
        </p>
      </div>
    </main>

  )
}
