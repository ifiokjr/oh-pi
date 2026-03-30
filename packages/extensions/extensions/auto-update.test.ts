import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	getAgentDir: () => "/mock-home/.pi/agent",
}));

import { isNewer } from "./auto-update";

describe("isNewer", () => {
	it("patch newer", () => expect(isNewer("1.0.1", "1.0.0")).toBe(true));
	it("minor newer", () => expect(isNewer("1.1.0", "1.0.0")).toBe(true));
	it("major newer", () => expect(isNewer("2.0.0", "1.9.9")).toBe(true));
	it("equal", () => expect(isNewer("1.0.0", "1.0.0")).toBe(false));
	it("older", () => expect(isNewer("1.0.0", "1.0.1")).toBe(false));
	it("0.1.70 > 0.1.69", () => expect(isNewer("0.1.70", "0.1.69")).toBe(true));
	it("0.1.69 < 0.1.70", () => expect(isNewer("0.1.69", "0.1.70")).toBe(false));
});
