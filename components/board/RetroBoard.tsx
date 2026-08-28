'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getDisplayName, setDisplayName } from '@/lib/utils/userKey'
import { getAuthUserId, captchaEnabled, hasAuthSession } from '@/lib/utils/auth'
import { getFormat } from '@/lib/utils/sessionFormats'
import { getPhaseCapabilities, getNextPhase, getPrevPhase, getPhaseDbPatch } from '@/lib/utils/phaseUtils'
import { useRetroChannel } from '@/lib/channels/useRetroChannel'
import { useBoardStore } from '@/store/boardStore'
import { usePresenceStore } from '@/store/presenceStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import BoardColumn from './BoardColumn'
import GroupingBoard from './GroupingBoard'
import VotingBoard from './VotingBoard'
import ResultsView from './ResultsView'
import WorkflowBreadcrumb, { STEPS, ORDER } from './WorkflowBreadcrumb'
import JoinModal from '@/components/session/JoinModal'
import TurnstileWidget from '@/components/auth/TurnstileWidget'
import InviteLinkButton from '@/components/session/InviteLinkButton'
import FacilitatorControls, { TimerDisplay } from '@/components/session/FacilitatorControls'
import PresenceBar from '@/components/presence/PresenceBar'
import { fireConfetti } from '@/components/effects/ConfettiBurst'
import type { Session } from '@/types/retro'

interface RetroBoardProps {
  session: Session
}

// ─── Finish modal ─────────────────────────────────────────────────────────────

function FinishModal({ onExport, onClose }: { onExport: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#2d1200]/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white/80 backdrop-blur-md rounded-3xl shadow-2xl border border-white/60 p-8 flex flex-col items-center text-center">
        <img
          src="/assets/logo-espresso-retro.avif"
          alt="Espresso Retro"
          className="h-24 w-auto mb-5"
        />
        <h2 className="text-2xl font-bold text-[#2d1200] mb-2">Retro complete!</h2>
        <p className="text-[#2d1200]/65 text-sm leading-relaxed mb-8">
          Great work, team. Your insights are captured — download the summary to share or revisit later.
        </p>
        <button
          onClick={() => { onExport(); onClose() }}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#B83C28] hover:bg-[#9c2e1a] text-white font-semibold rounded-xl transition-colors mb-3"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download retro summary
        </button>
        <button
          onClick={onClose}
          className="w-full py-2.5 text-sm font-medium text-[#2d1200]/60 hover:text-[#2d1200] hover:bg-[#2d1200]/8 rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ─── RetroBoard ────────────────────────────────────────────────────────────────

export default function RetroBoard({ session: initialSession }: RetroBoardProps) {
  const [userKey, setUserKey] = useState<string | null>(null)
  const [displayName, setDisplayNameState] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  // A first-time visitor arriving via an invite link must clear CAPTCHA before
  // we mint their anonymous identity. Returning visitors reuse their session.
  const [needCaptcha, setNeedCaptcha] = useState(false)
  const [showFinishModal, setShowFinishModal] = useState(false)
  const lastTimerStateRef = useRef<{ totalSeconds: number; running: boolean } | null>(null)
  const confettiFiredRef = useRef(false)

  const boardSession = useBoardStore((s) => s.session)
  const setSession = useBoardStore((s) => s.setSession)
  const isLoaded = useBoardStore((s) => s.isLoaded)
  const participants = usePresenceStore((s) => s.participants)

  // Establish the anonymous auth identity; auth.uid() becomes our userKey.
  // For a returning user (name already stored), re-assert membership before
  // revealing the board so the private realtime channel authorizes them.
  const establishIdentity = useCallback(
    async (captchaToken?: string) => {
      try {
        const uid = await getAuthUserId(captchaToken)
        setNeedCaptcha(false)
        const storedName = getDisplayName(initialSession.id)
        if (storedName) {
          await getSupabaseClient()
            .from('participants')
            .upsert(
              { session_id: initialSession.id, user_key: uid, display_name: storedName },
              { onConflict: 'session_id,user_key' }
            )
          setDisplayNameState(storedName)
        }
        setUserKey(uid)
      } catch {
        setUserKey(null)
        // Re-show the challenge so the user can retry with a fresh token.
        if (captchaEnabled) setNeedCaptcha(true)
      }
    },
    [initialSession.id]
  )

  useEffect(() => {
    setSession(initialSession)
    setMounted(true)
    let cancelled = false
    // Only the first sign-in per browser needs a token. If a session already
    // exists (or CAPTCHA is off), establish identity straight away; otherwise
    // gate it behind the Turnstile challenge below.
    hasAuthSession().then((exists) => {
      if (cancelled) return
      if (exists || !captchaEnabled) establishIdentity()
      else setNeedCaptcha(true)
    })
    return () => {
      cancelled = true
    }
  }, [initialSession, setSession, establishIdentity])

  const session = boardSession ?? initialSession
  const format = getFormat(session.format)
  const isFacilitator = session.facilitator_id === userKey
  const phase = session.phase ?? 'writing'
  const capabilities = getPhaseCapabilities(phase)

  const currentIndex = ORDER.indexOf(phase)
  const nextPhase = getNextPhase(phase)
  const prevPhase = getPrevPhase(phase)
  const nextLabel = nextPhase ? STEPS[ORDER.indexOf(nextPhase)].label : null
  const prevLabel = prevPhase ? STEPS[ORDER.indexOf(prevPhase)].label : null

  const participantMap: Record<string, string> = {}
  for (const p of participants) {
    participantMap[p.user_key] = p.display_name
  }

  const handlePresenceSync = useCallback(() => {
    if (isFacilitator && lastTimerStateRef.current) {
      broadcastTimerSyncRef.current?.(lastTimerStateRef.current.totalSeconds, lastTimerStateRef.current.running)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFacilitator])

  const broadcastTimerSyncRef = useRef<((totalSeconds: number, running: boolean) => void) | null>(null)

  const { broadcastTyping, broadcastTimerSync, broadcastResultsNavigate, setReady, timerState, resultsNavigatedId } = useRetroChannel({
    sessionId: session.id,
    userKey: userKey ?? '',
    displayName: displayName ?? '',
    onPresenceSync: handlePresenceSync,
  })

  const myReady = participants.find((p) => p.user_key === userKey)?.ready ?? false
  const readyCount = participants.filter((p) => p.ready).length

  // Clear ready state whenever we leave the writing phase, so a fresh writing
  // round always starts with nobody marked ready.
  useEffect(() => {
    if (phase !== 'writing') setReady(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  broadcastTimerSyncRef.current = broadcastTimerSync

  function handleTimerSync(totalSeconds: number, running: boolean) {
    lastTimerStateRef.current = { totalSeconds, running }
    broadcastTimerSync(totalSeconds, running)
  }

  // Keep the last-known timer state current on every tick (without broadcasting)
  // so presence-sync re-broadcasts always send the live remaining time.
  function handleTimerStateChange(totalSeconds: number, running: boolean) {
    lastTimerStateRef.current = { totalSeconds, running }
    // Re-arm the confetti latch while the facilitator's countdown is still active.
    if (running && totalSeconds > 0) confettiFiredRef.current = false
  }

  // Fire a full-screen confetti burst when the timer reaches zero. Latched so a
  // single zero-transition fires once even if both timer components (or repeated
  // broadcasts) report it; re-arms below when a fresh countdown is running.
  function handleTimerEnd() {
    if (confettiFiredRef.current) return
    confettiFiredRef.current = true
    fireConfetti()
  }

  // Re-arm the confetti latch whenever a countdown with time remaining is active,
  // so a reset-and-run-again timer produces confetti once more.
  useEffect(() => {
    if (timerState?.running && timerState.totalSeconds > 0) {
      const elapsed = Math.floor((Date.now() - timerState.ts) / 1000)
      if (timerState.totalSeconds - elapsed > 0) confettiFiredRef.current = false
    }
  }, [timerState])

  async function handleJoin(name: string) {
    if (!userKey) return
    setDisplayName(session.id, name)
    const supabase = getSupabaseClient()
    // Persist membership BEFORE revealing the board: the realtime channel is
    // private and only authorizes members, and is_session_member reads this row.
    await supabase
      .from('participants')
      .upsert(
        { session_id: session.id, user_key: userKey, display_name: name },
        { onConflict: 'session_id,user_key' }
      )
    setDisplayNameState(name)
  }

  async function handleAdvance() {
    if (!nextPhase) return
    const supabase = getSupabaseClient()
    await supabase.from('sessions').update(getPhaseDbPatch(nextPhase)).eq('id', session.id)
  }

  async function handleRetreat() {
    if (!prevPhase) return
    const supabase = getSupabaseClient()
    await supabase.from('sessions').update(getPhaseDbPatch(prevPhase)).eq('id', session.id)
  }

  function handleExport() {
    window.open(`/api/export/${session.id}`, '_blank')
  }

  if (mounted && !userKey && needCaptcha) {
    return (
      <div className="animated-bg min-h-screen flex items-center justify-center p-4">
        <div className="bg-white/50 backdrop-blur-md rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-white/50 text-center">
          <h2 className="text-2xl font-bold text-[#2d1200] mb-2">Quick check</h2>
          <p className="text-[#2d1200]/60 mb-6 text-sm">
            Verify you&apos;re human to join this session.
          </p>
          <TurnstileWidget
            onVerify={(token) => {
              setNeedCaptcha(false)
              establishIdentity(token)
            }}
            className="flex justify-center"
          />
        </div>
      </div>
    )
  }

  if (!mounted || !userKey) {
    return (
      <div className="animated-bg min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#B83C28] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animated-bg min-h-screen flex flex-col">
      {!displayName && <JoinModal onJoin={handleJoin} />}

      {/* Header */}
      <header className="px-4 py-3">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <a href="/" className="shrink-0 hover:opacity-80 transition-opacity">
              <img
                src="/logo-espresso-retro-horizontal.png"
                alt="Espresso Retro"
                className="h-12 sm:h-20 w-auto"
              />
            </a>
            <span className="text-[#2d1200]/30">/</span>
            <h1 className="text-[#2d1200] font-semibold truncate text-sm sm:text-base">{session.title}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <PresenceBar showReady={phase === 'writing'} />
            {isFacilitator
              ? <FacilitatorControls onTimerSync={handleTimerSync} onTimerStateChange={handleTimerStateChange} onTimerEnd={handleTimerEnd} />
              : timerState && <TimerDisplay timerState={timerState} onTimerEnd={handleTimerEnd} />
            }
            <InviteLinkButton />
          </div>
        </div>
      </header>

      {/* Workflow bar */}
      <div className="px-4 pb-4">
        <div className="max-w-[1200px] mx-auto">
          <div className="bg-white/20 backdrop-blur-md border border-white/40 rounded-2xl px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 shadow-[0_4px_24px_rgba(45,18,0,0.10),0_1px_4px_rgba(45,18,0,0.06)]" style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
            <WorkflowBreadcrumb phase={phase} />

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {phase === 'writing' && (
                <>
                  <span className="hidden sm:inline text-xs font-medium text-[#2d1200]/50">
                    {readyCount} of {participants.length} ready
                  </span>
                  <button
                    onClick={() => setReady(!myReady)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      myReady
                        ? 'bg-green-600 text-white shadow-sm shadow-green-600/30'
                        : 'text-[#B83C28] bg-transparent border border-[#B83C28] hover:bg-[#B83C28]/10'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {myReady ? 'Done' : "I'm done!"}
                  </button>
                </>
              )}

              {isFacilitator && (
                <>
                {prevLabel && (
                  <button
                    onClick={handleRetreat}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-[#2d1200]/70 bg-[#2d1200]/8 hover:bg-[#2d1200]/15 border border-[#2d1200]/15 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {prevLabel}
                  </button>
                )}
                {nextLabel && (
                  <button
                    onClick={handleAdvance}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#B83C28] hover:bg-[#9c2e1a] shadow-sm shadow-[#B83C28]/30 transition-colors"
                  >
                    Move to {nextLabel}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                {phase === 'results' && (
                  <button
                    onClick={() => setShowFinishModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#B83C28] hover:bg-[#9c2e1a] shadow-sm shadow-[#B83C28]/30 transition-colors"
                  >
                    Finish 🎉
                  </button>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showFinishModal && (
        <FinishModal onExport={handleExport} onClose={() => setShowFinishModal(false)} />
      )}

      {/* Board */}
      <main className="flex-1 p-4 md:p-6 overflow-auto pt-0">
        <div className="max-w-[1200px] mx-auto">
          {!isLoaded ? (
            <div className="grid gap-4 md:grid-cols-3">
              {format.columns.map((col) => (
                <div key={col.id} className="border border-[#2d1200]/15 rounded-2xl p-4 animate-pulse h-48" />
              ))}
            </div>
          ) : phase === 'results' ? (
            <ResultsView
              format={format}
              sessionId={session.id}
              userKey={userKey}
              isFacilitator={isFacilitator}
              externalSelectedId={resultsNavigatedId}
              onNavigate={broadcastResultsNavigate}
              onExport={handleExport}
            />
          ) : phase === 'grouping' ? (
            <GroupingBoard format={format} sessionId={session.id} />
          ) : phase === 'voting' ? (
            <VotingBoard format={format} sessionId={session.id} userKey={userKey} isFacilitator={isFacilitator} />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {format.columns.map((col) => (
                <BoardColumn
                  key={col.id}
                  column={col}
                  sessionId={session.id}
                  userKey={userKey}
                  displayName={displayName ?? ''}
                  isRevealed={capabilities.isRevealed}
                  isLocked={!capabilities.canAddCards}
                  canVote={capabilities.canVote}
                  onBroadcastTyping={broadcastTyping}
                  participants={participantMap}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
