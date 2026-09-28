'use client'

import { useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useBoardStore } from '@/store/boardStore'
import { usePresenceStore } from '@/store/presenceStore'
import CardEditor from './CardEditor'
import PresenceAvatar from '@/components/presence/PresenceAvatar'
import type { Card, Vote } from '@/types/retro'

interface RetroCardProps {
  card: Card
  votes: Vote[]
  userKey: string
  isRevealed: boolean
  isLocked: boolean
  canVote: boolean
  displayName: string
  onBroadcastTyping: (cardId: string) => void
  participants: Record<string, string>
}

export default function RetroCard({
  card, votes, userKey, isRevealed, isLocked, canVote, displayName, onBroadcastTyping, participants,
}: RetroCardProps) {
  const supabase = getSupabaseClient()
  const applyCardDelete = useBoardStore((s) => s.applyCardDelete)
  const applyCardUpsert = useBoardStore((s) => s.applyCardUpsert)
  const applyVoteInsert = useBoardStore((s) => s.applyVoteInsert)
  const applyVoteDelete = useBoardStore((s) => s.applyVoteDelete)
  const typingCards = usePresenceStore((s) => s.typingCards)

  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(card.content)
  const [saving, setSaving] = useState(false)

  const isAuthor = card.author_key === userKey
  const isVisible = isRevealed || isAuthor
  const hasVoted = votes.some((v) => v.user_key === userKey)
  const voteCount = votes.length
  const typingUser = typingCards[card.id]
  const isOtherTyping = typingUser && typingUser.user_key !== userKey
  const authorName = participants[card.author_key] ?? 'Unknown'
  const canDelete = isAuthor && !isLocked
  const showFooter = isRevealed || isOtherTyping || canDelete

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setEditing(false)
    await supabase
      .from('cards')
      .update({ content: editContent, updated_at: new Date().toISOString() })
      .eq('id', card.id)
    setSaving(false)
  }

  function handleCancelEdit() {
    setEditContent(card.content)
    setEditing(false)
  }

  async function handleDelete() {
    applyCardDelete(card.id)
    // RLS (cards_delete: author_key = auth.uid()) filters rather than errors,
    // so a rejected delete affects zero rows — restore the card in that case.
    const { data, error } = await supabase.from('cards').delete().eq('id', card.id).select('id')
    if (error || !data?.length) applyCardUpsert(card)
  }

  async function handleVote() {
    if (!canVote) return
    if (hasVoted) {
      applyVoteDelete({ card_id: card.id, user_key: userKey })
      await supabase.from('votes').delete().eq('card_id', card.id).eq('user_key', userKey)
    } else {
      const optimistic = { id: crypto.randomUUID(), card_id: card.id, user_key: userKey, created_at: new Date().toISOString() }
      applyVoteInsert(optimistic)
      await supabase.from('votes').upsert({ card_id: card.id, user_key: userKey }, { onConflict: 'card_id,user_key' })
    }
  }

  return (
    <div
      className={`relative border rounded-xl p-3.5 group transition-all shadow-sm bg-white/50 backdrop-blur-md ${
        isOtherTyping
          ? 'border-[#B83C28] shadow-[0_0_0_2px_rgba(184,60,40,0.2)]'
          : 'border-[#2d1200]/10'
      }`}
    >
      {/* Content */}
      <div className="min-h-[3rem]">
        {editing ? (
          <CardEditor
            value={editContent}
            placeholder="Type your thoughts…"
            onChange={setEditContent}
            onSave={handleSave}
            onCancel={handleCancelEdit}
            onTyping={() => onBroadcastTyping(card.id)}
          />
        ) : isVisible ? (
          <p
            className={`text-sm text-[#2d1200] leading-relaxed whitespace-pre-wrap break-words ${isAuthor && !isLocked ? 'cursor-pointer' : ''}`}
            onClick={() => isAuthor && !isLocked && setEditing(true)}
          >
            {card.content || <span className="text-[#2d1200]/65 italic">Empty card</span>}
          </p>
        ) : (
          <div className="flex items-center justify-center h-8">
            <span className="text-[#2d1200]/65 text-sm">Hidden until reveal</span>
          </div>
        )}
      </div>

      {/* Footer — author/votes only after reveal; typing + delete also while writing */}
      {showFooter && <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2d1200]/10">
        <div className="flex items-center gap-1.5">
          {isRevealed && (
            <>
              <PresenceAvatar displayName={authorName} size="sm" ringClass="ring-[#DFE0D8]" />
              <span className="text-xs text-[#2d1200]/65">{authorName}</span>
            </>
          )}
          {isOtherTyping && (
            <span className="text-xs text-[#B83C28] animate-pulse">typing…</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isRevealed && (
            <button
              onClick={handleVote}
              disabled={!canVote}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                hasVoted
                  ? 'bg-[#B83C28] text-white'
                  : 'bg-[#2d1200]/8 text-[#2d1200]/65 hover:bg-[#2d1200]/15 hover:text-[#2d1200]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <svg className="w-3.5 h-3.5" fill={hasVoted ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              {voteCount}
            </button>
          )}

          {canDelete && (
            <button
              onClick={handleDelete}
              // Hover-reveal on desktop; always visible on small/touch screens
              // (hover never fires there) and when focused via keyboard.
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 max-sm:opacity-100 pointer-coarse:opacity-100 p-1 rounded-md text-[#2d1200]/65 hover:text-red-500 hover:bg-red-50 transition-all"
              title="Delete card"
              aria-label="Delete card"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>}

      {saving && (
        <div className="absolute inset-0 rounded-xl bg-white/60 backdrop-blur-md flex items-center justify-center">
          <span className="text-xs text-[#2d1200]/65">Saving…</span>
        </div>
      )}
    </div>
  )
}
