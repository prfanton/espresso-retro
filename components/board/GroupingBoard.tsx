'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useBoardStore } from '@/store/boardStore'
import type { RetroFormat, Card, CardGroup } from '@/types/retro'

// Derives a group name from a card's content: first few words, trimmed to a
// reasonable length. Guarantees a new group is always named after one of its
// cards, even when the AI naming endpoint is unavailable.
function deriveGroupName(content: string): string {
  const cleaned = content.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'Group'
  const words = cleaned.split(' ').slice(0, 4).join(' ')
  const name = words.length > 30 ? words.slice(0, 30).trim() + '…' : words
  return name || 'Group'
}

// Disables the "shuffle cards while dragging" animation — cards stay put and
// only the hover highlight communicates where a drop will land.
const noSortingStrategy: SortingStrategy = () => null

// Keeps the drag overlay centered on the cursor.
// adj = cursor_at_drag_start - card_center_at_drag_start (constant offset)
// overlay_center = card_origin + transform + adj = cursor_start + transform = current_cursor
const snapToPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (draggingNodeRect && activatorEvent instanceof PointerEvent) {
    return {
      ...transform,
      x: transform.x + activatorEvent.clientX - draggingNodeRect.left - draggingNodeRect.width / 2,
      y: transform.y + activatorEvent.clientY - draggingNodeRect.top - draggingNodeRect.height / 2,
    }
  }
  return transform
}

// ─── Drag-handle icon ────────────────────────────────────────────────────────

function DragHandle() {
  return (
    <svg className="w-3.5 h-3.5 text-[#2d1200]/30 shrink-0" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
      <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
      <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
    </svg>
  )
}

// ─── Draggable ungrouped card ─────────────────────────────────────────────────

function SortableCard({ card, overlay = false }: { card: Card; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const groupingHint = isOver && !isDragging

  return (
    <div
      ref={setNodeRef}
      style={overlay ? undefined : style}
      {...attributes}
      {...listeners}
      className={`flex items-start gap-2 p-3 rounded-xl border bg-white/60 shadow-sm text-sm text-[#2d1200] leading-relaxed transition-colors touch-none
        ${overlay
          ? 'shadow-lg rotate-1 border-[#B83C28]/40 bg-white/90 cursor-grabbing'
          : groupingHint
            ? 'border-[#B83C28]/60 bg-[#B83C28]/8 ring-2 ring-[#B83C28]/25 cursor-grab'
            : 'border-[#2d1200]/10 hover:border-[#2d1200]/25 cursor-grab active:cursor-grabbing'}
      `}
    >
      <span className="mt-0.5 shrink-0">
        <DragHandle />
      </span>
      <span className="flex-1 whitespace-pre-wrap break-words">{card.content}</span>
      {groupingHint && (
        <span className="shrink-0 mt-0.5 text-[#B83C28]/70 text-xs font-medium">Group</span>
      )}
    </div>
  )
}

// ─── Card inside a group ──────────────────────────────────────────────────────

function GroupCard({ card, groupId, onRemoveFromGroup }: {
  card: Card
  groupId: string
  onRemoveFromGroup: (cardId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card, groupId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
      {...attributes}
      {...listeners}
      className="flex items-start gap-2 p-2.5 rounded-lg border border-[#2d1200]/8 bg-white/50 text-sm text-[#2d1200] leading-relaxed group/card cursor-grab active:cursor-grabbing touch-none"
    >
      <span className="mt-0.5 shrink-0">
        <DragHandle />
      </span>
      <span className="flex-1 whitespace-pre-wrap break-words">{card.content}</span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemoveFromGroup(card.id)}
        title="Remove from group"
        className="opacity-0 group-hover/card:opacity-100 mt-0.5 text-[#2d1200]/30 hover:text-[#B83C28] transition-all shrink-0"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ─── Ungroup drop zone ────────────────────────────────────────────────────────

function UngroupZone({ columnId }: { columnId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `ungroup:${columnId}`,
    data: { type: 'ungroup', columnId },
  })

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-2.5 text-xs font-medium transition-colors ${
        isOver
          ? 'border-[#B83C28]/70 bg-[#B83C28]/10 text-[#B83C28]'
          : 'border-[#2d1200]/25 text-[#2d1200]/40'
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      Ungroup
    </div>
  )
}

// ─── Group container ──────────────────────────────────────────────────────────

function GroupContainer({ group, cards, columnId, onRename, onDissolve, onRemoveFromGroup }: {
  group: CardGroup
  cards: Card[]
  columnId: string
  onRename: (id: string, name: string) => void
  onDissolve: (id: string) => void
  onRemoveFromGroup: (cardId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(group.name)

  const { setNodeRef, isOver } = useSortable({
    id: `group:${group.id}`,
    data: { type: 'group', group, columnId },
  })

  function commitRename() {
    setEditing(false)
    if (nameVal.trim() && nameVal.trim() !== group.name) {
      onRename(group.id, nameVal.trim())
    } else {
      setNameVal(group.name)
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 p-2.5 transition-colors ${
        isOver ? 'border-[#B83C28]/50 bg-[#B83C28]/5' : 'border-[#2d1200]/15 bg-[#2d1200]/3'
      }`}
    >
      {/* Group header */}
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3.5 h-3.5 text-[#2d1200]/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>

        {editing ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameVal(group.name); setEditing(false) } }}
            className="flex-1 text-xs font-semibold text-[#2d1200] bg-transparent border-b border-[#B83C28] outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-xs font-semibold text-[#2d1200] text-left hover:text-[#B83C28] transition-colors truncate"
            title="Click to rename"
          >
            {group.name}
          </button>
        )}

        <span className="text-xs text-[#2d1200]/40 shrink-0">{cards.length}</span>

        <button
          onClick={() => onDissolve(group.id)}
          title="Dissolve group"
          className="text-[#2d1200]/30 hover:text-[#B83C28] transition-colors shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Cards inside group */}
      <SortableContext items={cards.map((c) => c.id)} strategy={noSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {cards.map((card) => (
            <GroupCard key={card.id} card={card} groupId={group.id} onRemoveFromGroup={onRemoveFromGroup} />
          ))}
          {cards.length === 0 && (
            <p className="text-xs text-[#2d1200]/30 text-center py-2">Drop cards here</p>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Droppable column ─────────────────────────────────────────────────────────

const DOT_IMG_MAP: Record<string, string> = {
  green: '/assets/green.png', red: '/assets/red.png', blue: '/assets/yellow.png', yellow: '/assets/yellow.png',
}

function GroupingColumn({
  columnId, columnLabel, columnColor, sessionId,
  ungroupedCards, groups, groupedCards,
  onRename, onDissolve, onRemoveFromGroup,
  isDropTarget, isDraggingGroupedCard,
}: {
  columnId: string
  columnLabel: string
  columnColor: string
  sessionId: string
  ungroupedCards: Card[]
  groups: CardGroup[]
  groupedCards: Record<string, Card[]>
  onRename: (id: string, name: string) => void
  onDissolve: (id: string) => void
  onRemoveFromGroup: (cardId: string) => void
  isDropTarget: boolean
  isDraggingGroupedCard: boolean
}) {
  const { setNodeRef, isOver } = useSortable({
    id: `col:${columnId}`,
    data: { type: 'column', columnId },
  })

  const totalCards = ungroupedCards.length + groups.reduce((s, g) => s + (groupedCards[g.id]?.length ?? 0), 0)
  const dotImg = DOT_IMG_MAP[columnColor] ?? '/assets/yellow.png'

  // items for ungrouped SortableContext: cards + group containers
  const ungroupedItems = ungroupedCards.map((c) => c.id)
  const groupItems = groups.map((g) => `group:${g.id}`)
  const columnItems = [...ungroupedItems, ...groupItems]

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-0 rounded-2xl p-4 border shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)] transition-colors
        ${isOver && isDropTarget ? 'border-[#B83C28]/40 bg-[#B83C28]/5' : 'border-white/40 bg-white/20'}
      `}
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <img src={dotImg} width={24} height={24} alt="" />
        <h3 className="font-semibold text-base text-[#2d1200]">{columnLabel}</h3>
        <span className="ml-auto text-xs text-[#2d1200]/60 font-medium">{totalCards}</span>
      </div>

      <SortableContext items={columnItems} strategy={noSortingStrategy}>
        <div className="flex flex-col gap-2 flex-1">
          {isDraggingGroupedCard && <UngroupZone columnId={columnId} />}
          {ungroupedCards.map((card) => (
            <SortableCard key={card.id} card={card} />
          ))}
          {groups.map((group) => (
            <GroupContainer
              key={group.id}
              group={group}
              cards={groupedCards[group.id] ?? []}
              columnId={columnId}
              onRename={onRename}
              onDissolve={onDissolve}
              onRemoveFromGroup={onRemoveFromGroup}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Main GroupingBoard ───────────────────────────────────────────────────────

interface GroupingBoardProps {
  format: RetroFormat
  sessionId: string
}

export default function GroupingBoard({ format, sessionId }: GroupingBoardProps) {
  const supabase = getSupabaseClient()
  const allCards = useBoardStore((s) => s.cards)
  const allGroups = useBoardStore((s) => s.groups)
  const applyCardUpsert = useBoardStore((s) => s.applyCardUpsert)
  const applyGroupUpsert = useBoardStore((s) => s.applyGroupUpsert)
  const applyGroupDelete = useBoardStore((s) => s.applyGroupDelete)

  const [activeCard, setActiveCard] = useState<Card | null>(null)
  // Track which column we're hovering over for drop target highlight
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Derived data per column
  const sessionCards = useMemo(
    () => Object.values(allCards).filter((c) => c.session_id === sessionId),
    [allCards, sessionId]
  )

  const sessionGroups = useMemo(
    () => Object.values(allGroups).filter((g) => g.session_id === sessionId),
    [allGroups, sessionId]
  )

  const ungroupedByColumn = useMemo(() => {
    const map: Record<string, Card[]> = {}
    for (const col of format.columns) {
      map[col.id] = sessionCards
        .filter((c) => c.column_id === col.id && !c.group_id)
        .sort((a, b) => a.position - b.position)
    }
    return map
  }, [sessionCards, format.columns])

  const groupsByColumn = useMemo(() => {
    const map: Record<string, CardGroup[]> = {}
    for (const col of format.columns) {
      map[col.id] = sessionGroups
        .filter((g) => g.column_id === col.id)
        .sort((a, b) => a.position - b.position)
    }
    return map
  }, [sessionGroups, format.columns])

  const cardsByGroup = useMemo(() => {
    const map: Record<string, Card[]> = {}
    for (const g of sessionGroups) {
      map[g.id] = sessionCards.filter((c) => c.group_id === g.id).sort((a, b) => a.position - b.position)
    }
    return map
  }, [sessionCards, sessionGroups])

  function getGroupColumnId(groupId: string): string | null {
    return allGroups[groupId]?.column_id ?? null
  }

  function resolveTargetColumn(overId: string): string | null {
    if (overId.startsWith('col:')) return overId.slice(4)
    if (overId.startsWith('group:')) return getGroupColumnId(overId.slice(6))
    if (overId.startsWith('ungroup:')) return overId.slice(8)
    const card = allCards[overId]
    if (card) return card.column_id
    return null
  }

  function onDragStart({ active }: DragStartEvent) {
    const data = active.data.current
    if (data?.type === 'card') setActiveCard(data.card as Card)
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) { setOverColumnId(null); return }
    const colId = resolveTargetColumn(String(over.id))
    setOverColumnId(colId)
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null)
    setOverColumnId(null)
    if (!over || active.id === over.id) return

    const activeData = active.data.current
    if (activeData?.type !== 'card') return

    const draggedCard: Card = activeData.card
    const overId = String(over.id)
    const overData = over.data.current

    // --- Drop on the UNGROUP zone ---
    if (overId.startsWith('ungroup:')) {
      if (!draggedCard.group_id) return
      const originalGroupId = draggedCard.group_id
      const originalGroupCardCount = cardsByGroup[originalGroupId]?.length ?? 0
      const targetColId = overId.slice(8)
      const updated = { ...draggedCard, group_id: null, column_id: targetColId }
      applyCardUpsert(updated)
      await supabase.from('cards').update({ group_id: null, column_id: targetColId }).eq('id', draggedCard.id)
      if (originalGroupCardCount <= 1) {
        applyGroupDelete(originalGroupId)
        await supabase.from('groups').delete().eq('id', originalGroupId)
      }
      return
    }

    // --- Drop on a GROUP container ---
    if (overId.startsWith('group:')) {
      const groupId = overId.slice(6)
      const group = allGroups[groupId]
      if (!group) return
      if (draggedCard.group_id === groupId) return // already in this group

      const originalGroupId = draggedCard.group_id
      const originalGroupCardCount = originalGroupId ? (cardsByGroup[originalGroupId]?.length ?? 0) : 0

      const updated = { ...draggedCard, group_id: groupId, column_id: group.column_id }
      applyCardUpsert(updated)
      await supabase.from('cards').update({ group_id: groupId, column_id: group.column_id }).eq('id', draggedCard.id)

      if (originalGroupId && originalGroupCardCount <= 1) {
        applyGroupDelete(originalGroupId)
        await supabase.from('groups').delete().eq('id', originalGroupId)
      }
      return
    }

    // --- Drop on a COLUMN (empty area) ---
    if (overId.startsWith('col:')) {
      const targetColId = overId.slice(4)
      if (draggedCard.group_id === null && draggedCard.column_id === targetColId) return

      const originalGroupId = draggedCard.group_id
      const originalGroupCardCount = originalGroupId ? (cardsByGroup[originalGroupId]?.length ?? 0) : 0

      const updated = { ...draggedCard, group_id: null, column_id: targetColId }
      applyCardUpsert(updated)
      await supabase.from('cards').update({ group_id: null, column_id: targetColId }).eq('id', draggedCard.id)

      if (originalGroupId && originalGroupCardCount <= 1) {
        applyGroupDelete(originalGroupId)
        await supabase.from('groups').delete().eq('id', originalGroupId)
      }
      return
    }

    // --- Drop on another CARD ---
    if (overData?.type === 'card') {
      const targetCard: Card = overData.card
      if (targetCard.id === draggedCard.id) return

      // If target card is already in a group → add dragged card to that group
      if (targetCard.group_id) {
        const group = allGroups[targetCard.group_id]
        if (!group) return

        const originalGroupId = draggedCard.group_id
        const originalGroupCardCount = originalGroupId ? (cardsByGroup[originalGroupId]?.length ?? 0) : 0

        const updated = { ...draggedCard, group_id: targetCard.group_id, column_id: group.column_id }
        applyCardUpsert(updated)
        await supabase.from('cards').update({ group_id: targetCard.group_id, column_id: group.column_id }).eq('id', draggedCard.id)

        if (originalGroupId && originalGroupCardCount <= 1) {
          applyGroupDelete(originalGroupId)
          await supabase.from('groups').delete().eq('id', originalGroupId)
        }
        return
      }

      // Both ungrouped → create new group in target card's column
      const targetColId = targetCard.column_id
      const existingGroupsInCol = groupsByColumn[targetColId] ?? []
      const newPosition = existingGroupsInCol.length

      // Create the group with a name derived from one of its cards, so it is
      // always meaningfully named even if the AI enhancement below is skipped.
      const initialName = deriveGroupName(targetCard.content) || deriveGroupName(draggedCard.content)
      const { data: newGroup } = await supabase
        .from('groups')
        .insert({ session_id: sessionId, column_id: targetColId, name: initialName, position: newPosition })
        .select()
        .single()

      if (!newGroup) return
      applyGroupUpsert(newGroup as CardGroup)

      // Move both cards into the group
      const updatedDragged = { ...draggedCard, group_id: newGroup.id, column_id: targetColId }
      const updatedTarget = { ...targetCard, group_id: newGroup.id }
      applyCardUpsert(updatedDragged)
      applyCardUpsert(updatedTarget)

      await supabase.from('cards').update({ group_id: newGroup.id, column_id: targetColId }).eq('id', draggedCard.id)
      await supabase.from('cards').update({ group_id: newGroup.id }).eq('id', targetCard.id)

      // AI rename — fire-and-forget, graceful fallback
      fetch('/api/group-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [draggedCard.content, targetCard.content] }),
      })
        .then((r) => r.json())
        .then(({ name }: { name: string }) => {
          if (name && name !== 'Group') {
            applyGroupUpsert({ ...(newGroup as CardGroup), name })
            supabase.from('groups').update({ name }).eq('id', newGroup.id)
          }
        })
        .catch(() => undefined)
      return
    }
  }

  const handleRenameGroup = useCallback(async (groupId: string, name: string) => {
    const group = allGroups[groupId]
    if (!group) return
    applyGroupUpsert({ ...group, name })
    await supabase.from('groups').update({ name }).eq('id', groupId)
  }, [allGroups, applyGroupUpsert, supabase])

  const handleDissolveGroup = useCallback(async (groupId: string) => {
    const group = allGroups[groupId]
    if (!group) return
    // Ungroup all cards first
    const cardsInGroup = (cardsByGroup[groupId] ?? [])
    for (const card of cardsInGroup) {
      applyCardUpsert({ ...card, group_id: null })
    }
    applyGroupDelete(groupId)
    await supabase.from('cards').update({ group_id: null }).eq('group_id', groupId)
    await supabase.from('groups').delete().eq('id', groupId)
  }, [allGroups, cardsByGroup, applyCardUpsert, applyGroupDelete, supabase])

  const handleRemoveFromGroup = useCallback(async (cardId: string) => {
    const card = allCards[cardId]
    if (!card || !card.group_id) return
    const groupId = card.group_id
    const groupCardCount = cardsByGroup[groupId]?.length ?? 0
    const updated = { ...card, group_id: null }
    applyCardUpsert(updated)
    await supabase.from('cards').update({ group_id: null }).eq('id', cardId)
    if (groupCardCount <= 1) {
      applyGroupDelete(groupId)
      await supabase.from('groups').delete().eq('id', groupId)
    }
  }, [allCards, cardsByGroup, applyCardUpsert, applyGroupDelete, supabase])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-[#2d1200]/80">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Drag cards onto each other to group them. Drag into another column to move. Click a group name to rename it.
      </div>

      <SortableContext items={format.columns.map((c) => `col:${c.id}`)} strategy={noSortingStrategy}>
        <div className="grid gap-4 md:grid-cols-3">
          {format.columns.map((col) => (
            <GroupingColumn
              key={col.id}
              columnId={col.id}
              columnLabel={col.label}
              columnColor={col.color}
              sessionId={sessionId}
              ungroupedCards={ungroupedByColumn[col.id] ?? []}
              groups={groupsByColumn[col.id] ?? []}
              groupedCards={cardsByGroup}
              onRename={handleRenameGroup}
              onDissolve={handleDissolveGroup}
              onRemoveFromGroup={handleRemoveFromGroup}
              isDropTarget={overColumnId === col.id}
              isDraggingGroupedCard={activeCard?.group_id != null}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay modifiers={[snapToPointer]}>
        {activeCard && <SortableCard card={activeCard} overlay />}
      </DragOverlay>
    </DndContext>
  )
}
