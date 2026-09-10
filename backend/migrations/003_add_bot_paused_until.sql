ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS bot_paused_until TIMESTAMPTZ;
