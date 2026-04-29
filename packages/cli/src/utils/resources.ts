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
const resourcesDir = import.meta.dirname;

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
	diagnosticsDir: () => resolvePackagePathWithFallback("@ifi/pi-diagnostics", ".", "../../../diagnostics"),
	extension: (name: string) => join(resolvePackagePath("@ifi/oh-pi-extensions", "extensions"), name),
	extensionFile: (name: string) => join(resolvePackagePath("@ifi/oh-pi-extensions", "extensions"), `${name}.ts`),
	planDir: () => resolvePackagePath("@ifi/pi-plan", "."),
	prompt: (name: string) => join(resolvePackagePath("@ifi/oh-pi-prompts", "prompts"), `${name}.md`),
	sharedQnaDir: () => resolvePackagePathWithFallback("@ifi/pi-shared-qna", ".", "../../../shared-qna"),
	skill: (name: string) => join(resolvePackagePath("@ifi/oh-pi-skills", "skills"), name),
	skillsDir: () => resolvePackagePath("@ifi/oh-pi-skills", "skills"),
	specDir: () => resolvePackagePath("@ifi/pi-spec", "extension"),
	subagentsDir: () => resolvePackagePath("@ifi/pi-extension-subagents", "."),
	theme: (name: string) => join(resolvePackagePath("@ifi/oh-pi-themes", "themes"), `${name}.json`),
};
