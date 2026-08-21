'use client'

import { useMemo } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useBoardStore } from '@/store/boardStore'
import { usePresenceStore } from '@/store/presenceStore'
import type { RetroFormat, Card, CardGroup } from '@/types/retro'

const MIN_VOTES = 3
const MAX_VOTES_LIMIT = 7

const DOT_IMG_MAP: Record<string, string> = {
  green: '/assets/green.png', red: '/assets/red.png', blue: '/assets/yellow.png', yellow: '/assets/yellow.png',
}

interface VotingBoardProps {
  format: RetroFormat
  sessionId: string
  userKey: string
  isFacilitator?: boolean
}

// ─── Vote button ──────────────────────────────────────────────────────────────

function VoteButton({ count, hasVoted, disabled, onVote }: {
  count: number
  hasVoted: boolean
  disabled: boolean
  onVote: () => void
}) {
  return (
    <button
      onClick={onVote}
      disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
        hasVoted
          ? 'bg-[#B83C28] text-white'
          : disabled
            ? 'bg-[#2d1200]/5 text-[#2d1200]/25 cursor-not-allowed'
            : 'bg-[#2d1200]/8 text-[#2d1200]/65 hover:bg-[#2d1200]/15 hover:text-[#2d1200]'
      }`}
    >
      <svg className="w-3 h-3" fill={hasVoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
      {count}
      <span className="ml-0.5">{hasVoted ? 'Voted' : 'Vote'}</span>
    </button>
  )
}

// ─── Group item ───────────────────────────────────────────────────────────────

function GroupItem({ group, cards, userKey, votesLeft }: {
  group: CardGroup
  cards: Card[]
  userKey: string
  votesLeft: number
}) {
  const supabase = getSupabaseClient()
  const votes = useBoardStore((s) => s.votes)
  const applyVoteInsert = useBoardStore((s) => s.applyVoteInsert)
  const applyVoteDelete = useBoardStore((s) => s.applyVoteDelete)

  const totalVotes = cards.reduce((s, c) => s + (votes[c.id]?.length ?? 0), 0)
  const hasVoted = cards.some((c) => votes[c.id]?.some((v) => v.user_key === userKey))
  const proxyCard = cards.slice().sort((a, b) => a.position - b.position)[0]

  async function handleVote() {
    if (!proxyCard) return
    if (hasVoted) {
      for (const card of cards) {
        const userVote = votes[card.id]?.find((v) => v.user_key === userKey)
        if (userVote) {
          applyVoteDelete({ card_id: card.id, user_key: userKey })
          await supabase.from('votes').delete().eq('card_id', card.id).eq('user_key', userKey)
        }
      }
    } else {
      const newVote = { id: crypto.randomUUID(), card_id: proxyCard.id, user_key: userKey, created_at: new Date().toISOString() }
      applyVoteInsert(newVote)
      await supabase.from('votes').insert({ card_id: proxyCard.id, user_key: userKey })
    }
  }

  return (
    <div className="rounded-xl border-2 border-[#2d1200]/12 bg-[#2d1200]/3 p-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-3.5 h-3.5 text-[#2d1200]/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <span className="flex-1 text-xs font-semibold text-[#2d1200]/80 truncate">{group.name}</span>
        <VoteButton count={totalVotes} hasVoted={hasVoted} disabled={!hasVoted && votesLeft === 0} onVote={handleVote} />
      </div>
      <div className="flex flex-col gap-1.5">
        {cards.map((card) => (
          <div key={card.id} className="px-2.5 py-2 rounded-lg bg-white/50 border border-[#2d1200]/8 text-sm text-[#2d1200] leading-relaxed">
            {card.content}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Ungrouped card item ──────────────────────────────────────────────────────

function CardItem({ card, userKey, votesLeft }: { card: Card; userKey: string; votesLeft: number }) {
  const supabase = getSupabaseClient()
  const votes = useBoardStore((s) => s.votes)
  const applyVoteInsert = useBoardStore((s) => s.applyVoteInsert)
  const applyVoteDelete = useBoardStore((s) => s.applyVoteDelete)

  const cardVotes = votes[card.id] ?? []
  const hasVoted = cardVotes.some((v) => v.user_key === userKey)
  const voteCount = cardVotes.length

  async function handleVote() {
    if (hasVoted) {
      applyVoteDelete({ card_id: card.id, user_key: userKey })
      await supabase.from('votes').delete().eq('card_id', card.id).eq('user_key', userKey)
    } else {
      const newVote = { id: crypto.randomUUID(), card_id: card.id, user_key: userKey, created_at: new Date().toISOString() }
      applyVoteInsert(newVote)
      await supabase.from('votes').insert({ card_id: card.id, user_key: userKey })
    }
  }

  return (
    <div className="flex items-start gap-2 p-3 rounded-xl border border-[#2d1200]/10 bg-white/60 shadow-sm">
      <p className="flex-1 text-sm text-[#2d1200] leading-relaxed whitespace-pre-wrap break-words">{card.content}</p>
      <VoteButton count={voteCount} hasVoted={hasVoted} disabled={!hasVoted && votesLeft === 0} onVote={handleVote} />
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

function VotingColumn({ columnId, columnLabel, columnColor, sessionId, userKey, votesLeft }: {
  columnId: string
  columnLabel: string
  columnColor: string
  sessionId: string
  userKey: string
  votesLeft: number
}) {
  const allCards = useBoardStore((s) => s.cards)
  const allGroups = useBoardStore((s) => s.groups)

  const sessionCards = useMemo(
    () => Object.values(allCards).filter((c) => c.session_id === sessionId && c.column_id === columnId),
    [allCards, sessionId, columnId]
  )

  const groups = useMemo(
    () => Object.values(allGroups)
      .filter((g) => g.session_id === sessionId && g.column_id === columnId)
      .sort((a, b) => a.position - b.position),
    [allGroups, sessionId, columnId]
  )

  const cardsByGroup = useMemo(() => {
    const map: Record<string, Card[]> = {}
    for (const g of groups) {
      map[g.id] = sessionCards.filter((c) => c.group_id === g.id).sort((a, b) => a.position - b.position)
    }
    return map
  }, [groups, sessionCards])

  const ungroupedCards = useMemo(
    () => sessionCards.filter((c) => !c.group_id).sort((a, b) => a.position - b.position),
    [sessionCards]
  )

  const dotImg = DOT_IMG_MAP[columnColor] ?? '/assets/yellow.png'
  const totalItems = groups.length + ungroupedCards.length

  return (
    <div
      className="flex flex-col min-w-0 rounded-2xl p-4 border border-white/40 bg-white/20 shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)]"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <img src={dotImg} width={24} height={24} alt="" />
        <h3 className="font-semibold text-base text-[#2d1200]">{columnLabel}</h3>
        <span className="ml-auto text-xs text-[#2d1200]/60 font-medium">{totalItems}</span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {groups.map((group) => (
          <GroupItem key={group.id} group={group} cards={cardsByGroup[group.id] ?? []} userKey={userKey} votesLeft={votesLeft} />
        ))}
        {ungroupedCards.map((card) => (
          <CardItem key={card.id} card={card} userKey={userKey} votesLeft={votesLeft} />
        ))}
        {totalItems === 0 && (
          <p className="text-xs text-[#2d1200]/30 text-center py-4">No cards</p>
        )}
      </div>
    </div>
  )
}

// ─── Vote status bar ──────────────────────────────────────────────────────────

function VoteDots({ used, maxVotes }: { used: number; maxVotes: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxVotes }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full ${i < used ? 'bg-[#B83C28]' : 'bg-[#2d1200]/12'}`}
        />
      ))}
    </div>
  )
}

function VoteStatusBar({ userVoteCount, sessionId, userKey, maxVotes }: {
  userVoteCount: number
  sessionId: string
  userKey: string
  maxVotes: number
}) {
  const allCards = useBoardStore((s) => s.cards)
  const votes = useBoardStore((s) => s.votes)
  const participants = usePresenceStore((s) => s.participants)

  const sessionCardIds = useMemo(
    () => Object.values(allCards).filter((c) => c.session_id === sessionId).map((c) => c.id),
    [allCards, sessionId]
  )

  const participantVotes = useMemo(() =>
    participants
      .filter((p) => p.user_key !== userKey)
      .map((p) => ({
        ...p,
        used: sessionCardIds.reduce(
          (sum, cid) => sum + (votes[cid]?.filter((v) => v.user_key === p.user_key).length ?? 0),
          0
        ),
      })),
    [participants, sessionCardIds, votes, userKey]
  )

  const votesLeft = maxVotes - userVoteCount

  return (
    <div className="mb-4 px-1 flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* My votes */}
      <div className="flex items-center gap-2 bg-white/30 rounded-lg px-2 py-1">
        <span className="text-xs text-[#2d1200]/50 font-medium">You</span>
        <div className="flex items-center gap-1">
          {Array.from({ length: maxVotes }).map((_, i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                i < userVoteCount ? 'bg-[#B83C28] text-white' : 'bg-[#2d1200]/10'
              }`}
            >
              {i < userVoteCount && (
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              )}
            </div>
          ))}
        </div>
        <span className={`text-xs font-semibold ${votesLeft === 0 ? 'text-[#B83C28]' : 'text-[#2d1200]/70'}`}>
          {votesLeft === 0 ? 'All used' : `${votesLeft} left`}
        </span>
      </div>

      {/* Team votes */}
      {participantVotes.map((p) => {
        const remaining = maxVotes - p.used
        return (
          <div key={p.user_key} className="flex items-center gap-2">
            <span className="text-xs text-[#2d1200]/60 font-medium max-w-[7rem] truncate">{p.display_name}</span>
            <VoteDots used={p.used} maxVotes={maxVotes} />
            <span className={`text-xs font-medium ${remaining === 0 ? 'text-[#B83C28]' : 'text-[#2d1200]/50'}`}>
              {remaining === 0 ? 'Done' : `${remaining} left`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Facilitator vote limit controls ─────────────────────────────────────────

function VoteLimitControls({ sessionId, maxVotes }: { sessionId: string; maxVotes: number }) {
  const supabase = getSupabaseClient()

  async function adjust(delta: number) {
    const newVal = Math.min(MAX_VOTES_LIMIT, Math.max(MIN_VOTES, maxVotes + delta))
    if (newVal === maxVotes) return
    await supabase.from('sessions').update({ max_votes: newVal }).eq('id', sessionId)
  }

  return (
    <div
      className="mb-4 inline-flex flex-col gap-1.5 rounded-2xl border border-white/40 bg-white/20 px-4 py-3 shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)]"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <span className="text-xs text-[#2d1200]/60 font-medium">Total votes</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => adjust(-1)}
          disabled={maxVotes <= MIN_VOTES}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/40 text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-white/70 font-bold disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >−</button>
        <span className="text-sm font-semibold text-[#2d1200] w-6 text-center">{maxVotes}</span>
        <button
          onClick={() => adjust(1)}
          disabled={maxVotes >= MAX_VOTES_LIMIT}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/40 text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-white/70 font-bold disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >+</button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function VotingBoard({ format, sessionId, userKey, isFacilitator }: VotingBoardProps) {
  const allCards = useBoardStore((s) => s.cards)
  const votes = useBoardStore((s) => s.votes)
  const session = useBoardStore((s) => s.session)

  const maxVotes = session?.max_votes ?? MIN_VOTES

  const userVoteCount = useMemo(() => {
    const sessionCardIds = Object.values(allCards)
      .filter((c) => c.session_id === sessionId)
      .map((c) => c.id)
    return sessionCardIds.reduce(
      (sum, cid) => sum + (votes[cid]?.filter((v) => v.user_key === userKey).length ?? 0),
      0
    )
  }, [allCards, votes, sessionId, userKey])

  const votesLeft = Math.max(0, maxVotes - userVoteCount)

  return (
    <div>
      {isFacilitator && (
        <VoteLimitControls sessionId={sessionId} maxVotes={maxVotes} />
      )}
      <VoteStatusBar userVoteCount={userVoteCount} sessionId={sessionId} userKey={userKey} maxVotes={maxVotes} />
      <div className="grid gap-4 md:grid-cols-3">
        {format.columns.map((col) => (
          <VotingColumn
            key={col.id}
            columnId={col.id}
            columnLabel={col.label}
            columnColor={col.color}
            sessionId={sessionId}
            userKey={userKey}
            votesLeft={votesLeft}
          />
        ))}
      </div>
    </div>
  )
}
