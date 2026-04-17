-- Pi Analytics Database Schema Migration
-- Initial database setup with all tables

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  version TEXT,
  machine_id TEXT,
  os TEXT,
  os_version TEXT,
  arch TEXT,
  node_version TEXT
);

CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at);
CREATE INDEX IF NOT EXISTS sessions_date_idx ON sessions(started_at);

-- Codebases table
CREATE TABLE IF NOT EXISTS codebases (
  id TEXT PRIMARY KEY,
  absolute_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  git_branch TEXT,
  git_commit TEXT,
  remote_url TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  session_count INTEGER DEFAULT 0 NOT NULL,
  total_turns INTEGER DEFAULT 0 NOT NULL,
  total_cost REAL DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS codebases_name_idx ON codebases(name);
CREATE INDEX IF NOT EXISTS codebases_last_seen_idx ON codebases(last_seen_at);

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  first_used_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  total_turns INTEGER DEFAULT 0 NOT NULL,
  total_cost REAL DEFAULT 0 NOT NULL,
  total_input_tokens INTEGER DEFAULT 0 NOT NULL,
  total_output_tokens INTEGER DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS providers_last_used_idx ON providers(last_used_at);

-- Models table
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  display_name TEXT,
  first_used_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  total_turns INTEGER DEFAULT 0 NOT NULL,
  total_cost REAL DEFAULT 0 NOT NULL,
  total_input_tokens INTEGER DEFAULT 0 NOT NULL,
  total_output_tokens INTEGER DEFAULT 0 NOT NULL,
  total_cache_read_tokens INTEGER DEFAULT 0 NOT NULL,
  total_cache_write_tokens INTEGER DEFAULT 0 NOT NULL,
  avg_response_time REAL,
  estimated_cost_per_input_token REAL,
  estimated_cost_per_output_token REAL
);

CREATE INDEX IF NOT EXISTS models_provider_idx ON models(provider_id);
CREATE INDEX IF NOT EXISTS models_last_used_idx ON models(last_used_at);

-- Turns table (main usage data)
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  codebase_id TEXT REFERENCES codebases(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  duration_ms INTEGER,
  input_tokens INTEGER DEFAULT 0 NOT NULL,
  output_tokens INTEGER DEFAULT 0 NOT NULL,
  cache_read_tokens INTEGER DEFAULT 0 NOT NULL,
  cache_write_tokens INTEGER DEFAULT 0 NOT NULL,
  cost_input REAL DEFAULT 0 NOT NULL,
  cost_output REAL DEFAULT 0 NOT NULL,
  cost_cache_read REAL DEFAULT 0 NOT NULL,
  cost_cache_write REAL DEFAULT 0 NOT NULL,
  cost_total REAL DEFAULT 0 NOT NULL,
  context_window_size INTEGER,
  context_used_tokens INTEGER,
  context_percent_used REAL,
  source TEXT DEFAULT 'session' NOT NULL,
  source_scope TEXT,
  message_role TEXT NOT NULL,
  has_tool_calls INTEGER DEFAULT 0,
  tool_call_count INTEGER DEFAULT 0,
  hour_bucket TEXT NOT NULL,
  day_bucket TEXT NOT NULL,
  week_bucket TEXT NOT NULL,
  month_bucket TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS turns_session_idx ON turns(session_id);
CREATE INDEX IF NOT EXISTS turns_codebase_idx ON turns(codebase_id);
CREATE INDEX IF NOT EXISTS turns_model_idx ON turns(model_id);
CREATE INDEX IF NOT EXISTS turns_provider_idx ON turns(provider_id);
CREATE INDEX IF NOT EXISTS turns_time_idx ON turns(start_time);
CREATE INDEX IF NOT EXISTS turns_day_idx ON turns(day_bucket);
CREATE INDEX IF NOT EXISTS turns_week_idx ON turns(week_bucket);
CREATE INDEX IF NOT EXISTS turns_month_idx ON turns(month_bucket);
CREATE INDEX IF NOT EXISTS turns_hour_idx ON turns(hour_bucket);
CREATE INDEX IF NOT EXISTS turns_source_idx ON turns(source);

-- Rate limit snapshots
CREATE TABLE IF NOT EXISTS rate_limit_snapshots (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  recorded_at INTEGER NOT NULL,
  day_bucket TEXT NOT NULL,
  window_label TEXT NOT NULL,
  percent_remaining REAL NOT NULL,
  tokens_remaining INTEGER,
  tokens_limit INTEGER,
  requests_remaining INTEGER,
  requests_limit INTEGER,
  reset_at INTEGER,
  reset_description TEXT,
  window_minutes INTEGER,
  credits_remaining REAL,
  account_identifier TEXT,
  plan_name TEXT,
  error_message TEXT,
  probed_successfully INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS rate_limits_provider_time_idx ON rate_limit_snapshots(provider_id, recorded_at);
CREATE INDEX IF NOT EXISTS rate_limits_day_idx ON rate_limit_snapshots(day_bucket);

-- Daily statistics (aggregated)
CREATE TABLE IF NOT EXISTS daily_stats (
  id TEXT PRIMARY KEY,
  day_bucket TEXT NOT NULL UNIQUE,
  week_bucket TEXT NOT NULL,
  month_bucket TEXT NOT NULL,
  total_turns INTEGER DEFAULT 0 NOT NULL,
  total_sessions INTEGER DEFAULT 0 NOT NULL,
  total_cost REAL DEFAULT 0 NOT NULL,
  total_input_tokens INTEGER DEFAULT 0 NOT NULL,
  total_output_tokens INTEGER DEFAULT 0 NOT NULL,
  total_cache_read_tokens INTEGER DEFAULT 0 NOT NULL,
  total_cache_write_tokens INTEGER DEFAULT 0 NOT NULL,
  total_duration_ms INTEGER DEFAULT 0 NOT NULL,
  first_activity_at INTEGER,
  last_activity_at INTEGER,
  active_hours_count INTEGER DEFAULT 0 NOT NULL,
  avg_response_time_ms REAL,
  avg_tokens_per_turn REAL,
  avg_cost_per_turn REAL,
  avg_turns_per_session REAL,
  unique_models INTEGER DEFAULT 0 NOT NULL,
  unique_providers INTEGER DEFAULT 0 NOT NULL,
  unique_codebases INTEGER DEFAULT 0 NOT NULL,
  top_models_json TEXT,
  top_providers_json TEXT,
  top_codebases_json TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS daily_stats_week_idx ON daily_stats(week_bucket);
CREATE INDEX IF NOT EXISTS daily_stats_month_idx ON daily_stats(month_bucket);

-- Model daily stats
CREATE TABLE IF NOT EXISTS model_daily_stats (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  day_bucket TEXT NOT NULL,
  week_bucket TEXT NOT NULL,
  month_bucket TEXT NOT NULL,
  total_turns INTEGER DEFAULT 0 NOT NULL,
  total_cost REAL DEFAULT 0 NOT NULL,
  total_input_tokens INTEGER DEFAULT 0 NOT NULL,
  total_output_tokens INTEGER DEFAULT 0 NOT NULL,
  total_cache_read_tokens INTEGER DEFAULT 0 NOT NULL,
  total_cache_write_tokens INTEGER DEFAULT 0 NOT NULL,
  total_duration_ms INTEGER DEFAULT 0 NOT NULL,
  avg_response_time_ms REAL,
  avg_tokens_per_turn REAL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS model_daily_model_idx ON model_daily_stats(model_id);
CREATE INDEX IF NOT EXISTS model_daily_day_idx ON model_daily_stats(day_bucket);
CREATE INDEX IF NOT EXISTS model_daily_week_idx ON model_daily_stats(week_bucket);

-- Codebase daily stats
CREATE TABLE IF NOT EXISTS codebase_daily_stats (
  id TEXT PRIMARY KEY,
  codebase_id TEXT NOT NULL REFERENCES codebases(id),
  day_bucket TEXT NOT NULL,
  week_bucket TEXT NOT NULL,
  month_bucket TEXT NOT NULL,
  total_turns INTEGER DEFAULT 0 NOT NULL,
  total_cost REAL DEFAULT 0 NOT NULL,
  total_input_tokens INTEGER DEFAULT 0 NOT NULL,
  total_output_tokens INTEGER DEFAULT 0 NOT NULL,
  total_duration_ms INTEGER DEFAULT 0 NOT NULL,
  session_count INTEGER DEFAULT 0 NOT NULL,
  unique_models INTEGER DEFAULT 0 NOT NULL,
  top_models_json TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS codebase_daily_codebase_idx ON codebase_daily_stats(codebase_id);
CREATE INDEX IF NOT EXISTS codebase_daily_day_idx ON codebase_daily_stats(day_bucket);
CREATE INDEX IF NOT EXISTS codebase_daily_week_idx ON codebase_daily_stats(week_bucket);
