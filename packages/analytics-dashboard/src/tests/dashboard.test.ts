/**
 * Dashboard Store Tests
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useDashboardStore } from "../stores/dashboard";

describe("useDashboardStore", () => {
	beforeEach(() => {
		// Reset store to initial state before each test
		const store = useDashboardStore.getState();
		store.setView("overview");
		store.setTimeRange("30d");
		store.setSelectedModel(null);
		store.setSelectedCodebase(null);
		store.setSelectedProvider(null);
		store.setSidebarOpen(true);
		store.setIsLoading(false);
		store.setShowComparison(false);
		store.updateFilters({
			timeRange: "30d",
			providers: [],
			models: [],
			codebases: [],
			sources: [],
		});
	});

	describe("view management", () => {
		it("should default to overview view", () => {
			expect(useDashboardStore.getState().currentView).toBe("overview");
		});

		it("should update view", () => {
			useDashboardStore.getState().setView("models");
			expect(useDashboardStore.getState().currentView).toBe("models");
		});

		it("should update view to insights", () => {
			useDashboardStore.getState().setView("insights");
			expect(useDashboardStore.getState().currentView).toBe("insights");
		});

		it("should update view to codebases", () => {
			useDashboardStore.getState().setView("codebases");
			expect(useDashboardStore.getState().currentView).toBe("codebases");
		});
	});

	describe("time range", () => {
		it("should default to 30d", () => {
			expect(useDashboardStore.getState().timeRange).toBe("30d");
		});

		it("should update time range", () => {
			useDashboardStore.getState().setTimeRange("7d");
			expect(useDashboardStore.getState().timeRange).toBe("7d");
		});

		it("should update time range to 90d", () => {
			useDashboardStore.getState().setTimeRange("90d");
			expect(useDashboardStore.getState().timeRange).toBe("90d");
		});

		it("should update time range to 1y", () => {
			useDashboardStore.getState().setTimeRange("1y");
			expect(useDashboardStore.getState().timeRange).toBe("1y");
		});

		it("should update time range to all", () => {
			useDashboardStore.getState().setTimeRange("all");
			expect(useDashboardStore.getState().timeRange).toBe("all");
		});
	});

	describe("filters", () => {
		it("should have default empty filters", () => {
			const { filters } = useDashboardStore.getState();
			expect(filters.providers).toEqual([]);
			expect(filters.models).toEqual([]);
			expect(filters.codebases).toEqual([]);
			expect(filters.sources).toEqual([]);
		});

		it("should update filters partially", () => {
			useDashboardStore.getState().updateFilters({ providers: ["anthropic"] });
			const { filters } = useDashboardStore.getState();
			expect(filters.providers).toEqual(["anthropic"]);
			expect(filters.models).toEqual([]);
		});

		it("should preserve existing filters when updating", () => {
			useDashboardStore.getState().updateFilters({ providers: ["anthropic"] });
			useDashboardStore.getState().updateFilters({
				models: ["claude-sonnet-4"],
			});
			const { filters } = useDashboardStore.getState();
			expect(filters.providers).toEqual(["anthropic"]);
			expect(filters.models).toEqual(["claude-sonnet-4"]);
		});

		it("should reset filters", () => {
			useDashboardStore.getState().updateFilters({
				providers: ["anthropic"],
				models: ["gpt-4"],
			});
			useDashboardStore.getState().resetFilters();
			const { filters } = useDashboardStore.getState();
			expect(filters.providers).toEqual([]);
			expect(filters.models).toEqual([]);
			expect(filters.codebases).toEqual([]);
			expect(filters.sources).toEqual([]);
		});
	});

	describe("selections", () => {
		it("should manage model selection", () => {
			useDashboardStore.getState().setSelectedModel("claude-sonnet-4");
			expect(useDashboardStore.getState().selectedModel).toBe("claude-sonnet-4");
			useDashboardStore.getState().setSelectedModel(null);
			expect(useDashboardStore.getState().selectedModel).toBeNull();
		});

		it("should manage codebase selection", () => {
			useDashboardStore.getState().setSelectedCodebase("/my/project");
			expect(useDashboardStore.getState().selectedCodebase).toBe("/my/project");
			useDashboardStore.getState().setSelectedCodebase(null);
			expect(useDashboardStore.getState().selectedCodebase).toBeNull();
		});

		it("should manage provider selection", () => {
			useDashboardStore.getState().setSelectedProvider("anthropic");
			expect(useDashboardStore.getState().selectedProvider).toBe("anthropic");
			useDashboardStore.getState().setSelectedProvider(null);
			expect(useDashboardStore.getState().selectedProvider).toBeNull();
		});
	});

	describe("UI state", () => {
		it("should manage sidebar state", () => {
			expect(useDashboardStore.getState().sidebarOpen).toBe(true);
			useDashboardStore.getState().setSidebarOpen(false);
			expect(useDashboardStore.getState().sidebarOpen).toBe(false);
			useDashboardStore.getState().setSidebarOpen(true);
			expect(useDashboardStore.getState().sidebarOpen).toBe(true);
		});

		it("should manage loading state", () => {
			expect(useDashboardStore.getState().isLoading).toBe(false);
			useDashboardStore.getState().setIsLoading(true);
			expect(useDashboardStore.getState().isLoading).toBe(true);
			useDashboardStore.getState().setIsLoading(false);
			expect(useDashboardStore.getState().isLoading).toBe(false);
		});

		it("should manage comparison state", () => {
			expect(useDashboardStore.getState().showComparison).toBe(false);
			useDashboardStore.getState().setShowComparison(true);
			expect(useDashboardStore.getState().showComparison).toBe(true);
			useDashboardStore.getState().setShowComparison(false);
			expect(useDashboardStore.getState().showComparison).toBe(false);
		});
	});

	describe("preferences", () => {
		it("should have default preferences", () => {
			const { preferences } = useDashboardStore.getState();
			expect(preferences.defaultTimeRange).toBe("30d");
			expect(preferences.defaultView).toBe("overview");
			expect(preferences.compactMode).toBe(false);
			expect(preferences.showTrends).toBe(true);
			expect(preferences.currency).toBe("USD");
		});

		it("should update preferences partially", () => {
			useDashboardStore.getState().updatePreferences({ compactMode: true });
			const { preferences } = useDashboardStore.getState();
			expect(preferences.compactMode).toBe(true);
			expect(preferences.defaultTimeRange).toBe("30d");
		});

		it("should update currency preference", () => {
			useDashboardStore.getState().updatePreferences({ currency: "EUR" });
			expect(useDashboardStore.getState().preferences.currency).toBe("EUR");
		});
	});
});
