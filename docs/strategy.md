# Strategy

Market position, monetisation, and what has to exist for Chork to be
worth running. Written 2026-08-20 from three commissioned research
passes (competitive landscape, consumer monetisation + exit
precedents, market sizing). Sources are named inline; where a number
is triangulated rather than sourced it says so.

`docs/roadmap.md` is the build order. This file is the *why* behind
it — read it before arguing with the order.

---

## The one-paragraph version

Chork sells to gyms and is free for climbers, because that is the only
model the category has ever paid for. The differentiator is not the
gym leaderboard — four products already do that — it is that a
competition can be started by climbers, joined in thirty seconds, and
played by people without accounts. The missing primitive that turns
that from a party trick into a business is the **League**: a
repeating, cumulative series. One primitive serves a gym's season, a
gym's weekly social night, and a friend group's Tuesday standing
fixture, which is exactly the three things Chork is supposed to be
used for.

---

## What the market actually pays

The engagement layer above gym POS has a settled price band, and it is
narrow:

| Product | Gym price | Notes |
|---|---|---|
| TopLogger | $89.95/mo (free under 35 users) | NL/BE/DE entrenched |
| Griptonite | $85–90/mo, or £65/mo "Advanced" | UK-built, comps-led |
| KAYA (Plastick) | $1,200/location/yr (~$100/mo) | US, 300+ gyms |
| Vertical-Life | ~$1,080/yr + setup | IFSC + USA Climbing results stack |

**£59–79/mo is the credible slot.** Below the band you signal a toy;
above it you argue against four incumbents. Pricing is not the risk.

**Willingness to pay is the risk.** In CBJ's 2025 Grip List, which
polls routesetters on what they actually use, **"Spreadsheets" took
4.23% — beating several funded vendors.** A meaningful share of the
market's current solution is a printed scorecard and a laptop. That
cuts both ways: no incumbent lock-in to displace, but also no habit of
paying.

### The ceiling, stated honestly

UK dedicated commercial walls: **~200–300**, of which maybe **120–200**
are a realistic serviceable segment (bouldering-led, comp-friendly,
independent or small-group). At £55–70 blended:

- **£2.5k MRR ≈ 40–45 gyms** — roughly 15–20% of the UK category. A
  strong 18–36 month outcome, not a default one.
- **£10k MRR ≈ 150–180 gyms** — exceeds any plausible UK-only win.
  Requires Europe, or revenue per gym going up.
- **£50k MRR** — global category leader. For scale: TopLogger +
  Griptonite + KAYA combined are probably under ~1,500 paying
  locations (triangulated).

**UK-first is a beachhead, not a market.** Plan the product so Europe
is a pricing and language problem, never an architecture one.

Consolidation cuts both ways: 36% of UK walls now sit in groups
averaging 4.5 sites (ABC 2025). Fewer buyers, bigger each. One won
group is 3–8 sites — so multi-site standings are a sales feature, not
a nicety.

---

## Monetisation

### Decided: no per-comp pricing

Rejected 2026-08-20. A per-event price says "this is for the two
Saturdays a year you run something special", which is the opposite of
the product. Chork wants to be open on a Tuesday. Per-event pricing
also caps revenue at the frequency of the rarest thing a gym does, and
makes every sales conversation start over.

Everything a gym runs is included in one subscription: the main Set,
the weekly social, the winter league, the one big comp.

### The three revenue lines

**1. Gym subscription — the floor, and the only line that closes at
UK scale.**
£59–79/mo, everything included, free tier below a member threshold
(TopLogger's under-35 tier is the category's proven wedge shape).
This is where the first real money comes from and it is not a
consumer business.

**2. Organiser-pays on the social layer — the line that scales with
free Match users.**
This is the answer to "can it make money without gyms". The model is
**one payer per group, everyone else free** — the shape TeamSnap and
Spond use for grassroots sport. A friend group running a standing
league has exactly one person who cares enough to set it up; that
person pays. Joining is always free, forever.

Strava is the proof that friends will pay to compete privately: since
August 2024 **both creating and joining** a private Group Challenge
requires a subscription. They can afford to tax the join because they
already have 180M registered users. Chork cannot — taxing the join
kills the thirty-second recruit that is the entire growth loop. So we
take the organiser half of Strava's model and leave the join free.

**3. Identity — the long tail, cheap to run, no floor.**
Cosmetic and status goods inside a graph where your peers see you.
Precedents: Letterboxd Patron ($48.99/yr, largely profile flair) and
Finch ($30–40M ARR, bootstrapped, largely cosmetic). Chork already has
the surface: four palettes, a profile, badges, trophies. Never sell
scoring, never sell visibility on a board.

### What consumer subscriptions would actually yield

Do not plan on this line. Health & fitness freemium converts at a
**2.9% median** download→paid (RevenueCat 2025); Strava converts about
2% of registered users after fifteen years; Duolingo hit 9.1% of MAU
and that is best-in-class after a decade. At £3.99/mo and 3%:

| Target | Paying | Registered users needed |
|---|---|---|
| £2.5k MRR | ~630 | 16–31k |
| £10k MRR | ~2,500 | 63–125k |

63–125k UK registered users is more than the entire UK regular-climber
population (~100k, ABC estimate). **The consumer layer is
distribution and moat. It is not the revenue.**

---

## The differentiator, precisely

Every incumbent's competition machinery is configured by the gym.
Nobody serves the climber-run case:

- **TopLogger / Vertical-Life / KAYA / Griptonite** — gym-configured,
  account-gated, gym-scoped.
- **Web scorekeepers** (JudgeMate, ClimbLive, FingerComps) — organiser
  tools for one-off events, no persistent social layer, but note that
  several *do* let competitors score without an account. That part is
  not unique to us.
- **CompSesh** (iOS, 2024) — the only product found whose core loop is
  a friend-group session comp with handicap scoring. Five ratings.
- **Stokt** — user-created comps, but spray walls only.

So the white space is real: **climber-initiated, guest-playable,
game-mode-capable competition that works at a gym, outdoors, or on a
home wall.** Chork already has all four properties built.

The caution that comes with it: nobody occupying a space is not proof
the space is valuable. CompSesh's five ratings are as much evidence of
thin demand as of a missed opportunity, and **KAYA raised $3.7M, built
gym social, and pivoted to outdoor guidebook publishing in 2025.** The
research cannot tell us which it is. Only a real gym running a real
league can.

---

## The missing primitive: League

**A League is a repeating series with cumulative standings.** A Set
already ends with a winner; a League is what happens when you stack
them.

It is one primitive that serves all three markets the product is meant
for:

- **A gym's main Set** → a season. Members have a reason to come back
  midweek, which is the thing gyms actually buy (repeat footfall).
- **A gym's weekly social** → league night. UK walls already run these
  on paper: Highball Norwich's monthly league, Boulder UK Preston's
  Winter League, Frome's Winter League. ABC's data shows walls running
  local competitions and training schemes rose **20+ percentage
  points** between 2019 and 2023, while parties and yoga shrank. The
  programming shift is real and it is toward exactly this.
- **A friend group's standing fixture** → "our Tuesday league", and
  the thing the organiser pays for.

It is also the retention mechanic. A one-off Match is an event; a
League is a *fixture*, and fixtures are what produce the
weekly-active numbers that make a social app acquirable (a16z
benchmarks retention above all else for social; for a sport where
people attend 1–3×/week, WAU/MAU is the honest metric).

Build it as a series of Sets, not a new scoring system. `computePoints`
does not change. Standings are an aggregation over member Sets, with
a drop-lowest-N rule so missing one week doesn't end your league —
that rule is what makes casual participation survive.

---

## Competitions: what "doing it properly" means

Competitions exist in the schema (`competitions`, `organiser_id`,
`is_competition_organiser`) and have barely been touched. From the
competitive review, the feature set splits cleanly:

**Table stakes** — every serious incumbent has these, and without them
a gym cannot run its one big event on Chork:

- Categories (age / gender / ability), with separate standings
- Registration with a cap, and a roster the organiser can edit
- Self-scoring from the climber's phone
- A live board

**Differentiating** — where Chork can be visibly better:

- **Guest entrants.** Comp day is full of visitors who are not
  members and will never make an account. Chork's guest seats already
  solve this; no incumbent does it as cleanly.
- **A projector board.** Every incumbent sells this (Griptonite ships
  a hardware box for it). A read-only, high-contrast, auto-cycling
  standings view is cheap for us — it is a route, not a product.
- **Handicap divisions.** Already built, already tested, and the one
  thing that makes a mixed-ability gym comp fun rather than a
  formality. ClimbTime markets handicap leagues as its differentiator;
  we have better maths already written.
- **Qualification → finals.** The rounds structure is what separates a
  "comp" from a "big Set". Needed for credibility with any gym that
  runs a real event.

**Deliberately not building**: judged/IFSC-grade scoring, isolation
zones, federation results. Vertical-Life *is* the IFSC stack. That
fight is unwinnable and the customers are not ours.

---

## Distribution: the PWA question

No breakout consumer social app of the last decade scaled PWA-only.
Every climbing competitor ships native on both stores. iOS 26
(Sept 2025) helped — Add to Home Screen now opens any site as a
standalone web app — but the install gesture is still buried and
unpromptable, and iOS web push still requires the home-screen install.

The resolution is a split, not a bet:

- **The join flow stays web, forever.** Tap a link at the wall, play
  in Safari, no install, no account. That is the growth loop and an
  app-store detour would kill it.
- **A thin native wrapper is a growth-stage requirement, not a launch
  one.** It buys push reliability, a home-screen presence, and
  discovery under "climbing" — all retention concerns, none of them
  acquisition concerns.

parkrun is the encouraging counter-example: ~9–10M registrations,
web-only, in this exact market — though it is event-based, push-free
by design, and even parkrun shipped an app and bought a third-party
one once at scale.

---

## The exit, since it was asked

Two archetypes exist in this category's neighbourhood:

1. **Own the niche's social graph and sell the niche.** Letterboxd
   ($5–6/member in 2023, ~$8/member in 2026 talks), Komoot (~€6.7/user
   to Bending Spoons), Untappd. Priced per user.
2. **Build best-in-class paid depth and sell it to the graph owner.**
   Runna → Strava, reported ~£150M on ~1M MAU and ~£10M raised — a
   price that high *because the users paid*. The Breakaway, FATMAP,
   same shape.

The Runna template is archetype 2, and it requires revenue, not just
users. Chork's realistic path is archetype 1 for climbing — Strava has
no climbing graph and gym walls don't GPS-track — with enough revenue
to prove the business is real.

But the acquirers in *this* category are not Strava. The only
comparable exit found is **Rock Gym Pro → Togetherwork (2018)**, a PE
rollup buying category-leading gym software. Realistic buyers are gym
management rollups, a federation-infrastructure player like
Vertical-Life, or a gym chain buying its engagement layer. Nobody is
paying for logged-ascent social graphs on their own — that is what
KAYA's $3.7M and its pivot demonstrate.

Plan for a profitable small business. Treat an exit as an option the
business creates, not a plan it executes.

---

## What has to be true (the honest risk list)

- **Gyms must pay for engagement software.** ~4% of the market
  currently uses spreadsheets by choice.
- **Climbers must want a structured game.** CompSesh suggests the
  casual-comp demand may be thin; nothing in the research proves it
  either way.
- **The UK ceiling is ~£11–17k MRR.** Anything beyond needs Europe.
- **Distribution is a hustle, not a loop.** The Match link spreads
  inside a session; it does not obviously spread between gyms. The
  gym channel is the engine.
- **One person is building this.** Every scope decision should assume
  no second pair of hands.
