import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Copy index.html as 404.html after build so GitHub Pages SPA routing works. */
function ghPages404(): Plugin {
	let outDir: string;
	return {
		name: "gh-pages-404",
		configResolved(config) {
			outDir = config.build.outDir;
		},
		closeBundle() {
			copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));
		},
	};
}

export default defineConfig({
	base: "/oh-pi/",
	plugins: [
		mdx({ remarkPlugins: [remarkGfm] }),
		react(),
		tailwindcss(),
		ghPages404(),
	],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	server: {
		port: 5173,
		open: true,
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});