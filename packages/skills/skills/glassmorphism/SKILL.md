---
name: glassmorphism
description: Glassmorphism design system skill. Use when building frosted-glass UI components with blur, transparency, and layered depth effects.
version: 1.0.0
tags: [design, css, ui, glassmorphism]
---

# Glassmorphism Design Spec

## 4 Core Elements

1. **Transparency** — Semi-transparent backgrounds using `rgba()` or `hsla()` with alpha `0.05–0.4`
2. **Blur** — `backdrop-filter: blur()` ranging 8–40px for frosted-glass effect
3. **Border** — Subtle semi-transparent borders (`1px solid rgba(255,255,255,0.18)`) to define edges
4. **Shadow** — Soft layered `box-shadow` for depth separation from background

## CSS Tokens

Reference: [references/tokens.css](references/tokens.css)

Use CSS custom properties from `tokens.css` for consistent theming:

```css
@import 'references/tokens.css';

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow: var(--glass-shadow);
}
```

## Component Examples

### Card
```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--glass-radius);
  box-shadow: var(--glass-shadow);
  padding: 1.5rem;
}
```

### Navbar
```css
.glass-nav {
  background: var(--glass-bg-heavy);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border-bottom: var(--glass-border);
  box-shadow: var(--glass-shadow);
  position: sticky;
  top: 0;
  z-index: 100;
}
```

### Modal Overlay
```css
.glass-modal-backdrop {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}
.glass-modal {
  background: var(--glass-bg-heavy);
  backdrop-filter: var(--glass-blur-strong);
  -webkit-backdrop-filter: var(--glass-blur-strong);
  border: var(--glass-border);
  border-radius: var(--glass-radius-lg);
  box-shadow: var(--glass-shadow-elevated);
}
```

### Button
```css
.glass-btn {
  background: var(--glass-bg-light);
  backdrop-filter: var(--glass-blur-light);
  -webkit-backdrop-filter: var(--glass-blur-light);
  border: var(--glass-border);
  border-radius: var(--glass-radius);
  transition: background 0.2s;
}
.glass-btn:hover {
  background: var(--glass-bg);
}
```

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| `backdrop-filter` | 76+ | 103+ | 9+ (`-webkit-`) | 79+ |
| `rgba()` backgrounds | All | All | All | All |

- Always include `-webkit-backdrop-filter` for Safari support
- Firefox <103: use `@supports` fallback with solid semi-transparent bg
- Fallback pattern:

```css
.glass-card {
  background: rgba(255, 255, 255, 0.85); /* fallback */
}
@supports (backdrop-filter: blur(1px)) {
  .glass-card {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
  }
}
```

## Accessibility Notes

- Ensure **contrast ratio ≥ 4.5:1** for text over glass surfaces — test against all possible backgrounds
- Provide `prefers-reduced-transparency` media query to disable blur/transparency for users who need it
- Avoid placing critical text on highly transparent surfaces without a fallback
- Use `prefers-contrast: more` to increase border opacity and reduce transparency

```css
@media (prefers-reduced-transparency: reduce) {
  .glass-card {
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: none;
  }
}
@media (prefers-contrast: more) {
  .glass-card {
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(0, 0, 0, 0.3);
  }
}
```
