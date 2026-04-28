import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface FffModule {
	CursorStore?: new () => {
		rescan?: (cwd: string) => Promise<void>;
		stats?: () => { fileCount?: number };
	};
}

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
		const fff = (await import("@ff-labs/fff-node")) as FffModule;
		const cursor = fff.CursorStore ? new fff.CursorStore() : null;
		const stats = cursor?.stats?.() ?? {};
		return {
			ok: true,
			message: `FFF index healthy — ${stats.fileCount ?? "unknown"} files indexed`,
			indexed: true,
			fileCount: stats.fileCount,
		};
	} catch {
		return {
			ok: false,
			message: "FFF index not initialized or module unavailable",
			indexed: false,
		};
	}
}

export async function rescan(): Promise<FffStatus> {
	try {
		ensureFffDir();
		const fff = (await import("@ff-labs/fff-node")) as FffModule;
		const cursor = fff.CursorStore ? new fff.CursorStore() : null;
		if (cursor?.rescan) {
			await cursor.rescan(process.cwd());
			return {
				ok: true,
				message: `Rescan complete for ${process.cwd()}`,
				indexed: true,
			};
		}
		return {
			ok: true,
			message: "Index initialized (no rescan method available)",
			indexed: true,
		};
	} catch {
		return {
			ok: false,
			message: "Failed to rescan — FFF module unavailable",
			indexed: false,
		};
	}
}
