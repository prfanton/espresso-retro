'use client'

import { useRef, useEffect } from 'react'

interface CardEditorProps {
  value: string
  placeholder?: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onTyping?: () => void
  hideButtons?: boolean
}

export default function CardEditor({
  value, placeholder, onChange, onSave, onCancel, onTyping, hideButtons,
}: CardEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const len = ref.current?.value.length ?? 0
    ref.current?.setSelectionRange(len, len)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          onTyping?.()
        }}
        onKeyDown={handleKeyDown}
        rows={3}
        className="w-full bg-white/70 border border-[#2d1200]/15 rounded-lg px-3 py-2 text-[#2d1200] text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#B83C28]/40 focus:border-[#B83C28]/30 placeholder-[#2d1200]/40 leading-relaxed"
      />
      {!hideButtons && (
        <div className="flex gap-2">
          <button
            onClick={onSave}
            className="flex-1 py-1.5 bg-[#B83C28] hover:bg-[#9c2e1a] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-[#2d1200]/8 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
