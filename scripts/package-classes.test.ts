import { describe, expect, it } from "vitest";
import { compiledPackages, publishedPackages } from "./package-classes.mjs";

describe("package classes", () => {
	it("lists diagnostics as a published package without changing compiled packages", () => {
		expect(compiledPackages).not.toContainEqual(expect.objectContaining({ name: "@ifi/pi-diagnostics" }));
		expect(publishedPackages).toContainEqual({ name: "@ifi/pi-diagnostics", dir: "packages/diagnostics" });
	});
});
