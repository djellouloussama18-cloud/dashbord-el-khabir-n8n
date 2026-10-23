-- 007_dm_message_optional.sql
-- رسالة الخاص تصبح اختيارية، مع قيد 640 حرفًا عند إرفاق وسائط.
-- آمن للتشغيل المتكرر (idempotent).

-- 1) dm_message اختياري: الرد على التعليق فقط يعمل بلا رسالة خاصة.
ALTER TABLE public.bot_post_keywords
  ALTER COLUMN dm_message DROP NOT NULL;

-- 2) إزالة أي CHECK قديم يفرض رسالة خاصة غير فارغة (إن وُجد).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.bot_post_keywords'::regclass
       AND contype = 'c'
       AND conname <> 'bot_post_keywords_dm_media_chk'
       AND pg_get_constraintdef(oid) ILIKE '%dm_message%'
       AND (
         pg_get_constraintdef(oid) ILIKE '%<>%'
         OR pg_get_constraintdef(oid) ILIKE '%btrim%'
         OR pg_get_constraintdef(oid) ILIKE '%length%'
       )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.bot_post_keywords DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END
$$;

-- 3) عند وجود وسائط: رسالة الخاص مطلوبة، غير فارغة، وبحد أقصى 640 حرفًا.
--    نضيفه NOT VALID إذا كانت صفوف قديمة تخالف القيد حتى لا تفشل الترقية.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'bot_post_keywords_dm_media_chk'
       AND conrelid = 'public.bot_post_keywords'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.bot_post_keywords
        ADD CONSTRAINT bot_post_keywords_dm_media_chk
        CHECK (
          media_url IS NULL
          OR (
            dm_message IS NOT NULL
            AND btrim(dm_message) <> ''
            AND char_length(dm_message) <= 640
          )
        );
    EXCEPTION WHEN check_violation THEN
      ALTER TABLE public.bot_post_keywords
        ADD CONSTRAINT bot_post_keywords_dm_media_chk
        CHECK (
          media_url IS NULL
          OR (
            dm_message IS NOT NULL
            AND btrim(dm_message) <> ''
            AND char_length(dm_message) <= 640
          )
        ) NOT VALID;
    END;
  END IF;
END
$$;
