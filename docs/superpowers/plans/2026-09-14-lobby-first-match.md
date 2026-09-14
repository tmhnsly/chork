# Lobby-first Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Starting a match becomes one tap on a game poster; the empty match is a lobby where the host tunes setup, people join live, and the first route starts play.

**Architecture:** A new `set_match_setup` RPC (host + live + zero routes) shares `create_match`'s validation through one SQL helper. On the client the create-match reducer survives to drive setup *sheets* opened from pills in the match hero; the wizard form is deleted. The match screen gains a derived lobby state (`routes.length === 0`) that swaps the grid for a join card, a players card and one primary CTA.

**Tech Stack:** Next 15 App Router, Supabase (plpgsql RPCs, `db push`), vitest, SCSS modules with the design-token system, `qrcode.react` (already installed).

**Spec:** `docs/superpowers/specs/2026-09-14-lobby-first-match-design.md`

## Global Constraints

- Every server action opens with a `gate*` helper and returns `Promise<ActionResult<…>>` (`src/lib/action-hygiene.test.ts` enforces).
- Validate ids with `isUuid` from `src/lib/validation.ts`; never inline a uuid regex.
- SCSS only, tokens only: no raw px font sizes, radii, colours, durations; `src/styles/design-system.test.ts` enforces. Typography via `@include type.typography(role, $step)`.
- Icons from `react-icons/fa6`. Toasts via `showToast()`.
- Titles: `type.typography(display)` + `color: var(--mono-text)`.
- A choice is a `ChoiceTiles`, not a bar. Selected = accent solid.
- Defaults at creation: discipline `boulder`, scale `v`, range `[0, SCALE_HARD_MAX.v]`, handicap off, no alt scale, name `{first name}'s match`.
- RPC refusal copy (verbatim): `'Routes are already up — grading is locked'`, errcode `22023`; host gate `'Only the host can change a live match'`, errcode `42501`.
- Never `revalidatePath("/", "layout")`. Match state re-reads via `router.refresh()`.
- Commit only after Tom says so; the commit steps below are the boundaries to ask at.

---

### Task 1: Migration 136 — `match_setup_check`, `create_match` refactor, `set_match_setup`

**Files:**
- Create: `supabase/migrations/136_match_setup.sql`
- Modify: `docs/migrations.md` (append one row)
- Regenerate: `src/lib/database.types.ts`

**Interfaces:**
- Produces RPC `public.set_match_setup(p_set_id uuid, p_name text, p_location text, p_discipline text, p_grading_scale text, p_min_grade smallint, p_max_grade smallint, p_custom_grades text[], p_save_scale_name text, p_alt_grading_scale text, p_alt_min_grade smallint, p_alt_max_grade smallint) returns public.sets`.
- Produces SQL helper `public.match_setup_check(...)` returning void (raises on invalid).
- `create_match` keeps its exact signature and behaviour.

- [ ] **Step 1: Write the migration**

```sql
-- 136_match_setup.sql
--
-- Lobby-first matches. A match is created with defaults in one tap
-- and its setup (name, where, discipline, grading, mixed-day second
-- scale) is changed from the lobby — until the first route goes up,
-- after which grading is locked because routes have been graded on
-- it. The validation create_match already did is lifted into
-- match_setup_check so both writers share one copy.

-- ── The check ────────────────────────────────────
create or replace function public.match_setup_check(
  p_discipline text,
  p_grading_scale text,
  p_min_grade smallint,
  p_max_grade smallint,
  p_custom_grades text[],
  p_handicap boolean,
  p_alt_grading_scale text,
  p_alt_min_grade smallint,
  p_alt_max_grade smallint
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_alt_family text;
begin
  if p_discipline not in ('boulder', 'sport', 'top-rope') then
    raise exception 'Invalid discipline' using errcode = '22023';
  end if;

  if p_grading_scale is null
     or p_grading_scale not in ('v', 'font', 'custom', 'points', 'yds', 'french') then
    raise exception 'Invalid grading scale' using errcode = '22023';
  end if;

  -- A handicap scores relative to a grade, so it needs one. `points`
  -- has no grades at all and a `custom` ladder's ordinals aren't a
  -- difficulty scale — refuse rather than silently score everything
  -- at full value, which would look like the handicap doing nothing.
  if coalesce(p_handicap, false)
     and p_grading_scale not in ('v', 'font', 'yds', 'french') then
    raise exception 'Handicap needs a graded scale' using errcode = '22023';
  end if;

  if p_grading_scale = 'custom' then
    if p_custom_grades is null or array_length(p_custom_grades, 1) is null then
      raise exception 'Custom grading scale requires at least one grade' using errcode = '22023';
    end if;
    if array_length(p_custom_grades, 1) > 50 then
      raise exception 'Custom grading scale capped at 50 grades' using errcode = '22023';
    end if;
  end if;

  -- The second scale has to belong to the OTHER family, or it is not
  -- a second scale — it is the same one twice, and every route would
  -- resolve to whichever slot was read first.
  if p_alt_grading_scale is not null then
    if p_alt_grading_scale not in ('v', 'font', 'yds', 'french') then
      raise exception 'Invalid second grading scale' using errcode = '22023';
    end if;
    if p_alt_grading_scale in ('v', 'font') then
      v_alt_family := 'boulder';
    else
      v_alt_family := 'rope';
    end if;
    if public.discipline_family(p_discipline) = v_alt_family then
      raise exception 'The second scale must be for the other discipline'
        using errcode = '22023';
    end if;
    if p_alt_min_grade is null or p_alt_max_grade is null
       or p_alt_max_grade < p_alt_min_grade then
      raise exception 'Second scale needs a grade range' using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke execute on function public.match_setup_check(
  text, text, smallint, smallint, text[], boolean, text, smallint, smallint
) from anon, public;
grant execute on function public.match_setup_check(
  text, text, smallint, smallint, text[], boolean, text, smallint, smallint
) to authenticated;

-- ── create_match, calling the check ──────────────
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
  p_alt_max_grade smallint default null,
  p_league_id uuid default null
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
  v_league public.leagues;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform public.match_setup_check(
    v_discipline, p_grading_scale, p_min_grade, p_max_grade,
    p_custom_grades, p_handicap,
    p_alt_grading_scale, p_alt_min_grade, p_alt_max_grade
  );

  -- A week can only be started by the League's host, into a League
  -- that is still running.
  if p_league_id is not null then
    select * into v_league from public.leagues where public.leagues.id = p_league_id;
    if v_league.id is null or v_league.host_id <> caller_id then
      raise exception 'Only the host can start a week of this league.';
    end if;
    if v_league.ended_at is not null then
      raise exception 'This league has ended.';
    end if;
  end if;

  new_code := public.generate_set_code();

  insert into public.sets (
    owner_kind, host_id, gym_id, code, name, location,
    grading_scale, min_grade, max_grade, discipline, handicap,
    alt_grading_scale, alt_min_grade, alt_max_grade,
    status, starts_at, ends_at, last_activity_at, league_id
  ) values (
    'climber',
    caller_id,
    null,
    new_code,
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_location, '')), ''),
    p_grading_scale,
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_min_grade else null end,
    case when p_grading_scale in ('v', 'font', 'yds', 'french') then p_max_grade else null end,
    v_discipline,
    coalesce(p_handicap, false),
    p_alt_grading_scale,
    case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
    case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
    'live',
    now(),
    null,
    now(),
    p_league_id
  )
  returning public.sets.id into new_set_id;

  insert into public.set_players (set_id, user_id, is_host)
  values (new_set_id, caller_id, true);

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

-- ── set_match_setup ──────────────────────────────
-- Host only, live only, and only while the match has no routes:
-- a route is graded on the scale it was added under, and changing
-- the scale beneath it would relabel every send.
create or replace function public.set_match_setup(
  p_set_id uuid,
  p_name text default null,
  p_location text default null,
  p_discipline text default 'boulder',
  p_grading_scale text default null,
  p_min_grade smallint default null,
  p_max_grade smallint default null,
  p_custom_grades text[] default null,
  p_save_scale_name text default null,
  p_alt_grading_scale text default null,
  p_alt_min_grade smallint default null,
  p_alt_max_grade smallint default null
)
returns public.sets
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  current public.sets;
  result public.sets;
  new_scale_id uuid;
  grade_label text;
  grade_ordinal smallint;
  v_discipline text := coalesce(p_discipline, 'boulder');
  v_formula boolean;
begin
  if caller_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into current
    from public.sets
   where id = p_set_id
     and owner_kind = 'climber'
     and status = 'live'
     and host_id = caller_id;
  if current.id is null then
    raise exception 'Only the host can change a live match'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.routes where set_id = p_set_id) then
    raise exception 'Routes are already up — grading is locked'
      using errcode = '22023';
  end if;

  v_formula := p_grading_scale in ('v', 'font', 'yds', 'french');

  -- The handicap survives a move between graded scales and switches
  -- itself off on a scale without grades — the same rule the create
  -- form's reducer applies, so the two never disagree.
  perform public.match_setup_check(
    v_discipline, p_grading_scale, p_min_grade, p_max_grade,
    p_custom_grades, (current.handicap and v_formula),
    p_alt_grading_scale, p_alt_min_grade, p_alt_max_grade
  );

  update public.sets
     set name = nullif(trim(coalesce(p_name, '')), ''),
         location = nullif(trim(coalesce(p_location, '')), ''),
         discipline = v_discipline,
         grading_scale = p_grading_scale,
         min_grade = case when v_formula then p_min_grade else null end,
         max_grade = case when v_formula then p_max_grade else null end,
         handicap = (current.handicap and v_formula),
         alt_grading_scale = p_alt_grading_scale,
         alt_min_grade = case when p_alt_grading_scale is not null then p_alt_min_grade else null end,
         alt_max_grade = case when p_alt_grading_scale is not null then p_alt_max_grade else null end,
         updated_at = now()
   where id = p_set_id
  returning * into result;

  delete from public.set_grades where set_id = p_set_id;
  if p_grading_scale = 'custom' then
    grade_ordinal := 0;
    foreach grade_label in array p_custom_grades loop
      insert into public.set_grades (set_id, ordinal, label)
      values (p_set_id, grade_ordinal, trim(grade_label));
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

  return result;
end;
$$;

revoke execute on function public.set_match_setup(
  uuid, text, text, text, text, smallint, smallint, text[], text, text, smallint, smallint
) from anon, public;
grant execute on function public.set_match_setup(
  uuid, text, text, text, text, smallint, smallint, text[], text, text, smallint, smallint
) to authenticated;
```

- [ ] **Step 2: Append the catalogue row to `docs/migrations.md`**

After the `| 135 |` row:

```markdown
| 136 | `match_setup.sql` | **Lobby-first matches.** `match_setup_check(...)` holds the validation `create_match` used to inline (discipline, scale, handicap-needs-grades, custom ladder bounds, second scale in the other family with a range); `create_match` now calls it, same signature and behaviour. New `set_match_setup(p_set_id, …)`: host + live + **no routes yet** (`'Routes are already up — grading is locked'`, 22023), rewrites name / location / discipline / scale / range / second scale, replaces `set_grades`, optionally saves the custom ladder; the handicap survives a move between graded scales and switches off on one without grades. Authenticated-only |
```

- [ ] **Step 3: Push and regenerate types**

Run:
```bash
npx supabase db push
npx supabase gen types typescript --project-id "$(grep -o 'project_id = "[^"]*"' supabase/config.toml | cut -d'"' -f2)" > src/lib/database.types.ts
pnpm typecheck
```
Expected: push applies 136 only; `database.types.ts` gains `set_match_setup` and `match_setup_check` under `Functions`; typecheck passes.

- [ ] **Step 4: Hand-check the gate**

In the Supabase SQL editor as the host of a fresh match (no routes):
```sql
select name from public.set_match_setup('<set id>', 'Renamed', null, 'boulder', 'font', 0, 21);
```
Expected: returns `Renamed`. Add one route through the app, rerun: expected error `Routes are already up — grading is locked`. Run as a non-host player: expected `Only the host can change a live match`.

- [ ] **Step 5: Commit checkpoint**

```bash
git add supabase/migrations/136_match_setup.sql docs/migrations.md src/lib/database.types.ts
git commit -m "feat(match): set_match_setup — a lobby's settings, locked by the first route"
```

---

### Task 2: `setMatchSetupAction` and shared payload validation

**Files:**
- Modify: `src/app/match/actions.ts:96-236` (createMatchAction), add the new action after `setMatchHandicapAction`
- Test: `src/app/match/actions.test.ts`

**Interfaces:**
- Consumes RPC `set_match_setup` (Task 1).
- Produces `export interface MatchSetupPayload` (the `CreateMatchPayload` fields minus `leagueId` and `handicap`) and `export async function setMatchSetupAction(matchId: string, payload: MatchSetupPayload): Promise<ActionResult>`.
- Produces internal `validateMatchSetup(payload): { error: string } | { ok: ValidatedSetup }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/match/actions.test.ts`, after the `setMatchGameMode / setMatchHandicapAction` describe:

```ts
describe("setMatchSetupAction", () => {
  const SETUP = {
    name: "Friday sesh",
    location: null,
    discipline: "boulder" as const,
    gradingScale: "font" as const,
    minGrade: 0,
    maxGrade: 21,
    customGrades: null,
    saveScaleName: null,
    altGradingScale: null,
    altMinGrade: null,
    altMaxGrade: null,
  };

  it("rejects a malformed match id before any DB call", async () => {
    const sb = await mockSignedIn();
    const { setMatchSetupAction } = await import("./actions");
    expect(await setMatchSetupAction("nope", SETUP)).toEqual({ error: "Invalid match id" });
    expect(sb.calls.find((c) => c.source === "set_match_setup")).toBeUndefined();
  });

  it("requires a signed-in caller", async () => {
    const { setMatchSetupAction } = await import("./actions");
    expect(await setMatchSetupAction(MATCH_1, SETUP)).toEqual({ error: AUTH_REQUIRED });
  });

  it("validates the payload the way create does — a range is required on a formula scale", async () => {
    await mockSignedIn();
    const { setMatchSetupAction } = await import("./actions");
    expect(
      await setMatchSetupAction(MATCH_1, { ...SETUP, minGrade: null, maxGrade: null }),
    ).toEqual({ error: "Pick a min and max grade" });
  });

  it("refuses a second scale in the primary's own family", async () => {
    await mockSignedIn();
    const { setMatchSetupAction } = await import("./actions");
    expect(
      await setMatchSetupAction(MATCH_1, {
        ...SETUP,
        altGradingScale: "v",
        altMinGrade: 0,
        altMaxGrade: 10,
      }),
    ).toEqual({ error: "The second scale must be for the other discipline" });
  });

  it("writes through the RPC with nulls folded to undefined", async () => {
    const sb = await mockSignedIn();
    const { setMatchSetupAction } = await import("./actions");
    expect(await setMatchSetupAction(MATCH_1, SETUP)).toEqual({ success: true });
    expect(sb.calls.find((c) => c.source === "set_match_setup")?.args[0]).toEqual({
      p_set_id: MATCH_1,
      p_name: "Friday sesh",
      p_location: undefined,
      p_discipline: "boulder",
      p_grading_scale: "font",
      p_min_grade: 0,
      p_max_grade: 21,
      p_custom_grades: undefined,
      p_save_scale_name: undefined,
      p_alt_grading_scale: undefined,
      p_alt_min_grade: undefined,
      p_alt_max_grade: undefined,
    });
  });

  it("surfaces the locked-by-routes refusal as the RPC's own words", async () => {
    await mockSignedIn({
      "rpc:set_match_setup": {
        error: { code: "22023", message: "Routes are already up — grading is locked" },
      },
    });
    const { setMatchSetupAction } = await import("./actions");
    expect(await setMatchSetupAction(MATCH_1, SETUP)).toEqual({
      error: "Routes are already up — grading is locked",
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest --run src/app/match/actions.test.ts -t setMatchSetupAction`
Expected: FAIL — `setMatchSetupAction` is not exported.

- [ ] **Step 3: Extract the validator and add the action**

In `src/app/match/actions.ts`, replace the `CreateMatchPayload` interface and the body of `createMatchAction` up to the `rpc("create_match"…)` call with:

```ts
/** The setup a match is created with, and later changed from the lobby. */
export interface MatchSetupPayload {
  name?: string | null;
  location?: string | null;
  gradingScale: MatchGradingScale;
  minGrade?: number | null;
  maxGrade?: number | null;
  customGrades?: string[] | null;
  saveScaleName?: string | null;
  /** Default for the Match's routes; each may override. */
  discipline?: Discipline | null;
  /**
   * A mixed day: the scale for the discipline family this Match's own
   * discipline is NOT. Must be a formula scale in the OTHER family —
   * the server refuses the same family twice, since that isn't a
   * second scale, it's the first one written down again.
   */
  altGradingScale?: "v" | "font" | "yds" | "french" | null;
  altMinGrade?: number | null;
  altMaxGrade?: number | null;
}

interface CreateMatchPayload extends MatchSetupPayload {
  /** Score relative to each player's ceiling. Needs a graded scale. */
  handicap?: boolean;
  /**
   * Start this Match as the next week of a League the caller hosts.
   * The RPC refuses anyone else and any League that has ended.
   */
  leagueId?: string | null;
}

interface ValidatedSetup {
  name: string | null;
  location: string | null;
  discipline: Discipline;
  gradingScale: MatchGradingScale;
  minGrade: number | null;
  maxGrade: number | null;
  customGrades: string[] | null;
  saveScaleName: string | null;
  altScale: "v" | "font" | "yds" | "french" | null;
  altMin: number | null;
  altMax: number | null;
}

/**
 * The action-boundary half of match setup validation — the same
 * rules `match_setup_check` applies in SQL, run first so a malformed
 * payload never reaches the DB (CLAUDE.md "Validate ids at the
 * action boundary"). One copy, because create and the lobby's setup
 * sheet send the same shape.
 */
function validateMatchSetup(
  payload: MatchSetupPayload,
): { error: string } | { ok: ValidatedSetup } {
  if (!isScale(payload.gradingScale)) return { error: "Invalid grading scale" };

  const name = clampString(payload.name, MAX_NAME_LEN);
  const location = clampString(payload.location, MAX_LOCATION_LEN);

  let minGrade: number | null = null;
  let maxGrade: number | null = null;
  let customGrades: string[] | null = null;
  let saveScaleName: string | null = null;

  if (isFormulaScale(payload.gradingScale)) {
    if (typeof payload.minGrade !== "number" || typeof payload.maxGrade !== "number") {
      return { error: "Pick a min and max grade" };
    }
    if (payload.minGrade < 0 || payload.minGrade > 30) {
      return { error: "Min grade out of range" };
    }
    if (payload.maxGrade < payload.minGrade || payload.maxGrade > 30) {
      return { error: "Max grade must be above min and ≤ 30" };
    }
    minGrade = payload.minGrade;
    maxGrade = payload.maxGrade;
  } else if (payload.gradingScale === "custom") {
    if (!Array.isArray(payload.customGrades) || payload.customGrades.length === 0) {
      return { error: "Add at least one custom grade" };
    }
    if (payload.customGrades.length > MAX_CUSTOM_GRADES) {
      return { error: `Max ${MAX_CUSTOM_GRADES} grades` };
    }
    const normalised: string[] = [];
    for (const raw of payload.customGrades) {
      const label = clampString(raw, MAX_SCALE_NAME_LEN);
      if (!label) return { error: "Each grade needs a label" };
      normalised.push(label);
    }
    customGrades = normalised;
    saveScaleName = clampString(payload.saveScaleName, MAX_SCALE_NAME_LEN);
  }
  // `points` falls through — no grades, no range, nothing to validate.

  const discipline = payload.discipline ?? "boulder";
  if (!isDiscipline(discipline)) return { error: "Invalid discipline" };

  const altScale = payload.altGradingScale ?? null;
  let altMin: number | null = null;
  let altMax: number | null = null;
  if (altScale !== null) {
    if (!isFormulaScaleName(altScale)) return { error: "Invalid second grading scale" };
    if (scaleFamily(altScale) === scaleFamily(payload.gradingScale)) {
      return { error: "The second scale must be for the other discipline" };
    }
    if (typeof payload.altMinGrade !== "number" || typeof payload.altMaxGrade !== "number") {
      return { error: "Pick a min and max for the second scale" };
    }
    if (payload.altMinGrade < 0 || payload.altMinGrade > 30) {
      return { error: "Second min grade out of range" };
    }
    if (payload.altMaxGrade < payload.altMinGrade || payload.altMaxGrade > 30) {
      return { error: "Second max grade must be above min and ≤ 30" };
    }
    altMin = payload.altMinGrade;
    altMax = payload.altMaxGrade;
  }

  return {
    ok: {
      name, location, discipline,
      gradingScale: payload.gradingScale,
      minGrade, maxGrade, customGrades, saveScaleName,
      altScale, altMin, altMax,
    },
  };
}

export async function createMatchAction(
  payload: CreateMatchPayload,
): Promise<ActionResult<{ id: string; code: string }>> {
  const checked = validateMatchSetup(payload);
  if ("error" in checked) return { error: checked.error };
  const s = checked.ok;

  const leagueId = payload.leagueId ?? null;
  if (leagueId !== null && !isUuid(leagueId)) return { error: "Invalid league" };

  // No resource id to validate (the payload was validated above) —
  // the gate still supplies signed-in auth + the write rate limit.
  const auth = await gateSignedInMutation(null, "match");
  if ("error" in auth) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("create_match", {
    p_discipline: s.discipline,
    p_handicap: !!payload.handicap,
    p_name: undef(s.name),
    p_location: undef(s.location),
    p_grading_scale: s.gradingScale,
    p_min_grade: undef(s.minGrade),
    p_max_grade: undef(s.maxGrade),
    p_custom_grades: undef(s.customGrades),
    p_save_scale_name: undef(s.saveScaleName),
    p_alt_grading_scale: undef(s.altScale),
    p_alt_min_grade: undef(s.altMin),
    p_alt_max_grade: undef(s.altMax),
    p_league_id: undef(leagueId),
  });
  if (error) return { error: formatError(error) };
  const rows = (data ?? []) as Array<{ id: string; code: string }>;
  if (rows.length === 0) return { error: "Could not create the match." };
  return { success: true, ...rows[0] };
}
```

Then, after `setMatchHandicapAction`, add:

```ts
/**
 * Change a live match's setup from the lobby. Host only, and only
 * while no route exists — the RPC refuses otherwise, and its words
 * come straight back to the sheet.
 */
export async function setMatchSetupAction(
  matchId: string,
  payload: MatchSetupPayload,
): Promise<ActionResult> {
  const auth = await gateSignedInMutation(matchId, "match id");
  if ("error" in auth) return { error: auth.error };

  const checked = validateMatchSetup(payload);
  if ("error" in checked) return { error: checked.error };
  const s = checked.ok;

  const { error } = await auth.supabase.rpc("set_match_setup", {
    p_set_id: matchId,
    p_name: undef(s.name),
    p_location: undef(s.location),
    p_discipline: s.discipline,
    p_grading_scale: s.gradingScale,
    p_min_grade: undef(s.minGrade),
    p_max_grade: undef(s.maxGrade),
    p_custom_grades: undef(s.customGrades),
    p_save_scale_name: undef(s.saveScaleName),
    p_alt_grading_scale: undef(s.altScale),
    p_alt_min_grade: undef(s.altMin),
    p_alt_max_grade: undef(s.altMax),
  });
  if (error) return { error: formatError(error) };
  return { success: true };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest --run src/app/match/actions.test.ts src/lib/action-hygiene.test.ts`
Expected: PASS, including every existing `createMatchAction` test (the validator's messages are unchanged).

- [ ] **Step 5: Commit checkpoint**

```bash
git add src/app/match/actions.ts src/app/match/actions.test.ts
git commit -m "feat(match): setMatchSetupAction, sharing create's validation"
```

---

### Task 3: `matchTitle` helper and `isLobby` selector

**Files:**
- Create: `src/lib/data/match-title.ts`, `src/lib/data/match-title.test.ts`
- Modify: `src/components/Match/matchScreenReducer.ts` (add `isLobby`), `src/components/Match/matchScreenReducer.test.ts`
- Modify (call sites of `"Untitled match"`): `src/components/Match/MatchScreen.tsx:150`, `src/app/match/summary/[id]/page.tsx`, `src/components/Match/MatchHistoryList.tsx`, `src/components/Match/ActiveMatchBanner.tsx`, `src/components/Match/JoinMatchForm.tsx`

**Interfaces:**
- Produces `matchTitle(match: { name: string | null }): string`.
- Produces `isLobby(state: { routes: unknown[] }): boolean`.

- [ ] **Step 1: Write the failing tests**

`src/lib/data/match-title.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { matchTitle } from "./match-title";

describe("matchTitle", () => {
  it("uses the stored name", () => {
    expect(matchTitle({ name: "Friday sesh" })).toBe("Friday sesh");
  });
  it("trims it", () => {
    expect(matchTitle({ name: "  Friday sesh " })).toBe("Friday sesh");
  });
  it("falls back for legacy rows with no name", () => {
    expect(matchTitle({ name: null })).toBe("Untitled match");
    expect(matchTitle({ name: "   " })).toBe("Untitled match");
  });
});
```

Append to `src/components/Match/matchScreenReducer.test.ts`:
```ts
describe("isLobby", () => {
  it("is the lobby while no route exists", () => {
    expect(isLobby({ routes: [] })).toBe(true);
  });
  it("stops being the lobby at the first route", () => {
    expect(isLobby({ routes: [{ id: "r1" }] })).toBe(false);
  });
});
```
and add `isLobby` to that file's import from `./matchScreenReducer`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest --run src/lib/data/match-title.test.ts src/components/Match/matchScreenReducer.test.ts`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement**

`src/lib/data/match-title.ts`:
```ts
/**
 * What a match is called, everywhere it is named.
 *
 * Matches are created with a stored name now ("Tom's match"), so the
 * fallback is for rows from before that — one home for the word, so
 * the five lists that used to each write it stay in step.
 */
export function matchTitle(match: { name: string | null }): string {
  return match.name?.trim() || "Untitled match";
}
```

In `src/components/Match/matchScreenReducer.ts`, after `logKey`:
```ts
/**
 * A live match with no routes yet. Not a status — derived — and the
 * whole reason the empty screen is a lobby rather than an empty grid.
 */
export function isLobby(state: { routes: unknown[] }): boolean {
  return state.routes.length === 0;
}
```

Replace each `?.trim() || "Untitled match"` / `?? "Untitled match"` expression at the five call sites with `matchTitle(x)` and import it from `@/lib/data/match-title`. Find them:
```bash
grep -rn "Untitled match" src --include='*.tsx'
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm vitest --run src/lib/data/match-title.test.ts src/components/Match && pnpm typecheck`
Expected: PASS. `grep -rn "Untitled match" src --include='*.tsx'` returns nothing (only `match-title.ts` holds the words).

- [ ] **Step 5: Commit checkpoint**

```bash
git add src/lib/data/match-title.ts src/lib/data/match-title.test.ts src/components/Match src/app/match
git commit -m "refactor(match): one home for a match's title, and a lobby selector"
```

---

### Task 4: `GradingSetup` — lift the wizard's grading step into a component

**Files:**
- Create: `src/components/Match/GradingSetup.tsx`, `src/components/Match/gradingSetup.module.scss`
- Modify: `src/components/Match/CreateMatchForm.tsx` (step 1 renders `<GradingSetup>`), `src/components/Match/createMatchForm.module.scss` (move the custom-grade styles)
- Modify: `src/components/Match/createMatchReducer.ts:51-65` (`CreateMatchPrefill.leagueId` becomes `string | null`)

**Interfaces:**
- Produces `export function GradingSetup({ state, dispatch, savedScales, onMaxGrades }: { state: CreateMatchState; dispatch: Dispatch<CreateMatchAction>; savedScales: SavedScale[]; onMaxGrades: () => void })`. Renders the discipline tiles (Boulders / Ropes / Mixed), the scale tiles, the second scale, the handicap toggle and the custom ladder editor with saved scales. Owns no state.
- The form keeps working exactly as before (this task is a pure extraction; the form is deleted in Task 6).

- [ ] **Step 1: Create the component**

Move everything the form renders inside `{wizardStep === 1 && (…)}` — from `<h2>What are you climbing?</h2>` through the closing of the custom-scale section — into `GradingSetup.tsx`, along with `DisciplineChoice`, `DISCIPLINE_CHOICES`, `scaleOptions`, `formulaScaleOptions`, `chooseDiscipline` and the `primaryFamily` / `ownFamilyLabel` / `otherFamilyLabel` / `altScaleChoices` derivations. Signature:

```tsx
"use client";

import type { Dispatch } from "react";
import { FaPlus, FaXmark, FaArrowUp, FaArrowDown, FaScaleBalanced } from "react-icons/fa6";
import { ChoiceTiles, ToggleRow } from "@/components/ui";
import {
  SCALE_LABEL, DISCIPLINES, DISCIPLINE_LABEL, DISCIPLINE_SCALES,
  disciplineFamily, type Discipline,
} from "@/lib/data/grade-label";
import type { MatchGradingScale, SavedScale } from "@/lib/data/match-types";
import {
  isFormulaScale, MAX_CUSTOM_GRADES,
  type CreateMatchAction, type CreateMatchState, type FormulaScale,
} from "./createMatchReducer";
import styles from "./gradingSetup.module.scss";

interface Props {
  state: CreateMatchState;
  dispatch: Dispatch<CreateMatchAction>;
  savedScales: SavedScale[];
  /** Fired instead of adding when the ladder is full; the host toasts. */
  onMaxGrades: () => void;
}

export function GradingSetup({ state, dispatch, savedScales, onMaxGrades }: Props) {
  const { discipline, scale, altScale, handicap, customGrades, newGradeInput, saveScale, scaleName } = state;
  // … the derivations and JSX moved from CreateMatchForm, unchanged,
  // with `addCustomGrade` defined here:
  function addCustomGrade() {
    if (!newGradeInput.trim()) return;
    if (customGrades.length >= MAX_CUSTOM_GRADES) return onMaxGrades();
    dispatch({ type: "add-grade" });
  }
  return ( /* the step-1 JSX, top-level element a <div className={styles.root}> */ );
}
```

Move the SCSS rules the moved JSX uses (`.question`, `.hint`, `.customSection`, `.savedPills`, `.savedLabel`, `.savedPill`, `.addGradeRow`, `.input`, `.addButton`, `.gradeList`, `.gradeItem`, `.gradeOrdinal`, `.gradeLabel`, `.gradeActions`, `.gradeIconBtn`, `.gradeHint`, `.field`, `.label`) from `createMatchForm.module.scss` into `gradingSetup.module.scss`, adding `.root { @include layout.stack(var(--space-6)); }`. Keep `.question` and `.hint` in the form's stylesheet too — step 0 and 2 still use them.

- [ ] **Step 2: Wire the form to it**

In `CreateMatchForm.tsx`, step 1 becomes:
```tsx
{wizardStep === 1 && (
  <div className={styles.step} key={1}>
    <GradingSetup
      state={state}
      dispatch={dispatch}
      savedScales={savedScales}
      onMaxGrades={() => showToast("Max 50 grades", "error")}
    />
  </div>
)}
```
Delete the now-unused imports and helpers from the form.

- [ ] **Step 3: Loosen the prefill type**

In `createMatchReducer.ts`, `CreateMatchPrefill.leagueId: string;` → `leagueId: string | null;`. The lobby's setup sheet hydrates from a match that has no league in hand. Fix the one place that reads it (`initialCreateMatchState` already copies it into `leagueId: string | null` state — confirm with typecheck).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest --run src/components/Match src/styles`
Expected: all pass. Load `http://localhost:3000/match/new`, step 2 renders and behaves as before (Mixed on Sport shows Boulder grades; custom ladder adds/moves/removes).

- [ ] **Step 5: Commit checkpoint**

```bash
git add src/components/Match
git commit -m "refactor(match): GradingSetup — the grading step as a component"
```

---

### Task 5: Posters — `/match/new` creates in one tap

**Files:**
- Create: `src/components/Match/GamePosters.tsx`, `src/components/Match/gamePosters.module.scss`
- Modify: `src/app/match/new/page.tsx`, `src/app/match/new/new.module.scss`

**Interfaces:**
- Consumes `createMatchAction`, `setMatchGameMode` (existing), `SCALE_HARD_MAX` from `@/lib/data/grade-label`, `CreateMatchPrefill` (Task 4's loosened type).
- Produces `<GamePosters defaultName={string} prefill?={CreateMatchPrefill} />`.

- [ ] **Step 1: The posters component**

`src/components/Match/GamePosters.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaTrophy, FaSpellCheck } from "react-icons/fa6";
import { showToast } from "@/components/ui";
import { SCALE_HARD_MAX } from "@/lib/data/grade-label";
import { createMatchAction, setMatchGameMode } from "@/app/match/actions";
import type { CreateMatchPrefill } from "./createMatchReducer";
import styles from "./gamePosters.module.scss";

type GameMode = "points" | "chork";

interface Props {
  /** "Tom's match" — stored on the row, editable from the lobby. */
  defaultName: string;
  /** Starting a week of a League: last week's settings, not the defaults. */
  prefill?: CreateMatchPrefill;
}

const POSTERS: { mode: GameMode; title: string; line: string; icon: React.ReactNode }[] = [
  {
    mode: "points",
    title: "Points",
    line: "Most points wins. Every send scores.",
    icon: <FaTrophy aria-hidden />,
  },
  {
    mode: "chork",
    title: "Chork",
    line: "Set a route and send it. Everyone else matches you or takes a letter.",
    icon: <FaSpellCheck aria-hidden />,
  },
];

/**
 * Two posters; tapping one IS creating the match. Everything else
 * about a match is set from the lobby, where the people it's for can
 * see it happen. A form asked four questions before a match existed
 * and rewarded them with an empty grid.
 */
export function GamePosters({ defaultName, prefill }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tapped, setTapped] = useState<GameMode | null>(null);

  function start(mode: GameMode) {
    setTapped(mode);
    startTransition(async () => {
      const payload = prefill
        ? {
            name: prefill.name,
            location: prefill.location,
            discipline: prefill.discipline,
            gradingScale: prefill.scale,
            minGrade: prefill.minGrade,
            maxGrade: prefill.maxGrade,
            handicap: prefill.handicap,
            altGradingScale: prefill.altScale,
            altMinGrade: prefill.altMinGrade,
            altMaxGrade: prefill.altMaxGrade,
            leagueId: prefill.leagueId,
          }
        : {
            name: defaultName,
            discipline: "boulder" as const,
            gradingScale: "v" as const,
            minGrade: 0,
            maxGrade: SCALE_HARD_MAX.v,
          };
      const result = await createMatchAction(payload);
      if ("error" in result) {
        showToast(result.error, "error");
        setTapped(null);
        return;
      }
      // Set after creation rather than as a fourteenth argument to
      // `create_match` — see the note on `setMatchGameMode`. A failure
      // here leaves a playable points match rather than nothing.
      if (mode === "chork") {
        const r = await setMatchGameMode(result.id, "chork");
        if ("error" in r) showToast(r.error, "error");
      }
      router.push(`/match/${result.id}`);
    });
  }

  return (
    <div className={styles.posters}>
      {POSTERS.map((p) => (
        <button
          key={p.mode}
          type="button"
          className={styles.poster}
          onClick={() => start(p.mode)}
          disabled={pending}
          aria-busy={tapped === p.mode || undefined}
        >
          <span className={styles.glyph}>{p.icon}</span>
          <span className={styles.title}>{p.title}</span>
          <span className={styles.line}>{p.line}</span>
          <span className={styles.cta}>{tapped === p.mode ? "Starting…" : "Start"}</span>
        </button>
      ))}
    </div>
  );
}
```

`src/components/Match/gamePosters.module.scss`:
```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;
@use "mixins/focus";
@use "mixins/state" as state;

.posters {
  @include layout.stack(var(--space-4));
}

// The sent tile at card scale: solid accent, on-solid ink, the same
// radius as every card. Tapping it is the whole act of starting.
.poster {
  @include focus.ring;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    "glyph title"
    "glyph line"
    "glyph cta";
  column-gap: var(--space-4);
  row-gap: var(--space-1);
  align-items: start;
  text-align: left;
  width: 100%;
  padding: var(--space-5);
  border: 0;
  border-radius: var(--radius-card);
  background: var(--accent-solid);
  color: var(--accent-on-solid);
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-out),
    transform var(--duration-instant) var(--ease-out);

  &:hover { background: var(--accent-solid-hover); }
  &:active { transform: scale(0.99); }
  &:disabled { @include state.disabled-bare; cursor: progress; }
}

.glyph {
  grid-area: glyph;
  display: inline-flex;
  font-size: var(--size-icon-lg);
  padding-top: var(--space-1);
}

.title {
  grid-area: title;
  @include type.typography(display, $step: 3xl);
}

.line {
  grid-area: line;
  @include type.typography(body);
}

.cta {
  grid-area: cta;
  @include type.typography(label);
  margin-top: var(--space-3);
}
```
If `--size-icon-lg` does not exist, check `src/styles/theme/spacing.scss` for the icon size tokens and use the largest defined; do not invent a px value.

- [ ] **Step 2: The page**

Replace the return block of `src/app/match/new/page.tsx` with:
```tsx
  const profile = await getServerProfile();
  const firstName = profile?.name?.trim().split(/\s+/)[0] || profile?.username || "My";
  const defaultName = firstName === "My" ? "My match" : `${firstName}'s match`;

  return (
    <main className={styles.page}>
      <PageHeader
        title={league ? `Week ${league.weekNumber}` : "Start a match"}
        subtitle={league ? league.name : "Pick a game. Everything else is set from the lobby."}
      />
      <GamePosters defaultName={defaultName} prefill={league?.prefill} />
    </main>
  );
```
Import `getServerProfile` from `@/lib/supabase/server` and `GamePosters` from `@/components/Match/GamePosters`; drop the `CreateMatchForm` and `getUserSavedScales` imports and the `savedScales` fetch. Keep the League prefill computation exactly as it is; its `league` shape now only needs `{ name, weekNumber, prefill }` — narrow the type accordingly (`ComponentProps<typeof CreateMatchForm>["league"]` → a local interface `{ name: string; weekNumber: number; prefill: CreateMatchPrefill }`).

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint`. Load `/match/new`: two accent posters; tapping Points creates a match named "Tom's match" and lands on it. Tapping Chork lands on a Chork match. `/match/new?league=<id>` shows "Week N" and creates with last week's settings.

- [ ] **Step 4: Commit checkpoint**

```bash
git add src/components/Match/GamePosters.tsx src/components/Match/gamePosters.module.scss src/app/match/new
git commit -m "feat(match): starting a match is one tap on a poster"
```

---

### Task 6: Delete the wizard

**Files:**
- Delete: `src/components/Match/CreateMatchForm.tsx`, `src/components/Match/createMatchForm.module.scss`
- Keep: `createMatchReducer.ts` + its test (the setup sheet uses them), `GradingSetup.tsx`

- [ ] **Step 1: Delete and sweep**

```bash
git rm src/components/Match/CreateMatchForm.tsx src/components/Match/createMatchForm.module.scss
grep -rn "CreateMatchForm\|createMatchForm" src docs/*.md CLAUDE.md
```
Expected: no references in `src`. Update any doc line that names the form (CLAUDE.md "Server actions live next to their pages" paragraph does not; `docs/roadmap.md` may).

- [ ] **Step 2: Verify**

Run: `pnpm check`
Expected: green. `createMatchReducer.test.ts` still passes untouched.

- [ ] **Step 3: Commit checkpoint**

```bash
git add -A src docs
git commit -m "chore(match): the create wizard goes"
```

---

### Task 7: Setup pills and the setup sheet

**Files:**
- Create: `src/components/Match/MatchSetupSheet.tsx`, `src/components/Match/matchSetupSheet.module.scss`
- Create: `src/components/Match/MatchSetupPills.tsx`, `src/components/Match/matchSetupPills.module.scss`
- Modify: `src/components/Match/matchScreenReducer.ts:39-56` (`MatchPanel` gains `setup` and `invite`)
- Modify: `src/components/Match/useMatchScreenState.ts` (add `handleSetup`)
- Modify: `src/components/Match/MatchScreen.tsx` (render pills in hero; mount the sheet)
- Modify: `src/app/match/[id]/page.tsx` (fetch `savedScales` for the host, pass through)

**Interfaces:**
- `MatchPanel` gains `{ kind: "setup"; section: SetupSection }` and `{ kind: "invite" }` where `export type SetupSection = "game" | "climbing" | "details"`.
- `useMatchScreenState` returns `handleSetup(payload: MatchSetupPayload): Promise<boolean>` — calls `setMatchSetupAction`, toasts on error, `router.refresh()` + closes on success, returns success.
- `<MatchSetupPills match={Match} isHost={boolean} locked={boolean} onOpen={(section: SetupSection) => void} />`.
- `<MatchSetupSheet section={SetupSection} match={Match} grades={{ordinal,label}[]} savedScales={SavedScale[]} onSubmit={(payload) => Promise<boolean>} onGameMode={(mode) => void} pending={boolean} onClose={() => void} />`.
- `MatchScreen` gains prop `savedScales: SavedScale[]`.

- [ ] **Step 1: Panel kinds**

In `matchScreenReducer.ts`, extend the union:
```ts
export type SetupSection = "game" | "climbing" | "details";

export type MatchPanel =
  | { kind: "none" }
  // … existing members unchanged …
  | { kind: "setup"; section: SetupSection }
  | { kind: "invite" };
```
Run `pnpm vitest --run src/components/Match/matchScreenReducer.test.ts` — panel-exclusivity tests still pass (they open one kind and assert others close; add none).

- [ ] **Step 2: `handleSetup` in the hook**

In `useMatchScreenState.ts`, next to `handleEnd`:
```ts
  const handleSetup = async (payload: MatchSetupPayload): Promise<boolean> => {
    let ok = false;
    await run(async () => {
      const r = await setMatchSetupAction(initialState.match.id, payload);
      if ("error" in r) {
        showToast(r.error, "error");
        return;
      }
      ok = true;
      // `initialState.match` is a server prop; the setup lives there.
      // A refresh re-reads it, and the sheet closes on the fresh
      // props rather than a guess.
      router.refresh();
      dispatch({ type: "close-panel" });
    });
    return ok;
  };
```
Use whatever the hook already calls its `startTransition` wrapper (`run` above stands for it — read the hook and match its name), import `setMatchSetupAction` and `MatchSetupPayload` from `@/app/match/actions`, `useRouter` from `next/navigation` if not already there, and add `handleSetup` to the returned object.

- [ ] **Step 3: The pills**

`MatchSetupPills.tsx`:
```tsx
"use client";

import { SCALE_LABEL, DISCIPLINE_LABEL } from "@/lib/data/grade-label";
import type { Match } from "@/lib/data/match-types";
import type { SetupSection } from "./matchScreenReducer";
import styles from "./matchSetupPills.module.scss";

interface Props {
  match: Match;
  isHost: boolean;
  /** Grading is locked once a route exists; the pills say so. */
  locked: boolean;
  onOpen: (section: SetupSection) => void;
}

/**
 * The match's setup, worn on its hero: game · climbing · grading ·
 * where. The host taps one to change it; everyone else reads it.
 * Grading and climbing lock with the first route — a tap then toasts
 * why rather than opening a sheet that would only refuse.
 */
export function MatchSetupPills({ match, isHost, locked, onOpen }: Props) {
  const climbing = match.alt_grading_scale
    ? "Boulders and ropes"
    : DISCIPLINE_LABEL[match.discipline];
  const grading = match.alt_grading_scale
    ? `${SCALE_LABEL[match.grading_scale]} + ${SCALE_LABEL[match.alt_grading_scale]}`
    : SCALE_LABEL[match.grading_scale];
  const pills: { section: SetupSection; text: string; lockable: boolean }[] = [
    { section: "game", text: match.game_mode === "chork" ? "Chork" : "Points", lockable: false },
    { section: "climbing", text: climbing, lockable: true },
    { section: "climbing", text: grading, lockable: true },
    { section: "details", text: match.location ?? "Add a location", lockable: false },
  ];
  return (
    <ul className={styles.row} aria-label="Match setup">
      {pills.map((p) => (
        <li key={`${p.section}-${p.text}`}>
          {isHost ? (
            <button
              type="button"
              className={`${styles.pill} ${p.lockable && locked ? styles.pillLocked : ""}`}
              onClick={() => onOpen(p.section)}
            >
              {p.text}
            </button>
          ) : (
            <span className={styles.pill}>{p.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
```

`matchSetupPills.module.scss`:
```scss
@use "mixins/typography" as type;
@use "mixins/focus";

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.pill {
  @include type.typography(label);
  @include focus.ring;
  display: inline-flex;
  align-items: center;
  min-height: var(--size-touch-target);
  padding: 0 var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--mono-border-subtle);
  background: var(--mono-bg);
  color: var(--mono-text);
  cursor: default;

  @at-root button#{&} {
    cursor: pointer;
    &:hover { border-color: var(--accent-border); }
  }
}

.pillLocked {
  color: var(--mono-text-low-contrast);
}
```

In `MatchScreen.tsx`, the hero's `metaRow` becomes the pills plus the player count chip. The host taps a locked pill → `showToast("Grading is locked once a route is up", "error")` instead of opening; wire that in the `onOpen` callback using `isLobby(state)`.

- [ ] **Step 4: The sheet**

`MatchSetupSheet.tsx`:
```tsx
"use client";

import { useReducer } from "react";
import { BottomSheet, Button, ChoiceTiles, FormField, SheetActions, SheetBody, showToast } from "@/components/ui";
import type { Match, SavedScale } from "@/lib/data/match-types";
import type { MatchSetupPayload } from "@/app/match/actions";
import { GradingSetup } from "./GradingSetup";
import {
  buildCreateMatchPayload, createMatchReducer, initialCreateMatchState, isFormulaScale,
  type CreateMatchPrefill,
} from "./createMatchReducer";
import type { SetupSection } from "./matchScreenReducer";
import styles from "./matchSetupSheet.module.scss";

interface Props {
  section: SetupSection;
  match: Match;
  grades: Array<{ ordinal: number; label: string }>;
  savedScales: SavedScale[];
  onSubmit: (payload: MatchSetupPayload) => Promise<boolean>;
  onGameMode: (mode: "points" | "chork") => void;
  pending: boolean;
  onClose: () => void;
}

const TITLES: Record<SetupSection, string> = {
  game: "What are you playing?",
  climbing: "What are you climbing?",
  details: "Details",
};

/** The match as the create reducer sees it — its state, hydrated. */
function prefillFrom(match: Match, grades: Props["grades"]): CreateMatchPrefill {
  const alt = match.alt_grading_scale;
  return {
    name: match.name ?? "",
    location: match.location,
    discipline: match.discipline,
    scale: match.grading_scale,
    handicap: match.handicap,
    gameMode: match.game_mode,
    minGrade: match.min_grade,
    maxGrade: match.max_grade,
    altScale: alt && isFormulaScale(alt) ? alt : null,
    altMinGrade: match.alt_min_grade,
    altMaxGrade: match.alt_max_grade,
    leagueId: match.league_id,
    customGrades: grades.map((g) => g.label),
  };
}

/**
 * One sheet, three sections, one reducer. The create wizard's own
 * state machine drives it — a match's setup is exactly what that
 * reducer models, so the lobby edits it with the same transitions the
 * form used to, and `buildCreateMatchPayload` produces what
 * `set_match_setup` takes.
 */
export function MatchSetupSheet({ section, match, grades, savedScales, onSubmit, onGameMode, pending, onClose }: Props) {
  const [state, dispatch] = useReducer(createMatchReducer, prefillFrom(match, grades), initialCreateMatchState);

  async function save() {
    const p = buildCreateMatchPayload(state);
    await onSubmit({
      name: p.name, location: p.location, discipline: p.discipline,
      gradingScale: p.gradingScale, minGrade: p.minGrade, maxGrade: p.maxGrade,
      customGrades: p.customGrades, saveScaleName: p.saveScaleName,
      altGradingScale: p.altGradingScale, altMinGrade: p.altMinGrade, altMaxGrade: p.altMaxGrade,
    });
  }

  return (
    <BottomSheet open onClose={onClose} title={TITLES[section]}>
      <SheetBody>
        {section === "game" && (
          <ChoiceTiles<"points" | "chork">
            options={[
              { value: "points", label: "Points", detail: "Most points wins" },
              { value: "chork", label: "Chork", detail: "Miss and take a letter" },
            ]}
            value={match.game_mode}
            onChange={onGameMode}
            ariaLabel="Game mode"
          />
        )}
        {section === "climbing" && (
          <GradingSetup
            state={state}
            dispatch={dispatch}
            savedScales={savedScales}
            onMaxGrades={() => showToast("Max 50 grades", "error")}
          />
        )}
        {section === "details" && (
          <div className={styles.fields}>
            <FormField id="setup-name" label="Name" type="text" value={state.name} maxLength={80}
              placeholder="e.g. Friday sesh"
              onChange={(e) => dispatch({ type: "set-name", value: e.target.value })} />
            <FormField id="setup-location" label="Where" type="text" value={state.location} maxLength={120}
              placeholder="e.g. Fontainebleau, the garage"
              onChange={(e) => dispatch({ type: "set-location", value: e.target.value })} />
          </div>
        )}
      </SheetBody>
      {section !== "game" && (
        <SheetActions>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save} loading={pending}>Save</Button>
        </SheetActions>
      )}
    </BottomSheet>
  );
}
```
`CreateMatchPrefill` needs an optional `customGrades?: string[]` — add it, and in `initialCreateMatchState` copy it into `customGrades` when the prefill's scale is `custom`. `matchSetupSheet.module.scss` holds only `.fields { @include layout.stack(var(--space-4)); }`. Check `SheetActions`' props in `src/components/ui/SheetActions.tsx` before using it.

Mount in `MatchScreen.tsx` beside the other panels:
```tsx
{panel.kind === "setup" && (
  <MatchSetupSheet
    section={panel.section}
    match={initialState.match}
    grades={initialState.grades}
    savedScales={savedScales}
    onSubmit={handleSetup}
    onGameMode={(mode) => { void setMatchGameMode(initialState.match.id, mode).then(() => router.refresh()); }}
    pending={isPending}
    onClose={closePanel}
  />
)}
```
(Route the game-mode change through the hook as `handleGameMode` if the hook already wraps `setMatchGameMode`; grep for it first.)

- [ ] **Step 5: `savedScales` from the page**

In `src/app/match/[id]/page.tsx`, alongside `getMatchStateForUser`, fetch `const savedScales = initialState.match.host_id === auth.userId ? await getUserSavedScales(auth.supabase) : [];` (import from `@/lib/data/match-queries`) and pass `savedScales={savedScales}` to `<MatchScreen>`.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest --run src/components/Match src/styles`. In the app, as host on a fresh match: tap the "Boulders" pill → sheet with Boulders / Ropes / Mixed; switch to Ropes + French, Save → hero pills read "Sport · French". Add a route, tap the pill → toast "Grading is locked once a route is up". Details pill renames the match.

- [ ] **Step 7: Commit checkpoint**

```bash
git add src/components/Match src/app/match
git commit -m "feat(match): the hero wears the setup, and the host edits it in place"
```

---

### Task 8: The lobby

**Files:**
- Create: `src/components/Match/MatchJoinPanel.tsx`, `src/components/Match/matchJoinPanel.module.scss` (code + QR + share + invite + guest, shared by lobby card and invite sheet)
- Create: `src/components/Match/MatchLobby.tsx`, `src/components/Match/matchLobby.module.scss`
- Create: `src/components/Match/MatchInviteSheet.tsx`
- Modify: `src/components/Match/MatchMenuSheet.tsx` (drop code/QR/invite/guest; keep end/leave)
- Modify: `src/components/Match/MatchScreen.tsx` (lobby vs playing branch; Invite pill; mount invite sheet)

**Interfaces:**
- `<MatchJoinPanel match={Match} isHost={boolean} onInviteFriends={() => void} onAddGuest={() => void} />` — renders the two sections currently in `MatchMenuSheet` (`codeSection`, `qrSection`) and the two buttons; the `copyCode` / `shareLink` / `scanUrl` logic moves here verbatim.
- `<MatchLobby match={Match} players={MatchPlayerView[]} isHost={boolean} isChork={boolean} onAddRoute={() => void} onInviteFriends={() => void} onAddGuest={() => void} />`.
- `<MatchInviteSheet …MatchJoinPanel props, onClose />` — `BottomSheet` titled "Invite" around `MatchJoinPanel`.

- [ ] **Step 1: Extract `MatchJoinPanel`**

Move the `codeSection`/`qrSection`/Invite friends/Add a guest JSX and the `scanUrl`, `copyCode`, `shareLink` functions out of `MatchMenuSheet.tsx` into `MatchJoinPanel.tsx` (same imports: `QRCodeSVG`, `Button`, `showToast`, the four icons). Move `.codeSection`, `.codeLabel`, `.code`, `.codeActions`, `.qrSection`, `.qrFrame`, `.qrCaption` from `matchMenuSheet.module.scss` into `matchJoinPanel.module.scss` and wrap them in a root: `.panel { @include layout.stack(var(--space-4)); }`. Bump `.code` to `@include type.typography(code, $step: 3xl)` — the code is the lobby's biggest fact.

`MatchMenuSheet` keeps: the danger button and the two `ConfirmInline`s. Its props drop `onAddGuest` and `onInviteFriends`.

- [ ] **Step 2: The lobby**

`MatchLobby.tsx`:
```tsx
"use client";

import { FaPlus, FaPaperPlane } from "react-icons/fa6";
import { Button, UserAvatar, Username } from "@/components/ui";
import type { Match, MatchPlayerView } from "@/lib/data/match-types";
import { ownerIdOf } from "@/lib/data/match-types";
import { MatchJoinPanel } from "./MatchJoinPanel";
import styles from "./matchLobby.module.scss";

interface Props {
  match: Match;
  players: MatchPlayerView[];
  isHost: boolean;
  isChork: boolean;
  onAddRoute: () => void;
  onInviteFriends: () => void;
  onAddGuest: () => void;
}

/**
 * A live match with no routes yet. The setup screen, in the place
 * the match happens: the code and QR so people can get in, the
 * players as they arrive, and one thing to do next. Nobody fills a
 * form to get here — see the spec.
 */
export function MatchLobby({ match, players, isHost, isChork, onAddRoute, onInviteFriends, onAddGuest }: Props) {
  return (
    <div className={styles.lobby}>
      <section className={styles.card} aria-label="Join">
        <MatchJoinPanel match={match} isHost={isHost} onInviteFriends={onInviteFriends} onAddGuest={onAddGuest} />
      </section>

      <section className={styles.card} aria-label="Players">
        <h2 className={styles.heading}>Players</h2>
        <ul className={styles.players}>
          {players.map((p) => (
            <li key={p.player_id} className={styles.player}>
              <UserAvatar
                user={{ id: ownerIdOf(p), username: p.username ?? "guest", name: p.display_name ?? "", avatar_url: p.avatar_url ?? "" }}
                size="row"
              />
              <span className={styles.playerName}>
                {p.is_guest || !p.username ? (p.display_name ?? "Guest") : <Username username={p.username} />}
              </span>
              {p.is_host && <span className={styles.tag}>Host</span>}
              {p.is_guest && <span className={styles.tag}>Guest</span>}
            </li>
          ))}
        </ul>
        {players.length < 2 && (
          <p className={styles.waiting}>Waiting for players — share the code.</p>
        )}
      </section>

      <Button type="button" onClick={onAddRoute} fullWidth>
        <FaPlus aria-hidden /> {isChork ? "Set the first challenge" : "Add the first route"}
      </Button>
      <Button type="button" variant="secondary" onClick={onInviteFriends} fullWidth>
        <FaPaperPlane aria-hidden /> Invite friends
      </Button>
    </div>
  );
}
```

`matchLobby.module.scss`:
```scss
@use "mixins/typography" as type;
@use "mixins/layout" as layout;
@use "mixins/surfaces" as surface;

.lobby {
  @include layout.stack(var(--space-4));
  margin: 0 var(--gutter-x);
  max-width: var(--content-app);
  width: calc(100% - 2 * var(--gutter-x));
  box-sizing: border-box;
}

.card {
  @include surface.card;
  @include layout.stack(var(--space-4));
  border-radius: var(--radius-card);
  padding: var(--space-4);
}

.heading {
  @include type.typography(card-title);
  color: var(--mono-text);
  margin: 0;
}

.players {
  list-style: none;
  margin: 0;
  padding: 0;
}

// Rows flush to the card, a hairline between them — no inset tint.
.player {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--size-touch-target);
  padding: var(--space-2) 0;

  & + & { border-top: 1px solid var(--mono-border-subtle); }
}

.playerName {
  @include type.typography(label, $step: sm);
  color: var(--mono-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  @include type.typography(meta, $step: xs);
  color: var(--mono-text-low-contrast);
}

.waiting {
  @include type.typography(meta, $step: sm);
  color: var(--mono-text-low-contrast);
  margin: 0;
}
```
The `.lobby` margin/width block copies `.leaderboardStrip`'s page-column rule from `matchScreen.module.scss`, including its `@include bp.tablet { margin-inline: auto }` — copy that too.

- [ ] **Step 3: `MatchInviteSheet`**

```tsx
"use client";

import { BottomSheet, SheetBody } from "@/components/ui";
import type { Match } from "@/lib/data/match-types";
import { MatchJoinPanel } from "./MatchJoinPanel";

interface Props {
  match: Match;
  isHost: boolean;
  onInviteFriends: () => void;
  onAddGuest: () => void;
  onClose: () => void;
}

/** The lobby's join card, as a sheet, once the match is under way. */
export function MatchInviteSheet({ match, isHost, onInviteFriends, onAddGuest, onClose }: Props) {
  return (
    <BottomSheet open onClose={onClose} title="Invite">
      <SheetBody>
        <MatchJoinPanel match={match} isHost={isHost} onInviteFriends={onInviteFriends} onAddGuest={onAddGuest} />
      </SheetBody>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: Branch the screen**

In `MatchScreen.tsx`:
- `const lobby = isLobby(state);` (import from `./matchScreenReducer`).
- The hero's `codeChip` button goes; its slot becomes an `Invite` pill (`<Button variant="secondary" onClick={() => openPanel({ kind: "invite" })}>`) shown only when `!lobby` — in the lobby the join card carries it.
- Wrap the board strip / Chork board / `MatchGrid` block: when `lobby`, render `<MatchLobby match={initialState.match} players={state.players} isHost={isHost} isChork={isChork} onAddRoute={() => openPanel({ kind: "add" })} onInviteFriends={() => openPanel({ kind: "invite-friends" })} onAddGuest={() => openPanel({ kind: "add-guest" })} />` instead.
- Mount `{panel.kind === "invite" && <MatchInviteSheet match={initialState.match} isHost={isHost} onInviteFriends={() => openPanel({ kind: "invite-friends" })} onAddGuest={() => openPanel({ kind: "add-guest" })} onClose={closePanel} />}`.
- `MatchMenuSheet` call drops `onAddGuest` / `onInviteFriends`.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm vitest --run src/components/Match src/styles`. In the app: fresh match shows join card (code big, QR), Players card with you as Host and "Waiting for players", "Add the first route". Join from a second account with the code → the row appears without a refresh (realtime `set_players`). Add a route → grid appears, hero shows Invite pill, ⋮ menu has only End match.

- [ ] **Step 6: Commit checkpoint**

```bash
git add src/components/Match
git commit -m "feat(match): the empty match is a lobby"
```

---

### Task 9: Playing state — one add tile, no FAB, wrapping title, flush rows

**Files:**
- Modify: `src/components/Match/MatchGrid.tsx`, `src/components/Match/matchGrid.module.scss`
- Modify: `src/components/Match/MatchScreen.tsx` (remove FAB), `src/components/Match/matchScreen.module.scss` (remove `.floatingAdd` + keyframe, `.title` wraps, strip padding)
- Modify: `src/components/Match/chorkBoard.module.scss` (flush rows)
- Modify: `src/components/Match/MatchAddRouteSheet.tsx` (scale line with Change link in the lobby)

**Interfaces:**
- `MatchGrid` gains `canAdd: boolean` and `waitingFor?: string | null` (a username). `onAddTap` unchanged. `addLabel: string` ("Add route" / "Set a route").
- `MatchAddRouteSheet` gains `scaleLabel: string` and `onChangeScale?: () => void`.

- [ ] **Step 1: The add tile**

In `MatchGrid.tsx`, replace the trailing button:
```tsx
      {canAdd ? (
        <button type="button" className={styles.addTile} onClick={onAddTap}>
          <FaPlus aria-hidden />
          <span className={styles.addLabel}>{addLabel}</span>
        </button>
      ) : (
        <div className={styles.waitTile} aria-live="polite">
          <span className={styles.addLabel}>
            {waitingFor ? `Waiting for @${waitingFor}` : "Waiting for the setter"}
          </span>
        </div>
      )}
```
In `matchGrid.module.scss`, `.addTile` keeps its square and dashed border but gains `flex-direction: column; gap: var(--space-1); border-color: var(--accent-border); color: var(--accent-text);` and `.addLabel { @include type.typography(icon-label); }` — the word captions the glyph, which is exactly what that rung is for. `.waitTile` is `.addTile` without the pointer, dashed in `--mono-border`, `color: var(--mono-text-low-contrast)`.

In `MatchScreen.tsx`, pass `canAdd={canSet}`, `addLabel={isChork ? "Set a route" : "Add route"}`, `waitingFor={penPlayer?.username ?? null}`, and delete the `{canSet && (<button className={styles.floatingAdd}…` block and the `FaPlus` import if now unused. Delete `.floatingAdd` and `@keyframes fab-enter` from the stylesheet.

- [ ] **Step 2: Title wraps, rows flush**

`matchScreen.module.scss` `.title`: remove `white-space`, `overflow`, `text-overflow`; add `overflow-wrap: anywhere;`. `.leaderboardStrip` and `chorkBoard.module.scss` `.board`: `padding: 0;`. `chorkBoard.module.scss` `.row`: `border-radius: 0; padding: var(--space-3) var(--space-4);` and add `.board > li + li { border-top: 1px solid var(--mono-border-subtle); }`. `.self`: drop the `box-shadow` inset bar; keep the tint. For the points board, `LeaderboardRow` owns its row padding — check `src/components/ui/LeaderboardRow/leaderboardRow.module.scss` and, if it has a radius, leave it; the strip's zero padding is enough for flush.

- [ ] **Step 3: The scale line on the add-route sheet**

In `MatchAddRouteSheet.tsx`, under the sheet's title (inside `SheetBody`, first child), when `mode === "add"`:
```tsx
<p className={styles.scaleLine}>
  Grading in {scaleLabel}
  {onChangeScale && (
    <>
      {" · "}
      <button type="button" className={styles.scaleChange} onClick={onChangeScale}>Change</button>
    </>
  )}
</p>
```
Styles: `.scaleLine { @include type.typography(meta, $step: sm); color: var(--mono-text-low-contrast); margin: 0; }` and `.scaleChange { @include focus.ring; border: 0; background: none; padding: 0; color: var(--accent-text); cursor: pointer; @include type.typography(meta, $step: sm); }`. In `MatchScreen.tsx` pass `scaleLabel={SCALE_LABEL[initialState.match.grading_scale]}` (with `+ ${SCALE_LABEL[alt]}` on a mixed day) and `onChangeScale={isHost && lobby ? () => openPanel({ kind: "setup", section: "climbing" }) : undefined}`.

- [ ] **Step 4: Verify**

Run: `pnpm check`. In the app, points match: grid ends in an accent-outlined "Add route" tile, no FAB. Chork match as non-setter: "Waiting for @host" tile. Long name wraps in the hero. Board rows sit flush with hairlines.

- [ ] **Step 5: Commit checkpoint**

```bash
git add src/components/Match
git commit -m "style(match): one add tile, a title that wraps, rows that sit flush"
```

---

### Task 10: Docs, vocabulary, final verification

**Files:**
- Modify: `CLAUDE.md` (Domain rules — matches), `CONTEXT.md` (vocabulary), `docs/roadmap.md` (shipped), `docs/schema.md` (RPC list)

- [ ] **Step 1: CLAUDE.md**

Under "Domain rules — IMPORTANT", after the league placement bullet, add:
```markdown
- **A match is created in one tap and set up in its lobby.** `/match/new`
  is two posters (Points / Chork); tapping creates with defaults
  (boulders, V-scale, whole ladder, "Tom's match"). A live match with
  no routes is the **lobby** (`isLobby(state)` in
  `matchScreenReducer.ts`): join card, players, one CTA. The host
  changes setup from the hero's pills via `set_match_setup`, which
  refuses once a route exists — grading is locked by the first route.
  `create_match` and `set_match_setup` validate through one SQL
  helper, `match_setup_check`; the action side shares
  `validateMatchSetup`. There is no create form
```

- [ ] **Step 2: CONTEXT.md**

Add to the vocabulary section (find it with `grep -n "^## " CONTEXT.md`):
```markdown
- **Lobby** — a live match with no routes yet. Derived, not stored.
- **Setup** — what a host can change in the lobby: name, where,
  discipline, grading. Game mode and handicap change any time.
- **Poster** — the accent-solid card a game is chosen from. The sent
  tile at card scale.
```

- [ ] **Step 3: roadmap + schema**

`docs/roadmap.md` shipped section: `- 2026-09-14 — Lobby-first match: one-tap posters, setup pills, join card, locked grading (\`set_match_setup\`, migration 136)`. `docs/schema.md` RPC catalogue: add `set_match_setup` and `match_setup_check` beside `set_match_game_mode` with one line each.

- [ ] **Step 4: Full verification**

Run: `pnpm check && pnpm build`
Expected: green. Then the manual sweep: create Points → lobby → rename → switch to Ropes/French → invite → add route → grading pill locked → ⋮ End match. Create Chork → "Set the first challenge". League: `/match/new?league=…` → posters → lobby with last week's settings.

- [ ] **Step 5: Commit checkpoint**

```bash
git add CLAUDE.md CONTEXT.md docs
git commit -m "docs(match): lobby, setup, poster"
```
