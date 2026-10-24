-- 008_allow_shared_keywords.sql
-- السماح باستخدام نفس الكلمة المفتاحية في أكثر من منشور نشط في نفس الوقت
-- تم حذف قيد التفرد عبر المنشورات يدويًا من القاعدة، ونقوم هنا بالتأكد من حذفه
-- يبقى القيد على مستوى نفس المنشور فقط: bot_post_keywords_post_active_kw_uidx
-- آمن لإعادة التشغيل (idempotent)

DROP INDEX IF EXISTS public.bot_post_keywords_fb_active_kw_uidx;
