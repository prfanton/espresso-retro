-- ============================================================================
-- Espresso Retro — RLS lockdown for the live (TEXT identity column) schema
--
-- DRAFT — review before applying. Replaces 0001_rls.sql + 0003 for the live
-- project, which never had them: those compare identity columns to auth.uid()
-- (uuid), but the live columns (sessions.facilitator_id, cards.author_key,
-- votes/reactions/participants.user_key) are TEXT. Everything here compares
-- against auth.uid()::text instead.
--
-- Live state this replaces (checked 2026-09-28): RLS is enabled on every public
-- table but every policy is `to public using (true)` — anyone holding the
-- public anon key can read, edit or delete any session, card, vote, reaction,
-- group or participant, including rewriting sessions.facilitator_id.
--
-- Access model after this migration:
--   * Everything requires a signed-in (anonymous-auth) user; `anon` gets nothing.
--   * sessions: readable by any signed-in user (the link is the capability);
--     only the facilitator may create/update/delete their session.
--   * participants: you may only create/change/remove your own membership row;
--     rosters are visible to members of that session.
--   * cards/groups/votes/reactions: visible to session members only.
--     cards: insert as yourself, delete your own; any member may regroup/move
--     (UPDATE), but a trigger keeps content/author/session author-only.
--     votes/reactions: members insert/delete their own only.
--   * Vote limit is enforced from sessions.max_votes (was hard-coded to 3).
--
-- App requirements (already true on the PR that adds this file):
--   * The retro page tolerates the server-side session read returning nothing
--     for a visitor without an auth cookie, and loads it client-side after
--     anonymous sign-in (app/retro/[sessionId]/page.tsx, RetroBoard.tsx).
--   * Realtime DELETE events are applied by id (only the PK is sent under RLS).
--
-- Known effect on existing data: sessions created before anonymous auth have a
-- facilitator_id that isn't any auth user, so nobody can advance/rename those
-- old sessions any more (they stay readable). Participants of old sessions
-- rejoin under their auth id via the join modal.
--
-- Already live from 0004 and left untouched: public.is_session_member(uuid)
-- (text-cast version) and the realtime.messages policies for `retro:<id>`.
--
-- Runs in one transaction: on any error nothing changes.
-- ============================================================================

begin;

-- ── 1. membership helper (same definition as 0004, restated for fresh setups) ─
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

-- ── 2. drop every existing policy on the app tables ──────────────────────────
-- The live policies have assorted names ("Allow all on groups",
-- reactions_public, …); drop them all so no permissive leftover survives
-- (permissive policies are OR'ed, so one leftover `true` would undo this file).
do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('sessions', 'participants', 'cards', 'groups', 'votes', 'reactions')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.sessions     enable row level security;
alter table public.participants enable row level security;
alter table public.cards        enable row level security;
alter table public.groups       enable row level security;
alter table public.votes        enable row level security;
alter table public.reactions    enable row level security;

-- ── 3. table privileges ──────────────────────────────────────────────────────
-- Defense in depth: `anon` never touches these tables directly (the app signs
-- everyone in anonymously first), and nobody needs TRUNCATE/TRIGGER/REFERENCES
-- (TRUNCATE in particular bypasses RLS).
revoke all on public.sessions, public.participants, public.cards,
              public.groups, public.votes, public.reactions from anon;
revoke truncate, trigger, references
  on public.sessions, public.participants, public.cards,
     public.groups, public.votes, public.reactions from authenticated;

-- ── 4. sessions ──────────────────────────────────────────────────────────────
create policy sessions_select on public.sessions
  for select to authenticated
  using (true);

create policy sessions_insert on public.sessions
  for insert to authenticated
  with check (facilitator_id = (select auth.uid())::text);

create policy sessions_update on public.sessions
  for update to authenticated
  using (facilitator_id = (select auth.uid())::text)
  with check (facilitator_id = (select auth.uid())::text);

create policy sessions_delete on public.sessions
  for delete to authenticated
  using (facilitator_id = (select auth.uid())::text);

-- ── 5. participants ──────────────────────────────────────────────────────────
-- Your own row is always visible (needed for the join upsert); other rows only
-- to members of the same session.
create policy participants_select on public.participants
  for select to authenticated
  using (user_key = (select auth.uid())::text or public.is_session_member(session_id));

create policy participants_insert on public.participants
  for insert to authenticated
  with check (user_key = (select auth.uid())::text);

create policy participants_update on public.participants
  for update to authenticated
  using (user_key = (select auth.uid())::text)
  with check (user_key = (select auth.uid())::text);

create policy participants_delete on public.participants
  for delete to authenticated
  using (user_key = (select auth.uid())::text);

-- ── 6. cards ─────────────────────────────────────────────────────────────────
create policy cards_select on public.cards
  for select to authenticated
  using (public.is_session_member(session_id));

create policy cards_insert on public.cards
  for insert to authenticated
  with check (author_key = (select auth.uid())::text and public.is_session_member(session_id));

-- Collaborative: any member may regroup / move cards. The trigger below keeps
-- content, authorship and session author-only.
create policy cards_update on public.cards
  for update to authenticated
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

create policy cards_delete on public.cards
  for delete to authenticated
  using (author_key = (select auth.uid())::text);

create or replace function public.enforce_card_content_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- auth.uid() is null for service-role / SQL-editor maintenance: allow it.
  if auth.uid() is not null
     and old.author_key is distinct from (auth.uid())::text
     and (
       new.content    is distinct from old.content
       or new.author_key is distinct from old.author_key
       or new.session_id is distinct from old.session_id
     ) then
    raise exception 'Only the author may edit a card''s content or ownership';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_card_content_author on public.cards;
create trigger trg_enforce_card_content_author
  before update on public.cards
  for each row
  execute function public.enforce_card_content_author();

-- ── 7. groups (collaborative among members) ──────────────────────────────────
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_session_member(session_id));

create policy groups_write on public.groups
  for all to authenticated
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

-- ── 8. votes & reactions ─────────────────────────────────────────────────────
create policy votes_select on public.votes
  for select to authenticated
  using (exists (
    select 1 from public.cards c
    where c.id = votes.card_id and public.is_session_member(c.session_id)
  ));

create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    user_key = (select auth.uid())::text
    and exists (
      select 1 from public.cards c
      where c.id = votes.card_id and public.is_session_member(c.session_id)
    )
  );

create policy votes_delete on public.votes
  for delete to authenticated
  using (user_key = (select auth.uid())::text);

create policy reactions_select on public.reactions
  for select to authenticated
  using (exists (
    select 1 from public.cards c
    where c.id = reactions.card_id and public.is_session_member(c.session_id)
  ));

create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (
    user_key = (select auth.uid())::text
    and exists (
      select 1 from public.cards c
      where c.id = reactions.card_id and public.is_session_member(c.session_id)
    )
  );

create policy reactions_delete on public.reactions
  for delete to authenticated
  using (user_key = (select auth.uid())::text);

-- ── 9. vote limit from sessions.max_votes ────────────────────────────────────
-- The live trigger function hard-coded 3, so after a facilitator raised the
-- limit the extra votes failed server-side. SECURITY DEFINER so the count isn't
-- narrowed by the caller's RLS view.
create or replace function public.check_vote_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_limit   integer;
  v_used    integer;
begin
  select c.session_id, s.max_votes
    into v_session, v_limit
  from public.cards c
  join public.sessions s on s.id = c.session_id
  where c.id = new.card_id;

  select count(*) into v_used
  from public.votes v
  join public.cards c on c.id = v.card_id
  where c.session_id = v_session
    and v.user_key = new.user_key;

  if v_used >= coalesce(v_limit, 3) then
    raise exception 'vote_limit_exceeded';
  end if;

  return new;
end;
$$;

revoke all on function public.check_vote_limit() from public;

drop trigger if exists enforce_vote_limit on public.votes;
create trigger enforce_vote_limit
  before insert on public.votes
  for each row
  execute function public.check_vote_limit();

commit;
