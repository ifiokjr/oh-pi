/**
 * Pi Analytics Database Schema
 *
 * Comprehensive analytics tracking for Pi usage including models, tokens,
 * costs, timing, and codebase information.
 */

import {
  integer,
  real,
  sqliteTable,
  text,
  index,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── Core Tables ─────────────────────────────────────────────────────────────

/**
 * Pi sessions - each time Pi starts, a new session is created
 */
/* c8 ignore start -- Drizzle schema definitions are declarative; column presence tested via schema.test.ts */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    version: text("version"),
    machineId: text("machine_id"),
    os: text("os"),
    osVersion: text("os_version"),
    arch: text("arch"),
    nodeVersion: text("node_version"),
  },
  (table) => ({
    startedAtIdx: index("sessions_started_at_idx").on(table.startedAt),
  }),
);

/**
 * Codebases/workspaces - track which projects you're working on
 */
export const codebases = sqliteTable(
  "codebases",
  {
    id: text("id").primaryKey(),
    absolutePath: text("absolute_path").notNull().unique(),
    name: text("name").notNull(),
    gitBranch: text("git_branch"),
    gitCommit: text("git_commit"),
    remoteUrl: text("remote_url"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
    sessionCount: integer("session_count").default(0).notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
  },
  (table) => ({
    nameIdx: index("codebases_name_idx").on(table.name),
    lastSeenIdx: index("codebases_last_seen_idx").on(table.lastSeenAt),
  }),
);

/**
 * AI Providers (Anthropic, OpenAI, Google, Ollama, etc.)
 */
export const providers = sqliteTable(
  "providers",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    firstUsedAt: integer("first_used_at", { mode: "timestamp" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }).notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
    totalInputTokens: integer("total_input_tokens").default(0).notNull(),
    totalOutputTokens: integer("total_output_tokens").default(0).notNull(),
  },
  (table) => ({
    lastUsedIdx: index("providers_last_used_idx").on(table.lastUsedAt),
  }),
);

/**
 * AI Models
 */
export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    displayName: text("display_name"),
    firstUsedAt: integer("first_used_at", { mode: "timestamp" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }).notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
    totalInputTokens: integer("total_input_tokens").default(0).notNull(),
    totalOutputTokens: integer("total_output_tokens").default(0).notNull(),
    totalCacheReadTokens: integer("total_cache_read_tokens").default(0).notNull(),
    totalCacheWriteTokens: integer("total_cache_write_tokens").default(0).notNull(),
    avgResponseTime: real("avg_response_time"),
    estimatedCostPerInputToken: real("estimated_cost_per_input_token"),
    estimatedCostPerOutputToken: real("estimated_cost_per_output_token"),
  },
  (table) => ({
    providerIdx: index("models_provider_idx").on(table.providerId),
    lastUsedIdx: index("models_last_used_idx").on(table.lastUsedAt),
  }),
);

/**
 * Turns (individual interactions/messages)
 */
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    codebaseId: text("codebase_id").references(() => codebases.id),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),

    // Timing
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }),
    durationMs: integer("duration_ms"),

    // Token usage
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),

    // Cost (all default 0 so inserts can omit them)
    costInput: real("cost_input").default(0).notNull(),
    costOutput: real("cost_output").default(0).notNull(),
    costCacheRead: real("cost_cache_read").default(0).notNull(),
    costCacheWrite: real("cost_cache_write").default(0).notNull(),
    costTotal: real("cost_total").default(0).notNull(),

    // Context usage
    contextWindowSize: integer("context_window_size"),
    contextUsedTokens: integer("context_used_tokens"),
    contextPercentUsed: real("context_percent_used"),

    // Source (session, ant-colony, etc.)
    source: text("source").default("session").notNull(),
    sourceScope: text("source_scope"),

    // Message metadata
    messageRole: text("message_role").notNull(),
    hasToolCalls: integer("has_tool_calls", { mode: "boolean" }).default(false),
    toolCallCount: integer("tool_call_count").default(0),

    // Emotional & content analytics
    emotionalScore: real("emotional_score"),
    emotionalLabels: text("emotional_labels"),
    contentPreview: text("content_preview"),
    contentHash: text("content_hash"),

    // Timestamps for aggregation queries
    hourBucket: text("hour_bucket").notNull(),
    dayBucket: text("day_bucket").notNull(),
    weekBucket: text("week_bucket").notNull(),
    monthBucket: text("month_bucket").notNull(),
  },
  (table) => ({
    sessionIdx: index("turns_session_idx").on(table.sessionId),
    codebaseIdx: index("turns_codebase_idx").on(table.codebaseId),
    modelIdx: index("turns_model_idx").on(table.modelId),
    providerIdx: index("turns_provider_idx").on(table.providerId),
    timeIdx: index("turns_time_idx").on(table.startTime),
    dayIdx: index("turns_day_idx").on(table.dayBucket),
    weekIdx: index("turns_week_idx").on(table.weekBucket),
    monthIdx: index("turns_month_idx").on(table.monthBucket),
    hourIdx: index("turns_hour_idx").on(table.hourBucket),
    sourceIdx: index("turns_source_idx").on(table.source),
  }),
);

/**
 * Rate limit snapshots (captured periodically)
 */
export const rateLimitSnapshots = sqliteTable(
  "rate_limit_snapshots",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull(),
    dayBucket: text("day_bucket").notNull(),
    windowLabel: text("window_label").notNull(),
    percentRemaining: real("percent_remaining").notNull(),
    tokensRemaining: integer("tokens_remaining"),
    tokensLimit: integer("tokens_limit"),
    requestsRemaining: integer("requests_remaining"),
    requestsLimit: integer("requests_limit"),
    resetAt: integer("reset_at", { mode: "timestamp" }),
    resetDescription: text("reset_description"),
    windowMinutes: integer("window_minutes"),
    creditsRemaining: real("credits_remaining"),
    accountIdentifier: text("account_identifier"),
    planName: text("plan_name"),
    errorMessage: text("error_message"),
    probedSuccessfully: integer("probed_successfully", { mode: "boolean" }).default(true),
  },
  (table) => ({
    providerTimeIdx: index("rate_limits_provider_time_idx").on(
      table.providerId,
      table.recordedAt,
    ),
    dayIdx: index("rate_limits_day_idx").on(table.dayBucket),
  }),
);

// ─── Aggregated Statistics Tables ───────────────────────────────────────────

export const hourlyStats = sqliteTable(
  "hourly_stats",
  {
    id: text("id").primaryKey(),
    hourBucket: text("hour_bucket").notNull().unique(),
    dayBucket: text("day_bucket").notNull(),
    weekBucket: text("week_bucket").notNull(),
    monthBucket: text("month_bucket").notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalSessions: integer("total_sessions").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
    totalInputTokens: integer("total_input_tokens").default(0).notNull(),
    totalOutputTokens: integer("total_output_tokens").default(0).notNull(),
    totalCacheReadTokens: integer("total_cache_read_tokens").default(0).notNull(),
    totalCacheWriteTokens: integer("total_cache_write_tokens").default(0).notNull(),
    totalDurationMs: integer("total_duration_ms").default(0).notNull(),
    avgResponseTimeMs: real("avg_response_time_ms"),
    avgTokensPerTurn: real("avg_tokens_per_turn"),
    avgCostPerTurn: real("avg_cost_per_turn"),
    uniqueModels: integer("unique_models").default(0).notNull(),
    uniqueProviders: integer("unique_providers").default(0).notNull(),
    uniqueCodebases: integer("unique_codebases").default(0).notNull(),
    topModelsJson: text("top_models_json"),
    topCodebasesJson: text("top_codebases_json"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    dayIdx: index("hourly_day_idx").on(table.dayBucket),
    weekIdx: index("hourly_week_idx").on(table.weekBucket),
    monthIdx: index("hourly_month_idx").on(table.monthBucket),
  }),
);

export const dailyStats = sqliteTable(
  "daily_stats",
  {
    id: text("id").primaryKey(),
    dayBucket: text("day_bucket").notNull().unique(),
    weekBucket: text("week_bucket").notNull(),
    monthBucket: text("month_bucket").notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalSessions: integer("total_sessions").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
    totalInputTokens: integer("total_input_tokens").default(0).notNull(),
    totalOutputTokens: integer("total_output_tokens").default(0).notNull(),
    totalCacheReadTokens: integer("total_cache_read_tokens").default(0).notNull(),
    totalCacheWriteTokens: integer("total_cache_write_tokens").default(0).notNull(),
    totalDurationMs: integer("total_duration_ms").default(0).notNull(),
    firstActivityAt: integer("first_activity_at", { mode: "timestamp" }),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp" }),
    activeHoursCount: integer("active_hours_count").default(0).notNull(),
    avgResponseTimeMs: real("avg_response_time_ms"),
    avgTokensPerTurn: real("avg_tokens_per_turn"),
    avgCostPerTurn: real("avg_cost_per_turn"),
    avgTurnsPerSession: real("avg_turns_per_session"),
    uniqueModels: integer("unique_models").default(0).notNull(),
    uniqueProviders: integer("unique_providers").default(0).notNull(),
    uniqueCodebases: integer("unique_codebases").default(0).notNull(),
    topModelsJson: text("top_models_json"),
    topProvidersJson: text("top_providers_json"),
    topCodebasesJson: text("top_codebases_json"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    weekIdx: index("daily_week_idx").on(table.weekBucket),
    monthIdx: index("daily_month_idx").on(table.monthBucket),
  }),
);

export const modelDailyStats = sqliteTable(
  "model_daily_stats",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    dayBucket: text("day_bucket").notNull(),
    weekBucket: text("week_bucket").notNull(),
    monthBucket: text("month_bucket").notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
    totalInputTokens: integer("total_input_tokens").default(0).notNull(),
    totalOutputTokens: integer("total_output_tokens").default(0).notNull(),
    totalCacheReadTokens: integer("total_cache_read_tokens").default(0).notNull(),
    totalCacheWriteTokens: integer("total_cache_write_tokens").default(0).notNull(),
    totalDurationMs: integer("total_duration_ms").default(0).notNull(),
    avgResponseTimeMs: real("avg_response_time_ms"),
    avgTokensPerTurn: real("avg_tokens_per_turn"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    modelIdx: index("model_daily_model_idx").on(table.modelId),
    dayIdx: index("model_daily_day_idx").on(table.dayBucket),
    weekIdx: index("model_daily_week_idx").on(table.weekBucket),
  }),
);

export const codebaseDailyStats = sqliteTable(
  "codebase_daily_stats",
  {
    id: text("id").primaryKey(),
    codebaseId: text("codebase_id")
      .notNull()
      .references(() => codebases.id),
    dayBucket: text("day_bucket").notNull(),
    weekBucket: text("week_bucket").notNull(),
    monthBucket: text("month_bucket").notNull(),
    totalTurns: integer("total_turns").default(0).notNull(),
    totalCost: real("total_cost").default(0).notNull(),
    totalInputTokens: integer("total_input_tokens").default(0).notNull(),
    totalOutputTokens: integer("total_output_tokens").default(0).notNull(),
    totalDurationMs: integer("total_duration_ms").default(0).notNull(),
    sessionCount: integer("session_count").default(0).notNull(),
    uniqueModels: integer("unique_models").default(0).notNull(),
    topModelsJson: text("top_models_json"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    codebaseIdx: index("codebase_daily_codebase_idx").on(table.codebaseId),
    dayIdx: index("codebase_daily_day_idx").on(table.dayBucket),
    weekIdx: index("codebase_daily_week_idx").on(table.weekBucket),
  }),
);

// ─── Word Frequencies ──────────────────────────────────────────────────────
// Tracks word counts per model per day for "most common words" analytics

export const wordFrequencies = sqliteTable(
  "word_frequencies",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    dayBucket: text("day_bucket").notNull(),
    word: text("word").notNull(),
    count: integer("count").default(1).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    modelDayIdx: index("word_freq_model_day_idx").on(table.modelId, table.dayBucket),
    dayIdx: index("word_freq_day_idx").on(table.dayBucket),
  }),
);

// ─── Misspellings ──────────────────────────────────────────────────────────────
// Tracks common misspellings (words that were corrected by the model)

export const misspellings = sqliteTable(
  "misspellings",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    dayBucket: text("day_bucket").notNull(),
    misspelledWord: text("misspelled_word").notNull(),
    correctedWord: text("corrected_word").notNull(),
    occurrenceCount: integer("occurrence_count").default(1).notNull(),
    contextWindow: text("context_window"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    modelDayIdx: index("misspellings_model_day_idx").on(table.modelId, table.dayBucket),
    dayIdx: index("misspellings_day_idx").on(table.dayBucket),
  }),
);

// ─── Session Events (real-time activity stream) ────────────────────────────────
// For the live activity feed showing "current query being worked on"

export const sessionEvents = sqliteTable(
  "session_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    eventType: text("event_type").notNull(), // 'turn_start', 'turn_end', 'tool_call', 'rate_limit', 'error'
    modelId: text("model_id").references(() => models.id),
    codebaseId: text("codebase_id").references(() => codebases.id),
    providerId: text("provider_id").references(() => providers.id),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costTotal: real("cost_total"),
    isStreaming: integer("is_streaming", { mode: "boolean" }).default(false).notNull(),
    status: text("status").default("pending").notNull(), // 'pending', 'streaming', 'completed', 'error'
    errorMessage: text("error_message"),
    metadataJson: text("metadata_json"),
  },
  (table) => ({
    sessionIdx: index("session_events_session_idx").on(table.sessionId),
    statusIdx: index("session_events_status_idx").on(table.status),
    startedIdx: index("session_events_started_idx").on(table.startedAt),
    streamingIdx: index("session_events_streaming_idx").on(table.isStreaming),
  }),
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const sessionsRelations = relations(sessions, ({ many }) => ({
  turns: many(turns),
}));

export const codebasesRelations = relations(codebases, ({ many }) => ({
  turns: many(turns),
  dailyStats: many(codebaseDailyStats),
}));

export const providersRelations = relations(providers, ({ many }) => ({
  models: many(models),
  turns: many(turns),
  rateLimitSnapshots: many(rateLimitSnapshots),
}));

export const modelsRelations = relations(models, ({ one, many }) => ({
  provider: one(providers, {
    fields: [models.providerId],
    references: [providers.id],
  }),
  turns: many(turns),
  dailyStats: many(modelDailyStats),
}));

export const turnsRelations = relations(turns, ({ one }) => ({
  session: one(sessions, {
    fields: [turns.sessionId],
    references: [sessions.id],
  }),
  codebase: one(codebases, {
    fields: [turns.codebaseId],
    references: [codebases.id],
    relationName: "codebaseTurns",
  }),
  model: one(models, {
    fields: [turns.modelId],
    references: [models.id],
  }),
  provider: one(providers, {
    fields: [turns.providerId],
    references: [providers.id],
  }),
}));

export const rateLimitSnapshotsRelations = relations(rateLimitSnapshots, ({ one }) => ({
  provider: one(providers, {
    fields: [rateLimitSnapshots.providerId],
    references: [providers.id],
  }),
}));

export const wordFrequenciesRelations = relations(wordFrequencies, ({ one }) => ({
  model: one(models, {
    fields: [wordFrequencies.modelId],
    references: [models.id],
  }),
}));

export const misspellingsRelations = relations(misspellings, ({ one }) => ({
  model: one(models, {
    fields: [misspellings.modelId],
    references: [models.id],
  }),
}));

export const sessionEventsRelations = relations(sessionEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionEvents.sessionId],
    references: [sessions.id],
  }),
  model: one(models, {
    fields: [sessionEvents.modelId],
    references: [models.id],
  }),
  codebase: one(codebases, {
    fields: [sessionEvents.codebaseId],
    references: [codebases.id],
    relationName: "codebaseEvents",
  }),
  provider: one(providers, {
    fields: [sessionEvents.providerId],
    references: [providers.id],
  }),
}));

/* c8 ignore stop */

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Codebase = typeof codebases.$inferSelect;
export type NewCodebase = typeof codebases.$inferInsert;

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;

export type Turn = typeof turns.$inferSelect;
export type NewTurn = typeof turns.$inferInsert;

export type RateLimitSnapshot = typeof rateLimitSnapshots.$inferSelect;
export type NewRateLimitSnapshot = typeof rateLimitSnapshots.$inferInsert;

export type HourlyStat = typeof hourlyStats.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;
export type ModelDailyStat = typeof modelDailyStats.$inferSelect;
export type CodebaseDailyStat = typeof codebaseDailyStats.$inferSelect;

export type WordFrequency = typeof wordFrequencies.$inferSelect;
export type NewWordFrequency = typeof wordFrequencies.$inferInsert;

export type Misspelling = typeof misspellings.$inferSelect;
export type NewMisspelling = typeof misspellings.$inferInsert;

export type SessionEvent = typeof sessionEvents.$inferSelect;
export type NewSessionEvent = typeof sessionEvents.$inferInsert;