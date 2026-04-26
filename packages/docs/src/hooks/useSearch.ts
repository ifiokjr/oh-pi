import { useCallback, useEffect, useState } from "react";
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
	if (searchIndex) {return searchIndex;}
	if (indexPromise) {return indexPromise;}

	indexPromise = (async () => {
		const modules = import.meta.glob<{ default: string }>("../content/**/*.mdx", {
			eager: false,
			query: "?raw",
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
				.replaceAll(/```[\s\S]*?```/g, "")
				.replaceAll(/<[^>]+>/g, "")
				.replaceAll(/\{\/\*[\s\S]*?\*\/\}/g, "")
				.replaceAll(/[#*_`~|]/g, "")
				.replaceAll(/\[[^\]]*\]\([^)]*\)/g, (match) => match.replaceAll(/[[\]]/g, ""))
				.replaceAll(/\s+/g, " ")
				.trim();

			const slug =
				path
					.split("/")
					.pop()
					?.replace(/\.mdx$/, "") ?? "";

			// Get title from frontmatter
			const fmMatch = text.match(/^---\n(?:[\s\S]*?)title:\s*["']?(.+?)["']?\n(?:[\s\S]*?)---/);
			const title = fmMatch?.[1] ?? slug.replaceAll(/-/g, " ");

			entries.push({ id: slug, text: clean, title });
		}

		const ms = new MiniSearch<SearchIndexEntry>({
			fields: ["title", "text"],
			searchOptions: {
				boost: { title: 3 },
				fuzzy: 0.2,
				prefix: true,
			},
			storeFields: ["title"],
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
				if (cancelled) {return;}
				const hits = index.search(query) as unknown as { id: string; title: string }[];
				const searchResults: SearchResult[] = hits.map((hit) => ({
					id: hit.id,
					text: "",
					title: hit.title ?? hit.id,
				}));
				setResults(searchResults);
			})
			.catch(() => {
				if (!cancelled) {setResults([]);}
			})
			.finally(() => {
				if (!cancelled) {setLoading(false);}
			});

		return () => {
			cancelled = true;
		};
	}, [query]);

	const search = useCallback((q: string) => setQuery(q), []);

	return { loading, query, results, search };
}
