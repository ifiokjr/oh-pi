/**
 * Lightweight import graph builder — static analysis of ts/js file dependencies.
 *
 * Parses `import`/`export`/`require` statements to build a bidirectional
 * dependency graph. Used by the queen scheduler to detect file-level
 * dependencies between tasks, preventing workers from editing files that
 * depend on each other simultaneously.
 */
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Bidirectional import graph mapping files to their imports and reverse-imports.
 *
 * - `imports`: file → set of files it directly imports
 * - `importedBy`: file → set of files that import it (reverse edges)
 */
export interface ImportGraph {
	/** Forward edges: file → files it imports. */
	imports: Map<string, Set<string>>;
	/** Reverse edges: file → files that import it. */
	importedBy: Map<string, Set<string>>;
}

/** Matches ESM `import ... from './path'` and `export ... from './path'` statements. */
const IMPORT_RE = /(?:import|export)\s+.*?from\s+['"](\.[^'"]+)['"]/g;

/** Matches CommonJS `require('./path')` calls. */
const REQUIRE_RE = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

/**
 * Resolve a relative import specifier to an actual file path.
 * Tries common extensions (.ts, .tsx, .js, .jsx) and index files.
 *
 * @param from - The file that contains the import statement (relative to cwd)
 * @param specifier - The relative import specifier (e.g. `./foo`)
 * @param cwd - Project root directory
 * @returns Resolved path relative to cwd, or null if not found
 */
function resolveImport(from: string, specifier: string, cwd: string): string | null {
	const dir = path.dirname(path.resolve(cwd, from));
	const base = path.resolve(dir, specifier);
	const exts = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
	for (const ext of exts) {
		const full = base + ext;
		if (fs.existsSync(full)) {
			return path.relative(cwd, full);
		}
	}
	return null;
}

/**
 * Build a bidirectional import graph from a list of source files.
 * Scans each file for import/require statements and resolves them to
 * relative file paths within the project.
 *
 * @param files - List of file paths relative to `cwd`
 * @param cwd - Project root directory
 * @returns The constructed import graph
 */
export function buildImportGraph(files: string[], cwd: string): ImportGraph {
	const imports = new Map<string, Set<string>>();
	const importedBy = new Map<string, Set<string>>();

	for (const file of files) {
		const abs = path.resolve(cwd, file);
		if (!fs.existsSync(abs)) {
			continue;
		}
		let content: string;
		try {
			content = fs.readFileSync(abs, "utf8");
		} catch {
			continue;
		}

		const deps = new Set<string>();
		for (const re of [IMPORT_RE, REQUIRE_RE]) {
			re.lastIndex = 0;
			for (const m of content.matchAll(re)) {
				const resolved = resolveImport(file, m[1], cwd);
				if (resolved) {
					deps.add(resolved);
				}
			}
		}

		imports.set(file, deps);
		for (const dep of deps) {
			if (!importedBy.has(dep)) {
				importedBy.set(dep, new Set());
			}
			const dependents = importedBy.get(dep);
			if (dependents) {
				dependents.add(file);
			}
		}
	}

	return { importedBy, imports };
}

/**
 * Calculate the dependency depth of a file — how many files directly or
 * indirectly depend on it. Higher depth = more foundational = should be
 * processed first to avoid cascading breakage.
 *
 * Uses BFS traversal through the `importedBy` reverse edges.
 *
 * @param file - File path relative to cwd
 * @param graph - The import graph to traverse
 * @returns Number of transitive dependents (excluding the file itself)
 */
export function dependencyDepth(file: string, graph: ImportGraph): number {
	const visited = new Set<string>();
	const queue = [file];
	while (queue.length > 0) {
		const current = queue.pop();
		if (!current || visited.has(current)) {
			continue;
		}
		visited.add(current);
		const dependents = graph.importedBy.get(current);
		if (dependents) {
			for (const d of dependents) {
				queue.push(d);
			}
		}
	}
	return visited.size - 1;
}

/**
 * Check whether any file in taskA's scope imports any file in taskB's scope.
 * Used by the queen to detect inter-task dependencies and block conflicting
 * concurrent execution.
 *
 * @param taskAFiles - File paths assigned to task A
 * @param taskBFiles - File paths assigned to task B
 * @param graph - The import graph
 * @returns `true` if task A depends on task B's files
 */
export function taskDependsOn(taskAFiles: string[], taskBFiles: string[], graph: ImportGraph): boolean {
	for (const a of taskAFiles) {
		const deps = graph.imports.get(a);
		if (deps) {
			for (const b of taskBFiles) {
				if (deps.has(b)) {
					return true;
				}
			}
		}
	}
	return false;
}
