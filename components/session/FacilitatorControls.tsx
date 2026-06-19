'use client'

import { useState, useEffect, useRef } from 'react'
import { useBoardStore } from '@/store/boardStore'
import type { TimerState } from '@/lib/channels/useRetroChannel'

// ─── Read-only timer for participants ─────────────────────────────────────────

export function TimerDisplay({ timerState }: { timerState: TimerState }) {
  const [display, setDisplay] = useState(timerState.totalSeconds)

  useEffect(() => {
    if (!timerState.running) {
      setDisplay(timerState.totalSeconds)
      return
    }
    function tick() {
      const elapsed = Math.floor((Date.now() - timerState.ts) / 1000)
      setDisplay(Math.max(0, timerState.totalSeconds - elapsed))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timerState])

  const mins = Math.floor(display / 60)
  const secs = display % 60
  const isUrgent = display <= 60 && display > 0

  return (
    <div className="flex items-center gap-2 bg-white/40 backdrop-blur-sm border border-[#2d1200]/20 rounded-xl px-3 py-1.5">
      <svg className="w-4 h-4 text-[#2d1200]/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={`text-base font-sans font-semibold w-14 text-center ${isUrgent ? 'text-[#B83C28] animate-pulse' : 'text-[#2d1200]'}`}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  )
}

// ─── Facilitator timer controls ───────────────────────────────────────────────

interface FacilitatorControlsProps {
  onTimerSync?: (totalSeconds: number, running: boolean) => void
}

export default function FacilitatorControls({ onTimerSync }: FacilitatorControlsProps) {
  const session = useBoardStore((s) => s.session)

  const DEFAULT_MINUTES = 5
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_MINUTES * 60)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTotalSeconds((s) => {
          if (s <= 1) { setRunning(false); return 0 }
          return s - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  function adjustMinutes(delta: number) {
    const newVal = Math.max(60, totalSeconds + delta * 60)
    setTotalSeconds(newVal)
    onTimerSync?.(newVal, running)
  }

  function resetTimer() {
    setRunning(false)
    setTotalSeconds(DEFAULT_MINUTES * 60)
    onTimerSync?.(DEFAULT_MINUTES * 60, false)
  }

  function handleToggle() {
    if (totalSeconds > 0) {
      const newRunning = !running
      setRunning(newRunning)
      onTimerSync?.(totalSeconds, newRunning)
    }
  }

  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  const isUrgent = totalSeconds <= 60 && totalSeconds > 0

  if (!session) return null

  return (
    <div className="flex items-center gap-2 bg-white/40 backdrop-blur-sm border border-[#2d1200]/20 rounded-xl px-3 py-1.5">
      <button
        onClick={() => adjustMinutes(-1)}
        className="w-8 h-8 flex items-center justify-center text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-[#2d1200]/10 font-bold text-lg rounded-lg transition-colors"
        title="Remove 1 minute"
      >−</button>

      <button
        onClick={handleToggle}
        className={`text-base font-sans font-semibold w-14 text-center transition-colors ${
          isUrgent ? 'text-[#B83C28] animate-pulse' : 'text-[#2d1200]'
        }`}
        title={running ? 'Pause' : 'Start'}
      >
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </button>

      <button
        onClick={() => adjustMinutes(1)}
        className="w-8 h-8 flex items-center justify-center text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-[#2d1200]/10 font-bold text-lg rounded-lg transition-colors"
        title="Add 1 minute"
      >+</button>

      <button
        onClick={handleToggle}
        className="w-8 h-8 flex items-center justify-center text-[#B83C28] hover:text-[#8a2a1a] hover:bg-[#B83C28]/10 rounded-lg transition-colors"
        title={running ? 'Pause' : 'Start'}
      >
        {running ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </button>

      <button
        onClick={resetTimer}
        className="w-8 h-8 flex items-center justify-center text-[#2d1200]/40 hover:text-[#2d1200]/70 hover:bg-[#2d1200]/10 rounded-lg transition-colors"
        title="Reset timer"
      >
        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  )
}
