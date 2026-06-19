'use client'

import { useState, useMemo } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useBoardStore } from '@/store/boardStore'
import type { RetroFormat, Card } from '@/types/retro'

const EMOJI_OPTIONS = ['👍', '❤️', '🎉', '💡', '🔥', '😮', '😢', '👎']

interface ResultsViewProps {
  format: RetroFormat
  sessionId: string
  userKey: string
  onExport: () => void
}

// ─── Reaction bar per card ────────────────────────────────────────────────────

function ReactionBar({ cardId, userKey }: { cardId: string; userKey: string }) {
  const supabase = getSupabaseClient()
  const reactions = useBoardStore((s) => s.reactions)
  const applyReactionInsert = useBoardStore((s) => s.applyReactionInsert)
  const applyReactionDelete = useBoardStore((s) => s.applyReactionDelete)
  const [pickerOpen, setPickerOpen] = useState(false)

  const cardReactions = reactions[cardId] ?? []

  // Group by emoji: emoji → { count, hasReacted }
  const grouped = useMemo(() => {
    const map: Record<string, { count: number; hasReacted: boolean }> = {}
    for (const r of cardReactions) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, hasReacted: false }
      map[r.emoji].count++
      if (r.user_key === userKey) map[r.emoji].hasReacted = true
    }
    return map
  }, [cardReactions, userKey])

  async function toggleReaction(emoji: string) {
    setPickerOpen(false)
    if (grouped[emoji]?.hasReacted) {
      applyReactionDelete({ card_id: cardId, user_key: userKey, emoji })
      await supabase.from('reactions').delete().eq('card_id', cardId).eq('user_key', userKey).eq('emoji', emoji)
    } else {
      const newReaction = { id: crypto.randomUUID(), card_id: cardId, user_key: userKey, emoji, created_at: new Date().toISOString() }
      applyReactionInsert(newReaction)
      await supabase.from('reactions').insert({ card_id: cardId, user_key: userKey, emoji })
    }
  }

  return (
    <div className="relative flex items-center flex-wrap gap-1 mt-2">
      {/* Existing reactions */}
      {Object.entries(grouped).map(([emoji, { count, hasReacted }]) => (
        <button
          key={emoji}
          onClick={() => toggleReaction(emoji)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border transition-colors ${
            hasReacted
              ? 'bg-[#B83C28]/10 border-[#B83C28]/40 text-[#2d1200]'
              : 'bg-white/40 border-[#2d1200]/15 text-[#2d1200]/70 hover:bg-white/70'
          }`}
        >
          {emoji}
          <span className="text-xs font-medium">{count}</span>
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs border border-dashed border-[#2d1200]/20 text-[#2d1200]/40 hover:border-[#2d1200]/40 hover:text-[#2d1200]/70 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          React
        </button>

        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div className="absolute left-0 bottom-full mb-1 z-20 bg-white rounded-xl shadow-lg border border-[#2d1200]/10 p-1.5 flex gap-0.5">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-lg hover:bg-[#2d1200]/8 transition-colors ${
                    grouped[emoji]?.hasReacted ? 'bg-[#B83C28]/10' : ''
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Center panel card ────────────────────────────────────────────────────────

function CenterCard({ card, userKey, voteCount, showVotes = true, dotImg }: { card: Card; userKey: string; voteCount: number; showVotes?: boolean; dotImg?: string }) {
  return (
    <div className="py-4 border-b border-[#2d1200]/8 last:border-0">
      <div className="flex items-start gap-3">
        {showVotes && voteCount > 0 && (
          <div className="shrink-0 mt-0.5 flex items-center gap-1 text-[#B83C28] text-xs font-semibold">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5 15l7-7 7 7" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            {voteCount}
          </div>
        )}
        {dotImg && <img src={dotImg} width={18} height={18} alt="" className="shrink-0 mt-0.5" />}
        <div className="flex-1">
          <p className="text-sm text-[#2d1200] leading-relaxed whitespace-pre-wrap break-words">{card.content}</p>
          <ReactionBar cardId={card.id} userKey={userKey} />
        </div>
      </div>
    </div>
  )
}

// ─── Main ResultsView ─────────────────────────────────────────────────────────

type SidebarItem =
  | { kind: 'group'; id: string; name: string; totalVotes: number; cards: Card[] }
  | { kind: 'card'; id: string; card: Card; voteCount: number }

export default function ResultsView({ format, sessionId, userKey, onExport }: ResultsViewProps) {
  const allCards = useBoardStore((s) => s.cards)
  const allGroups = useBoardStore((s) => s.groups)
  const votes = useBoardStore((s) => s.votes)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const sessionCards = useMemo(
    () => Object.values(allCards).filter((c) => c.session_id === sessionId),
    [allCards, sessionId]
  )

  const sessionGroups = useMemo(
    () => Object.values(allGroups).filter((g) => g.session_id === sessionId),
    [allGroups, sessionId]
  )

  // Build sidebar items across all columns, sorted by votes desc
  const sidebarItems = useMemo((): SidebarItem[] => {
    const items: SidebarItem[] = []

    for (const group of sessionGroups) {
      const cards = sessionCards
        .filter((c) => c.group_id === group.id)
        .sort((a, b) => a.position - b.position)
      const totalVotes = cards.reduce((s, c) => s + (votes[c.id]?.length ?? 0), 0)
      items.push({ kind: 'group', id: group.id, name: group.name, totalVotes, cards })
    }

    for (const card of sessionCards.filter((c) => !c.group_id)) {
      const voteCount = votes[card.id]?.length ?? 0
      items.push({ kind: 'card', id: card.id, card, voteCount })
    }

    return items.sort((a, b) => {
      const va = a.kind === 'group' ? a.totalVotes : a.voteCount
      const vb = b.kind === 'group' ? b.totalVotes : b.voteCount
      return vb - va
    })
  }, [sessionGroups, sessionCards, votes])

  // Auto-select first item
  const activeId = selectedId ?? sidebarItems[0]?.id ?? null
  const activeIndex = sidebarItems.findIndex((i) => i.id === activeId)
  const activeItem = sidebarItems[activeIndex] ?? null
  const nextItem = activeIndex >= 0 ? sidebarItems[activeIndex + 1] ?? null : null

  const DOT_IMG_MAP: Record<string, string> = {
    green: '/assets/green.png', red: '/assets/red.png', blue: '/assets/yellow.png', yellow: '/assets/yellow.png',
  }

  function columnDotImg(columnId: string) {
    const col = format.columns.find((c) => c.id === columnId)
    return col ? (DOT_IMG_MAP[col.color] ?? '/assets/yellow.png') : '/assets/yellow.png'
  }

  function columnLabel(columnId: string) {
    return format.columns.find((c) => c.id === columnId)?.label ?? ''
  }

  return (
    <div className="flex gap-6 h-full min-h-[600px]">
      {/* ── Left sidebar ── */}
      <aside className="w-64 shrink-0 flex flex-col gap-1 overflow-y-auto rounded-2xl border border-white/40 bg-white/20 shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)] p-3" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
        {sidebarItems.map((item) => {
          const isActive = item.id === activeId
          if (item.kind === 'group') {
            const dotImg = item.cards[0] ? columnDotImg(item.cards[0].column_id) : '/assets/yellow.png'
            return (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                  isActive ? 'bg-white/50 shadow-sm' : 'hover:bg-white/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <img src={dotImg} width={24} height={24} alt="" className="shrink-0" />
                  <span className="flex-1 text-xs font-semibold text-[#2d1200] truncate">{item.name}</span>
                  {item.totalVotes > 0 && (
                    <span className="text-xs text-[#B83C28] font-semibold shrink-0">▲{item.totalVotes}</span>
                  )}
                </div>
                <p className="mt-0.5 ml-3.5 text-[11px] text-[#2d1200]/40">{item.cards.length} cards</p>
              </button>
            )
          }
          // Ungrouped card
          return (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                isActive ? 'bg-white/50 shadow-sm' : 'hover:bg-white/30'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1`} style={{ background: 'transparent', border: '1.5px solid', borderColor: 'rgba(45,18,0,0.25)' }} />
                <span className="flex-1 text-xs text-[#2d1200]/80 line-clamp-2 leading-relaxed">{item.card.content}</span>
                {item.voteCount > 0 && (
                  <span className="text-xs text-[#B83C28] font-semibold shrink-0">▲{item.voteCount}</span>
                )}
              </div>
            </button>
          )
        })}

        {sidebarItems.length === 0 && (
          <p className="text-xs text-[#2d1200]/30 text-center py-8">No cards yet</p>
        )}

        {/* Export */}
        <div className="mt-auto pt-4">
          <button
            onClick={onExport}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#B83C28] text-white font-medium text-xs hover:bg-[#9a3121] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      </aside>

      {/* ── Center panel ── */}
      <main className="flex-1 min-w-0 rounded-2xl border border-white/40 bg-white/30 shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)] p-6" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
        {activeItem ? (
          activeItem.kind === 'group' ? (
            <div>
              {/* Group header */}
              <div className="flex items-center gap-2 mb-6">
                <svg className="w-4 h-4 text-[#2d1200]/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h2 className="text-lg font-semibold text-[#2d1200]">{activeItem.name}</h2>
                <div className="flex items-center gap-1.5 ml-2">
                  {activeItem.cards[0] && (
                    <>
                      <img src={columnDotImg(activeItem.cards[0].column_id)} width={24} height={24} alt="" />
                      <span className="text-xs text-[#2d1200]/50">{columnLabel(activeItem.cards[0].column_id)}</span>
                    </>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {activeItem.totalVotes > 0 && (
                    <span className="text-sm font-semibold text-[#B83C28]">▲ {activeItem.totalVotes} votes</span>
                  )}
                  {nextItem && (
                    <button onClick={() => setSelectedId(nextItem.id)} className="text-xs text-[#2d1200]/50 hover:text-[#B83C28] transition-colors whitespace-nowrap">
                      next card →
                    </button>
                  )}
                </div>
              </div>
              <div>
                {activeItem.cards.map((card) => (
                  <CenterCard key={card.id} card={card} userKey={userKey} voteCount={votes[card.id]?.length ?? 0} showVotes={false} dotImg={columnDotImg(card.column_id)} />
                ))}
              </div>
            </div>
          ) : (
            <div>
              {/* Ungrouped card header */}
              <div className="flex items-center gap-2 mb-6">
                <img src={columnDotImg(activeItem.card.column_id)} width={24} height={24} alt="" />
                <span className="text-xs text-[#2d1200]/50">{columnLabel(activeItem.card.column_id)}</span>
                <div className="ml-auto flex items-center gap-2">
                  {activeItem.voteCount > 0 && (
                    <span className="text-sm font-semibold text-[#B83C28]">▲ {activeItem.voteCount} votes</span>
                  )}
                  {nextItem && (
                    <button onClick={() => setSelectedId(nextItem.id)} className="text-xs text-[#2d1200]/50 hover:text-[#B83C28] transition-colors whitespace-nowrap">
                      next card →
                    </button>
                  )}
                </div>
              </div>
              <CenterCard card={activeItem.card} userKey={userKey} voteCount={activeItem.voteCount} />
            </div>
          )
        ) : (
          <p className="text-sm text-[#2d1200]/30 text-center py-16">Select an item from the sidebar</p>
        )}
      </main>
    </div>
  )
}
