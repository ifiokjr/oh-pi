/// <reference types="vite/client" />

declare module "*.mdx" {
	let Component: () => React.JSX.Element;
	export default Component;
}

declare module "*.md" {
	let Component: () => React.JSX.Element;
	export default Component;
}