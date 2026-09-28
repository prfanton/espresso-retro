'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useBoardStore } from '@/store/boardStore'
import { usePresenceStore } from '@/store/presenceStore'
import type { Card, Vote, Session, PresenceUser, CardGroup, Reaction } from '@/types/retro'

interface UseRetroChannelOptions {
  sessionId: string
  userKey: string
  displayName: string
  onPresenceSync?: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPayload = { new: any; old: any; payload: any }

export interface TimerState {
  totalSeconds: number
  running: boolean
  ts: number
}

export function useRetroChannel({ sessionId, userKey, displayName, onPresenceSync }: UseRetroChannelOptions) {
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>['channel']> | null>(null)
  const {
    setSession, setCards, setVotes, setGroups, setReactions, setLoaded,
    applyCardUpsert, applyCardDelete,
    applyVoteInsert, applyVoteDeleteById,
    applyGroupUpsert, applyGroupDelete,
    applyReactionInsert, applyReactionDeleteById,
  } = useBoardStore.getState()
  const { setParticipants, setTyping, clearTyping } = usePresenceStore.getState()

  const typingTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const readyRef = useRef(false)

  const [timerState, setTimerState] = useState<TimerState | null>(null)
  const [resultsNavigatedId, setResultsNavigatedId] = useState<string | null>(null)

  async function fetchInitialData() {
    const supabase = getSupabaseClient()
    const [cardsRes, groupsRes] = await Promise.all([
      supabase.from('cards').select('*').eq('session_id', sessionId),
      supabase.from('groups').select('*').eq('session_id', sessionId),
    ])
    const cards = (cardsRes.data ?? []) as Card[]
    setCards(cards)
    setGroups((groupsRes.data ?? []) as CardGroup[])

    const cardIds = cards.map((c) => c.id)
    if (cardIds.length > 0) {
      const [votesRes, reactionsRes] = await Promise.all([
        supabase.from('votes').select('*').in('card_id', cardIds),
        supabase.from('reactions').select('*').in('card_id', cardIds),
      ])
      if (votesRes.data) setVotes(votesRes.data as Vote[])
      if (reactionsRes.data) setReactions(reactionsRes.data as Reaction[])
    } else {
      setVotes([])
      setReactions([])
    }
    setLoaded(true)
  }

  useEffect(() => {
    if (!sessionId || !userKey || !displayName) return

    const supabase = getSupabaseClient()
    const channelName = `retro:${sessionId}`
    let cancelled = false

    // Private channels gate broadcast + presence to authenticated session
    // members via the realtime.messages RLS policy, closing the open-internet
    // forgery surface on TIMER_SYNC / RESULTS_NAVIGATE / CARD_TYPING.
    const channel = supabase.channel(channelName, {
      config: { private: true, presence: { key: userKey } },
    })

    channelRef.current = channel

    // DELETE events: RLS isn't applied to deletes, so with RLS on Realtime
    // sends only the primary key in `old` (even with REPLICA IDENTITY FULL).
    // There's no session_id to filter or match on, so DELETE subscriptions are
    // unfiltered and removals are applied by id; ids this board doesn't hold
    // (other sessions' rows) are ignored by the store.
    const deletedId = (payload: AnyPayload) => (payload.old as { id?: string } | null)?.id
    // votes/reactions have no session_id column: scope inserts to this board's cards.
    const isOwnCard = (cardId: string) => cardId in useBoardStore.getState().cards

    // Postgres Changes: cards
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'cards', filter: `session_id=eq.${sessionId}` },
      (payload: AnyPayload) => applyCardUpsert(payload.new as Card)
    )
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'cards', filter: `session_id=eq.${sessionId}` },
      (payload: AnyPayload) => applyCardUpsert(payload.new as Card)
    )
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'cards' },
      (payload: AnyPayload) => {
        const id = deletedId(payload)
        if (id) applyCardDelete(id)
      }
    )

    // Postgres Changes: votes
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'votes' },
      (payload: AnyPayload) => {
        const vote = payload.new as Vote
        if (isOwnCard(vote.card_id)) applyVoteInsert(vote)
      }
    )
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'votes' },
      (payload: AnyPayload) => {
        const id = deletedId(payload)
        if (id) applyVoteDeleteById(id)
      }
    )

    // Postgres Changes: groups
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'groups', filter: `session_id=eq.${sessionId}` },
      (payload: AnyPayload) => applyGroupUpsert(payload.new as CardGroup)
    )
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'groups', filter: `session_id=eq.${sessionId}` },
      (payload: AnyPayload) => applyGroupUpsert(payload.new as CardGroup)
    )
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'groups' },
      (payload: AnyPayload) => {
        const id = deletedId(payload)
        if (id) applyGroupDelete(id)
      }
    )

    // Postgres Changes: reactions
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'reactions' },
      (payload: AnyPayload) => {
        const reaction = payload.new as Reaction
        if (isOwnCard(reaction.card_id)) applyReactionInsert(reaction)
      }
    )
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'reactions' },
      (payload: AnyPayload) => {
        const id = deletedId(payload)
        if (id) applyReactionDeleteById(id)
      }
    )

    // Postgres Changes: sessions
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      (payload: AnyPayload) => setSession(payload.new as Session)
    )

    // Presence
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, PresenceUser[]>
      // A single user_key can briefly hold more than one presence meta — e.g.
      // after re-tracking to update the "ready" flag. Collapse each key to its
      // most recent meta so a participant is never listed (or counted) twice.
      const participants = Object.values(state).map((metas) =>
        metas.reduce((latest, p) => (p.online_at > latest.online_at ? p : latest))
      )
      setParticipants(participants)
      onPresenceSync?.()
    })

    // Broadcast: typing indicator
    channel.on('broadcast', { event: 'CARD_TYPING' }, (payload: AnyPayload) => {
      const { cardId, user_key: typingUserKey, display_name } = payload.payload as {
        cardId: string; user_key: string; display_name: string
      }
      if (typingUserKey === userKey) return

      setTyping(cardId, { user_key: typingUserKey, display_name })

      if (typingTimeouts.current[cardId]) clearTimeout(typingTimeouts.current[cardId])
      typingTimeouts.current[cardId] = setTimeout(() => {
        clearTyping(cardId)
        delete typingTimeouts.current[cardId]
      }, 3000)
    })

    // Broadcast: timer sync
    channel.on('broadcast', { event: 'TIMER_SYNC' }, (payload: AnyPayload) => {
      const { totalSeconds, running } = payload.payload as { totalSeconds: number; running: boolean }
      setTimerState({ totalSeconds, running, ts: Date.now() })
    })

    // Broadcast: results navigation
    channel.on('broadcast', { event: 'RESULTS_NAVIGATE' }, (payload: AnyPayload) => {
      const { itemId } = payload.payload as { itemId: string }
      setResultsNavigatedId(itemId)
    })

    // Attach the current auth JWT to the realtime socket BEFORE subscribing.
    // subscribe() is what triggers the private-channel authorization; if it runs
    // before setAuth resolves, the join is evaluated as `anon`, the
    // realtime.messages RLS policy denies it, and the channel never reaches
    // SUBSCRIBED (so fetchInitialData never runs and the board hangs).
    supabase.auth.getSession().then(async (res: { data: { session: { access_token: string } | null } }) => {
      const token = res.data.session?.access_token
      if (token) await supabase.realtime.setAuth(token)
      if (cancelled) return

      channel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_key: userKey,
            display_name: displayName,
            online_at: new Date().toISOString(),
            ready: readyRef.current,
          })
          // Catch-up fetch for any missed events
          await fetchInitialData()
        }
      })
    })

    return () => {
      cancelled = true
      Object.values(typingTimeouts.current).forEach(clearTimeout)
      typingTimeouts.current = {}
      channel.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userKey, displayName])

  function broadcastTyping(cardId: string) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'CARD_TYPING',
      payload: { cardId, user_key: userKey, display_name: displayName },
    })
  }

  function broadcastTimerSync(totalSeconds: number, running: boolean) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'TIMER_SYNC',
      payload: { totalSeconds, running },
    })
  }

  function broadcastResultsNavigate(itemId: string) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'RESULTS_NAVIGATE',
      payload: { itemId },
    })
  }

  function setReady(ready: boolean) {
    if (readyRef.current === ready) return
    readyRef.current = ready
    channelRef.current?.track({
      user_key: userKey,
      display_name: displayName,
      online_at: new Date().toISOString(),
      ready,
    })
  }

  return { broadcastTyping, broadcastTimerSync, broadcastResultsNavigate, setReady, timerState, resultsNavigatedId }
}
