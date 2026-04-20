import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import { resolve } from "node:path";

export default defineConfig({
	base: "/oh-pi/",
	plugins: [
		mdx({ remarkPlugins: [remarkGfm] }),
		react(),
		tailwindcss(),
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