import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["index.ts"],
	outDir: "dist",
	format: "esm",
	clean: true,
	platform: "node",
	dts: {
		sourcemap: true,
	},
	outExtensions() {
		return { js: ".js", dts: ".d.ts" };
	},
});
