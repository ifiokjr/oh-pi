/**
 * Shell-Format Extension
 *
 * Detects the user's login shell and instructs the LLM to format all shell
 * commands for that shell rather than defaulting to Bash syntax. This means
 * nushell users get nushell commands, fish users get fish commands, etc.
 *
 * For supported shells (nu, fish, zsh), a companion skill is available at
 * ~/.pi/agent/skills/<shell>/SKILL.md that the LLM can load for detailed
 * syntax reference.
 *
 * Usage:
 * 1. Copy this file to ~/.pi/agent/extensions/ (already there!)
 * 2. Restart pi or run /reload
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ---- Shell detection ----

/** Shell profile with optional companion skill reference. */
interface ShellProfile {
	name: string;
	/** Skill name (e.g., "nushell") if a companion SKILL.md exists */
	skill?: string;
	note: string;
}

/**
 * Map of shell binary names to profiles.
 * Shells with `skill` set have a companion skill file the LLM can load.
 */
const SHELL_PROFILES: Record<string, ShellProfile> = {
	nu: {
		name: "Nushell",
		skill: "nushell",
		note:
			"Commands run through a bash execution backend but you MUST write them in Nushell syntax.\n" +
			"The `nushell` skill is available — use the `read` tool to load\n" +
			"`~/.pi/agent/skills/nushell/SKILL.md` when you need detailed Nushell syntax reference\n" +
			"(variables, tables, pipelines, strings, custom commands, control flow, etc.).\n" +
			"Key differences from Bash:\n" +
			"- Variables: `$var` not `${var}`; use `$env.VAR` for environment variables\n" +
			"- Lists: `[a b c]` not quoted space-separated strings\n" +
			"- Pipes: `|` works but structured data flows through records/tables\n" +
			"- Commands: `ls`, `open`, `each`, `where`, `select`, `str replace`, `def`\n" +
			"- No `&&` chaining; use `;` or `and`/`or` keywords\n" +
			'- String interpolation: `$"Hello ($name)"`\n' +
			"- Use `^` prefix to run external commands directly (e.g., `^git status`)\n" +
			"- Shell variables set with `let`, mutable with `mut`",
	},
	fish: {
		name: "Fish",
		skill: "fish",
		note:
			"Commands run through a bash execution backend but you MUST write them in Fish syntax.\n" +
			"The `fish` skill is available — use `read` to load\n" +
			"`~/.pi/agent/skills/fish/SKILL.md` for detailed Fish syntax reference.\n" +
			"Key differences from Bash:\n" +
			"- Variables: `set var value`, use `$var`\n" +
			"- No `$()` command substitution; use `(command)` directly\n" +
			"- `and`/`or` instead of `&&`/`||`\n" +
			"- `end` instead of `fi`/`done`/`esac`\n" +
			"- String manipulation: `string replace`, `string split`, etc.\n" +
			"- Functions: `function name ... end`",
	},
	bash: {
		name: "Bash",
		note: "Use standard Bash/POSIX shell syntax.",
	},
	sh: {
		name: "POSIX shell",
		note: "Use POSIX-compatible shell syntax (dash, ash, BusyBox sh).",
	},
	zsh: {
		name: "Zsh",
		note:
			"Commands run through a bash execution backend. Zsh and Bash have very similar syntax.\n" +
			"You may use Zsh-specific features like glob qualifiers, `=(cmd)`, `{a,b}` expansions,\n" +
			"but be aware the backend is bash — test advanced Zsh features first.",
	},
	pwsh: {
		name: "PowerShell",
		skill: "pwsh",
		note:
			"Commands run through a bash execution backend but you MUST write them in PowerShell syntax.\n" +
			"The `pwsh` skill is available — use `read` to load\n" +
			"`~/.pi/agent/skills/pwsh/SKILL.md` for detailed PowerShell syntax reference.\n" +
			"Key differences:\n" +
			"- Variables: `$var`, environment: `$env:VAR`\n" +
			"- Commands: Verb-Noun pattern (Get-Content, Set-Location, etc.)\n" +
			"- Pipes pass objects, not text\n" +
			"- No `grep`/`sed`/`awk`; use `Select-String`, `-replace`, `Where-Object`",
	},
};

/** Detect the user's shell from environment variables. */
function detectShell(): { key: string; info: ShellProfile } {
	// 1. NU_VERSION → Nushell
	if (process.env.NU_VERSION) {
		return { key: "nu", info: SHELL_PROFILES.nu };
	}

	// 2. FISH_VERSION → Fish
	if (process.env.FISH_VERSION) {
		return { key: "fish", info: SHELL_PROFILES.fish };
	}

	// 3. ZSH_VERSION → Zsh
	if (process.env.ZSH_VERSION) {
		return { key: "zsh", info: SHELL_PROFILES.zsh };
	}

	// 4. BASH_VERSION → Bash
	if (process.env.BASH_VERSION) {
		return { key: "bash", info: SHELL_PROFILES.bash };
	}

	// 5. Parse $SHELL path
	const shellPath = process.env.SHELL ?? "";
	const shellBin = shellPath.split("/").pop()?.toLowerCase() ?? "";
	const baseName = shellBin.replace(/[-.]\d.*$/, "");

	if (baseName in SHELL_PROFILES) {
		return { key: baseName, info: SHELL_PROFILES[baseName] };
	}

	// Fallback: unknown shell
	return {
		key: baseName || "unknown",
		info: {
			name: baseName || "unknown shell",
			note: `Could not determine shell type from $SHELL="${shellPath}". ` + `Use standard POSIX syntax.`,
		},
	};
}

// ---- System prompt injection ----

const { key: shellKey, info } = detectShell();

const SHELL_INSTRUCTION = `
## Shell Syntax

**IMPORTANT:** The user's login shell is **${info.name}**, NOT Bash. When providing
shell commands (including commands passed to the \`bash\` tool), you MUST format
them using ${info.name} syntax.
`;

const SKILL_REFERENCE = info.skill
	? `A comprehensive \`${info.skill}\` skill is available. Use the \`read\` tool to load
\`~/.pi/agent/skills/${info.skill}/SKILL.md\` for complete ${info.name} syntax
reference (command equivalents, pipelines, data types, common patterns, and gotchas).

`
	: "";

const SINK = `
${info.note}

Always provide commands in ${info.name} syntax. The bash tool will execute them;
the execution backend handles compatibility. Your job is to give the user commands
they can understand, reuse, and learn from — in their native shell dialect.
`;

const FULL_INSTRUCTION = SHELL_INSTRUCTION + SKILL_REFERENCE + SINK;

/** Slug for display in status bar. */
const STATUS_LABEL = `${info.name} shell-format`;

/** Whether we need to inject shell instructions (skip for bash/sh/unknown). */
const isSupported = shellKey !== "bash" && shellKey !== "sh" && shellKey !== "unknown";

// ---- Extension entry point ----

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (isSupported) {
			ctx.ui.setStatus("shell-format", STATUS_LABEL);
			ctx.ui.notify(
				`Shell format: commands will use ${info.name} syntax` + (info.skill ? ` (${info.skill} skill available)` : ""),
				"info",
			);
		}
	});

	pi.on("before_agent_start", (event) => {
		if (!isSupported) return;

		const { systemPrompt } = event;

		// Avoid double-injection
		if (systemPrompt.includes("The user's login shell is")) return;

		return {
			systemPrompt: systemPrompt + FULL_INSTRUCTION,
		};
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus("shell-format", undefined);
	});
}
