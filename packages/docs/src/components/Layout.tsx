import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X, Github, ExternalLink, Search } from "lucide-react";
import type { MdxPageData } from "@/hooks/useMdxPages";
import { SearchDialog } from "@/components/SearchDialog";

interface LayoutProps {
	children: React.ReactNode;
	pages: MdxPageData[];
}

export function Layout({ children, pages }: LayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const location = useLocation();

	// Cmd+K / Ctrl+K shortcut to open search
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setSearchOpen(true);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const closeSearch = useCallback(() => setSearchOpen(false), []);

	return (
		<div className="flex h-screen overflow-hidden bg-zinc-950">
			{/* Search dialog */}
			<SearchDialog open={searchOpen} onClose={closeSearch} />

			{/* Mobile overlay */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 z-30 bg-black/60 lg:hidden"
					onClick={() => setSidebarOpen(false)}
					onKeyDown={(e) => e.key === "Escape" && setSidebarOpen(false)}
					role="button"
					tabIndex={-1}
					aria-label="Close sidebar"
				/>
			)}

			{/* Sidebar */}
			<aside
				className={`
					fixed inset-y-0 left-0 z-40 w-72 bg-sidebar-bg border-r border-sidebar-border
					transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0
					${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
				`}
			>
				<div className="flex h-14 items-center gap-3 px-4 border-b border-zinc-800">
					<svg className="h-7 w-7" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
						<rect width="32" height="32" rx="6" fill="#09090b" />
						<path d="M8 10h4v12H8V10zm6 0h2l6 8V10h2v12h-2l-6-8v8h-2V10z" fill="#10b981" />
					</svg>
					<span className="text-lg font-bold text-zinc-100">oh-pi</span>
					<span className="text-xs text-zinc-500 font-mono ml-auto">docs</span>
				</div>

				{/* Search button in sidebar */}
				<div className="px-3 pt-3 pb-1">
					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300 transition-colors"
					>
						<Search className="h-4 w-4" />
						<span>Search docs...</span>
						<kbd className="ml-auto text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500">
							⌘K
						</kbd>
					</button>
				</div>

				<nav className="flex-1 overflow-y-auto py-2 px-3">
					<ul className="space-y-1">
						<li>
							<Link
								to="/"
								className={`
									block rounded-lg px-3 py-2 text-sm font-medium transition-colors
									${
										location.pathname === "/oh-pi/" || location.pathname === "/oh-pi"
											? "bg-pi-emerald/10 text-pi-emerald"
											: "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
									}
								`}
								onClick={() => setSidebarOpen(false)}
							>
								Home
							</Link>
						</li>
						{pages.map((page) => (
							<li key={page.slug}>
								<Link
									to={`/${page.slug}`}
									className={`
										block rounded-lg px-3 py-2 text-sm font-medium transition-colors
										${
											location.pathname === `/oh-pi/${page.slug}`
												? "bg-pi-emerald/10 text-pi-emerald"
												: "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
										}
									`}
									onClick={() => setSidebarOpen(false)}
								>
									<span className="text-zinc-600 mr-2 tabular-nums">
										{String(page.order).padStart(2, "0")}
									</span>
									{page.title}
								</Link>
							</li>
						))}
					</ul>
				</nav>

				<div className="border-t border-zinc-800 px-4 py-3 space-y-2">
					<a
						href="https://github.com/ifiokjr/oh-pi"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
					>
						<Github className="h-4 w-4" />
						GitHub
						<ExternalLink className="h-3 w-3" />
					</a>
				</div>
			</aside>

			{/* Main content */}
			<div className="flex-1 flex flex-col min-w-0">
				{/* Top bar */}
				<header className="flex h-14 items-center gap-3 px-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm lg:px-6">
					<button
						type="button"
						className="lg:hidden p-2 text-zinc-400 hover:text-zinc-100"
						onClick={() => setSidebarOpen(!sidebarOpen)}
						aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
					>
						{sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
					</button>

					<div className="flex-1" />

					{/* Search trigger in header */}
					<button
						type="button"
						onClick={() => setSearchOpen(true)}
						className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-zinc-300 transition-colors"
					>
						<Search className="h-3.5 w-3.5" />
						<span className="hidden sm:inline">Search</span>
						<kbd className="hidden sm:inline text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 ml-2">
							⌘K
						</kbd>
					</button>

					<a
						href="https://github.com/ifiokjr/oh-pi"
						target="_blank"
						rel="noopener noreferrer"
						className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-3"
					>
						<Github className="h-3.5 w-3.5" />
						ifiokjr/oh-pi
					</a>
				</header>

				{/* Scrollable content */}
				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">{children}</div>
				</main>
			</div>
		</div>
	);
}