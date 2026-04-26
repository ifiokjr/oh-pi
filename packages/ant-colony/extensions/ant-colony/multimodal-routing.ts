import type { EscalationReason, Task } from "./types.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".svg", ".heic"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".mpeg", ".mpg"]);

export interface IngestionArtifact {
	path: string;
	kind: "image" | "video";
}

export interface MultimodalIngestionReport {
	hasMultimodalInput: boolean;
	artifacts: IngestionArtifact[];
	summary: string;
}

export function preprocessMultimodalTask(task: Task): MultimodalIngestionReport {
	const artifacts: IngestionArtifact[] = [];
	for (const file of task.files) {
		const lower = file.toLowerCase();
		const imageExt = [...IMAGE_EXTENSIONS].find((ext) => lower.endsWith(ext));
		if (imageExt) {
			artifacts.push({ kind: "image", path: file });
			continue;
		}
		const videoExt = [...VIDEO_EXTENSIONS].find((ext) => lower.endsWith(ext));
		if (videoExt) {
			artifacts.push({ kind: "video", path: file });
		}
	}

	if (artifacts.length === 0) {
		return {
			artifacts,
			hasMultimodalInput: false,
			summary: "No image/video artifacts detected.",
		};
	}

	const imageCount = artifacts.filter((a) => a.kind === "image").length;
	const videoCount = artifacts.filter((a) => a.kind === "video").length;
	return {
		artifacts,
		hasMultimodalInput: true,
		summary: `Detected multimodal artifacts: ${imageCount} image(s), ${videoCount} video(s).`,
	};
}

export function shouldEscalateMultimodalRoute(task: Task, report: MultimodalIngestionReport): EscalationReason[] {
	const reasons: EscalationReason[] = [];
	if (!report.hasMultimodalInput) {
		return reasons;
	}

	if (report.artifacts.some((artifact) => artifact.kind === "video")) {
		reasons.push("risk_flag");
	}

	if ((task.description ?? "").toLowerCase().includes("policy")) {
		reasons.push("policy_violation");
	}

	if ((task.context ?? "").length > 5000) {
		reasons.push("low_confidence");
	}

	return reasons;
}
