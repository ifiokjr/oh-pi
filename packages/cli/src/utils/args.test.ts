import { parseArgs } from "./args.js";

describe(parseArgs, () => {
	it("defaults to interactive mode", () => {
		expect(parseArgs([])).toStrictEqual({ yes: false });
	});

	it("parses -y", () => {
		expect(parseArgs(["-y"])).toStrictEqual({ yes: true });
	});

	it("parses --yes", () => {
		expect(parseArgs(["--yes"])).toStrictEqual({ yes: true });
	});

	it("ignores unrelated args", () => {
		expect(parseArgs(["--foo", "-y", "bar"])).toStrictEqual({ yes: true });
	});
});
