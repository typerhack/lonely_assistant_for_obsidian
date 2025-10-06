# Lonely Assistant Design System

This document defines the visual language for the Lonely Assistant Obsidian plugin. Follow these guidelines for any UI surfaces (views, modals, settings panes) to ensure a cohesive look that adapts cleanly to user themes.

## Core Principles

1. **Respect the host theme.** Always reach for `var(--*)` tokens so colors track the user's Obsidian theme.
2. **Keep it lightweight.** Avoid gradients, heavy borders, or custom shadows that fight the vault aesthetic.
3. **Emphasise readability.** Use generous padding, clear hierarchy, and consistent typography scaling.
4. **Consistency beats novelty.** Reuse spacing, radius, and layout primitives across all components.

## Foundations

### Layout & Spacing
- Default container padding: `16px` (vertical & horizontal).
- Vertical gaps between stacked blocks: `12px` (or `16px` for major sections).
- Inside chat bubbles & cards: `12px 14px`.
- Rounded corners: `12px` for cards, `14px` for bubbles, `10px` for buttons.

### Color Tokens
Always use native Obsidian CSS variables:
- Background surfaces: `var(--background-primary)`, `var(--background-primary-alt)`, `var(--background-secondary-alt)`.
- Borders: `var(--background-modifier-border)`.
- Text: `var(--text-normal)`, `var(--text-muted)`, `var(--text-on-accent)`.
- Accent actions: `var(--interactive-accent)` (hover/active states handled by Obsidian).
- Error/danger: `var(--background-modifier-error)`, `var(--background-modifier-error-hover)`.

### Typography
- Inherit the vault font (`font-family: inherit`).
- Body text size: `13px` for chat bubbles, `14px` for inputs/settings.
- Header text size: `16px` with `font-weight: 600`.
- Status/help text: `11px–12px`, `color: var(--text-muted)`.

## Components

### Containers
- Wrap feature panes in a flex column with `gap: 16px` and `padding: 16px`.
- Use `var(--background-secondary-alt)` for secondary surfaces, bordered by `var(--background-modifier-border)`.

### Chat Bubble
```
.lonely-assistant-bubble {
    max-width: 85%;
    padding: 12px 14px;
    border-radius: 14px;
    background-color: var(--background-primary-alt);
    border: 1px solid var(--background-modifier-border);
    line-height: 1.55;
    font-size: 13px;
}
```
- User bubble: same structure but filled with `var(--interactive-accent)` and text `var(--text-on-accent)`.
- Assistant bubble: renders markdown content with syntax highlighting for code blocks.
- Code blocks: use `var(--background-primary)` background with `var(--font-monospace)` font.
- Inline code: `background-primary`, `2px 6px` padding, `4px` border radius.
- Streaming indicator: inline flex dots that inherit `var(--text-muted)` (`lonely-assistant-typing` class) with 1.2s loop.

### Header
- Flex row with space-between layout, `gap: 12px`.
- New Chat button: `32px` square icon button with `8px` radius, hover lifts with accent color.

### Input Area
- Card: `padding: 14px`, `border-radius: 12px`, background `var(--background-secondary-alt)`.
- Textarea: `border-radius: 10px`, border `var(--background-modifier-border)`, focus shadow `0 0 0 1px var(--interactive-accent)`.
- Buttons: `border-radius: 10px`, `padding: 8px 16px`, font size `13px`, `font-weight: 600`.
- Primary button background `var(--interactive-accent)`; no gradient. Hover lifts `translateY(-1px)` with soft shadow.

### Settings (Global Guidance)
- Mirror the same padding, radius, and typography as the sidebar.
- Use `Setting` blocks but apply `.lonely-assistant-settings-textarea` for multi-line fields (min height `120px`).

## Motion
- Keep animation subtle and purposeful (e.g. typing dots, hover lift). Duration ≤ 150ms except streaming indicator.
- Avoid entrance animations or large transitions that may conflict with Obsidian performance expectations.

## Accessibility
- Maintain contrast by using theme tokens; do not hardcode light/dark values.
- Ensure actionable controls have at least `44px` tap targets where possible.
- Provide textual status feedback (e.g. the “Thinking…” label) alongside visual indicators.

## Implementation Checklist
- [ ] Uses only Obsidian CSS variables for colors.
- [ ] Padding/gaps match the spacing scale above.
- [ ] Buttons/bubbles share the standard radii and typography.
- [ ] Streaming states reuse `lonely-assistant-typing` classes.
- [ ] No gradients or hardcoded shadows outside the permitted subtle hover shadow.

Keep this file up to date as the design evolves. Any new component should be added here first, then implemented in code.
