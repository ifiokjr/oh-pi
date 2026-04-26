
import type { ImportGraph } from "../extensions/ant-colony/deps.js";
import { buildImportGraph, dependencyDepth, taskDependsOn } from "../extensions/ant-colony/deps.js";

describe(buildImportGraph, () => {
	it("returns empty graph for empty files", () => {
		const graph = buildImportGraph([], "/tmp");
		expect(graph.imports.size).toBe(0);
		expect(graph.importedBy.size).toBe(0);
	});

	it("returns empty graph for nonexistent files", () => {
		const graph = buildImportGraph(["nonexistent.ts"], "/tmp");
		expect(graph.imports.size).toBe(0);
	});
});

describe(dependencyDepth, () => {
	it("returns 0 for file with no dependents", () => {
		const graph: ImportGraph = { importedBy: new Map(), imports: new Map() };
		expect(dependencyDepth("a.ts", graph)).toBe(0);
	});

	it("counts direct dependents", () => {
		const graph: ImportGraph = {
			importedBy: new Map([["a.ts", new Set(["b.ts"])]]),
			imports: new Map([["b.ts", new Set(["a.ts"])]]),
		};
		expect(dependencyDepth("a.ts", graph)).toBe(1);
	});

	it("counts transitive dependents", () => {
		const graph: ImportGraph = {
			importedBy: new Map([
				["a.ts", new Set(["b.ts"])],
				["b.ts", new Set(["c.ts"])],
			]),
			imports: new Map([
				["b.ts", new Set(["a.ts"])],
				["c.ts", new Set(["b.ts"])],
			]),
		};
		expect(dependencyDepth("a.ts", graph)).toBe(2);
	});
});

describe(taskDependsOn, () => {
	it("returns true when taskA imports taskB file", () => {
		const graph: ImportGraph = {
			importedBy: new Map([["b.ts", new Set(["a.ts"])]]),
			imports: new Map([["a.ts", new Set(["b.ts"])]]),
		};
		expect(taskDependsOn(["a.ts"], ["b.ts"], graph)).toBeTruthy();
	});

	it("returns false when no dependency", () => {
		const graph: ImportGraph = {
			importedBy: new Map(),
			imports: new Map([["a.ts", new Set(["c.ts"])]]),
		};
		expect(taskDependsOn(["a.ts"], ["b.ts"], graph)).toBeFalsy();
	});

	it("returns false for empty file lists", () => {
		const graph: ImportGraph = { importedBy: new Map(), imports: new Map() };
		expect(taskDependsOn([], [], graph)).toBeFalsy();
	});
});
