import type { BadgeStatus } from "@/lib/badges";

/**
 * View state for the achievements overlay — ONE bottom sheet whose
 * content navigates between the catalogue grid and a badge's detail.
 *
 * This replaces two sibling modal dialogs (catalogue + detail) stacked
 * by mount order. Stacked sibling modals left the catalogue's
 * dismissal listeners live underneath the detail, so interacting with
 * the top sheet could dismiss the bottom one — closing the detail then
 * dropped you back on the profile with everything gone. One dialog has
 * one set of listeners; there is nothing underneath to desynchronise.
 *
 * `from` records how the detail was reached:
 *   shelf — straight from the profile shelf; no grid behind it, so the
 *           chrome shows no back button and a defensive `back` closes.
 *   grid  — pushed from the catalogue; back pops to the grid with the
 *           filter untouched (component state survives — the overlay
 *           stays mounted) and the scroll restored from `gridScroll`.
 */
export type OverlayView =
  | { name: "closed" }
  | { name: "grid" }
  | { name: "detail"; badge: BadgeStatus; from: "shelf" | "grid" };

export interface OverlayState {
  view: OverlayView;
  /** Catalogue scroll offset captured when a grid tap pushes a
   *  detail, read back on `back` so the grid reopens where it was. */
  gridScroll: number;
}

export type OverlayAction =
  | { type: "open-grid" }
  | {
      type: "open-detail";
      badge: BadgeStatus;
      from: "shelf" | "grid";
      /** Present only when a grid tap knows its scroll position. */
      gridScroll?: number;
    }
  | { type: "back" }
  | { type: "close" };

export const initialOverlayState: OverlayState = {
  view: { name: "closed" },
  gridScroll: 0,
};

export function achievementsOverlayReducer(
  state: OverlayState,
  action: OverlayAction,
): OverlayState {
  switch (action.type) {
    case "open-grid":
      return { ...state, view: { name: "grid" } };

    case "open-detail":
      return {
        view: { name: "detail", badge: action.badge, from: action.from },
        // A tap that measured the grid records it; a swap or shelf
        // open leaves the remembered offset alone.
        gridScroll: action.gridScroll ?? state.gridScroll,
      };

    case "back":
      if (state.view.name !== "detail") return state;
      return state.view.from === "grid"
        ? { ...state, view: { name: "grid" } }
        : initialOverlayState;

    case "close":
      return initialOverlayState;
  }
}
