# `@ifi/oh-pi-prompts`

> 10 ready-made slash commands for common coding tasks.

## Why use this?

You don't need to craft the perfect prompt every time. These templates encode proven prompt structures for the tasks you do most often — code review, testing, refactoring, committing, and more.

Just type the slash command, and pi already knows what you want.

## All prompts

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `/review` | Code review for bugs, security, performance, and readability | `/review` (on selected file) |
| `/fix` | Fix a bug with minimal changes and explain the root cause | `/fix the login redirect loops on error` |
| `/explain` | Explain code from summary through trade-offs and edge cases | `/explain this authentication middleware` |
| `/refactor` | Refactor while preserving behavior | `/refactor extract the validation logic` |
| `/test` | Generate tests using the project's existing framework | `/test` (on selected file) |
| `/commit` | Generate a Conventional Commit message from staged changes | `/commit` (with staged changes) |
| `/document` | Generate or update technical documentation | `/document this API endpoint` |
| `/optimize` | Analyze and improve performance without premature optimization | `/optimize this database query` |
| `/security` | OWASP-style security audit | `/security` (on selected file) |
| `/pr` | Draft a pull request description | `/pr` (after finishing a feature) |

## Installation

```bash
pi install npm:@ifi/oh-pi-prompts
```

> Installed by default with `npx @ifi/oh-pi`.

## How they work

Each prompt is a markdown file with instructions that pi injects into the conversation when you type the slash command. They're designed to:

- **Set context:** Tell pi what role to take (reviewer, tester, writer)
- **Define output:** Specify what format the response should follow
- **Include constraints:** "Minimal changes", "preserve behavior", "follow existing patterns"

## Package layout

```
prompts/
├── review.md
├── fix.md
├── explain.md
├── refactor.md
├── test.md
├── commit.md
├── document.md
├── optimize.md
├── security.md
└── pr.md
```

## Customization

These are pi prompt templates — you can override any of them by placing a file with the same name in your user prompt directory.

## Related

- Pi built-in `@` commands — user-defined prompt shortcuts
- `@ifi/oh-pi-skills` — on-demand skill packs for deeper workflows
