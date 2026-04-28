import { HomePage } from "@/components/HomePage";
import { Layout } from "@/components/Layout";
import { MdxPage } from "@/components/MdxPage";
import { useMdxPages } from "@/hooks/useMdxPages";
import { Route, Routes } from "react-router";

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
