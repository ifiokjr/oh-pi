import { useState, useEffect, useCallback } from "react";
import MiniSearch from "minisearch";

export interface SearchResult {
	id: string;
	title: string;
	text: string;
}

interface SearchIndexEntry {
	id: string;
	title: string;
	text: string;
}

let searchIndex: MiniSearch | null = null;
let indexPromise: Promise<MiniSearch> | null = null;

async function getSearchIndex(): Promise<MiniSearch> {
	if (searchIndex) return searchIndex;
	if (indexPromise) return indexPromise;

	indexPromise = (async () => {
		const modules = import.meta.glob<{ default: string }>("../content/**/*.mdx", {
			query: "?raw",
			eager: false,
		});

		const entries: SearchIndexEntry[] = [];

		for (const [path, loader] of Object.entries(modules)) {
			const raw = await loader();
			const content = raw.default ?? raw;
			const text = typeof content === "string" ? content : String(content);

			// Strip frontmatter
			const body = text.replace(/^---[\s\S]*?---/, "").trim();
			// Strip MDX/JSX tags, code blocks, and links
			const clean = body
				.replace(/```[\s\S]*?```/g, "")
				.replace(/<[^>]+>/g, "")
				.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
				.replace(/[#*_`~|]/g, "")
				.replace(/\[[^\]]*\]\([^)]*\)/g, (match) => match.replace(/[\[\]]/g, ""))
				.replace(/\s+/g, " ")
				.trim();

			const slug = path.split("/").pop()?.replace(/\.mdx$/, "") ?? "";

			// Get title from frontmatter
			const fmMatch = text.match(/^---\n(?:[\s\S]*?)title:\s*["']?(.+?)["']?\n(?:[\s\S]*?)---/);
			const title = fmMatch?.[1] ?? slug.replace(/-/g, " ");

			entries.push({ id: slug, title, text: clean });
		}

		const ms = new MiniSearch<SearchIndexEntry>({
			fields: ["title", "text"],
			storeFields: ["title"],
			searchOptions: {
				boost: { title: 3 },
				fuzzy: 0.2,
				prefix: true,
			},
		});
		ms.addAll(entries);
		searchIndex = ms;
		return ms;
	})();

	return indexPromise;
}

export function useSearch() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!query.trim()) {
			setResults([]);
			return;
		}

		let cancelled = false;
		setLoading(true);

		getSearchIndex()
			.then((index) => {
				if (cancelled) return;
				const hits = index.search(query) as unknown as Array<{ id: string; title: string }>;
				const searchResults: SearchResult[] = hits.map((hit) => ({
					id: hit.id,
					title: hit.title ?? hit.id,
					text: "",
				}));
				setResults(searchResults);
			})
			.catch(() => {
				if (!cancelled) setResults([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [query]);

	const search = useCallback((q: string) => setQuery(q), []);

	return { query, results, loading, search };
}