
import { getPiTuiFallbackPaths, requirePiTuiModule } from "../pi-tui-loader.js";

describe(getPiTuiFallbackPaths, () => {
	it("includes BUN_INSTALL and the default home fallback without duplicates", () => {
		const paths = getPiTuiFallbackPaths({
			bunInstallDir: "/custom-bun",
			homeDir: "/Users/tester",
		});
		expect(paths).toStrictEqual([
			"/custom-bun/install/global/node_modules/@mariozechner/pi-tui",
			"/Users/tester/.bun/install/global/node_modules/@mariozechner/pi-tui",
		]);
	});

	it("deduplicates the default bun root when BUN_INSTALL matches it", () => {
		const paths = getPiTuiFallbackPaths({
			bunInstallDir: "/Users/tester/.bun",
			homeDir: "/Users/tester",
		});
		expect(paths).toStrictEqual(["/Users/tester/.bun/install/global/node_modules/@mariozechner/pi-tui"]);
	});
});

describe(requirePiTuiModule, () => {
	it("uses the regular package resolution path first", () => {
		const calls: string[] = [];
		const resolved = requirePiTuiModule({
			requireFn(specifier) {
				calls.push(specifier);
				return { source: specifier };
			},
		});
		expect(resolved).toStrictEqual({ source: "@mariozechner/pi-tui" });
		expect(calls).toStrictEqual(["@mariozechner/pi-tui"]);
	});

	it("falls back to Bun global paths on module-not-found", () => {
		const calls: string[] = [];
		const resolved = requirePiTuiModule({
			bunInstallDir: "/custom-bun",
			homeDir: "/Users/tester",
			requireFn(specifier) {
				calls.push(specifier);
				if (specifier === "@mariozechner/pi-tui") {
					const error = new Error("missing");
					(error as Error & { code?: string }).code = "MODULE_NOT_FOUND";
					throw error;
				}
				if (specifier.includes("/custom-bun/")) {
					return { source: specifier };
				}
				const error = new Error("missing");
				(error as Error & { code?: string }).code = "MODULE_NOT_FOUND";
				throw error;
			},
		});
		expect(resolved).toStrictEqual({ source: "/custom-bun/install/global/node_modules/@mariozechner/pi-tui" });
		expect(calls[0]).toBe("@mariozechner/pi-tui");
		expect(calls[1]).toBe("/custom-bun/install/global/node_modules/@mariozechner/pi-tui");
	});

	it("throws a helpful error when no location resolves", () => {
		expect(() =>
			requirePiTuiModule({
				homeDir: "/Users/tester",
				requireFn() {
					const error = new Error("missing");
					(error as Error & { code?: string }).code = "MODULE_NOT_FOUND";
					throw error;
				},
			}),
		).toThrow(/Unable to load @mariozechner\/pi-tui/);
	});
});
