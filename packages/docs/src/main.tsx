import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@/index.css";
import { App } from "@/App";

const root = document.querySelector("#root");
if (!root) {throw new Error("Root element not found");}

createRoot(root).render(
	<StrictMode>
		<BrowserRouter basename="/oh-pi">
			<App />
		</BrowserRouter>
	</StrictMode>,
);
