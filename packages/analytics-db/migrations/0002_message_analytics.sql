-- Migration 0002: Add message analytics columns and new tables
--
-- Adds: emotional_score, most_common_words, most_common_misspellings,
-- and turn_message_analytics table for rich per-message insights.

-- ─── Add emotional score column to turns table ──────────────────────────────

ALTER TABLE turns ADD COLUMN emotional_score REAL;
ALTER TABLE turns ADD COLUMN emotional_labels TEXT; -- JSON array like ["curious","frustrated","satisfied"]

-- ─── Add content preview column (first N chars of user message) ─────────────

ALTER TABLE turns ADD COLUMN content_preview TEXT; -- First 200 chars of the message
ALTER TABLE turns ADD COLUMN content_hash TEXT; -- SHA256 hash of full message for dedup/lookup

-- ─── New table: message word frequency ───────────────────────────────────────
-- Tracks word counts per model per day for "most common words" analytics

CREATE TABLE IF NOT EXISTS word_frequencies (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  day_bucket TEXT NOT NULL,
  word TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(model_id, day_bucket, word)
);

CREATE INDEX IF NOT EXISTS word_freq_model_day_idx ON word_frequencies(model_id, day_bucket);
CREATE INDEX IF NOT EXISTS word_freq_day_idx ON word_frequencies(day_bucket);

-- ─── New table: misspellings ────────────────────────────────────────────────
-- Tracks common misspellings (words that were corrected by the model)

CREATE TABLE IF NOT EXISTS misspellings (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  day_bucket TEXT NOT NULL,
  misspelled_word TEXT NOT NULL,
  corrected_word TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  context_window TEXT, -- surrounding text for context (nullable for privacy)
  first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(model_id, day_bucket, misspelled_word, corrected_word)
);

CREATE INDEX IF NOT EXISTS misspellings_model_day_idx ON misspellings(model_id, day_bucket);
CREATE INDEX IF NOT EXISTS misspellings_day_idx ON misspellings(day_bucket);

-- ─── New table: real-time session events ─────────────────────────────────────
-- For the live activity feed showing "current query being worked on"

CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  event_type TEXT NOT NULL, -- 'turn_start', 'turn_end', 'tool_call', 'rate_limit', 'error'
  model_id TEXT REFERENCES models(id),
  codebase_id TEXT REFERENCES codebases(id),
  provider_id TEXT REFERENCES providers(id),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_total REAL,
  is_streaming INTEGER NOT NULL DEFAULT 0, -- 1 if currently streaming
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'streaming', 'completed', 'error'
  error_message TEXT,
  metadata_json TEXT -- arbitrary key-value pairs as JSON
);

CREATE INDEX IF NOT EXISTS session_events_session_idx ON session_events(session_id);
CREATE INDEX IF NOT EXISTS session_events_status_idx ON session_events(status);
CREATE INDEX IF NOT EXISTS session_events_started_idx ON session_events(started_at);
CREATE INDEX IF NOT EXISTS session_events_streaming_idx ON session_events(is_streaming) WHERE is_streaming = 1;