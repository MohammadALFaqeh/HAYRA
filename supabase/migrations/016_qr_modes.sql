-- =====================================================================
-- حيرة | HAYRA — 016: فقرات التحديات التفاعلية (QR) الجديدة.
--   الفقرة تُحدَّد بـ extra.mode فوق أنواع QR الموجودة — بدون تعديل قيد
--   النوع. هنا الفئات الفرعية الجديدة + تحويل تحديات 005 القديمة لفقراتها.
--   بيانات فقط وآمن للتكرار. الأسئلة الجديدة في hayra-questions-25.json
-- =====================================================================

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, v.slug, v.name, v.icon, v.sort_order
from (values
  ('interactive', 'qr-movie', 'مثّل فيلم أو مسلسل', '🎬', 12),
  ('interactive', 'qr-face', 'بوجهك بس', '😶', 13),
  ('interactive', 'qr-draw-blind', 'ارسم وعيونك مسكّرة', '🙈', 14),
  ('interactive', 'qr-draw-line', 'خط واحد', '〰️', 15),
  ('interactive', 'qr-hum', 'دندنها', '🎵', 16),
  ('interactive', 'qr-speed', 'تحدي سرعة', '⚡', 17),
  ('interactive', 'qr-tongue', 'قولها بسرعة', '👅', 18)
) as v(cat, slug, name, icon, sort_order)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;

-- التحديات القديمة: القواعد صارت تأتي من الفقرة، فنحذف التعليمات العامة المكررة
update public.questions set extra = extra - 'instructions'
where type like 'qr\_%' and extra ? 'instructions';

update public.questions set extra = extra || '{"mode":"speed"}'::jsonb
where type = 'qr_movement' and (answer like 'اذكر%' or answer like 'عُدّ%') and not extra ? 'mode';
update public.questions set extra = extra || '{"mode":"tongue"}'::jsonb
where type = 'qr_movement' and answer like '%خيط حرير%' and not extra ? 'mode';
