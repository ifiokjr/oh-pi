---
default: minor
---

Upgrade Vite from 7.3.2 to 8.0.9 across the monorepo. Also upgrade
@vitejs/plugin-react from v4 to v6 for Vite 8 compatibility. Convert
analytics-dashboard's manualChunks from object to function form
(required by Rolldown/Vite 8).