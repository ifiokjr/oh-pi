import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
	it("defaults to interactive mode", () => {
		expect(parseArgs([])).toEqual({ yes: false });
	});

	it("parses -y", () => {
		expect(parseArgs(["-y"])).toEqual({ yes: true });
	});

	it("parses --yes", () => {
		expect(parseArgs(["--yes"])).toEqual({ yes: true });
	});

	it("ignores unrelated args", () => {
		expect(parseArgs(["--foo", "-y", "bar"])).toEqual({ yes: true });
	});
});
