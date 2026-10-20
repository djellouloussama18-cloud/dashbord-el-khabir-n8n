-- 005_instagram_platform.sql
-- منصّة إنستغرام: عمود platform على bot_posts و bot_post_keywords + فهارس التفرد الجديدة.
-- آمن للتشغيل المتكرر (idempotent).
-- Run manually, e.g.:  psql "$DATABASE_URL" -f migrations/005_instagram_platform.sql

-- ==========================================================================
-- 1) bot_posts: عمود platform + قيد CHECK + فهارس
-- ==========================================================================

ALTER TABLE public.bot_posts
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'facebook';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bot_posts_platform_chk'
       AND conrelid = 'public.bot_posts'::regclass
  ) THEN
    ALTER TABLE public.bot_posts
      ADD CONSTRAINT bot_posts_platform_chk
      CHECK (platform IN ('facebook', 'instagram'));
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_posts_platform_key
  ON public.bot_posts (platform, post_key);

CREATE INDEX IF NOT EXISTS idx_bot_posts_active
  ON public.bot_posts (platform, is_active);

-- ==========================================================================
-- 2) bot_post_keywords: عمود platform (يُملأ تلقائيًا من المنشور الأب)
-- ==========================================================================

ALTER TABLE public.bot_post_keywords
  ADD COLUMN IF NOT EXISTS platform TEXT;

UPDATE public.bot_post_keywords k
   SET platform = COALESCE(p.platform, 'facebook')
  FROM public.bot_posts p
 WHERE p.id = k.post_id
   AND k.platform IS NULL;

UPDATE public.bot_post_keywords
   SET platform = 'facebook'
 WHERE platform IS NULL;

ALTER TABLE public.bot_post_keywords
  ALTER COLUMN platform SET DEFAULT 'facebook',
  ALTER COLUMN platform SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bot_post_keywords_platform_chk'
       AND conrelid = 'public.bot_post_keywords'::regclass
  ) THEN
    ALTER TABLE public.bot_post_keywords
      ADD CONSTRAINT bot_post_keywords_platform_chk
      CHECK (platform IN ('facebook', 'instagram'));
  END IF;
END
$$;

-- دالة + trigger: تنسخ المنصّة من المنشور الأب عند كل INSERT (لا يكتبها الباك-إند).
CREATE OR REPLACE FUNCTION public.bot_post_keywords_set_platform()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.platform := COALESCE(
    (SELECT p.platform FROM public.bot_posts p WHERE p.id = NEW.post_id),
    'facebook'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bot_post_keywords_platform ON public.bot_post_keywords;
CREATE TRIGGER trg_bot_post_keywords_platform
  BEFORE INSERT ON public.bot_post_keywords
  FOR EACH ROW
  EXECUTE FUNCTION public.bot_post_keywords_set_platform();

-- ==========================================================================
-- 3) تفرد الكلمات المفتاحية: عالمي لفيسبوك فقط، وداخل المنشور لكل المنصّات
-- ==========================================================================

DROP INDEX IF EXISTS bot_post_keywords_active_kw_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS bot_post_keywords_fb_active_kw_uidx
  ON public.bot_post_keywords (keyword_normalized)
  WHERE is_active AND platform = 'facebook';

CREATE UNIQUE INDEX IF NOT EXISTS bot_post_keywords_post_active_kw_uidx
  ON public.bot_post_keywords (post_id, keyword_normalized)
  WHERE is_active;
