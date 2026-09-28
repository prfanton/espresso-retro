// Shared countdown-timer math. The timer is wall-clock based: a countdown is
// described by how much time was left at a reference instant (`ts`), so a
// throttled/background tab or a sleeping laptop never slows it down.

export const DEFAULT_TIMER_SECONDS = 5 * 60
export const MAX_TIMER_SECONDS = 99 * 60 // keeps the display at MM:SS
export const ADJUST_STEP_SECONDS = 60

export interface Countdown {
  /** Milliseconds left at `ts` (the frozen value while paused). */
  remainingMs: number
  running: boolean
  /** Date.now() the state was captured at. */
  ts: number
}

export function remainingMsAt(state: Countdown, now = Date.now()): number {
  if (!state.running) return Math.max(0, state.remainingMs)
  return Math.max(0, state.remainingMs - (now - state.ts))
}

/** Seconds shown to the user: 04:59 means "less than 5:00 left". */
export function toDisplaySeconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

export function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
