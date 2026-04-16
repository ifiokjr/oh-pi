import { describe, expect, it } from "vitest";
import { CURRENT_VERSION, MIN_VERSION, SMOKE_TESTS, parseArgs } from "./verify-pi-compat.mjs";

describe("verify pi compatibility script", () => {
	it("includes the diagnostics smoke test in compatibility runs", () => {
		expect(SMOKE_TESTS).toContain("packages/diagnostics/tests/smoke.test.ts");
	});

	it("parses explicit versions and restore mode", () => {
		expect(parseArgs(["--version", CURRENT_VERSION, "--restore"], {})).toEqual({
			restore: true,
			version: CURRENT_VERSION,
		});
		expect(parseArgs([], { PI_COMPAT_VERSION: MIN_VERSION })).toEqual({
			restore: false,
			version: MIN_VERSION,
		});
		expect(() => parseArgs([], {})).toThrow("Missing pi compatibility version");
	});
});
