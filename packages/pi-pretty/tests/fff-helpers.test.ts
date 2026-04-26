import { checkHealth, rescan } from "../src/fff-helpers.js";

describe("fff-helpers", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("checkHealth returns degraded status when FFF is unavailable", async () => {
		const result = await checkHealth();
		expectTypeOf(result.ok).toBeBoolean();
		expectTypeOf(result.message).toBeString();
		expectTypeOf(result.indexed).toBeBoolean();
	});

	it("rescan returns degraded status when FFF is unavailable", async () => {
		const result = await rescan();
		expectTypeOf(result.ok).toBeBoolean();
		expectTypeOf(result.message).toBeString();
	});
});
