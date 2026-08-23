-- ============================================================================
-- Espresso Retro — Security hardening
--
-- Closes two access-control gaps left open by 0001_rls.sql:
--
--   #2  Card takeover via UPDATE. cards_update authorizes any session member,
--       and the content-author trigger only guarded the `content` column. A
--       member could reassign another author's `author_key` to themselves in an
--       update that left `content` unchanged (so the trigger passed), then edit
--       or delete the card as its new "author". We now forbid any member from
--       changing `author_key` (or moving a card to another `session_id`) on a
--       card they do not author, so authorship is immutable to everyone but the
--       original author.
--
--   #4  Vote / reaction stuffing by non-members. votes_insert and
--       reactions_insert only checked `user_key = auth.uid()` — unlike
--       cards_insert they never verified session membership. Any authenticated
--       user who obtained a card_id could write votes/reactions into a session
--       they never joined. We add the missing is_session_member() predicate so
--       only members of the card's session may vote or react.
--
-- Depends on 0001_rls.sql (public.is_session_member, the cards trigger).
-- ============================================================================

-- ── #2. authorship is immutable except to the card's author ──────────────────
-- Replaces public.enforce_card_content_author from 0001_rls.sql. The trigger
-- binding created there (trg_enforce_card_content_author) already points at this
-- function name, so redefining the function is enough — collaborative updates to
-- column_id / group_id / position by any member still pass.
create or replace function public.enforce_card_content_author()
returns trigger
language plpgsql
as $$
begin
  -- Only the original author may change content, reassign authorship, or move a
  -- card out of its session. Any other member editing these on someone else's
  -- card is rejected; grouping/positioning columns remain freely collaborative.
  if old.author_key is distinct from auth.uid()
     and (
       new.content     is distinct from old.content
       or new.author_key is distinct from old.author_key
       or new.session_id is distinct from old.session_id
     ) then
    raise exception 'Only the author may edit a card''s content or ownership';
  end if;
  return new;
end;
$$;

-- ── #4. votes & reactions require session membership on insert ────────────────
-- Idempotent user-scoping (user_key = auth.uid()) is kept and combined with the
-- membership check that was missing, matching the model used by cards_insert.
drop policy if exists votes_insert on public.votes;
create policy votes_insert on public.votes
  for insert to authenticated
  with check (
    user_key = auth.uid()
    and exists (
      select 1 from public.cards c
      where c.id = votes.card_id
        and public.is_session_member(c.session_id)
    )
  );

drop policy if exists reactions_insert on public.reactions;
create policy reactions_insert on public.reactions
  for insert to authenticated
  with check (
    user_key = auth.uid()
    and exists (
      select 1 from public.cards c
      where c.id = reactions.card_id
        and public.is_session_member(c.session_id)
    )
  );
