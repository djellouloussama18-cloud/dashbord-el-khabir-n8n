-- إضافة عمود comment_reply_index لتتبع الرد التالي في التوزيع الدوري (Round-Robin)
ALTER TABLE bot_posts
  ADD COLUMN IF NOT EXISTS comment_reply_index INTEGER NOT NULL DEFAULT 0;
