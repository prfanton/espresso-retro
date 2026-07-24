'use client'

import { useState, useRef, useEffect } from 'react'
import { usePresenceStore } from '@/store/presenceStore'
import PresenceAvatar from './PresenceAvatar'

const MAX_SHOWN = 3

interface PresenceBarProps {
  showReady?: boolean
}

export default function PresenceBar({ showReady = false }: PresenceBarProps) {
  const participants = usePresenceStore((s) => s.participants)
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close the expanded list when clicking outside of it.
  useEffect(() => {
    if (!expanded) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expanded])

  if (participants.length === 0) return null

  const shown = participants.slice(0, MAX_SHOWN)
  const extra = participants.length - MAX_SHOWN

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <PresenceAvatar key={p.user_key} displayName={p.display_name} />
        ))}
      </div>
      {extra > 0 && (
        <button
          onClick={() => setExpanded((o) => !o)}
          className="ml-2 text-xs font-medium text-[#2d1200]/60 hover:text-[#B83C28] underline underline-offset-2 transition-colors"
        >
          +{extra} more
        </button>
      )}

      {/* Expanded popover: full participant list */}
      {expanded && (
        <div className="absolute right-0 top-full mt-2 z-30 min-w-[200px] max-h-72 overflow-y-auto bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-2">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#2d1200]/40">
            {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
          </p>
          <ul className="flex flex-col">
            {participants.map((p) => (
              <li key={p.user_key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#2d1200]/5">
                <PresenceAvatar displayName={p.display_name} size="sm" />
                <span className="flex-1 text-sm text-[#2d1200] truncate">{p.display_name}</span>
                {showReady && p.ready && (
                  <span className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-green-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Ready
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
