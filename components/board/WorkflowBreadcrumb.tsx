'use client'

import type { RetroPhase } from '@/types/retro'

const STEPS: { phase: RetroPhase; label: string; icon: React.ReactNode }[] = [
  {
    phase: 'writing',
    label: 'Writing',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  {
    phase: 'grouping',
    label: 'Grouping',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    phase: 'voting',
    label: 'Voting',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ),
  },
  {
    phase: 'results',
    label: 'Results',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
]

const ORDER: RetroPhase[] = ['writing', 'grouping', 'voting', 'results']

interface WorkflowBreadcrumbProps {
  phase: RetroPhase
}

export { STEPS, ORDER }

export default function WorkflowBreadcrumb({ phase }: WorkflowBreadcrumbProps) {
  const currentIndex = ORDER.indexOf(phase)

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIndex
        const isCurrent = idx === currentIndex

        return (
          <div key={step.phase} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                isCurrent
                  ? 'bg-[#B83C28] text-white shadow-sm'
                  : isCompleted
                  ? 'bg-[#2d1200]/15 text-[#2d1200]/70'
                  : 'bg-white/30 text-[#2d1200]/40 border border-[#2d1200]/10'
              }`}
            >
              {step.icon}
              {/* On small screens only the current step shows its label, keeping
                  the four-step trail from overflowing the workflow bar. */}
              <span className={isCurrent ? 'inline' : 'hidden sm:inline'}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-2 sm:w-4 h-px ${idx < currentIndex ? 'bg-[#2d1200]/30' : 'bg-[#2d1200]/15'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
