# Contributing Guide

Thank you for your interest in oh-pi! All forms of contributions are welcome.

## Development Setup

```bash
git clone https://github.com/telagod/oh-pi.git
cd oh-pi
pnpm install
pnpm build
pnpm test
```

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix     | Purpose                             |
| ---------- | ----------------------------------- |
| `feat`     | New feature                         |
| `fix`      | Bug fix                             |
| `docs`     | Documentation changes               |
| `refactor` | Refactor (no behavior change)       |
| `test`     | Add or modify tests                 |
| `chore`    | Build, dependency, and other chores |

Examples:

```
feat(ant-colony): add planning recovery loop
fix(spawner): handle 429 rate limits gracefully
docs: update README with new extension list
```

## Branch Strategy

- `main` — stable branch, no force pushes
- Feature branches created from `main`, named: `feat/xxx`, `fix/xxx`, `docs/xxx`
- Merge via Pull Request, at least one review required

## Pull Request Process

1. Fork this repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes (follow the commit convention)
4. Ensure the build passes: `pnpm build`
5. Ensure lint passes: `pnpm lint`
6. Push and create a PR

### PR Requirements

- Title follows Conventional Commits format
- Description clearly explains the change and rationale
- One PR addresses one issue
- No unrelated code changes

## Code Style

- Follow existing project style (enforced by Biome)
- Use meaningful variable names
- Keep functions under 50 lines where possible
- Add comments only for complex logic
- Never hardcode keys or sensitive information
- Handle errors explicitly — don't fail silently

## Reporting Issues

Use the [Issue templates](https://github.com/telagod/oh-pi/issues/new/choose) and include:

- Clear problem description
- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Node.js version, etc.)

## License

By submitting a contribution, you agree that your code will be released under the [MIT](./LICENSE)
license.
