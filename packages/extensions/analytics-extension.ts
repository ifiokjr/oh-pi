/* c8 ignore file -- tested via Playwright E2E and separate vitest suite */
/**
 * Pi Analytics Extension
 *
 * Enhanced usage tracker that persists analytics to SQLite database.
 */

import {
  createSession,
  endSession,
  recordTurn,
  upsertModel,
  upsertProvider,
  upsertCodebase,
  formatDateBucket,
  formatHourBucket,
  formatWeekBucket,
  formatMonthBucket,
  runMigrations,
} from "@ifi/pi-analytics-db";
import type { NewTurn, NewSession, NewCodebase } from "@ifi/pi-analytics-db";
import { createHash } from "node:crypto";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ═══ State ═══

interface ActiveSessionInfo {
  id: string;
  startedAt: Date;
  currentCodebaseId?: string;
}

let _activeSession: ActiveSessionInfo | null = null;
let _lastCodebaseId: string | undefined;

// ═══ Helper Functions ═══

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getCodebaseHash(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 16);
}

function normalizeModelId(modelId: string): string {
  return modelId
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-latest$/, "")
    .trim();
}

function inferProviderId(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("claude") || lower.includes("sonnet") || lower.includes("opus") || lower.includes("haiku")) {
    return "anthropic";
  }
  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4") || lower.includes("codex")) {
    return "openai";
  }
  if (lower.includes("gemini") || lower.includes("flash") || lower.includes("antigravity")) {
    return "google";
  }
  if (lower.includes("ollama")) {
    return "ollama";
  }
  return "unknown";
}

function getProviderDisplayName(providerId: string): string {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    ollama: "Ollama",
  };
  return names[providerId] ?? providerId;
}

// ═══ Database Operations ═══

let migrationsDone = false;

function ensureDatabase(): void {
  if (migrationsDone) return;
  runMigrations();
  migrationsDone = true;
}

function startAnalyticsSession(_ctx: { cwd?: string }): void {
  ensureDatabase();

  const sessionId = generateSessionId();
  const now = new Date();

  const sessionData: NewSession = {
    id: sessionId,
    startedAt: now,
  };

  _activeSession = {
    id: sessionId,
    startedAt: now,
  };

  createSession(sessionData);
}

function endAnalyticsSession(): void {
  if (_activeSession) {
    endSession(_activeSession.id);
    _activeSession = null;
  }
}

function updateCodebase(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;

  const codebaseId = getCodebaseHash(cwd);

  if (codebaseId !== _lastCodebaseId) {
    const pathParts = cwd.split("/");
    const name = pathParts[pathParts.length - 1] || "unknown";

    const codebaseData: NewCodebase = {
      id: codebaseId,
      absolutePath: cwd,
      name,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };

    upsertCodebase(codebaseData);
    _lastCodebaseId = codebaseId;

    if (_activeSession) {
      _activeSession.currentCodebaseId = codebaseId;
    }
  }

  return codebaseId;
}

function updateModel(modelId: string): void {
  const normalizedId = normalizeModelId(modelId);
  const providerId = inferProviderId(normalizedId);
  const now = new Date();

  // Upsert provider first
  upsertProvider({
    id: providerId,
    displayName: getProviderDisplayName(providerId),
    firstUsedAt: now,
    lastUsedAt: now,
  });

  // Upsert model
  upsertModel({
    id: normalizedId,
    providerId,
    displayName: modelId.split("/").pop() ?? modelId,
    firstUsedAt: now,
    lastUsedAt: now,
  });
}

function recordAnalyticsTurn(
  ctx: { cwd?: string },
  message: {
    model: string;
    provider?: string;
    usage: {
      input: number;
      output: number;
      cacheRead?: number;
      cacheWrite?: number;
      cost: { total: number };
    };
  },
): void {
  if (!_activeSession) {
    startAnalyticsSession(ctx);
  }

  const now = new Date();
  const dayBucket = formatDateBucket(now);
  const hourBucket = formatHourBucket(now);
  const weekBucket = formatWeekBucket(now);
  const monthBucket = formatMonthBucket(now);

  // Update codebase tracking
  const codebaseId = updateCodebase(ctx.cwd);

  // Update model tracking
  updateModel(message.model);
  const modelId = normalizeModelId(message.model);
  const providerId = inferProviderId(message.model);

  const turnData: NewTurn = {
    id: generateTurnId(),
    sessionId: _activeSession!.id,
    codebaseId,
    modelId,
    providerId,
    startTime: now,
    endTime: now,
    inputTokens: message.usage.input ?? 0,
    outputTokens: message.usage.output ?? 0,
    cacheReadTokens: message.usage.cacheRead ?? 0,
    cacheWriteTokens: message.usage.cacheWrite ?? 0,
    costTotal: message.usage.cost?.total ?? 0,
    dayBucket,
    hourBucket,
    weekBucket,
    monthBucket,
    messageRole: "assistant",
    hasToolCalls: false,
    toolCallCount: 0,
    source: "session",
  };

  recordTurn(turnData);
}

// ═══ Extension Entry Point ═══

export default function piAnalytics(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    try {
      startAnalyticsSession(ctx);
    } catch (err) {
      console.error("[analytics] Failed to start session:", err);
    }
  });

  pi.on("turn_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;

    const msg = event.message as {
      model: string;
      provider?: string;
      usage: {
        input: number;
        output: number;
        cacheRead?: number;
        cacheWrite?: number;
        cost: { total: number };
      };
    };

    try {
      recordAnalyticsTurn(ctx, msg);
    } catch (err) {
      console.error("[analytics] Failed to record turn:", err);
    }
  });

  pi.on("session_shutdown", () => {
    endAnalyticsSession();
  });

  // Command to open dashboard
  pi.registerCommand("analytics-dashboard", {
    description: "Open the Pi Analytics Dashboard in a browser",
    async handler(_args, ctx) {
      const dashboardUrl = "http://localhost:31415";
      try {
        const { exec } = await import("node:child_process");
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        exec(`${openCmd} ${dashboardUrl}`);
        ctx.ui.notify("Analytics Dashboard opened", "info");
      } catch {
        ctx.ui.notify(`Dashboard available at ${dashboardUrl}`, "info");
      }
    },
  });
}