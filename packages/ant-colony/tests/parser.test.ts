import { describe, expect, it, vi } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", () => ({
	AuthStorage: class {},
	createAgentSession: vi.fn(),
	createReadTool: vi.fn(),
	createBashTool: vi.fn(),
	createEditTool: vi.fn(),
	createWriteTool: vi.fn(),
	createGrepTool: vi.fn(),
	createFindTool: vi.fn(),
	createLsTool: vi.fn(),
	ModelRegistry: class {},
	SessionManager: { inMemory: vi.fn() },
	SettingsManager: { inMemory: vi.fn() },
	createExtensionRuntime: vi.fn(),
}));
vi.mock("@mariozechner/pi-ai", () => ({ getModel: vi.fn() }));
vi.mock("./spawner.js", async () => {
	const actual = await vi.importActual<any>("./spawner.js");
	return { ...actual, makePheromoneId: () => "p-test" };
});

import { extractPheromones, parseSubTasks } from "../extensions/ant-colony/parser.js";

describe("parseSubTasks", () => {
	it("parses markdown TASK blocks", () => {
		const output = `## Recommended Tasks
### TASK: Fix login
- description: Fix the login bug
- files: src/auth.ts
- caste: worker
- priority: 2`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Fix login");
		expect(tasks[0].description).toBe("Fix the login bug");
		expect(tasks[0].files).toEqual(["src/auth.ts"]);
		expect(tasks[0].caste).toBe("worker");
		expect(tasks[0].priority).toBe(2);
	});

	it("parses JSON block", () => {
		const output =
			'```json\n[{"title":"Task A","description":"Do A","files":["a.ts"],"caste":"scout","priority":1}]\n```';
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Task A");
		expect(tasks[0].caste).toBe("scout");
	});

	it("defaults caste to worker for invalid", () => {
		const tasks = parseSubTasks('```json\n[{"title":"X","caste":"invalid"}]\n```');
		expect(tasks[0].caste).toBe("worker");
	});

	it("defaults priority to 3", () => {
		const tasks = parseSubTasks('```json\n[{"title":"X"}]\n```');
		expect(tasks[0].priority).toBe(3);
	});

	it("returns empty for no tasks", () => {
		expect(parseSubTasks("no tasks here")).toEqual([]);
	});

	it("parses multiple markdown tasks", () => {
		const output = `### TASK: A
- description: Do A
- files: a.ts
- caste: worker
- priority: 1

### TASK: B
- description: Do B
- files: b.ts
- caste: soldier
- priority: 2`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(2);
	});

	it("parses context field", () => {
		const output = `### TASK: Fix it
- description: Fix bug
- files: x.ts
- caste: worker
- priority: 3
- context: some relevant code`;
		const tasks = parseSubTasks(output);
		expect(tasks[0].context).toBeTruthy();
	});

	it("parses chinese task format with full-width colon", () => {
		const output = `### 任务：生成重启检查报告
- 描述：创建重启检查文档
- 文件：docs/ant-colony-restart-check.md
- 角色：worker
- 优先级：1`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toContain("重启检查报告");
		expect(tasks[0].files).toEqual(["docs/ant-colony-restart-check.md"]);
		expect(tasks[0].caste).toBe("worker");
		expect(tasks[0].priority).toBe(1);
	});

	it("does not infer tasks from plain next-step narrative", () => {
		const output = `目前发现如下\n\n下一步我会继续定位：
- 写入 docs/ant-colony-restart-check.md
- 校验 src/index.ts 的入口流程`;
		const tasks = parseSubTasks(output);
		expect(tasks).toEqual([]);
	});

	it("parses bold markdown field keys", () => {
		const output = `### TASK: Harden parser
- **description**: support bold fields
- **files**: pi-package/extensions/ant-colony/parser.ts
- **caste**: worker
- **priority**: 2`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].files).toEqual(["pi-package/extensions/ant-colony/parser.ts"]);
	});
});

describe("extractPheromones", () => {
	it("extracts discovery section", () => {
		const p = extractPheromones("ant-1", "scout", "t-1", "## Discoveries\n- Found auth\n\n## Other\nstuff", ["a.ts"]);
		expect(p.some((x) => x.type === "discovery")).toBe(true);
	});

	it("extracts warning section", () => {
		const p = extractPheromones("ant-1", "scout", "t-1", "## Warnings\n- Conflict\n", []);
		expect(p.some((x) => x.type === "warning")).toBe(true);
	});

	it("adds repellent on failure", () => {
		const p = extractPheromones("ant-1", "worker", "t-1", "output", ["a.ts"], true);
		expect(p.some((x) => x.type === "repellent")).toBe(true);
	});

	it("returns empty for no matching sections", () => {
		expect(extractPheromones("ant-1", "worker", "t-1", "nothing", [])).toEqual([]);
	});

	it("extracts Files Changed as completion", () => {
		const p = extractPheromones("ant-1", "worker", "t-1", "## Files Changed\n- src/foo.ts\n", ["src/foo.ts"]);
		expect(p.some((x) => x.type === "completion")).toBe(true);
	});
});
