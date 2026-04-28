/* C8 ignore file */
/**
 * App Component
 *
 * Main application wrapper with routing.
 */
import { SidebarLayout } from "@/components/SidebarLayout";
import { Codebases, Insights, Models, Overview } from "@/pages";
import useDashboardStore from "@/stores/dashboard";
import type { ViewType } from "@/types";

function App() {
	const currentView = useDashboardStore((s) => s.currentView);
	const setView = useDashboardStore((s) => s.setView);

	function renderView(view: ViewType) {
		switch (view) {
			case "overview": {
				return <Overview />;
			}
			case "models": {
				return <Models />;
			}
			case "codebases": {
				return <Codebases />;
			}
			case "insights": {
				return <Insights timeRange={useDashboardStore.getState().timeRange} />;
			}
			default: {
				return <Overview />;
			}
		}
	}

	return (
		<SidebarLayout currentView={currentView} onViewChange={setView}>
			<div className="animate-fade-in">{renderView(currentView)}</div>
		</SidebarLayout>
	);
}

export default App;
