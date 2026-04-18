/**
 * Typed wrappers around the design-token spacing scale defined in
 * `src/styles/theme/spacing.scss`. Components that want to expose a
 * controllable gap/padding prop should accept `SpaceStep` (a number
 * literal union) rather than a free-form string — autocomplete then
 * shows every legal value and typos become compile errors.
 *
 * Kept here (rather than in `styles/`) so React primitives import a
 * type module, not a SCSS file. The numeric values mirror the CSS
 * custom properties exactly: `1` → `var(--space-1)` (0.25rem),
 * `8` → `var(--space-8)` (2rem). If the SCSS scale grows a new step
 * that components need to use, add it here too.
 */
export type SpaceStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Convert a `SpaceStep` into a `var(--space-N)` CSS string so a
 * component can pass it through an inline custom-property without
 * leaking free-form strings into its public API.
 */
export function spaceVar(step: SpaceStep): string {
  return `var(--space-${step})`;
}

/**
 * Page-column max-widths exposed to components that need to align
 * their own bleed math with the surrounding page layout (e.g.
 * `<HorizontalScroller>` extends past `layout.page`'s centred column
 * but still aligns its first item with the page's gutter).
 *
 * The legal values map 1-to-1 to the `--content-*` tokens in
 * `spacing.scss`. Keep this union in sync with the token list.
 */
export type ContentWidth = "narrow" | "app" | "prose" | "wide" | "max";

export function contentVar(width: ContentWidth): string {
  return `var(--content-${width})`;
}
