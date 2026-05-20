# ADR 0002 — No generic lifecycle orchestrator

**Status:** Accepted, 2026-05-21
**Context links:** session that proposed it (architecture-improvement skill, opportunity #3)

## Decision

We do **not** introduce a generic `orchestrate([step, step, step])` runner for multi-step server-side flows (rate-limit → mutation → notify → revalidate). Multi-step server actions stay as straight imperative code with inline error recovery.

## Why

The proposed orchestrator would generalise the shape of functions like `sendCrewInvite` in `crew-lifecycle.ts`. Each step would declare its `run`, optional `onError`, and `onSuccess` callbacks; the runner would compose them.

That shape is *flow-of-control*, not a module. Three observations:

1. Only ~3 lifecycle functions follow this pattern today (`sendCrewInvite`, `acceptCrewInvite`, `transferCrewOwnership`). Each has subtly different recovery rules (e.g. `notify()` failure should never unwind the mutation, but the mutation failure stops the rest of the chain). A generic runner has to express that nuance via per-step callbacks — which is more typing, not less.
2. The deletion test fails: deleting an orchestrator that wraps 3 functions doesn't concentrate complexity; it pushes the same conditional logic into the step callbacks.
3. Reading a 60-line imperative function top-to-bottom is faster than tracing through a generic runner's dispatch loop. Server actions are read more than they're written.

## How to apply

- Multi-step server actions stay as flat `try / await / await / await` blocks.
- Repeated *single-step* primitives (UUID validation, auth gates, rate-limit) get a named helper — see `gateClimberMutation` / `gateGymAdminMutation` in `src/lib/auth.ts`.
- If a lifecycle function grows past ~80 LOC, prefer extracting *named sub-functions* (e.g. `notifyInviteAccepted(...)`, `revalidateCrewMembership(...)`) rather than a generic step runner.

## Counter-evidence that would reopen this

- A 5th+ lifecycle function appears, all five share a near-identical step shape, and the per-function recovery rules turn out to be uniform enough that a single declarative description is cleaner than the imperative version. Today that condition isn't met.
