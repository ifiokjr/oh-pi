import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";

const __dirname = import.meta.dirname;

/** Copy index.html as 404.html after build so GitHub Pages SPA routing works. */
function ghPages404(): Plugin {
	let outDir: string;
	return {
		closeBundle() {
			copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));
		},
		configResolved(config) {
			outDir = config.build.outDir;
		},
		name: "gh-pages-404",
	};
}

export default defineConfig({
	base: "/oh-pi/",
	build: {
		emptyOutDir: true,
		outDir: "dist",
	},
	plugins: [mdx({ remarkPlugins: [remarkGfm] }), react(), tailwindcss(), ghPages404()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	server: {
		open: true,
		port: 5173,
	},
});
