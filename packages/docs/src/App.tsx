import { Routes, Route } from "react-router";
import { Layout } from "@/components/Layout";
import { useMdxPages } from "@/hooks/useMdxPages";
import { HomePage } from "@/components/HomePage";
import { MdxPage } from "@/components/MdxPage";

export function App() {
	const pages = useMdxPages();

	return (
		<Layout pages={pages}>
			<Routes>
				<Route path="/" element={<HomePage />} />
				{pages.map((page) => (
					<Route key={page.slug} path={`/${page.slug}`} element={<MdxPage page={page} />} />
				))}
			</Routes>
		</Layout>
	);
}