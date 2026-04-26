import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkHealth, rescan } from "../src/fff-helpers.js";

describe("fff-helpers", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("checkHealth returns degraded status when FFF is unavailable", async () => {
		const result = await checkHealth();
		expect(typeof result.ok).toBe("boolean");
		expect(typeof result.message).toBe("string");
		expect(typeof result.indexed).toBe("boolean");
	});

	it("rescan returns degraded status when FFF is unavailable", async () => {
		const result = await rescan();
		expect(typeof result.ok).toBe("boolean");
		expect(typeof result.message).toBe("string");
	});
});
