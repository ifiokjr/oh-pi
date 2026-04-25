/**
 * Resource path resolver — locates resource files from sibling workspace packages.
 *
 * Uses createRequire to resolve installed package paths, which works both
 * in development (workspace:* links) and after publishing (real npm installs).
 */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const resourcesDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a subpath within an installed npm package.
 * @param pkg - Package name (e.g. "@ifi/oh-pi-themes")
 * @param subpath - Relative path within the package (e.g. "themes")
 * @returns Absolute path to the resolved directory/file
 */
function resolvePackagePath(pkg: string, subpath: string): string {
	const pkgJson = require.resolve(`${pkg}/package.json`);
	return join(dirname(pkgJson), subpath);
}

function resolvePackagePathWithFallback(pkg: string, subpath: string, fallbackRelativePath: string): string {
	try {
		return resolvePackagePath(pkg, subpath);
	} catch {
		return resolve(resourcesDir, fallbackRelativePath, subpath);
	}
}

/** Resource path mapping — resolves paths into installed workspace packages. */
export const resources = {
	agent: (name: string) => join(resolvePackagePath("@ifi/oh-pi-agents", "agents"), `${name}.md`),
	extension: (name: string) => join(resolvePackagePath("@ifi/oh-pi-extensions", "extensions"), name),
	extensionFile: (name: string) => join(resolvePackagePath("@ifi/oh-pi-extensions", "extensions"), `${name}.ts`),
	antColonyDir: () => resolvePackagePath("@ifi/oh-pi-ant-colony", "extensions/ant-colony"),
	diagnosticsDir: () => resolvePackagePathWithFallback("@ifi/pi-diagnostics", ".", "../../../diagnostics"),
	planDir: () => resolvePackagePath("@ifi/pi-plan", "."),
	subagentsDir: () => resolvePackagePath("@ifi/pi-extension-subagents", "."),
	sharedQnaDir: () => resolvePackagePathWithFallback("@ifi/pi-shared-qna", ".", "../../../shared-qna"),
	specDir: () => resolvePackagePath("@ifi/pi-spec", "extension"),
	prompt: (name: string) => join(resolvePackagePath("@ifi/oh-pi-prompts", "prompts"), `${name}.md`),
	skill: (name: string) => join(resolvePackagePath("@ifi/oh-pi-skills", "skills"), name),
	skillsDir: () => resolvePackagePath("@ifi/oh-pi-skills", "skills"),
	theme: (name: string) => join(resolvePackagePath("@ifi/oh-pi-themes", "themes"), `${name}.json`),
};
