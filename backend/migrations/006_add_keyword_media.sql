-- Add media attachment support to auto-comment keywords
ALTER TABLE bot_post_keywords
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_url  text;

-- Guard constraint so it does not fail if it already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bot_post_keywords_media_chk'
      AND conrelid = 'bot_post_keywords'::regclass
  ) THEN
    ALTER TABLE bot_post_keywords
      ADD CONSTRAINT bot_post_keywords_media_chk
      CHECK ((media_url IS NULL AND media_type IS NULL) OR (media_url IS NOT NULL AND media_type IN ('image','video')));
  END IF;
END
$$;
