import * as p from "@clack/prompts";
import { t } from "@ifi/oh-pi-core";
import type { EnvInfo } from "../utils/detect.js";

export type Mode = "quick" | "custom" | "preset";

/**
 * Prompt the user to select a configuration mode: quick, preset, or custom.
 * @param {EnvInfo} env - Detected environment information
 * @returns {Promise<Mode>} The mode selected by the user
 */
export async function selectMode(_env: EnvInfo): Promise<Mode> {
	const mode = await p.select({
		message: t("mode.select"),
		options: [
			{ value: "quick" as Mode, label: t("mode.quick"), hint: t("mode.quickHint") },
			{ value: "preset" as Mode, label: t("mode.preset"), hint: t("mode.presetHint") },
			{ value: "custom" as Mode, label: t("mode.custom"), hint: t("mode.customHint") },
		],
	});
	if (p.isCancel(mode)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return mode;
}
