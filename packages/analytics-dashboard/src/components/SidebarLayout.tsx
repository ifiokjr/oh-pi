/* c8 ignore file */
/**
 * Sidebar Layout Component
 *
 * Main dashboard layout with navigation sidebar.
 */
import { Navigation } from "@/components/Navigation";
import { TimeRangeSelector } from "@/components/TimeRangeSelector";
import useDashboardStore from "@/stores/dashboard";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Download,
} from "lucide-react";
import { useState } from "react";
import type { ViewType } from "@/types";

interface SidebarLayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function SidebarLayout({
  children,
  currentView,
  onViewChange,
}: SidebarLayoutProps) {
  const sidebarOpen = useDashboardStore((s) => s.sidebarOpen);
  const setSidebarOpen = useDashboardStore((s) => s.setSidebarOpen);
  const timeRange = useDashboardStore((s) => s.timeRange);
  const setTimeRange = useDashboardStore((s) => s.setTimeRange);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-30 hidden h-full border-r border-zinc-800 bg-zinc-950/95 backdrop-blur-xl transition-all duration-300 lg:block",
          sidebarOpen ? "w-64" : "w-16"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-zinc-800 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700">
              <span className="text-lg font-bold text-white">π</span>
            </div>
            {sidebarOpen && (
              <span className="text-lg font-bold text-white">
                Analytics
              </span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            {sidebarOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="p-2">
          <Navigation
            currentView={currentView}
            onViewChange={onViewChange}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          sidebarOpen ? "lg:ml-64" : "lg:ml-16"
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              title="Export Data"
            >
              <Download className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6">{children}</div>
      </main>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="absolute left-0 top-0 h-full w-64 bg-zinc-950 border-r border-zinc-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700">
                <span className="text-lg font-bold text-white">π</span>
              </div>
              <span className="text-lg font-bold text-white">Analytics</span>
            </div>
            <Navigation
              currentView={currentView}
              onViewChange={(view) => {
                onViewChange(view);
                setMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
