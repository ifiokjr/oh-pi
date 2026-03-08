/**
 * oh-pi Compact Header — table-style startup info with dynamic column widths
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) {
			return;
		}

		ctx.ui.setHeader((_tui, theme) => ({
			render(width: number): string[] {
				const d = (s: string) => theme.fg("dim", s);
				const a = (s: string) => theme.fg("accent", s);

				const cmds = pi.getCommands();
				const prompts = cmds
					.filter((c) => c.source === "prompt")
					.map((c) => `/${c.name}`)
					.join("  ");
				const skills = cmds
					.filter((c) => c.source === "skill")
					.map((c) => c.name)
					.join("  ");
				const model = ctx.model ? `${ctx.model.id}` : "no model";
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
		}));
	});
}
