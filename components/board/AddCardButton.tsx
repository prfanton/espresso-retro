'use client'

import { useState } from 'react'
import { useBoardStore } from '@/store/boardStore'
import CardEditor from './CardEditor'
import type { Card } from '@/types/retro'

interface AddCardButtonProps {
  sessionId: string
  columnId: string
  userKey: string
  displayName: string
  placeholder?: string
  onBroadcastTyping: (cardId: string) => void
}

export default function AddCardButton({
  sessionId, columnId, userKey, placeholder, onBroadcastTyping,
}: AddCardButtonProps) {
  const [adding, setAdding] = useState(false)
  const [content, setContent] = useState('')
  const addOptimisticCard = useBoardStore((s) => s.addOptimisticCard)
  const confirmOptimisticCard = useBoardStore((s) => s.confirmOptimisticCard)
  const removeOptimisticCard = useBoardStore((s) => s.removeOptimisticCard)
  const cards = useBoardStore((s) => s.cards)

  async function handleSave() {
    const trimmed = content.trim()
    if (!trimmed) {
      setAdding(false)
      setContent('')
      return
    }

    const maxPos = Math.max(0, ...Object.values(cards)
      .filter((c) => c.column_id === columnId && c.session_id === sessionId)
      .map((c) => c.position))

    const now = new Date().toISOString()
    const tempId = `temp_${Date.now()}`
    const optimistic: Card = {
      id: tempId,
      session_id: sessionId,
      column_id: columnId,
      author_key: userKey,
      content: trimmed,
      created_at: now,
      updated_at: now,
      position: maxPos + 1000,
      group_id: null,
    }

    addOptimisticCard(optimistic)
    setAdding(false)
    setContent('')

    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          column_id: columnId,
          author_key: userKey,
          content: trimmed,
          position: maxPos + 1000,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const serverCard = await res.json()
      confirmOptimisticCard(tempId, serverCard)
    } catch {
      removeOptimisticCard(tempId)
    }
  }

  function handleCancel() {
    setAdding(false)
    setContent('')
  }

  if (adding) {
    return (
      <div className="bg-[#FBF7F6] border border-[#2d1200]/12 rounded-xl p-3.5 shadow-[0_2px_12px_rgba(45,18,0,0.08)]">
        <CardEditor
          value={content}
          placeholder={placeholder}
          onChange={setContent}
          onSave={handleSave}
          onCancel={handleCancel}
          onTyping={() => onBroadcastTyping('new')}
          hideButtons
        />
        <div className="flex gap-2 mt-2 pt-2 border-t border-[#2d1200]/8">
          <button
            onClick={handleSave}
            className="px-3 py-1.5 bg-[#B83C28] hover:bg-[#9c2e1a] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Add card
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 bg-[#2d1200]/6 hover:bg-[#2d1200]/12 text-[#2d1200]/55 text-xs font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <span className="text-[#2d1200]/40 text-xs self-center">⌘↵ to add</span>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setAdding(true)}
      className="w-full flex items-center gap-2 px-3 py-2.5 border border-dashed border-[#2d1200]/25 hover:border-[#B83C28]/60 rounded-xl text-[#2d1200]/45 hover:text-[#B83C28] text-sm transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Add a card
    </button>
  )
}
