---
name: claymorphism
description: Claymorphism design system skill. Use when building soft, puffy, clay-like UI components with large radii, dual inner shadows, and offset outer shadows.
version: 1.0.0
tags: [design, css, ui, claymorphism]
---

# Claymorphism Design Spec

## 3 Core Elements

1. **Large Radius** — Generous `border-radius` (20–50px) for a puffy, inflated look
2. **Dual Inner Shadows** — Light inset from top-left + dark inset from bottom-right to simulate 3D clay surface
3. **Offset Outer Shadow** — Directional `box-shadow` offset (not centered) to ground the element

## CSS Tokens

Reference: [references/tokens.css](references/tokens.css)

```css
@import 'references/tokens.css';

.clay-card {
  background: var(--clay-bg-card);
  border-radius: var(--clay-radius-lg);
  box-shadow: var(--clay-shadow);
  color: var(--clay-text);
}
```

## Component Examples

### Card
```css
.clay-card {
  background: var(--clay-bg-card);
  border-radius: var(--clay-radius-lg);
  box-shadow: var(--clay-shadow);
  padding: 1.5rem;
  color: var(--clay-text);
}
```

### Button
```css
.clay-btn {
  background: var(--clay-bg-button);
  border: none;
  border-radius: var(--clay-radius-pill);
  box-shadow: var(--clay-shadow);
  padding: 0.75rem 1.5rem;
  color: var(--clay-text);
  cursor: pointer;
  transition: box-shadow 0.2s;
}
.clay-btn:hover {
  box-shadow: var(--clay-shadow-elevated);
}
.clay-btn:active {
  box-shadow: var(--clay-shadow-pressed);
}
```

### Input
```css
.clay-input {
  background: var(--clay-bg);
  border: none;
  border-radius: var(--clay-radius);
  box-shadow: var(--clay-shadow-pressed);
  padding: 0.75rem 1rem;
  color: var(--clay-text);
}
.clay-input:focus {
  outline: 2px solid var(--clay-accent);
  outline-offset: 2px;
}
```

### Toggle
```css
.clay-toggle {
  width: 56px;
  height: 30px;
  background: var(--clay-bg-card);
  border-radius: var(--clay-radius-pill);
  box-shadow: var(--clay-shadow-pressed);
}
.clay-toggle-knob {
  width: 24px;
  height: 24px;
  background: var(--clay-bg);
  border-radius: 50%;
  box-shadow: var(--clay-shadow);
  transition: transform 0.2s;
}
```

## Dark Mode Notes

- Dark mode reduces inner highlight intensity (`rgba(255,255,255,0.05)` vs `0.6`) to avoid glowing artifacts
- Outer shadow opacity increases to maintain depth on dark backgrounds
- Background colors shift to warm dark tones — avoid pure black to preserve the clay feel
- All dark tokens are defined in `[data-theme="dark"]` in `tokens.css`

## Accessibility Notes

- Ensure **contrast ratio ≥ 4.5:1** for text — clay backgrounds are muted, verify against `--clay-text`
- Provide visible `:focus` outlines since clay shadows alone don't indicate focus
- Use `prefers-contrast: more` to flatten shadows and increase text contrast

```css
@media (prefers-contrast: more) {
  .clay-card {
    box-shadow: 0 0 0 2px var(--clay-text);
  }
}
```
