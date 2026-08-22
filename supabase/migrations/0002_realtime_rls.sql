-- ============================================================================
-- Espresso Retro — Realtime authorization for private channels
--
-- The client subscribes to a *private* channel `retro:<sessionId>`
-- (config.private = true). Private channels authorize send/receive through RLS
-- on realtime.messages, so only authenticated session members can broadcast or
-- receive TIMER_SYNC / RESULTS_NAVIGATE / CARD_TYPING and presence — closing the
-- open-internet forgery surface where any client could emit these events.
--
-- realtime.topic() returns the channel name of the current message; we parse the
-- session id out of the `retro:<uuid>` topic and reuse public.is_session_member.
--
-- NOTE: depends on 0001_rls.sql (defines public.is_session_member). Realtime
-- Authorization must be enabled for the project (default on recent projects).
-- ============================================================================

alter table realtime.messages enable row level security;

drop policy if exists retro_realtime_read on realtime.messages;
create policy retro_realtime_read on realtime.messages
  for select to authenticated
  using (
    realtime.topic() like 'retro:%'
    and public.is_session_member(
      split_part(realtime.topic(), ':', 2)::uuid
    )
  );

drop policy if exists retro_realtime_write on realtime.messages;
create policy retro_realtime_write on realtime.messages
  for insert to authenticated
  with check (
    realtime.topic() like 'retro:%'
    and public.is_session_member(
      split_part(realtime.topic(), ':', 2)::uuid
    )
  );
