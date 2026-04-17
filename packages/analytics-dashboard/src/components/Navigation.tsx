import {
  LayoutDashboard,
  Cpu,
  FolderCode,
  Network,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewType } from "@/types";

interface NavItem {
  id: ViewType;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "models", label: "Models", icon: Cpu },
  { id: "codebases", label: "Codebases", icon: FolderCode },
  { id: "providers", label: "Providers", icon: Network },
  { id: "timeline", label: "Timeline", icon: CalendarDays },
];

interface NavigationProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  className?: string;
}

export function Navigation({
  currentView,
  onViewChange,
  className,
}: NavigationProps) {
  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary-500/10 text-primary-400"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            )}
          >
            <Icon className={cn("h-5 w-5", isActive && "text-primary-400")} />
            {item.label}
            {isActive && (
              <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-400 pulse-ring relative" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
