-- =====================================================================
-- حيرة | HAYRA — 013: فئات فرعية جديدة للغة العربية (جموع، صرف، إملاء،
--   بلاغة، أمثال بالإيموجي). بيانات فقط وآمن للتشغيل أكثر من مرة.
--
--   الأسئلة نفسها في supabase/seed/hayra-questions-17..19.json
--   (اللغة العربية، أمثال الإيموجي، أعلام العالم ضمن geography/flags).
-- =====================================================================

insert into public.subcategories (category_id, slug, name, icon, sort_order)
select c.id, v.slug, v.name, v.icon, v.sort_order
from (values
  ('arabic', 'plurals', 'جموع ومفرد ومثنى', '👥', 5),
  ('arabic', 'morphology', 'صرف واشتقاق', '🌱', 6),
  ('arabic', 'spelling', 'إملاء وهمزات', '✏️', 7),
  ('arabic', 'rhetoric', 'بلاغة وأساليب', '🎭', 8),
  ('arabic', 'emoji-proverbs', 'أمثال بالإيموجي', '🧩', 9)
) as v(cat, slug, name, icon, sort_order)
join public.categories c on c.slug = v.cat
on conflict (category_id, slug) do nothing;
