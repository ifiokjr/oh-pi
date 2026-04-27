import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/bin/oh-pi.ts"],
	outDir: "dist",
	format: "esm",
	clean: true,
	platform: "node",
	dts: {
		sourcemap: true,
		tsgo: true,
	},
	outExtensions() {
		return { js: ".js", dts: ".d.ts" };
	},
});
