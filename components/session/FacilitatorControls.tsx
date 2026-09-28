'use client'

import { useState, useEffect, useRef } from 'react'
import { useBoardStore } from '@/store/boardStore'
import type { TimerState } from '@/lib/channels/useRetroChannel'
import {
  ADJUST_STEP_SECONDS, DEFAULT_TIMER_SECONDS, MAX_TIMER_SECONDS,
  formatTimer, remainingMsAt, toDisplaySeconds, type Countdown,
} from '@/lib/utils/timer'

const TICK_MS = 250

// ─── Read-only timer for participants ─────────────────────────────────────────

export function TimerDisplay({ timerState, onTimerEnd }: { timerState: TimerState; onTimerEnd?: () => void }) {
  const [display, setDisplay] = useState(timerState.totalSeconds)
  const prevRemainingRef = useRef(timerState.totalSeconds)

  useEffect(() => {
    const countdown: Countdown = {
      remainingMs: timerState.totalSeconds * 1000,
      running: timerState.running,
      ts: timerState.ts,
    }
    function tick() {
      const remaining = toDisplaySeconds(remainingMsAt(countdown))
      // Fire once on the transition into zero while the timer was counting down.
      if (countdown.running && remaining === 0 && prevRemainingRef.current > 0) {
        onTimerEnd?.()
      }
      prevRemainingRef.current = remaining
      setDisplay(remaining)
    }
    tick()
    if (!countdown.running) return
    const id = setInterval(tick, TICK_MS)
    return () => clearInterval(id)
  }, [timerState, onTimerEnd])

  const isUrgent = display <= 60 && display > 0

  return (
    <div
      role="timer"
      aria-label={`Time remaining ${formatTimer(display)}`}
      className="flex items-center gap-2 bg-white/40 backdrop-blur-sm border border-[#2d1200]/20 rounded-xl px-3 py-1.5"
    >
      <svg className="w-4 h-4 text-[#2d1200]/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={`text-base font-sans font-semibold w-14 text-center tabular-nums ${isUrgent ? 'text-[#B83C28] animate-pulse' : 'text-[#2d1200]'}`}>
        {formatTimer(display)}
      </span>
    </div>
  )
}

// ─── Facilitator timer controls ───────────────────────────────────────────────

// The facilitator's timer is persisted per session so a page reload (or a
// second tab) resumes the running countdown instead of resetting it to 5:00
// and re-broadcasting that reset to every participant.
interface FacilitatorTimer extends Countdown {
  /** What Reset returns to: the length set before the countdown first started. */
  durationSeconds: number
  started: boolean
}

const INITIAL_TIMER: FacilitatorTimer = {
  remainingMs: DEFAULT_TIMER_SECONDS * 1000,
  running: false,
  ts: 0,
  durationSeconds: DEFAULT_TIMER_SECONDS,
  started: false,
}

function storageKey(sessionId: string) {
  return `espresso-retro:timer:${sessionId}`
}

function parseTimer(raw: string | null): FacilitatorTimer | null {
  if (!raw) return null
  try {
    const t = JSON.parse(raw) as FacilitatorTimer
    if (
      typeof t.remainingMs !== 'number' || typeof t.ts !== 'number' ||
      typeof t.running !== 'boolean' || typeof t.durationSeconds !== 'number'
    ) return null
    // A countdown that ran out while this tab was closed ends silently.
    const now = Date.now()
    if (t.running && remainingMsAt(t, now) <= 0) return { ...t, remainingMs: 0, running: false, ts: now }
    return t
  } catch {
    return null
  }
}

function loadTimer(sessionId: string | undefined): FacilitatorTimer | null {
  if (!sessionId) return null
  try {
    return parseTimer(localStorage.getItem(storageKey(sessionId)))
  } catch {
    return null
  }
}

interface FacilitatorControlsProps {
  onTimerSync?: (totalSeconds: number, running: boolean) => void
  onTimerStateChange?: (totalSeconds: number, running: boolean) => void
  onTimerEnd?: () => void
}

export default function FacilitatorControls({ onTimerSync, onTimerStateChange, onTimerEnd }: FacilitatorControlsProps) {
  const session = useBoardStore((s) => s.session)
  const sessionId = session?.id

  const [timer, setTimer] = useState<FacilitatorTimer>(() => loadTimer(sessionId) ?? INITIAL_TIMER)
  const [now, setNow] = useState(() => Date.now())
  // Set when `timer` was adopted from another tab, so we don't write it back.
  const fromStorageRef = useRef(false)

  useEffect(() => {
    if (!sessionId) return
    if (fromStorageRef.current) { fromStorageRef.current = false; return }
    try { localStorage.setItem(storageKey(sessionId), JSON.stringify(timer)) } catch { /* storage unavailable */ }
  }, [sessionId, timer])

  // Keep the facilitator's other tabs in step.
  useEffect(() => {
    if (!sessionId) return
    function handleStorage(e: StorageEvent) {
      if (e.key !== storageKey(sessionId!)) return
      const next = parseTimer(e.newValue)
      if (!next) return
      fromStorageRef.current = true
      setTimer(next)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [sessionId])

  // Derive the display from the wall clock rather than counting ticks, so a
  // throttled background tab or a sleeping laptop doesn't fall behind.
  useEffect(() => {
    if (!timer.running) return
    const id = setInterval(() => {
      const t = Date.now()
      if (remainingMsAt(timer, t) <= 0) {
        setTimer({ ...timer, remainingMs: 0, running: false, ts: t })
        onTimerEnd?.()
      } else {
        setNow(t)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer])

  const remainingMs = remainingMsAt(timer, Math.max(now, timer.ts))
  const displaySeconds = toDisplaySeconds(remainingMs)
  const canDecrease = displaySeconds > ADJUST_STEP_SECONDS
  const canIncrease = displaySeconds + ADJUST_STEP_SECONDS <= MAX_TIMER_SECONDS
  const canToggle = displaySeconds > 0

  // Report the live timer state — including every tick — to the parent so that
  // a re-broadcast (e.g. when a new participant joins) carries the *current*
  // remaining time instead of resetting everyone's countdown to the start.
  useEffect(() => {
    onTimerStateChange?.(displaySeconds, timer.running)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySeconds, timer.running])

  // Every committed state holds a whole number of seconds, so the broadcast
  // value is exact and participants tick in step with the facilitator.
  function commit(next: FacilitatorTimer) {
    setNow(next.ts)
    setTimer(next)
    onTimerSync?.(toDisplaySeconds(next.remainingMs), next.running)
  }

  function adjustMinutes(delta: number) {
    if (delta < 0 ? !canDecrease : !canIncrease) return
    const t = Date.now()
    const nextMs = (toDisplaySeconds(remainingMsAt(timer, t)) + delta * ADJUST_STEP_SECONDS) * 1000
    commit({
      ...timer,
      remainingMs: nextMs,
      ts: t,
      // Before the first start, +/- sets the length that Reset returns to.
      durationSeconds: timer.started ? timer.durationSeconds : toDisplaySeconds(nextMs),
    })
  }

  function resetTimer() {
    commit({
      remainingMs: timer.durationSeconds * 1000,
      running: false,
      ts: Date.now(),
      durationSeconds: timer.durationSeconds,
      started: false,
    })
  }

  function handleToggle() {
    const t = Date.now()
    const ms = remainingMsAt(timer, t)
    if (ms <= 0) return
    if (timer.running) {
      // Pause on the second that's shown, so resuming picks up exactly there.
      commit({ ...timer, running: false, remainingMs: toDisplaySeconds(ms) * 1000, ts: t })
    } else {
      commit({ ...timer, running: true, remainingMs: ms, ts: t, started: true })
    }
  }

  const isUrgent = displaySeconds <= 60 && displaySeconds > 0
  const toggleLabel = timer.running ? 'Pause timer' : 'Start timer'

  if (!session) return null

  return (
    <div className="flex items-center gap-0.5 sm:gap-2 bg-white/40 backdrop-blur-sm border border-[#2d1200]/20 rounded-xl px-2 sm:px-3 py-1.5">
      <button
        onClick={() => adjustMinutes(-1)}
        disabled={!canDecrease}
        className="w-8 h-8 flex items-center justify-center text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-[#2d1200]/10 font-bold text-lg rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
        title="Remove 1 minute"
        aria-label="Remove 1 minute"
      >−</button>

      <button
        onClick={handleToggle}
        disabled={!canToggle}
        className={`text-base font-sans font-semibold w-14 text-center tabular-nums transition-colors ${
          isUrgent ? 'text-[#B83C28] animate-pulse' : 'text-[#2d1200]'
        }`}
        title={timer.running ? 'Pause' : 'Start'}
        aria-label={`${toggleLabel}, ${formatTimer(displaySeconds)} remaining`}
      >
        {formatTimer(displaySeconds)}
      </button>

      <button
        onClick={() => adjustMinutes(1)}
        disabled={!canIncrease}
        className="w-8 h-8 flex items-center justify-center text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-[#2d1200]/10 font-bold text-lg rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
        title="Add 1 minute"
        aria-label="Add 1 minute"
      >+</button>

      <button
        onClick={handleToggle}
        disabled={!canToggle}
        className="w-8 h-8 flex items-center justify-center text-[#B83C28] hover:text-[#8a2a1a] hover:bg-[#B83C28]/10 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
        title={timer.running ? 'Pause' : 'Start'}
        aria-label={toggleLabel}
      >
        {timer.running ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </button>

      <button
        onClick={resetTimer}
        className="w-8 h-8 flex items-center justify-center text-[#2d1200]/40 hover:text-[#2d1200]/70 hover:bg-[#2d1200]/10 rounded-lg transition-colors"
        title="Reset timer"
        aria-label="Reset timer"
      >
        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  )
}
