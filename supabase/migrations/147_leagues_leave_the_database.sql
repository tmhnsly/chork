-- ────────────────────────────────────────────────────────────────
-- Leagues leave the database
-- ────────────────────────────────────────────────────────────────
--
-- Leagues (133, 134) were taken out of the app on 2026-10-01, and the
-- owner wants no leftovers, so the database side goes too: the
-- `leagues` table, `sets.league_id`, the fourteen league functions, and
-- the league logic in the two functions that carried it. At the time
-- of writing that is one league ("Boulder Buds (Mondays)", ended) and
-- one set carrying a league_id (an empty finished game, which stays as
-- an ordinary one). The league row is deleted with the table.
--
-- Order, which Postgres partly enforces: the functions first (one of
-- them returns the leagues rowtype, and the table won't drop while it
-- exists); then create_match and delete_match without their league
-- lines; then the column (its foreign key to leagues goes with it);
-- then the table. No CASCADE anywhere, so an unexpected dependent
-- fails the push instead of vanishing quietly. The functions are
-- dropped one statement each — the definitions parser reads drop
-- lists, but this is plainer.
--
-- `create_match` loses `p_league_id`. A changed argument list is a new
-- signature, and `create or replace` would leave the old 13-argument
-- function standing beside it (PostgREST then can't choose between
-- them), so the old one is dropped by its exact signature, with no
-- `if exists`: a mistyped signature fails the push. The new function
-- is re-granted, since the schema's default ACL would otherwise let
-- anon call it. Its empty-lobby reuse loses the league filter, which
-- is the same rule now that no lobby can be a league week.
--
-- `delete_match` loses the league-week refusal: every game its host
-- can see is theirs to delete again.
--
-- Deploy the league-free app BEFORE pushing this: the app at the last
-- commit still calls the league functions and reads `league_id`.
--
-- The bodies start from supabase/definitions/create_match.sql and
-- supabase/definitions/delete_match.sql.

-- 1. The league functions, callers before callees.
drop function public.get_my_leagues();
drop function public.get_league(uuid);
drop function public.league_standings(uuid);
drop function public.add_match_to_league(uuid, uuid);
drop function public.remove_match_from_league(uuid, uuid);
drop function public.end_league(uuid);
drop function public.rename_league(uuid, text);
drop function public.create_league(text, uuid);
drop function public.league_assert_host(uuid, uuid);
drop function public.league_assert_addable(uuid, uuid);
drop function public.league_visible_to(uuid, uuid);
drop function public.league_week_placings(uuid);
drop function public.league_placement_points(integer);
drop function public.league_drops(integer);

-- 2. create_match without p_league_id: the old signature goes, the new one is granted.
drop function public.create_match(text, text, text, smallint, smallint, text[], text, text, boolean, text, smallint, smallint, uuid);

create or replace function public.create_match(
  p_name text default null,
  p_location text default null,
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null,
  p_discipline text default 'boulder',
  p_handicap boolean default false,
  p_alt_grading_scale text default null,
  p_alt_min_grade smallint default null,
  p_alt_max_grade smallint default null
)
returns table(id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_set_id uuid;
  new_code text;
  new_scale_id uuid;
  grade_label text;
  grade_ordinal smallint;
  v_discipline text := coalesce(p_discipline, 'boulder');
  v_formula boolean := p_grading_scale in ('v', 'font', 'yds', 'french');
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform public.match_setup_check(
    v_discipline, p_grading_scale, p_min_grade, p_max_grade,
    p_custom_grades, p_handicap,
    p_alt_grading_scale, p_alt_min_grade, p_alt_max_grade
  );

  -- An empty lobby you already host is the game you meant. Locked, so
  -- two quick taps settle on one row rather than racing to update it.
  select s.id, s.code into new_set_id, new_code
    from public.sets s
   where s.owner_kind = 'climber'
     and s.status = 'live'
     and s.host_id = caller_id
     and not exists (select 1 from public.routes r where r.set_id = s.id)
   order by s.starts_at desc
   limit 1
   for update of s;

  if new_set_id is not null then
    update public.sets
       set name = nullif(trim(coalesce(p_name, '')), ''),
           location = nullif(trim(coalesce(p_location, '')), ''),
           grading_scale = p_grading_scale,
           min_grade = case when v_formula then p_min_grade else null end,
           max_grade = case when v_formula then p_max_grade else null end,
           discipline = v_discipline,
           handicap = coalesce(p_handicap, false),
           alt_grading_scale = p_alt_grading_scale,
           alt_min_grade = case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
           alt_max_grade = case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
           game_mode = 'points',
           last_activity_at = now(),
           updated_at = now()
     where public.sets.id = new_set_id;

    delete from public.set_grades where set_id = new_set_id;
  else
    new_code := public.generate_set_code();

    insert into public.sets (
      owner_kind, host_id, gym_id, code, name, location,
      grading_scale, min_grade, max_grade, discipline, handicap,
      alt_grading_scale, alt_min_grade, alt_max_grade,
      status, starts_at, ends_at, last_activity_at
    ) values (
      'climber',
      caller_id,
      null,
      new_code,
      nullif(trim(coalesce(p_name, '')), ''),
      nullif(trim(coalesce(p_location, '')), ''),
      p_grading_scale,
      case when v_formula then p_min_grade else null end,
      case when v_formula then p_max_grade else null end,
      v_discipline,
      coalesce(p_handicap, false),
      p_alt_grading_scale,
      case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
      case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
      'live',
      now(),
      null,
      now()
    )
    returning public.sets.id into new_set_id;

    insert into public.set_players (set_id, user_id, is_host)
    values (new_set_id, caller_id, true);
  end if;

  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.set_grades (set_id, ordinal, label)
      values (new_set_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  if p_save_scale_name is not null
     and char_length(trim(p_save_scale_name)) > 0
     and p_grading_scale = 'custom' then
    insert into public.user_custom_scales (user_id, name)
    values (caller_id, trim(p_save_scale_name))
    returning public.user_custom_scales.id into new_scale_id;

    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.user_custom_scale_grades (scale_id, ordinal, label)
      values (new_scale_id, grade_ordinal, trim(grade_label));
      grade_ordinal := grade_ordinal + 1;
    end loop;
  end if;

  return query select new_set_id, new_code;
end;
$$;

revoke execute on function public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean, text, smallint, smallint
) from anon, public;
grant execute on function public.create_match(
  text, text, text, smallint, smallint, text[], text, text, boolean, text, smallint, smallint
) to authenticated;

-- 3. delete_match without the league-week refusal.
create or replace function public.delete_match(p_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.sets;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into target
    from public.sets
   where id = p_set_id
     and owner_kind = 'climber'
   for update;

  -- A non-player and a missing game get the same answer, so an id can't
  -- be probed.
  if target.id is null
     or not exists (
       select 1 from public.set_players sp
        where sp.set_id = p_set_id
          and sp.user_id = caller_id
     ) then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;

  if target.host_id is distinct from caller_id then
    raise exception 'Only the host can delete this game' using errcode = '42501';
  end if;

  -- An invite to a game that no longer exists would open a dead join.
  delete from public.notifications
   where kind = 'match_invite_received'
     and payload ->> 'set_id' = p_set_id::text;

  delete from public.sets where id = p_set_id;

  return p_set_id;
end;
$$;

revoke execute on function public.delete_match(uuid) from anon, public;
grant execute on function public.delete_match(uuid) to authenticated;

-- 4. The column (takes sets_league_id_fkey and sets_league_id_idx with it).
alter table public.sets drop column league_id;

-- 5. The table (takes its key, index, check, host foreign key and rowtype).
drop table public.leagues;
