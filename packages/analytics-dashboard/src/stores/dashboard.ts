/**
 * Dashboard State Store (Zustand)
 *
 * Manages global dashboard state including filters, view preferences, and UI state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DashboardFilters, TimeRange, UserPreferences, ViewType } from "@/types";

interface DashboardState {
	// Current view
	currentView: ViewType;
	setView: (view: ViewType) => void;

	// Time range filter
	timeRange: TimeRange;
	setTimeRange: (range: TimeRange) => void;

	// Filters
	filters: DashboardFilters;
	updateFilters: (filters: Partial<DashboardFilters>) => void;
	resetFilters: () => void;

	// Selection
	selectedModel: string | null;
	setSelectedModel: (model: string | null) => void;
	selectedCodebase: string | null;
	setSelectedCodebase: (codebase: string | null) => void;
	selectedProvider: string | null;
	setSelectedProvider: (provider: string | null) => void;

	// UI State
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	isLoading: boolean;
	setIsLoading: (loading: boolean) => void;
	showComparison: boolean;
	setShowComparison: (show: boolean) => void;

	// User preferences
	preferences: UserPreferences;
	updatePreferences: (prefs: Partial<UserPreferences>) => void;
}

const defaultPreferences: UserPreferences = {
	compactMode: false,
	currency: "USD",
	defaultTimeRange: "30d",
	defaultView: "overview",
	showTrends: true,
};

const useDashboardStore = create<DashboardState, [["zustand/persist", UserPreferences]]>(
	persist(
		(set, get) => ({
			// View
			currentView: "overview",
			setView: (view) => set({ currentView: view }),

			// Time range
			timeRange: "30d",
			setTimeRange: (range) => set({ timeRange: range }),

			// Filters
			filters: {
				codebases: [],
				models: [],
				providers: [],
				sources: [],
				timeRange: "30d",
			},
			updateFilters: (newFilters) =>
				set({
					filters: { ...get().filters, ...newFilters },
				}),
			resetFilters: () =>
				set({
					filters: {
						codebases: [],
						models: [],
						providers: [],
						sources: [],
						timeRange: get().timeRange,
					},
				}),

			// Selections
			selectedModel: null,
			setSelectedModel: (model) => set({ selectedModel: model }),
			selectedCodebase: null,
			setSelectedCodebase: (codebase) => set({ selectedCodebase: codebase }),
			selectedProvider: null,
			setSelectedProvider: (provider) => set({ selectedProvider: provider }),

			// UI State
			sidebarOpen: true,
			setSidebarOpen: (open) => set({ sidebarOpen: open }),
			isLoading: false,
			setIsLoading: (loading) => set({ isLoading: loading }),
			showComparison: false,
			setShowComparison: (show) => set({ showComparison: show }),

			// Preferences
			preferences: defaultPreferences,
			updatePreferences: (prefs) =>
				set({
					preferences: { ...get().preferences, ...prefs },
				}),
		}),
		{
			name: "pi-analytics-preferences",
			partialize: (state) => ({ preferences: state.preferences }),
		},
	),
);

export default useDashboardStore;
export { useDashboardStore };

// Selector hooks for performance
export const useTimeRange = () => useDashboardStore((s) => s.timeRange);
export const useCurrentView = () => useDashboardStore((s) => s.currentView);
export const useIsLoading = () => useDashboardStore((s) => s.isLoading);
export const usePreferences = () => useDashboardStore((s) => s.preferences);
