# Styles

## Imports (aliases)

```scss
@use "mixins/breakpoints" as bp;
@use "mixins/container" as container;
@use "mixins/container-queries" as cq;
@use "mixins/layout" as layout;
@use "mixins/surfaces" as surface;
@use "mixins/typography" as type;
```

## Fonts

Two font families are used:
- **Heading** — Outfit (titles, numbers, labels, display — supports weights 100–900)
- **Body** — Inter (body text, meta, buttons)

Fonts are loaded via `next/font/google` in `app/layout.tsx`. Each font sets a
CSS custom property on `<html>`:

| next/font variable  | Token            | Resolves to |
|---------------------|------------------|-------------|
| `--font-outfit`     | `--font-heading` | Outfit      |
| `--font-inter`      | `--font-body`    | Inter       |

The tokens are defined in `theme/typography.scss` with named fallbacks so
rendering is graceful before fonts load or if `next/font` isn't available.

## Typography

Use presets instead of manual `font-size` / `font-weight` / `font-family`:

```scss
@include type.typography(card-title);
```

Each preset sets `font-family`, `font-size`, `line-height`, `font-weight`,
and `letter-spacing` in one call.

| Preset       | Font    | Weight | Intended use                               |
|--------------|---------|--------|--------------------------------------------|
| `display`    | heading | 900    | Hero headings, uppercase (PUNCH CARD)      |
| `page-title` | heading | 700    | Top-level page heading                     |
| `card-title` | heading | 700    | Card / section heading                     |
| `number`     | heading | 700    | Large numeric displays (14/20, 65%)        |
| `label`      | heading | 600    | Uppercase labels (CURRENT SESSION, FLASH)  |
| `body`       | body    | 400    | Default body text                          |
| `meta`       | body    | 500    | Timestamps, secondary info                 |
| `button`     | body    | 600    | Button text                                |

## Layout mixins

| Mixin                    | Use for                                          |
|--------------------------|--------------------------------------------------|
| `layout.stack($gap)`     | Vertical flow (cards, form fields)               |
| `layout.cluster($gap)`   | Horizontal wrapping row (tags, buttons, controls) |
| `container.content`      | Centered content with gutters + max-width         |
| `container.gutters`      | Horizontal padding only                          |

Defaults: `--stack-gap` for stack, `--cluster-gap` for cluster.

## Spacing tokens

All spacing uses `--space-*` CSS variables defined in `theme/spacing.scss`.
Tokens are defined in `rem` so they scale with the user's root font-size
preference.
