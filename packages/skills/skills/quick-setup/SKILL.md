---
name: quick-setup
description: Detect project type and generate .pi/ configuration. Use when setting up pi for a new project or when user asks to initialize pi config.
---

# Quick Setup

Analyze the current project and generate appropriate `.pi/` configuration.

## Steps

1. **Detect project type** by examining files:
   - `package.json` → Node.js/TypeScript
   - `requirements.txt` / `pyproject.toml` → Python
   - `go.mod` → Go
   - `Cargo.toml` → Rust
   - `pom.xml` / `build.gradle` → Java
   - `Makefile` / `CMakeLists.txt` → C/C++

2. **Detect frameworks** (React, Vue, Next.js, Django, FastAPI, Gin, etc.)

3. **Detect existing tooling** (ESLint, Prettier, pytest, etc.)

4. **Generate `.pi/` directory**:

```
.pi/
├── settings.json      # Project-specific settings
└── AGENTS.md          # Project context for the agent
```

5. **Generate AGENTS.md** with:
   - Project stack description
   - Build/test/lint commands (from package.json scripts, Makefile, etc.)
   - Code conventions detected from config files
   - Directory structure overview

6. **Generate settings.json** with:
   - Appropriate thinking level for project complexity
   - Relevant skills enabled

## Output

Show the generated files and ask user to confirm before writing.
