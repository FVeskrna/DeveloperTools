# Design system — "Strictly Precise"

Swiss precision, zero decoration, speed as beauty. The visible surface is plain and functional — a serious, understated professional tool site. No themed language anywhere in rendered copy ("instrument", "workbench", "catalog", stamps, serial numbers are all banned); the only personality lives in two invisible Easter eggs.

## Tokens

All tokens live in `src/styles/tokens.css` as CSS custom properties.

### Color (light mode)

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#FBFBF9` | Page background — warm technical white, not pure `#FFF` |
| `--ink` | `#14161A` | Primary text |
| `--ink-secondary` | `#5A5F66` | Secondary text, labels |
| `--hairline` | `#DDDFE2` | 1px rules everywhere instead of shadows |
| `--accent` | `#2038E6` | Electric blue — interactive elements ONLY: links, buttons, focus rings, active states. Never decorative. |
| `--accent-ink` | `#FFFFFF` | Text on accent |
| `--ok` | `#0B7A4B` | Status only |
| `--error` | `#B4231F` | Status only |

### Color (dark mode)

Class-based toggle (`.dark` on `<html>`), persisted in `localStorage`, applied by an inline head script before first paint (no flash of wrong theme).

| Token | Value |
| --- | --- |
| `--paper` | `#101215` |
| `--ink` | `#E8EAED` |
| `--ink-secondary` | `#9AA0A6` |
| `--hairline` | `#2A2D31` |
| `--accent` | `#7A8CFF` |

### Type

- Display & data: **IBM Plex Mono** — tool names, headings, spec plate, input/output panes, numbers.
- Body: **IBM Plex Sans** — article text, UI labels.
- Self-hosted via `@fontsource`, weights 400/500/600 only, `font-display: swap`.
- Scale: 13px UI labels / 15px body / 18px section headings / 28px tool title. Tight, tabular numerals for data, generous line-height (1.7) in articles.

### Layout rules

- Max content width **880px**, single column. Tool pane full-width within it.
- 1px hairline rules separate sections — **no cards, no drop shadows, no rounded corners above 4px**.
- Whitespace is the only luxury. No gradients, no illustrations, no emoji in UI.

## Page anatomy

**The tool is the page.** Everything else is deliberately quiet:

- Tool pages, top to bottom: breadcrumb → tool title (28px Plex Mono `h1`) → one-line description → the tool itself. Nothing else above the tool.
- Directly below each tool, one quiet 13px `--ink-secondary` line: "All processing happens in your browser — nothing you enter is uploaded or stored."
- The article content (guide, examples, edge cases, FAQ) renders inside a collapsed `<details class="notes">` at the bottom. It stays in the DOM for SEO (plus `FAQPage` JSON-LD) but takes one line of visual space until opened.
- Related tools are a single compact line of links, not cards.
- Homepage entries are `.tool-card` links: tool name (mono) + one-sentence description, grouped under small category labels. The privacy pitch lives in the "Private by design" section at the *bottom* of the homepage and in the footer — never as a hero banner.
- The header theme toggle is a bare sun/moon icon button (`aria-label="Toggle dark mode"`); the icon swap is pure CSS via the `.dark` class.
- 404 is standard type scale, no styled box: `404 — Page not found` / "The page you're looking for doesn't exist." / "Browse all tools →".

## Motion

Exactly one micro-interaction: when a tool produces output, the output pane's top hairline animates a quick 200ms accent-colored sweep (left → right). Implemented as `.sweep-line` in `tokens.css`, triggered by the `useSweep()` hook in `src/components/tools/ui.tsx`. Respects `prefers-reduced-motion`. Nothing else animates. No page-load animation.

## Easter eggs (exactly two, both invisible)

1. **Konami code** toggles Engineer Mode: hairlines turn blueprint-blue, a faint grid appears, and a small mono readout fixed to the bottom-right shows the page's measured JS transfer size. Persists nothing.
2. **Console message** (plain text, mono font only): `Curious? Good instinct. Everything here runs client-side — check the Network tab.`
