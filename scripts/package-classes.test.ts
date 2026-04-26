import { compiledPackages, publishedPackages } from "./package-classes.mjs";

describe("package classes", () => {
	it("lists diagnostics as a published package without changing compiled packages", () => {
		expect(compiledPackages).not.toContainEqual(expect.objectContaining({ name: "@ifi/pi-diagnostics" }));
		expect(publishedPackages).toContainEqual({ dir: "packages/diagnostics", name: "@ifi/pi-diagnostics" });
	});
});
