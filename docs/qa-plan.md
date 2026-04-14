# QA Backlog — Organised Plan

Grouped by area, ranked P0 (blocker/data integrity/prod auth) → P3 (polish).
Each item is scoped small enough to be one PR.

Legend: **`[P0]`** must-fix, **`[P1]`** high, **`[P2]`** nice, **`[P3]`** polish.
`UX` visual, `BUG` broken, `PERF` speed, `DATA` server/DB, `A11Y` accessibility.

---

## 1. Auth / onboarding / account flow

- **[P0 BUG]** Sign-up redirects to homepage instead of onboarding. Onboarding not guarded — trap if already complete. Fix: middleware gate + redirect after submit.
- **[P0 BUG]** `createCrew` hits `new row violates row-level security policy for table "crews"`. RLS policy missing INSERT for authed user, or action calls wrong client. Trace action → policy.
- **[P0 DATA]** Reset-password redirect points at `localhost`. Use `NEXT_PUBLIC_SITE_URL` (default `chork.vercel.app`).
- **[P1 UX]** Reset-password button belongs inside Edit profile dialog. Also add "Change email" field there.
- **[P1 BUG]** `@supabase/gotrue-js` orphaned lock warning. Investigate StrictMode double-mount in AuthProvider + push listener. Likely benign but log-noisy.

## 2. Bottom-sheet primitive (used everywhere — fix once)

Priority block — bottom sheet underpins achievements, route log, climber sheet, gym switcher, settings, etc.

- **[P0 BUG]** Open animation flicker: panel paints at rest state for 1 frame, then animates in. Root cause: mount happens before animation class applied. Fix: `useLayoutEffect` + initial `transform: translateY(100%)` inline style committed with first paint.
- **[P0 BUG]** Close: drag-down flicks back up then slides away. Root cause: `dragging` class removed before `contentClosing` applies → reflows to open → re-animates to closed. Fix: one authoritative state machine (`open` / `closing`), never concurrent.
- **[P0 BUG]** Achievements panel not scrollable in Chrome (Radix ScrollArea Viewport has no definite height). Already attempted `max-height: inherit` on Viewport — verify on Chrome.
- **[P0 BUG]** Achievements resizes on tab switch. Lock sheet height at open time, don't let content dictate. Candidate: `height: min(90svh, content)` captured on open via ref + inline style, or simply `height: 90svh` always for this sheet.
- **[P1 UX]** Firefox: title-bar backdrop-filter doesn't show. Move blur off `::before` → apply directly with `isolation: isolate` on `.content` ancestor. Verify Firefox 135+.
- **[P1 BUG]** Close button dead on iPhone 11 Pro + Apple Pencil. Pointer events likely blocked by overlay z-index. Audit `pointer-events: none` chain + Radix's own pointer handling.
- **[P1 BUG]** Beta spray: after submitting comment, toggle unresponsive, title bar disappears. Likely state reset bug in RouteLogSheet or React key collision. Reproduce + fix.
- **[P2 UX]** Beta spray drawer only shows ~1 comment worth of space. When open, let sheet extend to full viewport (90 → 100svh).
- **[P2 UX]** "Reveal beta" button hidden by blur. Stack above blur layer or move outside blurred ancestor.
- **[P2 UX]** Grade save: pop-in/out on save. Debounce + keep UI stable during commit (optimistic state).
- **[P3 UX]** Drag-handle removal already done. Confirm no residual `.handle` class references.

## 3. Achievements

- **[P0 BUG]** Kill the secondary "achievement detail" popover in `/achievements` sheet — all info in primary already.
- **[P1 UX]** Filter pill min-width — "All" reads tiny. Raise min per pill. Must not touch V-grade slider in RouteLogSheet (shared component? verify isolation).
- **[P1 UX]** Default filter = "Earned" (not "All") to encourage taps on earned badges.
- **[P2 UX]** In-progress flash achievements use flash palette; zone achievements use zone palette. Currently mono.
- **[P2 UX]** Detail sheet icon text could be bigger (image 2, "1,2" swatch).
- **[P2 UX]** Text on badge detail hero could be larger overall.

## 4. Profile / nav / inbox / settings

- **[P1 UX]** New profile-nav dropdown: View profile / Notifications / Settings. Settings is a nested list holding everything currently in ProfileHeader. Move items out of profile.
- **[P1 UX]** Nav icon gains notification dot when inbox count > 0. Gentle bell-ring animation on page load when unread exists.
- **[P1 UX]** Inbox rename → "Notifications", add bell icon. Use accent colour (themable). Show count ("4") when > 0.
- **[P1 UX]** Push-notification disable option after enabling. Settings → Push subscriptions list + toggle.
- **[P2 UX]** Nav pill background slide-animate between tabs (from previous → current).
- **[P2 BUG]** PWA nav bar appears at top initially, only drops to bottom on scroll. Fix: pin bottom via `env(safe-area-inset-bottom)` from first paint.
- **[P3 UX]** Settings/Inbox buttons use accent colour so they theme correctly.

## 5. Profile card / current set / gym stats

- **[P0 BUG]** Leaderboard tab switch → gym-stats card layout bug (image 3 — `#` cut off, extra margin, `CURRENT SET` ghost header). SetMeta `CollapseFade` exit animation probably dropping width wrong on Chrome. Repro + fix.
- **[P1 UX]** "Current set" card: replace layer-group icon with rank number (`#N`). Remove duplicate rank on right side.
- **[P1 UX]** Rename header text "Current set" → "Reset" with short-month date ("May 6" always).
- **[P1 UX]** Gym-stats meta row must handle long gym names gracefully (image 5 — "RESETS MAY 6 • THE CLIMBING ACADEMY" wraps poorly, divider dot orphans on its own line). Use flex-wrap + ellipsis for gym name.
- **[P2 UX]** Card header icons align to vertical centre of heading text.
- **[P2 UX]** Sends icon missing (truncated note "For the sends icons, can we have a little"). Flag for full spec.

## 6. Send grid / home / wall

- **[P1 UX]** Homepage send grid too wide — drop to 4 columns. Keep shared component with Wall page.
- **[P1 UX]** Send-grid numbers + flash/zone icons use accent lime-9 on homepage.
- **[P1 UX]** Flashed / zone icons across app use the same colour tokens as ring section. Text uses proper colour + typography token.
- **[P2 PERF]** Leaderboard climber-sheet grid: window requests between updates (don't re-fetch on every tap). Candidate: client cache keyed by `userId+setId` with 30s TTL.
- **[P2 UX]** Climber sheet grid squares need loading state (same shimmer as wall skeleton).

## 7. Scoring / how it works

- **[P1 BUG]** "How scoring works" panel: zone row using wrong colour (shows accent instead of zone/teal). Attempt bars use accent (should be accent). Cross-check against design doc.

## 8. Skeleton / loader system

- **[P1 UX]** Adopt provided glow/blur skeleton style globally. Swap hardcoded `rgba(255,255,255,...)` in user's snippet for:
  - `--mono-bg` (base)
  - `--mono-border-subtle` (border)
  - `--mono-text-low-contrast` (glow)
- **[P1 UX]** Beta spray comment count shows loading indicator (currently pops in).
- **[P1 DATA]** Community grade slow to load → store it on the `routes` row (denormalise). Update on log insert/delete/grade-vote via trigger. Grade column + `vote_count` column.

## 9. Search (climber / gym)

- **[P1 UX]** Fuzzy search for climbers + elsewhere. Suggest: pg `pg_trgm` GIN index + `ilike '%query%'` fallback, or client-side Fuse.js on the current gym's climber list (small enough set). Reusable `useFuzzySearch` hook.

## 10. Landing / marketing

- **[P1 UX]** Hero text uses font colours 1 and 2 (each sentence). Currently both same colour (image 1, 4). Split sentences → alternate step-11 / step-12.
- **[P1 A11Y]** Landing italic text clips letter edges (images 1, 4). RevealText word-clip padding insufficient. Widen clip box horizontally; ensure final state has `clip-path: none`.
- **[P2 UX]** Richer social-share metadata: open graph tags, Twitter card, brand logo. Next.js `generateMetadata` on landing.
- **[P2 UX]** Replace missing PWA + favicon (Vercel default showing). Need 192/512 PNGs + maskable dark/light variants.

## 11. Themes

- **[P2 UX]** New theme set: one for every Radix gray scale (gray/mauve/slate/sage/olive/sand). Each paired with complementary accent per Radix pairing guide. Document in `src/lib/theme.tsx` THEME_META.

## 12. Performance — Chrome-specific + initial load

Chrome chugs on first load, fine after warm-up. Top suspects:

- **[P0 PERF]** Disable any JS-driven animation where CSS works. Prefer `transform`/`opacity` only. No `width`/`height`/`top`/`left` animated.
- **[P0 PERF]** All animated elements: `will-change: transform, opacity` ONLY during animation (add via class, remove on `animationend`).
- **[P0 PERF]** Heavy first-paint CSS (backdrop-filter chains, large gradients) — Chrome 135+ has a backdrop-filter cost. Audit how many blur surfaces paint simultaneously on first load.
- **[P1 PERF]** Preload critical fonts (Outfit, Inter subsets).
- **[P1 PERF]** Prefetch likely-next routes on idle (Leaderboard / Crew / Profile). Next's `<Link prefetch>` should handle this — verify.
- **[P1 PERF]** Keep "warm" server data cached across tab switches (staleTimes already set to 300 — confirm it's hitting). Consider SWR-style client cache for leaderboard rows.
- **[P1 PERF]** Route-log bottom sheet: first open is heavy (dynamic import + data fetch + nested context). Preload on SendsGrid hover/focus (`next/dynamic` with `preload()` hint).
- **[P2 PERF]** Remove `@supports (backdrop-filter)` cascade double-paint — one selector path.
- **[P2 PERF]** Audit the ActivityRings draw: pathLength=1 keyframe already replaces JS; confirm no lingering RAF loops.

## 13. Misc / data

- **[P1 DATA]** Seed 20 fake climber parodies ("John Flashen", "Magnus Meats-bjorn"…) each with randomised sends/zones/attempts/flashes in current set. Script lives in `scripts/seed-climbers.ts`, idempotent (uses SEED_TAG on profiles for cleanup).
- **[P1 A11Y]** Random focus-ring flashes (user saw on panel close button). Audit `@include focus.ring` — likely applying on pointer focus. Use `:focus-visible` only.

---

## Execution — phased batches

Each batch = one PR. Commit after each.

**Batch A — auth / data correctness** (P0)
1. Sign-up → onboarding → home flow fix + middleware guard.
2. Crew RLS policy fix.
3. Reset-password redirect uses `NEXT_PUBLIC_SITE_URL`.

**Batch B — bottom sheet foundation** (P0, biggest win)
4. Rewrite sheet state machine (open/closing/closed, no concurrent flags).
5. Fix open-flicker (`useLayoutEffect` + committed initial transform).
6. Fix close/drag regression.
7. Lock achievements-sheet height; kill secondary detail popover.
8. Verify Chrome scroll + Firefox blur.

**Batch C — homepage + landing + hero**
9. Send grid → 4 col, accent numbers/icons.
10. Hero text two-colour split + RevealText clip fix.
11. Favicon + PWA icons + OG tags.

**Batch D — gym stats / profile card / SetMeta**
12. SetMeta long-name handling + layout-bug fix on tab switch.
13. Current-set card header: rank icon + "Reset MMM d" rename.
14. Icon vertical centring audit.

**Batch E — achievements polish**
15. Default filter "Earned".
16. Filter pill min-width.
17. Flash/zone palette for in-progress badges.
18. Detail sheet text + icon sizing.

**Batch F — nav + settings dropdown + notifications**
19. Profile nav dropdown (View / Notifications / Settings).
20. Nav notification dot + bell animation.
21. Push-disable toggle.
22. PWA nav bar starts at bottom.

**Batch G — performance / chrome**
23. Will-change hygiene sweep.
24. Backdrop-filter layer audit.
25. Prefetch + preload critical assets.
26. Community-grade denormalisation + trigger.

**Batch H — search + skeletons + themes**
27. Shared fuzzy-search hook + climber search.
28. Unified skeleton style (glow/blur pattern).
29. Radix gray-scale theme set.

**Batch I — seed + small bugs**
30. 20 climber seed script.
31. Focus-ring `:focus-visible` sweep.
32. Supabase lock warning investigate.
33. Scoring panel colour fix.
34. Beta spray unresponsive-after-submit bug.
35. Apple Pencil tap fix.

**Batch J — minor polish / deferred**
36. Nav pill slide-between.
37. Rich OG images (auto-generated).
38. Change-email in edit profile.
39. Sends icon spec (needs clarification from you).

---

## Open questions (need your input before touching)

- Truncated note: "For the sends icons, can we have a little" — finish this.
- "The in progress flash related routes should also use the flash colours, same for zone achievements etc" — is this the same as the flash-palette achievement item (§3 P2)?
- "When I'm on the leaderboard page" — unfinished note.
- Themeable push-notification colour: currently amber flash. Keep brand-fixed or theme-swap?
- Default filter "Earned" — what if user has zero earned? Fall back to "All" silently?

---

**Next step after you sign off:** start Batch A. One item, one commit, one review.

---

## Status — execution log

| Commit | Batch | What shipped |
|--------|-------|--------------|
| `9565955` | A | sign-up→onboarding flow, reset-pw redirect env-driven, crew RLS guard |
| `25b441f` | B pt1 | bottom sheet swapped to vaul (iOS-native drag physics) |
| `e694f37` | B pt2 | achievements height lock, pill min-width, SetMeta gym-name truncate |
| `3555f38` | C+D | home grid 4-col, hero two-tone, rank icon in current-set card, manifest svg |
| `f20df44` | E | earned filter default, family-tinted progress rings |
| `2952ddd` | G | interpolate-size for auto-height drawers (Chrome perf) |
| `8320eca` | I pt1 | migration 026 denorm community_grade, seed 20 parody climbers |
| `25b6609` | I pt2 | scoring chart zone palette, kill phantom sheet focus ring |
| `91a633b` | F pt1 | Inbox→Notifications rename, accent-tint pill, bell-ring anim |
| `f4dabce` | H pt1 | unified glow-pulse skeleton (themed via `--mono-*`) |
| `1151e13` | H pt2 | fuzzy climber search (pg_trgm + word_similarity RPC) |
| `2b3391d` | H pt3 | 6 themes total — gray, mauve, sage added |
| `4c164f4` | B pt3 | sheet reverted to button-controlled slide, real PNG icons wired |
| `1d28674` | — | favicon dark/light pairing swap + profile tab notification dot |
| `95afae5` | — | climber-sheet 30s cache + email/reset-pw in Edit Profile |
| `672735a` | B pt4 | reveal-beta unblurred + postComment narrow revalidate |
| `605d7f6` | — | migrations 025/026/027 applied to live DB, types regenerated, any-casts dropped, 20 climbers seeded |
| `8a3eb14` | F pt2 | Profile nav dropdown (View + Notifications); notifications moved off profile page into nav |
| `76ad891` | F pt3 | Settings moves into Profile dropdown as a nested submenu — Edit/Gym/Invites/Push/Theme/Privacy/SignOut/Delete all live in nav; ProfileHeader now identity-only |
| `92f295c` | — | sliding pill highlight between nav tabs (useLayoutEffect + DOM ref, no setState) |
| `2d3c503` | — | BottomSheet `size="tall"` variant; RouteLogSheet flips to tall when beta drawer expanded |
| `9c71cb2` | test | admin + leaderboard server actions — auth, validation, cross-gym rejection, privacy contract on sanitised logs |
| `6d03d1e` | test | profile action + admin-mutation rollback path coverage |
| `ecba4e4` | test | crew + competition query helpers — flatten, tally, sort invariants |
| `e6cfc77` | chore | dropped orphan NotificationsButton + renamed scss to match remaining sheet |
| `dfc5a70` | feat | theme syncs across devices via `profiles.theme` (migration 028) |
| `9dd69ea` | test | user-actions coverage — 225 tests total |

**Needs your action (one command each):**
- `npx supabase db push` — applies migrations 025 (attempts bound + crew index), 026 (community_grade denorm), 027 (fuzzy search)
- `npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts` — refresh TS types after 026/027 so the `(any)` casts can be removed
- `npx tsx scripts/seed-climbers.ts` — seed 20 parody climbers into live set
- Replace `/public/icon-192.png` + `/public/icon-512.png` + maskable 512 with real brand PNGs (manifest currently points at the SVG fallback)

**Test coverage**
- 237 tests across 26 files, all green locally and in CI
- Every server action that can leak data has explicit rejection
  coverage (admin, leaderboard, profile, crew)
- Rollback/compensating-write paths tested where they exist
  (`createGymWithOwner` gym-delete, invite accept flow)
- Pure-logic helpers remain covered by their long-standing suites
  (`badges`, `logs`, `grade-label`, `profile-stats`, `crew-time`,
  `roles`, `mutations`)

**Still pending — need input or repro:**
- **F pt2** Profile nav dropdown reorg — View / Notifications / Settings (nested). Substantial refactor moving dialogs from ProfileHeader into NavBar; risk of unwinding auth-gated state. Own PR.
- **Push-disable toggle** — already in Settings dropdown on profile; moves with the dropdown reorg above.
- **Apple Pencil close button on iPhone 11 Pro** — needs device repro. Best guess is a `touch-action` or pointer-event-trap somewhere in the sheet chrome.
- **Grade save pop-in** — can't repro cleanly; likely related to the RouteLogSheet state flush on `setCurrentLog` after the debounced grade save.
- **Supabase `@gotrue-js` lock warning** — informational, Radix Strict Mode interaction with AuthProvider. Not user-visible. Low priority.
- **Gym-stats tab-switch visual bug** (image 3) — needs fresh repro; the earlier CollapseFade changes may already have fixed it.
- **Nav pill slide-between animation** — pure polish, not blocking.
- **Beta spray drawer full-viewport when open** — pending; current sheet is content-sized up to 90svh.

This session shipped **16 commits**. ~85% of the QA list is addressed. The remainder either needs device repro or is a big enough refactor to deserve its own scoped PR.
- **B pt3** Remaining sheet bugs: beta spray unresponsive-after-submit, Apple Pencil close, reveal-beta behind blur, grade-save pop-in
- **I pt3** Supabase lock warning investigation, nav pill slide animation

Let me know which batch to tackle next.
