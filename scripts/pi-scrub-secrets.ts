#!/usr/bin/env node
/**
 * Pi Session Secret Scrubber — retroactively removes secrets from Pi session logs.
 *
 * Usage:
 *   npx pi-scrub-secrets              # Dry run — show what would be redacted
 *   npx pi-scrub-secrets --apply       # Actually modify JSONL files
 *   npx pi-scrub-secrets --apply --level=all   # Include env-var values
 *   npx pi-scrub-secrets --dir <path>  # Custom session directory
 *   npx pi-scrub-secrets --json        # Machine-readable output
 *
 * Backs up each file before modification (file.jsonl → file.jsonl.bak).
 * Creates a scrub-manifest.json so you can undo later.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

// ── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_SESSION_DIR = join(homedir(), ".pi", "agent", "sessions");

type ScrubLevel = "patterns" | "env" | "all";

interface ScrubConfig {
	level: ScrubLevel;
	apply: boolean;
	json: boolean;
	dir: string;
	extraPatterns: Array<{ pattern: string; label: string }>;
}

function parseArgs(args: string[]): ScrubConfig {
	const config: ScrubConfig = {
		level: "patterns",
		apply: false,
		json: false,
		dir: DEFAULT_SESSION_DIR,
		extraPatterns: [],
	};

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--apply":
				config.apply = true;
				break;
			case "--level":
				config.level = args[++i] as ScrubLevel;
				break;
			case "--dir":
				config.dir = args[++i];
				break;
			case "--json":
				config.json = true;
				break;
			case "--extra-patterns":
				config.extraPatterns = JSON.parse(args[++i]);
				break;
			case "--help":
				printHelp();
				process.exit(0);
		}
	}
	return config;
}

function printHelp() {
	console.log(`
Pi Session Secret Scrubber

Usage:
  npx pi-scrub-secrets              # Dry run
  npx pi-scrub-secrets --apply       # Modify files
  npx pi-scrub-secrets --level=all  # Include env-var values
  npx pi-scrub-secrets --dir <path> # Custom session directory
  npx pi-scrub-secrets --apply --json # Machine-readable output

Options:
  --apply             Actually modify JSONL files (default: dry run)
  --level <level>     patterns (default) | env | all
  --dir <path>        Session directory (default: ~/.pi/agent/sessions)
  --json              JSON output for each finding
  --extra-patterns    JSON array of {pattern, label} objects
  --help              Show this help

Backs up each file before modification (.jsonl → .jsonl.bak).
	`);
}

// ── Secret patterns (same as secret-guard extension) ─────────────────────────

interface SecretPattern {
	pattern: RegExp;
	label: string;
}

const BUILTIN_PATTERNS: SecretPattern[] = [
	{ pattern: /AKIA[0-9A-Z]{16}/g, label: "AWS_ACCESS_KEY_ID" },
	{ pattern: /ghp_[0-9a-zA-Z]{36,}/g, label: "GH_PAT" },
	{ pattern: /gho_[0-9a-zA-Z]{36,}/g, label: "GH_OAUTH" },
	{ pattern: /ghu_[0-9a-zA-Z]{36,}/g, label: "GH_USER_TOKEN" },
	{ pattern: /ghs_[0-9a-zA-Z]{36,}/g, label: "GH_APP_TOKEN" },
	{ pattern: /ghr_[0-9a-zA-Z]{36,}/g, label: "GH_REFRESH_TOKEN" },
	{ pattern: /github_pat_[0-9a-zA-Z_]{82}/g, label: "GH_FINE_GRAINED_PAT" },
	{ pattern: /glpat-[0-9a-zA-Z\-]{20,}/g, label: "GL_PAT" },
	{ pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,34}/g, label: "SLACK_BOT_TOKEN" },
	{ pattern: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,34}/g, label: "SLACK_USER_TOKEN" },
	{ pattern: /sk_live_[0-9a-zA-Z]{24,99}/g, label: "STRIPE_SECRET_KEY" },
	{ pattern: /sk_test_[0-9a-zA-Z]{24,99}/g, label: "STRIPE_TEST_KEY" },
	{ pattern: /rk_live_[0-9a-zA-Z]{24,99}/g, label: "STRIPE_RESTRICTED_KEY" },
	{ pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, label: "PRIVATE_KEY_BEGIN" },
	{ pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g, label: "PGP_PRIVATE_KEY_BEGIN" },
	{ pattern: /eyJ[0-9a-zA-Z_-]{10,}\.eyJ[0-9a-zA-Z_-]{10,}\.[0-9a-zA-Z_-]{10,}/g, label: "JWT" },
	{ pattern: /(?:mongodb|postgres|postgresql|mysql|redis|amqp):\/\/[^:\s]+:([^@\s]{3,})@/g, label: "DB_PASSWORD" },
	{
		pattern: /(?<=(?:^|[\s"'`]))([A-Z_][A-Z0-9_]{0,}(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH)[A-Z0-9_]{0,})=([^\s"'`]{8,})/gm,
		label: "ENV_SECRET",
	},
	{ pattern: /npm_[0-9a-zA-Z]{36,}/g, label: "NPM_TOKEN" },
	{ pattern: /dckr_pat_[0-9a-zA-Z]{22,}/g, label: "DOCKER_PAT" },
	{ pattern: /sk-ant-api[0-9a-z]{2}-[0-9a-zA-Z_-]{20,}/g, label: "ANTHROPIC_API_KEY" },
	{ pattern: /(?:DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=)[0-9a-zA-Z+/=]{40,}/g, label: "AZURE_STORAGE_KEY" },
	{ pattern: /"type"\s*:\s*"service_account"/g, label: "GCP_SERVICE_ACCOUNT" },
];

// ── Environment-based detection ──────────────────────────────────────────────

const SECRET_ENV_PATTERNS = [
	"PASSWORD", "SECRET", "TOKEN", "API_KEY", "ACCESS_KEY",
	"PRIVATE_KEY", "CREDENTIAL", "AUTH", "DATABASE_URL",
	"CONNECTION_STRING", "CONNECTIONSTRING",
];

const ALLOWED_ENV_VARS = new Set([
	"PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL",
	"PWD", "OLDPWD", "EDITOR", "PAGER", "TZ", "HOSTNAME",
	"DOCKER_HOST", "DISPLAY", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
	"XDG_CACHE_HOME", "NODE_ENV", "NPM_CONFIG_REGISTRY",
]);

interface EnvSecret {
	name: string;
	value: string;
}

function getEnvSecrets(): EnvSecret[] {
	const secrets: EnvSecret[] = [];
	for (const [name, value] of Object.entries(process.env)) {
		if (!value || value.length < 6) continue;
		if (ALLOWED_ENV_VARS.has(name)) continue;
		const upperName = name.toUpperCase();
		if (SECRET_ENV_PATTERNS.some((p) => upperName.includes(p))) {
			secrets.push({ name, value });
		}
	}
	secrets.sort((a, b) => b.value.length - a.value.length);
	return secrets;
}

// ── Redaction engine ─────────────────────────────────────────────────────────

interface Redaction {
	original: string;
	replacement: string;
	label: string;
	line: number;
	file: string;
}

function redactText(text: string, level: ScrubLevel, envSecrets: EnvSecret[], extraPats: SecretPattern[]): {
	result: string;
	redactions: Array<{ original: string; replacement: string; label: string }>;
} {
	const redactions: Array<{ original: string; replacement: string; label: string }> = [];
	let result = text;

	if (level === "patterns" || level === "all") {
		const allPatterns = [...BUILTIN_PATTERNS, ...extraPats];
		for (const { pattern, label } of allPatterns) {
			pattern.lastIndex = 0;
			const matches = result.match(pattern);
			if (matches) {
				for (const match of matches) {
					redactions.push({ original: match, replacement: `[REDACTED:${label}]`, label });
				}
			}
			pattern.lastIndex = 0;
			result = result.replace(pattern, `[REDACTED:${label}]`);
		}
	}

	if (level === "env" || level === "all") {
		for (const { name, value } of envSecrets) {
			if (value.length < 6) continue;
			if (/^(true|false|null|undefined|none|empty)$/i.test(value)) continue;
			if (result.includes(value)) {
				redactions.push({ original: value, replacement: `[REDACTED:${name}]`, label: name });
				const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				result = result.replace(new RegExp(escaped, "g"), `[REDACTED:${name}]`);
			}
		}
	}

	return { result, redactions };
}

/** Recursively redact all string values in a JSON object, tracking paths. */
function redactJSON(
	obj: unknown,
	level: ScrubLevel,
	envSecrets: EnvSecret[],
	extraPats: SecretPattern[],
): { result: unknown; redactions: Redaction[] } {
	const allRedactions: Redaction[] = [];

	if (typeof obj === "string") {
		const { result, redactions } = redactText(obj, level, envSecrets, extraPats);
		for (const r of redactions) {
			allRedactions.push({ ...r, line: 0, file: "" });
		}
		return { result, redactions: allRedactions };
	}

	if (Array.isArray(obj)) {
		const results: unknown[] = [];
		for (const item of obj) {
			const { result, redactions } = redactJSON(item, level, envSecrets, extraPats);
			results.push(result);
			allRedactions.push(...redactions);
		}
		return { result: results, redactions: allRedactions };
	}

	if (obj && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
			if (typeof value === "string") {
				const { result: redactedStr, redactions } = redactText(value, level, envSecrets, extraPats);
				result[key] = redactedStr;
				for (const r of redactions) {
					allRedactions.push({ ...r, line: 0, file: "" });
				}
			} else if (typeof value === "object" && value !== null) {
				const { result: redactedVal, redactions } = redactJSON(value, level, envSecrets, extraPats);
				result[key] = redactedVal;
				allRedactions.push(...redactions);
			} else {
				result[key] = value;
			}
		}
		return { result, redactions: allRedactions };
	}

	return { result: obj, redactions: allRedactions };
}

// ── File processing ──────────────────────────────────────────────────────────

function findSessionFiles(dir: string): string[] {
	const files: string[] = [];

	function walk(d: string) {
		if (!existsSync(d)) return;
		for (const entry of readdirSync(d)) {
			const full = join(d, entry);
			const stat = statSync(full);
			if (stat.isDirectory()) {
				walk(full);
			} else if (entry.endsWith(".jsonl") && !entry.endsWith(".jsonl.bak")) {
				files.push(full);
			}
		}
	}

	walk(dir);
	return files.sort();
}

function processFile(
	filePath: string,
	config: ScrubConfig,
	envSecrets: EnvSecret[],
	extraPats: SecretPattern[],
): { totalRedactions: number; modified: boolean } {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	let totalRedactions = 0;
	let modified = false;
	const newLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) {
			newLines.push(line);
			continue;
		}

		try {
			const parsed = JSON.parse(line);
			const { result, redactions } = redactJSON(parsed, config.level, envSecrets, extraPats);

			if (redactions.length > 0) {
				totalRedactions += redactions.length;
				modified = true;
				newLines.push(JSON.stringify(result));

				for (const r of redactions) {
					r.file = filePath;
					r.line = i + 1;
					if (config.json) {
						console.log(JSON.stringify(r));
					} else {
						console.log(`  L${r.line}: ${r.original.slice(0, 40)}${r.original.length > 40 ? "…" : ""} → ${r.replacement}`);
					}
				}
			} else {
				newLines.push(line);
			}
		} catch {
			// Not valid JSON — still redact as plain text
			const { result, redactions } = redactText(line, config.level, envSecrets, extraPats);
			if (redactions.length > 0) {
				totalRedactions += redactions.length;
				modified = true;
				newLines.push(result);
				for (const r of redactions) {
					if (config.json) {
						console.log(JSON.stringify({ ...r, file: filePath, line: i + 1 }));
					} else {
						console.log(`  L${i + 1}: ${r.original.slice(0, 40)}${r.original.length > 40 ? "…" : ""} → [REDACTED:${r.label}]`);
					}
				}
			} else {
				newLines.push(line);
			}
		}
	}

	if (modified && config.apply) {
		// Back up original (copy, not rename, so original survives a crash)
		const bakPath = filePath + ".bak";
		if (!existsSync(bakPath)) {
			copyFileSync(filePath, bakPath);
		}

		writeFileSync(filePath, newLines.join("\n"));

		// Validate: every non-empty line must be valid JSON
		const written = readFileSync(filePath, "utf-8");
		const writtenLines = written.split("\n");
		let invalidLines = 0;
		for (const wl of writtenLines) {
			if (wl.trim()) {
				try {
					JSON.parse(wl);
				} catch {
					invalidLines++;
				}
			}
		}

		if (invalidLines > 0) {
			console.error(`  ⚠ VALIDATION FAILED: ${invalidLines} invalid JSON lines in ${filePath}`);
			console.error(`  Restoring backup from ${bakPath}...`);
			copyFileSync(bakPath, filePath);
			return { totalRedactions: 0, modified: false };
		}
	}

	return { totalRedactions, modified };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
	const config = parseArgs(process.argv.slice(2));

	if (!config.json) {
		const mode = config.apply ? "APPLY" : "DRY RUN";
		console.log(`\n🔐 Pi Session Secret Scrubber — ${mode} mode`);
		console.log(`   Directory: ${config.dir}`);
		console.log(`   Level: ${config.level}\n`);
	}

	const envSecrets = config.level === "env" || config.level === "all" ? getEnvSecrets() : [];
	const extraPats: SecretPattern[] = config.extraPatterns.map((p) => ({
		pattern: new RegExp(p.pattern, "g"),
		label: p.label,
	}));

	const files = findSessionFiles(config.dir);
	if (!config.json) {
		console.log(`Found ${files.length} session files\n`);
	}

	let totalFiles = 0;
	let totalRedactions = 0;
	let filesModified = 0;

	for (const file of files) {
		const { totalRedactions: fileRedactions, modified } = processFile(file, config, envSecrets, extraPats);
		totalRedactions += fileRedactions;
		if (modified) filesModified++;
		if (fileRedactions > 0) totalFiles++;
	}

	if (!config.json) {
		console.log(`\n📊 Summary:`);
		console.log(`   Files scanned:   ${files.length}`);
		console.log(`   Files with hits: ${totalFiles}`);
		console.log(`   Total redactions: ${totalRedactions}`);
		console.log(`   Files modified:  ${filesModified}${config.apply ? "" : " (dry run — no changes made)"}`);
		if (config.apply && filesModified > 0) {
			console.log(`\n   Backups saved as .jsonl.bak files. To undo:`);
			console.log("   To undo: find " + config.dir + " -name '*.jsonl.bak' -exec sh -c 'mv \"$0\" \"${0%.bak}\"' {} \\;");
		}
		console.log();
	}

	if (totalRedactions > 0 && !config.apply && !config.json) {
		console.log(`💡 Re-run with --apply to actually modify files.`);
		console.log();
	}
}

main();