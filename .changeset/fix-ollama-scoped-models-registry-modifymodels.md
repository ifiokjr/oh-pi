---
default: patch
---

Fix Ollama cloud models not appearing in /scoped-models after refresh

The `modifyModels` OAuth callback in `createOllamaCloudOAuthProvider` always
used `getCredentialModels(credentials)` — the stale models stored with the
login credential — over the freshly discovered runtime state. This meant that
even after `/ollama:refresh-models` successfully re-discovered all models, the
model registry (used by `/scoped-models`) would overwrite them with the old
credential models on the next registry refresh.

Now `modifyModels` prefers `cloudEnvDiscoveryState.models` (the runtime
discovery state that is always updated during refresh) and only falls back to
credential models when the runtime state is empty (e.g. before first
discovery).