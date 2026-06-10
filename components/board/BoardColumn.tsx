'use client'

import { useBoardStore } from '@/store/boardStore'
import RetroCard from './RetroCard'
import AddCardButton from './AddCardButton'
import type { ColumnDef } from '@/types/retro'

const BORDER_COLOR_MAP: Record<string, string> = {
  green:  'border-[#2d1200]/20',
  red:    'border-[#2d1200]/20',
  blue:   'border-[#2d1200]/20',
  yellow: 'border-[#2d1200]/20',
}

const HEADER_COLOR_MAP: Record<string, string> = {
  green:  'text-[#2d1200]',
  red:    'text-[#2d1200]',
  blue:   'text-[#2d1200]',
  yellow: 'text-[#2d1200]',
}

const DOT_IMG_MAP: Record<string, string> = {
  green:  '/assets/green.png',
  red:    '/assets/red.png',
  blue:   '/assets/yellow.png',
  yellow: '/assets/yellow.png',
}

interface BoardColumnProps {
  column: ColumnDef
  sessionId: string
  userKey: string
  displayName: string
  isRevealed: boolean
  isLocked: boolean
  canVote: boolean
  onBroadcastTyping: (cardId: string) => void
  participants: Record<string, string>
}

export default function BoardColumn({
  column, sessionId, userKey, displayName, isRevealed, isLocked, canVote, onBroadcastTyping, participants,
}: BoardColumnProps) {
  const allCards = useBoardStore((s) => s.cards)
  const optimisticCards = useBoardStore((s) => s.optimisticCards)
  const votes = useBoardStore((s) => s.votes)

  const colCards = [
    ...Object.values(allCards),
    ...Object.values(optimisticCards),
  ]
    .filter((c) => c.column_id === column.id && c.session_id === sessionId)
    .sort((a, b) => a.position - b.position)

  const borderClass = BORDER_COLOR_MAP[column.color] ?? BORDER_COLOR_MAP.blue
  const headerClass = HEADER_COLOR_MAP[column.color] ?? 'text-blue-400'
  const dotImg = DOT_IMG_MAP[column.color] ?? '/assets/yellow.png'

  return (
    <div className={`flex flex-col min-w-0 rounded-2xl p-4 border border-white/40 bg-white/20 shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)]`} style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <img src={dotImg} width={24} height={24} alt="" />
        <h3 className={`font-semibold text-base ${headerClass}`}>{column.label}</h3>
        <span className="ml-auto text-xs text-[#2d1200]/60 font-medium">{colCards.length}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {!isLocked && (
          <AddCardButton
            sessionId={sessionId}
            columnId={column.id}
            userKey={userKey}
            displayName={displayName}
            placeholder={column.placeholder}
            onBroadcastTyping={onBroadcastTyping}
          />
        )}

        {colCards.map((card) => (
          <RetroCard
            key={card.id}
            card={card}
            votes={votes[card.id] ?? []}
            userKey={userKey}
            isRevealed={isRevealed}
            isLocked={isLocked}
            canVote={canVote}
            displayName={displayName}
            onBroadcastTyping={onBroadcastTyping}
            participants={participants}
          />
        ))}
      </div>
    </div>
  )
}
