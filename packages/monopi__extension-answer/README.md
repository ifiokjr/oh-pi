# @monopi/extension-answer

Standalone pi extension package for answering questions extracted from the last assistant response.

```bash
pi install npm:@monopi/extension-answer
```

## Commands

- `/answer` — extract questions from the last completed assistant message and answer them in the Q&A overlay.
- `/answer auto` — toggle automatic question detection after assistant turns.

The extension uses `@monopi/shared-qna` for the interactive Q&A UI. It accepts both Monopi's JSON-array extraction format and the upstream object-shaped `{ "questions": [...] }` format, and prefers a configured fast extraction model when one is available.

## Attribution

This package keeps the Monopi Q&A UI flow while incorporating extraction-model selection and JSON repair ideas from [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/answer.ts`.
Those adapted ideas are Copyright Armin Ronacher and contributors and licensed under Apache-2.0.
Monopi package metadata and surrounding repository files remain MIT licensed.
