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
			{ hint: t("mode.quickHint"), label: t("mode.quick"), value: "quick" as Mode },
			{ hint: t("mode.presetHint"), label: t("mode.preset"), value: "preset" as Mode },
			{ hint: t("mode.customHint"), label: t("mode.custom"), value: "custom" as Mode },
		],
	});
	if (p.isCancel(mode)) {
		p.cancel(t("cancelled"));
		process.exit(0);
	}
	return mode;
}
