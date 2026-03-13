---
default: patch
---

Make the CI dependency review job skip cleanly when GitHub dependency graph manifests are not yet available for the repository, instead of failing the whole pull request with a repository settings error.
