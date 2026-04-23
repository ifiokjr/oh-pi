/**
 * oh-pi Compact Header — table-style startup info with dynamic column widths
 *
 * Also bootstraps the plain-icons setting: reads `plainIcons` from
 * settings.json and/or the `--plain-icons` CLI flag, and bridges it
 * to the `OH_PI_PLAIN_ICONS` env var so all oh-pi packages pick it up.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir, VERSION } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { getSafeModeState, subscribeSafeMode } from "./runtime-mode";

/** Read `plainIcons` from settings.json (global or project-local). */
const STARTUP_PLAIN_ICONS_SYNC_DELAY_MS = 250;

function loadPlainIconsSetting(): boolean {
	for (const dir of [join(process.cwd(), ".pi"), getAgentDir()]) {
		try {
			const raw = readFileSync(join(dir, "settings.json"), "utf8");
			const settings = JSON.parse(raw);
			if (settings.plainIcons === true) {
				return true;
			}
		} catch {
			/* file missing or unparseable — skip */
		}
	}
	return false;
}

export function buildCommandCatalog(commands: ReadonlyArray<{ name: string; source?: string }>): {
	prompts: string;
	skills: string;
} {
	const promptNames: string[] = [];
	const skillNames: string[] = [];

	for (const command of commands) {
		if (command.source === "prompt") {
			promptNames.push(`/${command.name}`);
			continue;
		}
		if (command.source === "skill") {
			skillNames.push(command.name);
		}
	}

	return {
		prompts: promptNames.join("  "),
		skills: skillNames.join("  "),
	};
}

export default function (pi: ExtensionAPI) {
	let plainIconsSyncTimer: ReturnType<typeof setTimeout> | undefined;
	const cancelPlainIconsSync = () => {
		if (!plainIconsSyncTimer) {
			return;
		}
		clearTimeout(plainIconsSyncTimer);
		plainIconsSyncTimer = undefined;
	};
	const syncPlainIconsSetting = () => {
		if (process.env.OH_PI_PLAIN_ICONS) {
			return;
		}
		if (loadPlainIconsSetting()) {
			process.env.OH_PI_PLAIN_ICONS = "1";
		}
	};
	// Register --plain-icons CLI flag
	pi.registerFlag("plain-icons", {
		description: "Use ASCII-safe icons instead of emoji (same as OH_PI_PLAIN_ICONS=1 or plainIcons in settings.json)",
		type: "boolean",
		default: false,
	});

	// Bridge settings.json and --plain-icons flag to the env var
	// (env var takes precedence, then flag, then settings.json)
	if (!process.env.OH_PI_PLAIN_ICONS && pi.getFlag("plain-icons") === true) {
		process.env.OH_PI_PLAIN_ICONS = "1";
	}
	pi.on("session_start", async (_event, ctx) => {
		cancelPlainIconsSync();
		plainIconsSyncTimer = setTimeout(() => {
			plainIconsSyncTimer = undefined;
			syncPlainIconsSetting();
		}, STARTUP_PLAIN_ICONS_SYNC_DELAY_MS);
		plainIconsSyncTimer.unref?.();

		if (!ctx.hasUI) {
			return;
		}

		ctx.ui.setHeader((tui, theme) => {
			const unsubSafeMode = subscribeSafeMode(() => tui.requestRender());
			const commandCatalog = buildCommandCatalog(pi.getCommands());
			return {
				dispose() {
					unsubSafeMode();
				},
				render(width: number): string[] {
					if (getSafeModeState().enabled) {
						return [];
					}
					const d = (s: string) => theme.fg("dim", s);
					const a = (s: string) => theme.fg("accent", s);

					const model = ctx.model ? `${ctx.model.id}` : "no model";
					const { prompts, skills } = commandCatalog;
					const thinking = pi.getThinkingLevel();
					const provider = ctx.model?.provider ?? "";

					const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - visibleWidth(s)));
					const t = (s: string) => truncateToWidth(s, width);
					const sep = d(" │ ");

					// Right two columns are fixed width
					const rCol = [
						[d("esc"), a("interrupt"), d("S-tab"), a("thinking")],
						[d("^C"), a("clear/exit"), d("^O"), a("expand")],
						[d("^P"), a("model"), d("^G"), a("editor")],
						[d("/"), a("commands"), d("^V"), a("paste")],
						[d("!"), a("bash"), d(""), a("")],
					];
					const k1w = 6;
					const v1w = 13;
					const k2w = 6;
					const v2w = 9;
					const rightW = k1w + v1w + 3 + k2w + v2w + 3; // 3 for each sep

					// Left column gets remaining space
					const leftW = Math.max(20, width - rightW);
					const lk = 9; // label width

					const lCol = [
						[d("version"), a(`v${VERSION}  ${provider}`)],
						[d("model"), a(model)],
						[d("think"), a(thinking)],
						[d(""), d("")],
						[d(""), d("")],
					];

					const lines: string[] = [""];
					for (let i = 0; i < 5; i++) {
						const [lk0, lv0] = lCol[i];
						const [rk0, rv0, rk1, rv1] = rCol[i];
						const left = truncateToWidth(pad(lk0, lk) + lv0, leftW);
						const right = pad(rk0, k1w) + pad(rv0, v1w) + sep + pad(rk1, k2w) + rv1;
						lines.push(t(pad(left, leftW) + sep + right));
					}

					if (prompts) {
						lines.push(t(`${pad(d("prompts"), lk)}${a(prompts)}`));
					}
					if (skills) {
						lines.push(t(`${pad(d("skills"), lk)}${a(skills)}`));
					}
					lines.push(d("─".repeat(width)));

					return lines;
				},
				// biome-ignore lint/suspicious/noEmptyBlockStatements: Required by header interface
				invalidate() {},
			};
		});
	});

	pi.on("session_shutdown", async () => {
		cancelPlainIconsSync();
	});
}
