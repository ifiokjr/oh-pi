/* C8 ignore file */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = import.meta.dirname;

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		emptyOutDir: true,
		outDir: "dist",
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("recharts")) return "recharts";
				},
			},
		},
	},
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	server: {
		open: true,
		port: 31415,
	},
});
