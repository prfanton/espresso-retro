'use client'

import { useEffect, useRef } from 'react'

// Cloudflare Turnstile challenge, rendered explicitly so we control when the
// token is produced. The widget only appears when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set; otherwise it renders nothing and the caller proceeds without a token
// (matching a Supabase project that has CAPTCHA turned off).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
      theme?: 'light' | 'dark' | 'auto'
    },
  ) => string
  reset: (id?: string) => void
  remove: (id?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Turnstile'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

interface TurnstileWidgetProps {
  /** Called with a fresh, single-use token each time a challenge is solved. */
  onVerify: (token: string) => void
  /** Called when the challenge errors or the script fails to load. */
  onError?: () => void
  className?: string
}

export default function TurnstileWidget({ onVerify, onError, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  // Track the latest callbacks without re-rendering (and re-mounting) the widget.
  const onVerifyRef = useRef(onVerify)
  const onErrorRef = useRef(onError)
  onVerifyRef.current = onVerify
  onErrorRef.current = onError

  useEffect(() => {
    if (!SITE_KEY) return
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          callback: (token) => onVerifyRef.current(token),
          'error-callback': () => onErrorRef.current?.(),
          // Tokens are single-use and expire (~300s); refresh so a slow user
          // still holds a valid token when they finally act.
          'expired-callback': () => {
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current)
            }
          },
        })
      })
      .catch(() => onErrorRef.current?.())

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [])

  if (!SITE_KEY) return null
  return <div ref={containerRef} className={className} />
}
