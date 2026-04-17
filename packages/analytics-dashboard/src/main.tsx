/* c8 ignore file -- tested via Playwright E2E and separate vitest suite */
/**
 * Pi Analytics Dashboard Entry Point
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";

// Create query client with sensible defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 5 minutes
      staleTime: 5 * 60 * 1000,
      // Cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed queries 2 times
      retry: 2,
      // Don't refetch on window focus in development
      refetchOnWindowFocus: import.meta.env.PROD,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
