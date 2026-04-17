/* c8 ignore file -- tested via Playwright E2E and separate vitest suite */
/**
 * App Component
 *
 * Main application wrapper with routing.
 */
import { Overview, Models, Codebases, Insights } from "@/pages";
import { SidebarLayout } from "@/components/SidebarLayout";
import useDashboardStore from "@/stores/dashboard";
import type { ViewType } from "@/types";

function App() {
  const currentView = useDashboardStore((s) => s.currentView);
  const setView = useDashboardStore((s) => s.setView);

  function renderView(view: ViewType) {
    switch (view) {
      case "overview":
        return <Overview />;
      case "models":
        return <Models />;
      case "codebases":
        return <Codebases />;
      case "insights":
        return <Insights timeRange={useDashboardStore.getState().timeRange} />;
      default:
        return <Overview />;
    }
  }

  return (
    <SidebarLayout currentView={currentView} onViewChange={setView}>
      <div className="animate-fade-in">{renderView(currentView)}</div>
    </SidebarLayout>
  );
}

export default App;
