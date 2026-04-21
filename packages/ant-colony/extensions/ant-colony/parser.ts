import { makePheromoneId } from "./spawner.js";
import type { AntCaste, Pheromone, PheromoneType } from "./types.js";

const VALID_CASTES = new Set(["scout", "worker", "soldier", "drone"]);
const TASK_HEADER_RE = /^\s*#{2,6}\s*task\s*:\s*(.+?)\s*$/i;

// Pre-compiled pheromone section regexes — avoid new RegExp() per call in extractPheromones.
const PHEROMONE_SECTION_NAMES = ["Discoveries", "Pheromone", "Files Changed", "Warnings", "Review"] as const;
const PHEROMONE_SECTION_REGEXES = PHEROMONE_SECTION_NAMES.map(
	(section) => new RegExp(`#{1,2} ${section}\\n([\\s\\S]*?)(?=\\n#{1,2} |$)`, "i"),
);

export interface ParsedSubTask {
	title: string;
	description: string;
	files: string[];
	caste: AntCaste;
	priority: 1 | 2 | 3 | 4 | 5;
	context?: string;
}

function normalizePriority(v: unknown): 1 | 2 | 3 | 4 | 5 {
	const n = Number.parseInt(String(v ?? "3"), 10);
	return Math.min(5, Math.max(1, Number.isNaN(n) ? 3 : n)) as 1 | 2 | 3 | 4 | 5;
}

function normalizeCaste(v: unknown): AntCaste {
	const raw = String(v ?? "worker")
		.trim()
		.toLowerCase();

	if (VALID_CASTES.has(raw)) {
		return raw as AntCaste;
	}

	if (raw.includes("scout")) {
		return "scout";
	}

	if (raw.includes("worker")) {
		return "worker";
	}

	if (raw.includes("review") || raw.includes("soldier")) {
		return "soldier";
	}

	if (raw.includes("drone") || raw.includes("bash") || raw.includes("shell")) {
		return "drone";
	}

	return "worker";
}

function extractFileLike(value: string): string[] {
	const normalized = value.replace(/;/g, ",").replace(/["']/g, "").replace(/`/g, "");
	const tokens = normalized
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const fileish = tokens.map((t) => t.replace(/^\.?\//, "")).filter((t) => /[./\\]/.test(t) || /\.[a-z0-9]+$/i.test(t));
	return [...new Set(fileish)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasNonEmptyText(value: unknown): boolean {
	return typeof value === "string" && value.trim().length > 0;
}

function isJsonTaskLike(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && (hasNonEmptyText(value.title) || hasNonEmptyText(value.description));
}

function extractJsonTaskCandidates(parsed: unknown): Array<Record<string, unknown>> {
	if (Array.isArray(parsed)) {
		return parsed.filter(isJsonTaskLike);
	}

	if (isRecord(parsed) && Array.isArray(parsed.tasks)) {
		return parsed.tasks.filter(isJsonTaskLike);
	}

	if (isJsonTaskLike(parsed)) {
		return [parsed];
	}

	return [];
}

function normalizeJsonTasks(parsed: unknown): ParsedSubTask[] {
	return extractJsonTaskCandidates(parsed).map((t) => {
		const title = String(t.title || t.description || "Untitled").trim() || "Untitled";
		const description = String(t.description || t.title || title).trim() || title;
		return {
			title,
			description,
			files: Array.isArray(t.files)
				? t.files
						.map(String)
						.map((f) => f.trim())
						.filter(Boolean)
				: extractFileLike(String(t.files || "")),
			caste: normalizeCaste(t.caste),
			priority: normalizePriority(t.priority),
			context: t.context ? String(t.context) : undefined,
		};
	});
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Parser must handle many field variants (en/zh) and edge cases
function parseTasksFromStructuredLines(output: string): ParsedSubTask[] {
	const lines = output.split(/\r?\n/);
	const tasks: ParsedSubTask[] = [];

	let current: ParsedSubTask | null = null;

	const flushCurrent = () => {
		if (!current) {
			return;
		}
		current.title = current.title.trim() || "Untitled";
		current.description = current.description.trim() || current.title;
		current.files = [...new Set(current.files.map((f) => f.trim()).filter(Boolean))];
		current.priority = normalizePriority(current.priority);
		current.caste = normalizeCaste(current.caste);
		if (current.context) {
			current.context = current.context.trim();
		}
		tasks.push(current);
		current = null;
	};

	const fieldMatch = (line: string) => {
		return line.match(
			/^\s*(?:[-*]|\d+\.)?\s*(?:\*\*|__)?\s*(description|desc|files?|caste|role|priority|prio|context)\s*(?:\*\*|__)?\s*:\s*(.*)$/i,
		);
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const header = line.match(TASK_HEADER_RE);
		if (header) {
			flushCurrent();
			current = {
				title: header[1]?.trim() || "Untitled",
				description: "",
				files: [],
				caste: "worker",
				priority: 3,
			};
			continue;
		}

		if (!current) {
			continue;
		}

		const m = fieldMatch(line);
		if (!m) {
			continue;
		}

		const key = m[1].toLowerCase();
		const value = (m[2] || "").trim();

		if (["description", "desc"].includes(key)) {
			current.description = value;
			continue;
		}

		if (["files", "file"].includes(key)) {
			current.files.push(...extractFileLike(value));
			continue;
		}

		if (["caste", "role"].includes(key)) {
			current.caste = normalizeCaste(value);
			continue;
		}

		if (["priority", "prio"].includes(key)) {
			current.priority = normalizePriority(value);
			continue;
		}

		if (key === "context") {
			const contextLines = [value];
			while (i + 1 < lines.length) {
				const next = lines[i + 1];
				if (TASK_HEADER_RE.test(next) || fieldMatch(next)) {
					break;
				}
				if (/^\s*#{1,6}\s+/.test(next)) {
					break;
				}
				contextLines.push(next);
				i++;
			}
			current.context = contextLines.join("\n").trim();
		}
	}

	flushCurrent();
	return tasks;
}

export function parseSubTasks(output: string): ParsedSubTask[] {
	// 1) JSON fenced block
	const jsonMatch = output.match(/```json\s*([\s\S]*?)```/i);
	if (jsonMatch?.[1]) {
		try {
			const jsonTasks = normalizeJsonTasks(JSON.parse(jsonMatch[1].trim()));
			if (jsonTasks.length > 0) {
				return jsonTasks;
			}
		} catch {
			/* fallback */
		}
	}

	// 2) Structured markdown task blocks
	return parseTasksFromStructuredLines(output);
}

export function extractPheromones(
	antId: string,
	caste: AntCaste,
	taskId: string,
	output: string,
	files: string[],
	failed = false,
): Pheromone[] {
	const pheromones: Pheromone[] = [];
	const now = Date.now();
	for (let i = 0; i < PHEROMONE_SECTION_NAMES.length; i++) {
		const section = PHEROMONE_SECTION_NAMES[i];
		const match = output.match(PHEROMONE_SECTION_REGEXES[i]);
		if (match?.[1]?.trim()) {
			const type: PheromoneType =
				section === "Discoveries"
					? "discovery"
					: section === "Warnings" || section === "Review"
						? "warning"
						: section === "Files Changed"
							? "completion"
							: "progress";
			pheromones.push({
				id: makePheromoneId(),
				type,
				antId,
				antCaste: caste,
				taskId,
				content: match[1].trim().slice(0, 2000),
				files,
				strength: 1.0,
				createdAt: now,
			});
		}
	}

	if (failed && files.length > 0) {
		pheromones.push({
			id: makePheromoneId(),
			type: "repellent",
			antId,
			antCaste: caste,
			taskId,
			content: `Task failed on files: ${files.join(", ")}`,
			files,
			strength: 1.0,
			createdAt: now,
		});
	}
	return pheromones;
}
