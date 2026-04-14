-- 031: ownership transfer on crews
--
-- `crews` had no UPDATE policy — created_by was effectively
-- immutable. Transferring a crew to another active member keeps
-- the creator-leave path sane (otherwise creators are permanently
-- stuck with the crew or have to delete it) and sets us up for
-- future ownership features without migrating data.
--
-- Policy: the CURRENT creator is the only one who can update the
-- row, and they can only set `created_by` to a user who is already
-- an active member of the crew. Name edits also flow through this
-- policy; all other columns stay readonly.

create policy "Creator updates crew"
  on public.crews for update to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by in (
      select user_id
        from public.crew_members
       where crew_id = crews.id
         and status  = 'active'
    )
  );
