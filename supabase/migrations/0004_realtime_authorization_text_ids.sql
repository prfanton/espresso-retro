-- ============================================================================
-- Espresso Retro — Realtime authorization (applied to the live project)
--
-- The live project's identity columns are TEXT (participants.user_key,
-- sessions.facilitator_id, cards.author_key), not uuid — so the uuid-typed
-- helper in 0001/0002 was never applied here. This is the version actually in
-- the database: is_session_member casts auth.uid() to text to match, and the
-- realtime.messages policies authorize the private `retro:<sessionId>` channel.
--
-- Without these, realtime.messages had RLS enabled but zero policies, so every
-- member was denied ("Unauthorized ... Channel topic: retro:<id>") and the board
-- never reached SUBSCRIBED.
--
-- NOTE: `alter table realtime.messages enable row level security` is omitted —
-- RLS is already enabled there and the table is owned by supabase_realtime_admin
-- (the `postgres` role that runs migrations is not its owner). Creating policies
-- is permitted; toggling RLS is not.
-- ============================================================================

create or replace function public.is_session_member(sid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.participants p
    where p.session_id = sid
      and p.user_key = (auth.uid())::text
  );
$$;

revoke all on function public.is_session_member(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;

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
