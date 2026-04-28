import { useSearch } from "@/hooks/useSearch";
import { FileText, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";

interface SearchDialogProps {
	open: boolean;
	onClose: () => void;
}

export function SearchDialog({ open, onClose }: SearchDialogProps) {
	const { query, results, loading, search } = useSearch();
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			// Delay focus to ensure the dialog is rendered
			const timer = setTimeout(() => inputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [open]);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && open) onClose();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
				onKeyDown={(e) => e.key === "Enter" && onClose()}
				role="button"
				tabIndex={-1}
				aria-label="Close search"
			/>

			{/* Dialog */}
			<div className="relative w-full max-w-xl mx-4 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
				{/* Search input */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
					<Search className="h-5 w-5 text-zinc-400 shrink-0" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => search(e.target.value)}
						placeholder="Search documentation..."
						className="flex-1 bg-transparent text-zinc-100 placeholder:text-zinc-500 outline-none text-sm"
					/>
					{loading && (
						<div className="h-4 w-4 animate-spin rounded-full border-2 border-pi-emerald border-t-transparent" />
					)}
					<button
						type="button"
						onClick={onClose}
						className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Results */}
				<div className="max-h-80 overflow-y-auto">
					{query.trim() && results.length === 0 && !loading && (
						<div className="px-4 py-8 text-center text-sm text-zinc-500">No results for "{query}"</div>
					)}

					{results.map((result) => (
						<Link
							key={result.id}
							to={`/${result.id}`}
							onClick={onClose}
							className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 transition-colors border-b border-zinc-800/50 last:border-0"
						>
							<FileText className="h-4 w-4 text-zinc-500 shrink-0" />
							<span className="text-sm text-zinc-200 truncate">{result.title}</span>
						</Link>
					))}

					{!query.trim() && (
						<div className="px-4 py-6 text-center text-sm text-zinc-500">
							<Search className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
							Type to search the documentation
						</div>
					)}
				</div>

				{/* Footer hint */}
				<div className="px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500">
					Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400 font-mono">Esc</kbd> to close
				</div>
			</div>
		</div>
	);
}
