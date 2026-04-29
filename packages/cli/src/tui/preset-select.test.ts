import { describe, expect, it } from "vitest";

import { PRESETS } from "./preset-select.js";

describe("PRESETS", () => {
	it("keeps safe-guard opt-in even in the full preset", () => {
		const full = PRESETS.full?.config;
		expect(full).toBeDefined();
		expect(full?.extensions).not.toContain("safe-guard");
		expect(full?.extensions).toContain("bg-process");
		expect(full?.extensions).not.toContain("ant-colony");
	});

	it("keeps the clean preset extension-free", () => {
		expect(PRESETS.clean?.config.extensions).toEqual([]);
	});

	it("keeps the colony preset focused on colony-related defaults", () => {
		expect(PRESETS.colony?.config.extensions).toEqual(["ant-colony", "auto-session-name", "compact-header"]);
		expect(PRESETS.colony?.config.extensions).not.toContain("safe-guard");
	});
});
