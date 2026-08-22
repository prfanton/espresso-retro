// Identity now comes from Supabase anonymous auth (see lib/utils/auth.ts).
// This module only persists the per-session display name.

export function getDisplayName(sessionId: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(`retro_display_name_${sessionId}`)
}

export function setDisplayName(sessionId: string, name: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`retro_display_name_${sessionId}`, name)
}
