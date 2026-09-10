-- 002_indexes.sql
-- Indexes for dashboard read queries.
-- Run manually, e.g.:  psql "$DATABASE_URL" -f migrations/002_indexes.sql

CREATE INDEX IF NOT EXISTS idx_conversation_state_last_message_at
  ON conversation_state (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_log_client_id
  ON chat_log (client_id);

CREATE INDEX IF NOT EXISTS idx_chat_log_created_at
  ON chat_log (created_at);

CREATE INDEX IF NOT EXISTS idx_event_log_event_type_created_at
  ON event_log (event_type, created_at DESC);