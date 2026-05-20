# ADR 0001 — No global optimistic-form hook

**Status:** Accepted, 2026-05-21
**Context links:** session that proposed it (architecture-improvement skill, opportunity #5)

## Decision

We do **not** introduce a global `useOptimisticForm` / `useOptimisticAction` hook that concentrates the "snapshot → optimistic update → server action → revert on error" pattern across components.

When the pattern genuinely repeats inside a single component (e.g. `RoutesAdmin` with three field-patch handlers), we extract a **local** function inside that component. When the pattern crosses components, we keep the orchestration inline.

## Why

The architecture-improvement skill flagged `RoutesAdmin`, `JamLogSheet`, and `useRouteLogState` as a three-instance pattern that could be hoisted to a shared hook. Looking at the actual code:

- `RoutesAdmin` has three handlers with the same shape — but they all live in one component, so locality is already concentrated. A local helper is enough.
- `JamLogSheet` doesn't follow the same shape at all — it delegates to a parent via `onSubmit`. It's not an instance of the optimistic+revert pattern.
- `useRouteLogState` has a much more complex shape (reducer + debounce + multi-field flush) that wouldn't fit cleanly behind a generic hook signature.

A hypothetical `useOptimisticForm({ patch, revert, action })` saves about six lines per handler but introduces ceremony — passing `patch`, `revert`, and `action` through a generic signature reads heavier than the original inline shape. The deletion test fails: removing the hook from a future caller doesn't concentrate complexity, because the complexity was always local to one component.

## How to apply

- If you find a fourth genuine instance of the same shape across components, revisit this decision.
- A single component with 3+ handlers of the same shape → extract a local helper (see `RoutesAdmin.patchOptimistically`).
- A complex reducer-based component (`useRouteLogState`) stays as its own custom hook.

## Counter-evidence that would reopen this

- A third or fourth component appears with the *exact* `setItems → call action → revert on error` shape AND with a list-of-records state, AND the local-helper extraction is being copy-pasted across them. Then the deletion test passes and a shared hook earns its keep.
