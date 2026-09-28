'use client'

import { create } from 'zustand'
import type { Session, Card, Vote, CardGroup, Reaction } from '@/types/retro'

interface BoardStore {
  session: Session | null
  cards: Record<string, Card>
  votes: Record<string, Vote[]>
  groups: Record<string, CardGroup>
  // reactions[card_id] = Reaction[]
  reactions: Record<string, Reaction[]>
  optimisticCards: Record<string, Card>
  isLoaded: boolean

  setSession: (session: Session) => void
  setCards: (cards: Card[]) => void
  setVotes: (votes: Vote[]) => void
  setGroups: (groups: CardGroup[]) => void
  setReactions: (reactions: Reaction[]) => void
  setLoaded: (loaded: boolean) => void

  applyCardUpsert: (card: Card) => void
  applyCardDelete: (id: string) => void
  applyVoteInsert: (vote: Vote) => void
  applyVoteDelete: (vote: { card_id: string; user_key: string }) => void
  applyVoteDeleteById: (id: string) => void
  applyGroupUpsert: (group: CardGroup) => void
  applyGroupDelete: (id: string) => void
  applyReactionInsert: (reaction: Reaction) => void
  applyReactionDelete: (reaction: { card_id: string; user_key: string; emoji: string }) => void
  applyReactionDeleteById: (id: string) => void

  addOptimisticCard: (card: Card) => void
  confirmOptimisticCard: (tempId: string, serverCard: Card) => void
  removeOptimisticCard: (tempId: string) => void
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  session: null,
  cards: {},
  votes: {},
  groups: {},
  reactions: {},
  optimisticCards: {},
  isLoaded: false,

  setSession: (session) => set({ session }),
  setLoaded: (isLoaded) => set({ isLoaded }),

  setCards: (cards) => {
    const map: Record<string, Card> = {}
    for (const c of cards) map[c.id] = c
    set({ cards: map })
  },

  setVotes: (votes) => {
    const map: Record<string, Vote[]> = {}
    for (const v of votes) {
      if (!map[v.card_id]) map[v.card_id] = []
      map[v.card_id].push(v)
    }
    set({ votes: map })
  },

  setGroups: (groups) => {
    const map: Record<string, CardGroup> = {}
    for (const g of groups) map[g.id] = g
    set({ groups: map })
  },

  applyCardUpsert: (card) => {
    const { optimisticCards } = get()
    const tempId = Object.keys(optimisticCards).find((tid) => {
      const opt = optimisticCards[tid]
      return (
        opt.author_key === card.author_key &&
        opt.column_id === card.column_id &&
        opt.session_id === card.session_id &&
        Math.abs(new Date(opt.created_at).getTime() - new Date(card.created_at).getTime()) < 5000
      )
    })

    if (tempId) {
      set((state) => {
        const { [tempId]: _, ...rest } = state.optimisticCards
        return {
          cards: { ...state.cards, [card.id]: card },
          optimisticCards: rest,
        }
      })
    } else {
      set((state) => ({ cards: { ...state.cards, [card.id]: card } }))
    }
  },

  // Realtime DELETE events can't be session-filtered, so ids from other
  // sessions arrive here too — ignore anything this board doesn't hold.
  applyCardDelete: (id) =>
    set((state) => {
      if (!(id in state.cards) && !(id in state.votes)) return state
      const { [id]: _, ...rest } = state.cards
      const { [id]: __, ...restVotes } = state.votes
      return { cards: rest, votes: restVotes }
    }),

  // A server row replaces the optimistic one for the same (card, user), so the
  // store holds the real id that a later realtime DELETE event refers to.
  applyVoteInsert: (vote) =>
    set((state) => {
      const existing = state.votes[vote.card_id] ?? []
      const match = existing.find((v) => v.user_key === vote.user_key)
      if (match?.id === vote.id) return state
      const next = match ? existing.map((v) => (v === match ? vote : v)) : [...existing, vote]
      return { votes: { ...state.votes, [vote.card_id]: next } }
    }),

  applyVoteDelete: ({ card_id, user_key }) =>
    set((state) => ({
      votes: {
        ...state.votes,
        [card_id]: (state.votes[card_id] ?? []).filter((v) => v.user_key !== user_key),
      },
    })),

  // Realtime DELETE payloads only carry the primary key (RLS is on), so
  // remote removals are matched by id.
  applyVoteDeleteById: (id) =>
    set((state) => {
      const cardId = Object.keys(state.votes).find((cid) => state.votes[cid].some((v) => v.id === id))
      if (!cardId) return state
      return { votes: { ...state.votes, [cardId]: state.votes[cardId].filter((v) => v.id !== id) } }
    }),

  applyGroupUpsert: (group) =>
    set((state) => ({ groups: { ...state.groups, [group.id]: group } })),

  setReactions: (reactions) => {
    const map: Record<string, Reaction[]> = {}
    for (const r of reactions) {
      if (!map[r.card_id]) map[r.card_id] = []
      map[r.card_id].push(r)
    }
    set({ reactions: map })
  },

  applyReactionInsert: (reaction) =>
    set((state) => {
      const existing = state.reactions[reaction.card_id] ?? []
      const match = existing.find((r) => r.user_key === reaction.user_key && r.emoji === reaction.emoji)
      if (match?.id === reaction.id) return state
      const next = match ? existing.map((r) => (r === match ? reaction : r)) : [...existing, reaction]
      return { reactions: { ...state.reactions, [reaction.card_id]: next } }
    }),

  applyReactionDelete: ({ card_id, user_key, emoji }) =>
    set((state) => ({
      reactions: {
        ...state.reactions,
        [card_id]: (state.reactions[card_id] ?? []).filter(
          (r) => !(r.user_key === user_key && r.emoji === emoji)
        ),
      },
    })),

  applyReactionDeleteById: (id) =>
    set((state) => {
      const cardId = Object.keys(state.reactions).find((cid) => state.reactions[cid].some((r) => r.id === id))
      if (!cardId) return state
      return { reactions: { ...state.reactions, [cardId]: state.reactions[cardId].filter((r) => r.id !== id) } }
    }),

  applyGroupDelete: (id) =>
    set((state) => {
      if (!(id in state.groups) && !Object.values(state.cards).some((c) => c.group_id === id)) return state
      const { [id]: _, ...rest } = state.groups
      // Ungroup cards that belonged to this group
      const updatedCards: Record<string, Card> = {}
      for (const [cid, card] of Object.entries(state.cards)) {
        updatedCards[cid] = card.group_id === id ? { ...card, group_id: null } : card
      }
      return { groups: rest, cards: updatedCards }
    }),

  addOptimisticCard: (card) =>
    set((state) => ({
      optimisticCards: { ...state.optimisticCards, [card.id]: card },
    })),

  confirmOptimisticCard: (tempId, serverCard) =>
    set((state) => {
      const { [tempId]: _, ...rest } = state.optimisticCards
      return {
        cards: { ...state.cards, [serverCard.id]: serverCard },
        optimisticCards: rest,
      }
    }),

  removeOptimisticCard: (tempId) =>
    set((state) => {
      const { [tempId]: _, ...rest } = state.optimisticCards
      return { optimisticCards: rest }
    }),
}))
