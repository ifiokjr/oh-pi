---
name: neubrutalism
description: Neubrutalism design system skill. Use when building bold UI with thick borders, offset solid shadows, high saturation colors, and minimal border radius.
version: 1.0.0
tags: [design, css, ui, neubrutalism, brutalism]
---

# Neubrutalism Design Spec

## Core Principles

1. **Thick Borders** — Bold `3–5px solid` black outlines on all elements
2. **Offset Solid Shadows** — Hard-edge `box-shadow` with zero blur (e.g. `5px 5px 0 #000`)
3. **High Saturation Colors** — Vivid, punchy fills: pinks, yellows, blues, greens
4. **Minimal Radius** — `0–8px` border-radius; sharp or barely rounded corners
5. **Flat Aesthetic** — No gradients, no blur, no transparency

## CSS Tokens

Reference: [references/tokens.css](references/tokens.css)

```css
@import 'references/tokens.css';

.nb-card {
  background: var(--nb-yellow);
  border: var(--nb-border-thick);
  border-radius: var(--nb-radius);
  box-shadow: var(--nb-shadow);
}
```

## Component Examples

### Card
```css
.nb-card {
  background: var(--nb-white);
  border: var(--nb-border-thick);
  border-radius: var(--nb-radius);
  box-shadow: var(--nb-shadow);
  padding: 1.5rem;
}
```

### Button
```css
.nb-btn {
  background: var(--nb-yellow);
  border: var(--nb-border);
  border-radius: var(--nb-radius);
  box-shadow: var(--nb-shadow-sm);
  padding: 0.6rem 1.4rem;
  font-family: var(--nb-font);
  font-weight: var(--nb-font-weight);
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
}
.nb-btn:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--nb-shadow);
}
.nb-btn:active {
  transform: translate(3px, 3px);
  box-shadow: none;
}
```

### Navbar
```css
.nb-nav {
  background: var(--nb-bg);
  border-bottom: var(--nb-border-thick);
  padding: 1rem 2rem;
  position: sticky;
  top: 0;
  z-index: 100;
}
```

### Input
```css
.nb-input {
  background: var(--nb-white);
  border: var(--nb-border);
  border-radius: var(--nb-radius);
  box-shadow: var(--nb-shadow-sm);
  padding: 0.6rem 1rem;
  font-family: var(--nb-font);
  font-weight: var(--nb-font-weight-body);
}
.nb-input:focus {
  outline: none;
  box-shadow: var(--nb-shadow);
}
```

### Badge
```css
.nb-badge {
  background: var(--nb-pink);
  border: var(--nb-border);
  border-radius: var(--nb-radius);
  padding: 0.2rem 0.8rem;
  font-family: var(--nb-font);
  font-weight: var(--nb-font-weight);
  font-size: 0.85rem;
}
```

## Typography

- Use bold, geometric sans-serif fonts (Space Grotesk, Inter, etc.)
- Headings: `font-weight: 700`, `letter-spacing: -0.02em`
- Body: `font-weight: 500`
- Uppercase sparingly for labels/badges

```css
h1, h2, h3 {
  font-family: var(--nb-font-heading);
  font-weight: var(--nb-font-weight);
  letter-spacing: var(--nb-letter-spacing);
}
body {
  font-family: var(--nb-font);
  font-weight: var(--nb-font-weight-body);
}
```

## Accessibility Notes

- Thick borders provide strong visual boundaries — good for low-vision users
- Ensure color contrast ≥ 4.5:1 for text on colored backgrounds
- Active/hover states use `transform` shifts — provide `prefers-reduced-motion` fallback

```css
@media (prefers-reduced-motion: reduce) {
  .nb-btn:hover, .nb-btn:active {
    transform: none;
  }
}
```
