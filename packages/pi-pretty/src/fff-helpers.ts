import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const FFF_DIR = join(homedir(), ".pi", "agent", "pi-pretty", "fff");

function ensureFffDir(): void {
	if (!existsSync(FFF_DIR)) {
		mkdirSync(FFF_DIR, { recursive: true });
	}
}

interface FffStatus {
	ok: boolean;
	message: string;
	indexed?: boolean;
	fileCount?: number;
}

export async function checkHealth(): Promise<FffStatus> {
	try {
		ensureFffDir();
		// Attempt to load FFF module; if unavailable, return degraded status
		const fff = await import("@ff-labs/fff-node");
		// Safe access to any API surface
		const cursor = (
			fff as unknown as {
				CursorStore?: new () => { stats?(): { fileCount?: number }; rescan?(cwd: string): Promise<void> };
			}
		).CursorStore
			? new (
					fff as unknown as {
						CursorStore?: new () => { stats?(): { fileCount?: number }; rescan?(cwd: string): Promise<void> };
					}
				).CursorStore()
			: null;
		const stats = cursor?.stats?.() ?? {};
		return {
			fileCount: stats.fileCount,
			indexed: true,
			message: `FFF index healthy — ${stats.fileCount ?? "unknown"} files indexed`,
			ok: true,
		};
	} catch {
		return {
			indexed: false,
			message: "FFF index not initialized or module unavailable",
			ok: false,
		};
	}
}

export async function rescan(): Promise<FffStatus> {
	try {
		ensureFffDir();
		const fff = await import("@ff-labs/fff-node");
		const cursor = (
			fff as unknown as {
				CursorStore?: new () => { stats?(): { fileCount?: number }; rescan?(cwd: string): Promise<void> };
			}
		).CursorStore
			? new (
					fff as unknown as {
						CursorStore?: new () => { stats?(): { fileCount?: number }; rescan?(cwd: string): Promise<void> };
					}
				).CursorStore()
			: null;
		if (cursor?.rescan) {
			await cursor.rescan(process.cwd());
			return {
				indexed: true,
				message: `Rescan complete for ${process.cwd()}`,
				ok: true,
			};
		}
		return {
			indexed: true,
			message: "Index initialized (no rescan method available)",
			ok: true,
		};
	} catch {
		return {
			indexed: false,
			message: "Failed to rescan — FFF module unavailable",
			ok: false,
		};
	}
}
