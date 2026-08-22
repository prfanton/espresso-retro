-- ============================================================================
-- Espresso Retro — Row Level Security
--
-- Establishes a server-authoritative access model. Identity is the Supabase
-- authenticated (anonymous) user: auth.uid(). The app writes auth.uid() into
-- facilitator_id / author_key / user_key, and these policies enforce that a
-- caller can only act as themselves.
--
-- PREREQUISITE: enable Anonymous sign-ins (Auth → Providers → Anonymous).
--
-- NOTE ON COLUMN TYPES: these policies compare identity columns to auth.uid()
-- (a uuid). If the live columns are already uuid, nothing to do. If any are
-- `text`, uncomment the ALTERs in section 0 (comparisons still work via cast,
-- but uuid + a FK to auth.users is cleaner). Review before applying.
-- ============================================================================

-- ── 0. (optional) normalize identity column types ───────────────────────────
-- alter table public.sessions     alter column facilitator_id type uuid using facilitator_id::uuid;
-- alter table public.cards        alter column author_key     type uuid using author_key::uuid;
-- alter table public.votes        alter column user_key        type uuid using user_key::uuid;
-- alter table public.reactions    alter column user_key        type uuid using user_key::uuid;
-- alter table public.participants alter column user_key        type uuid using user_key::uuid;

-- ── 1. membership helper ─────────────────────────────────────────────────────
-- SECURITY DEFINER so member checks inside policies don't recurse through the
-- participants policy. STABLE: result is constant within a statement.
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
      and p.user_key = auth.uid()
  );
$$;

revoke all on function public.is_session_member(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;

-- ── 2. enable RLS ────────────────────────────────────────────────────────────
alter table public.sessions     enable row level security;
alter table public.cards        enable row level security;
alter table public.groups       enable row level security;
alter table public.votes        enable row level security;
alter table public.reactions    enable row level security;
alter table public.participants enable row level security;

-- ── 3. sessions ──────────────────────────────────────────────────────────────
-- The session UUID is the capability to view/join; any authenticated user who
-- has the link may read it. Only the facilitator (auth.uid() == facilitator_id)
-- may create/update/delete it — this is what makes phase changes and max_votes
-- facilitator-only, and makes a leaked facilitator_id harmless.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select to authenticated
  using (true);

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
  for insert to authenticated
  with check (facilitator_id = auth.uid());

drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update to authenticated
  using (facilitator_id = auth.uid())
  with check (facilitator_id = auth.uid());

drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions
  for delete to authenticated
  using (facilitator_id = auth.uid());

-- ── 4. participants ──────────────────────────────────────────────────────────
-- Readable by any authenticated user (roster/presence). You may only create or
-- modify your own membership row (name / ready flag).
drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants
  for select to authenticated
  using (true);

drop policy if exists participants_insert on public.participants;
create policy participants_insert on public.participants
  for insert to authenticated
  with check (user_key = auth.uid());

drop policy if exists participants_update on public.participants;
create policy participants_update on public.participants
  for update to authenticated
  using (user_key = auth.uid())
  with check (user_key = auth.uid());

drop policy if exists participants_delete on public.participants;
create policy participants_delete on public.participants
  for delete to authenticated
  using (user_key = auth.uid());

-- ── 5. cards ─────────────────────────────────────────────────────────────────
-- Visible to session members. You may only insert cards authored as yourself,
-- and only delete your own. UPDATE is allowed to any member so that grouping
-- (reassigning group_id / column_id / position) stays collaborative — but a
-- trigger (section 8) forbids changing another author's `content`.
drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists cards_insert on public.cards;
create policy cards_insert on public.cards
  for insert to authenticated
  with check (author_key = auth.uid() and public.is_session_member(session_id));

drop policy if exists cards_update on public.cards;
create policy cards_update on public.cards
  for update to authenticated
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards
  for delete to authenticated
  using (author_key = auth.uid());

-- ── 6. votes & reactions ─────────────────────────────────────────────────────
-- Members may read all; you may only cast/remove your own. The existing
-- unique(card_id, user_key) constraint keeps one vote per card per user, and
-- because user_key must equal auth.uid() it cannot be rotated to stuff votes.
drop policy if exists votes_select on public.votes;
create policy votes_select on public.votes
  for select to authenticated
  using (exists (
    select 1 from public.cards c
    where c.id = votes.card_id and public.is_session_member(c.session_id)
  ));

drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes
  for insert to authenticated
  with check (user_key = auth.uid());

drop policy if exists votes_delete on public.votes;
create policy votes_delete on public.votes
  for delete to authenticated
  using (user_key = auth.uid());

drop policy if exists reactions_select on public.reactions;
create policy reactions_select on public.reactions
  for select to authenticated
  using (exists (
    select 1 from public.cards c
    where c.id = reactions.card_id and public.is_session_member(c.session_id)
  ));

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (user_key = auth.uid());

drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions
  for delete to authenticated
  using (user_key = auth.uid());

-- ── 7. groups ────────────────────────────────────────────────────────────────
-- Grouping is a collaborative activity; any session member may create, rename,
-- move, or dissolve groups.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_session_member(session_id));

drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
  for all to authenticated
  using (public.is_session_member(session_id))
  with check (public.is_session_member(session_id));

-- ── 8. card content stays author-only (even though UPDATE is collaborative) ──
create or replace function public.enforce_card_content_author()
returns trigger
language plpgsql
as $$
begin
  if new.content is distinct from old.content
     and old.author_key is distinct from auth.uid() then
    raise exception 'Only the author may edit a card''s content';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_card_content_author on public.cards;
create trigger trg_enforce_card_content_author
  before update on public.cards
  for each row
  execute function public.enforce_card_content_author();
