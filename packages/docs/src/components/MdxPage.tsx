import { Suspense, lazy } from "react";
import { useParams } from "react-router";
import type { MdxPageData } from "@/hooks/useMdxPages";

interface MdxPageProps {
	page: MdxPageData;
}

export function MdxPage({ page }: MdxPageProps) {
	const Content = lazy(page.module);

	return (
		<article className="prose-doc">
			<header className="mb-8">
				<h1 className="text-3xl font-bold text-zinc-50 mb-2">{page.title}</h1>
				{page.description && <p className="text-zinc-400 text-lg">{page.description}</p>}
			</header>
			<Suspense
				fallback={
					<div className="flex items-center justify-center py-12">
						<div className="h-6 w-6 animate-spin rounded-full border-2 border-pi-emerald border-t-transparent" />
					</div>
				}
			>
				<Content />
			</Suspense>
		</article>
	);
}

/** 404 page when no matching slug is found */
export function NotFoundPage() {
	const params = useParams();
	return (
		<div className="flex flex-col items-center justify-center py-20 space-y-4">
			<h1 className="text-4xl font-bold text-zinc-200">404</h1>
			<p className="text-zinc-400">
				Page not found: <code className="text-pi-emerald">/{params["*"]}</code>
			</p>
			<a href="/oh-pi/" className="text-pi-emerald hover:underline">
				← Back to docs
			</a>
		</div>
	);
}
